import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type AskDocumentsBody = {
  question?: string;
};

type EmbeddingResponse = {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
};

type ChunkSearchRow = {
  chunk_id: string;
  document_id: string;
  chunk_text: string;
  file_name: string;
  document_type: string | null;
  similarity: number;
  storage_path: string;
};

type SourceRow = {
  file_name: string;
  document_type: string | null;
  similarity: number;
};

type DirectChunkRow = {
  id: string;
  document_id: string;
  chunk_text: string;
  embedding: unknown;
  documents:
    | {
        id: string;
        file_name: string;
        document_type: string | null;
        storage_path: string;
      }
    | null;
};

function toVectorString(values: number[]): string {
  return `[${values.join(",")}]`;
}

function parseVectorEmbedding(value: unknown): number[] {
  if (Array.isArray(value)) {
    const numbers = value.filter((item): item is number => typeof item === "number");
    return numbers;
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();
  const normalized = trimmed.replace(/^\[/, "").replace(/\]$/, "");
  if (!normalized) return [];

  return normalized
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function embedQuestion(question: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY is missing");
  }

  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "voyage-3",
      input: [question],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Voyage embedding failed: ${text}`);
  }

  const payload = (await response.json()) as EmbeddingResponse;
  console.log('Voyage response:', JSON.stringify(payload))

  const firstItem = Array.isArray(payload.data) ? payload.data[0] : null;
  const embedding = Array.isArray(firstItem?.embedding) ? firstItem.embedding : [];

  if (embedding.length !== 1024) {
    throw new Error("Voyage question embedding payload was invalid");
  }

  return embedding;
}

function buildContextFromChunks(chunks: ChunkSearchRow[]): string {
  return chunks
    .map((chunk, index) => {
      const docType = chunk.document_type ?? "unknown";
      return [
        `Source ${index + 1}:`,
        `File: ${chunk.file_name}`,
        `Document type: ${docType}`,
        `Similarity: ${chunk.similarity}`,
        `Content: ${chunk.chunk_text}`,
      ].join("\n");
    })
    .join("\n\n");
}

async function callOpenAiForDocumentAnswer(input: {
  question: string;
  context: string;
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing");
  }

  const anthropic = new Anthropic({ apiKey });

  const systemPrompt = [
    "You answer questions only using the provided document context.",
    "Only answer about the firm's services, products, and packages.",
    "If a specific industry is not mentioned in the documents, apply the general services (Redovisning, System, Tillväxt) to that industry context and explain how they would be beneficial.",
    "Think like a knowledgeable consultant — map Saldo Redo's offerings to whatever the user asks about.",
    "Do not invent details, pricing, or offerings.",
    "Never say information is unavailable if general services could still apply — instead bridge the gap helpfully.",
  ].join(" ");

  const prompt = [
    `Question: ${input.question}`,
    "",
    "Document context:",
    input.context,
  ].join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1200,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const outputTexts = response.content
    .filter((item) => item.type === "text")
    .map((item) => item.text.trim())
    .filter((text) => text.length > 0);

  return outputTexts.join("\n").trim();
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as AskDocumentsBody;
    const question = body.question?.trim() ?? "";

    if (!question) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 },
      );
    }

    const questionEmbedding = await embedQuestion(question);
    const adminClient = createAdminClient();

    const vectorString = toVectorString(questionEmbedding);
    const vectorWithCast = `${vectorString}::vector`;

    const { data: rpcData, error: rpcError } = await adminClient.rpc(
      "search_chunks" as never,
      {
        query_embedding: vectorWithCast,
        match_count: 5,
      } as never,
    );

    console.log("RPC error:", rpcError);
    console.log("RPC data:", JSON.stringify(rpcData));
    console.log("Embedding length:", questionEmbedding.length);
    console.log("Embedding sample:", questionEmbedding.slice(0, 3));

    let rows = Array.isArray(rpcData) ? (rpcData as ChunkSearchRow[]) : [];

    if (rows.length === 0) {
      const sql = [
        "SELECT",
        "  dc.id AS chunk_id,",
        "  dc.document_id,",
        "  dc.chunk_text,",
        "  d.file_name,",
        "  d.document_type,",
        `  1 - (dc.embedding <=> '${vectorString}'::vector(1536)) AS similarity,`,
        "  d.storage_path",
        "FROM document_chunks dc",
        "INNER JOIN documents d ON d.id = dc.document_id",
        `ORDER BY dc.embedding <=> '${vectorString}'::vector(1536)`,
        "LIMIT 5",
      ].join("\n");

      const { data: rawSqlData, error: rawSqlError } = await adminClient.rpc(
        "run_generated_sql" as never,
        {
          query_text: sql,
        } as never,
      );

      console.log("Raw SQL fallback error:", rawSqlError);
      console.log("Raw SQL fallback data:", JSON.stringify(rawSqlData));

      rows = Array.isArray(rawSqlData) ? (rawSqlData as ChunkSearchRow[]) : [];
    }

    if (rows.length === 0) {
      const { data: directData, error: directError } = await adminClient
        .from("document_chunks")
        .select(
          "id, document_id, chunk_text, embedding, documents!inner(id, file_name, document_type, storage_path)",
        )
        .limit(500);

      console.log("Direct fallback error:", directError);

      const directRows = (directData ?? []) as DirectChunkRow[];

      rows = directRows
        .map((row) => {
          const parsedEmbedding = parseVectorEmbedding(row.embedding);
          const similarity = cosineSimilarity(questionEmbedding, parsedEmbedding);

          if (!row.documents) {
            return null;
          }

          return {
            chunk_id: row.id,
            document_id: row.document_id,
            chunk_text: row.chunk_text,
            file_name: row.documents.file_name,
            document_type: row.documents.document_type,
            similarity,
            storage_path: row.documents.storage_path,
          };
        })
        .filter((row): row is ChunkSearchRow => Boolean(row))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5);
    }

    if (rows.length === 0) {
      return NextResponse.json({
        answer: "I could not find relevant information in the uploaded documents.",
        sources: [],
      });
    }

    const context = buildContextFromChunks(rows);
    const answer = await callOpenAiForDocumentAnswer({
      question,
      context,
    });

    const sourceMap = new Map<string, SourceRow>();
    for (const row of rows) {
      const key = `${row.file_name}::${row.document_type ?? ""}`;
      const existing = sourceMap.get(key);
      if (!existing || row.similarity > existing.similarity) {
        sourceMap.set(key, {
          file_name: row.file_name,
          document_type: row.document_type,
          similarity: row.similarity,
        });
      }
    }

    return NextResponse.json({
      answer,
      sources: Array.from(sourceMap.values()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
