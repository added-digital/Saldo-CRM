import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type AskDocumentsBody = {
  question?: string;
};

type AskDocumentsInput = {
  question: string;
  attachmentContext: string;
  attachmentSources: SourceRow[];
};

type OpenAiSqlResponse = {
  sql: string;
  raw_response?: string;
};

type ResponsesTextContent = {
  type?: string;
  text?: string;
};

type ResponsesOutputItem = {
  type?: string;
  content?: ResponsesTextContent[];
};

type ResponsesPayload = {
  output_text?: string;
  output?: ResponsesOutputItem[];
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

type PdfParserErrorEvent = Error | { parserError: Error };

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

const ALLOWED_TABLES = new Set([
  "customers",
  "profiles",
  "teams",
  "invoices",
  "time_reports",
  "contract_accruals",
  "customer_kpis",
  "customer_segments",
  "segments",
]);

const CRM_ENABLED_ROLES = new Set(["admin", "team_lead"]);
const FORBIDDEN_SQL_COLUMN_PATTERN = /\b(email|phone|linkedin|notes)\b/i;

function toVectorString(values: number[]): string {
  return `[${values.join(",")}]`;
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function getFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1];
}

function getFileKind(fileName: string, fileType: string): "pdf" | "docx" | "txt" | "unsupported" {
  const normalizedType = fileType.toLowerCase();
  const extension = getFileExtension(fileName);

  if (normalizedType === "application/pdf" || extension === "pdf") return "pdf";
  if (
    normalizedType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  ) {
    return "docx";
  }
  if (normalizedType.startsWith("text/") || extension === "txt") return "txt";

  return "unsupported";
}

async function extractTextFromAttachment(input: {
  fileBuffer: Buffer;
  fileName: string;
  fileType: string;
}): Promise<string> {
  const kind = getFileKind(input.fileName, input.fileType);

  if (kind === "pdf") {
    const PDFParser = (await import("pdf2json")).default;
    return new Promise((resolve, reject) => {
      const parser = new PDFParser(null, true);
      parser.on("pdfParser_dataError", (err: PdfParserErrorEvent) => {
        if (err instanceof Error) {
          reject(err);
          return;
        }
        reject(err.parserError);
      });
      parser.on("pdfParser_dataReady", () => {
        resolve(normalizeWhitespace(parser.getRawTextContent()));
      });
      parser.parseBuffer(input.fileBuffer);
    });
  }

  if (kind === "docx") {
    const result = await mammoth.extractRawText({ buffer: input.fileBuffer });
    return normalizeWhitespace(result.value ?? "");
  }

  if (kind === "txt") {
    return normalizeWhitespace(input.fileBuffer.toString("utf8"));
  }

  return "";
}

async function parseAskDocumentsInput(request: Request): Promise<AskDocumentsInput> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const question = normalizeWhitespace(String(formData.get("question") ?? ""));
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);

    const attachmentParts: string[] = [];
    const attachmentSources: SourceRow[] = [];

    for (const file of files) {
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const extracted = await extractTextFromAttachment({
        fileBuffer,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
      });

      if (!extracted) continue;

      attachmentParts.push([
        `Attachment file: ${file.name}`,
        "Attachment document type: Chat attachment",
        `Attachment content: ${extracted}`,
      ].join("\n"));

      attachmentSources.push({
        file_name: file.name,
        document_type: "Chat attachment",
        similarity: 1,
      });
    }

    return {
      question,
      attachmentContext: attachmentParts.join("\n\n"),
      attachmentSources,
    };
  }

  const body = (await request.json()) as AskDocumentsBody;
  return {
    question: normalizeWhitespace(body.question ?? ""),
    attachmentContext: "",
    attachmentSources: [],
  };
}

async function readDbContext(): Promise<string> {
  const filePath = path.join(
    process.cwd(),
    "src/app/api/questions/ask-sql/db-context.md",
  );

  return readFile(filePath, "utf8");
}

function toSafeUuidLiteral(value: string | null | undefined): string {
  if (!value) return "NULL";

  const trimmed = value.trim();
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(trimmed)) return "NULL";

  return `'${trimmed}'`;
}

function extractCteNames(sql: string): Set<string> {
  const cteNames = new Set<string>();
  const withMatches = sql.matchAll(/\bwith\s+([a-z_][a-z0-9_]*)\s+as\b/gi);
  const chainedMatches = sql.matchAll(/,\s*([a-z_][a-z0-9_]*)\s+as\b/gi);

  for (const match of withMatches) {
    cteNames.add(match[1].toLowerCase());
  }

  for (const match of chainedMatches) {
    cteNames.add(match[1].toLowerCase());
  }

  return cteNames;
}

function extractRelationNames(sql: string): string[] {
  const matches = sql.matchAll(
    /\b(?:from|join)\s+(?:lateral\s+)?([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)/gi,
  );

  return Array.from(matches, (match) => {
    const raw = match[1].toLowerCase();
    const parts = raw.split(".");
    return parts[parts.length - 1];
  });
}

function validateSql(
  query: string,
): { valid: true; sql: string } | { valid: false; error: string } {
  const fencedMatch = query.match(/```(?:sql)?\s*([\s\S]*?)\s*```/i);
  const unfenced = (fencedMatch?.[1] ?? query).trim();
  const firstSelectOrWith = unfenced.match(/(?:^|[\s\S]*?)(\b(?:select|with)\b[\s\S]*)/i);
  const extracted = (firstSelectOrWith?.[1] ?? unfenced).trim();

  const trimmed = extracted.replace(/;+\s*$/, "");
  const lowered = trimmed.toLowerCase();

  if (!lowered.startsWith("select") && !lowered.startsWith("with")) {
    return { valid: false, error: "Only SELECT queries are allowed." };
  }

  const forbiddenKeywords = [
    "insert",
    "update",
    "delete",
    "drop",
    "alter",
    "truncate",
    "grant",
    "revoke",
  ];

  for (const keyword of forbiddenKeywords) {
    if (new RegExp(`\\b${keyword}\\b`, "i").test(trimmed)) {
      return { valid: false, error: `Forbidden SQL keyword: ${keyword}` };
    }
  }

  const cteNames = extractCteNames(trimmed);
  const tableNames = extractRelationNames(trimmed);

  for (const tableName of tableNames) {
    if (cteNames.has(tableName)) {
      continue;
    }

    if (!ALLOWED_TABLES.has(tableName)) {
      return { valid: false, error: `Table not allowed: ${tableName}` };
    }
  }

  const hasLimit = /\blimit\s+\d+/i.test(trimmed);
  const limited = hasLimit ? trimmed : `${trimmed} LIMIT 200`;

  return { valid: true, sql: limited };
}

async function callOpenAiForSql(input: {
  question: string;
  userId: string;
  dbContext: string;
}): Promise<OpenAiSqlResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const prompt = [
    "You generate SQL for Postgres.",
    "Return only JSON that matches the provided schema.",
    "Generate a read-only query using only allowed tables from context.",
    "Use placeholder {user_id} only when relevant.",
    "Do not use markdown fences.",
    "Keep the query focused on the user's question and return only fields needed to answer it.",
    "If the question is not about CRM or reporting data, return JSON with sql as an empty string.",
    "Never query or return direct personal contact details such as email addresses, phone numbers, linkedin links, or free-text notes.",
    "Do not use contact tables for this endpoint.",
    "For turnover values, prefer total_ex_vat when available.",
    "For contract totals or KPI questions, use active contract_accruals only.",
    "",
    `Question: ${input.question}`,
    `Authenticated user id: ${input.userId}`,
    "",
    "Database context:",
    input.dbContext,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "generated_sql",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              sql: {
                type: "string",
              },
            },
            required: ["sql"],
            strict: true,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI SQL generation failed: ${text}`);
  }

  const payload = (await response.json()) as ResponsesPayload;
  const outputTexts: string[] = [];

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    outputTexts.push(payload.output_text);
  }

  const outputItems = Array.isArray(payload.output) ? payload.output : [];
  for (const item of outputItems) {
    const contentItems = Array.isArray(item.content) ? item.content : [];
    for (const contentItem of contentItems) {
      if (typeof contentItem.text === "string" && contentItem.text.trim()) {
        outputTexts.push(contentItem.text);
      }
    }
  }

  const joinedOutput = outputTexts.join("\n").trim();
  const fencedMatch = joinedOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const rawJson = (fencedMatch?.[1] ?? joinedOutput).trim();

  let parsed: OpenAiSqlResponse | null = null;

  try {
    parsed = JSON.parse(rawJson) as OpenAiSqlResponse;
  } catch {
    const payloadSnippet = JSON.stringify(payload).slice(0, 400);
    throw new Error(`OpenAI SQL generation returned non-JSON payload: ${payloadSnippet}`);
  }

  if (!parsed || typeof parsed.sql !== "string") {
    throw new Error("OpenAI SQL generation returned invalid payload");
  }

  return {
    sql: parsed.sql.trim(),
    raw_response: joinedOutput,
  };
}

function buildContextFromRows(rows: Array<Record<string, unknown>>): string {
  return rows
    .slice(0, 50)
    .map((row, index) => `CRM row ${index + 1}: ${JSON.stringify(row)}`)
    .join("\n");
}

async function buildDatabaseContext(input: {
  question: string;
  userId: string;
  role: string | null;
}): Promise<{ context: string; sources: SourceRow[] }> {
  try {
    if (!input.role || !CRM_ENABLED_ROLES.has(input.role)) {
      return { context: "", sources: [] };
    }

    const dbContext = await readDbContext();
    const generated = await callOpenAiForSql({
      question: input.question,
      userId: input.userId,
      dbContext,
    });

    if (!generated.sql) {
      return { context: "", sources: [] };
    }

    const withTokensReplaced = generated.sql.replaceAll(
      "{user_id}",
      toSafeUuidLiteral(input.userId),
    );

    const validated = validateSql(withTokensReplaced);
    if (!validated.valid) {
      console.error("crm sql validation failed", { error: validated.error });
      return { context: "", sources: [] };
    }

    if (FORBIDDEN_SQL_COLUMN_PATTERN.test(validated.sql)) {
      console.error("crm sql rejected forbidden columns");
      return { context: "", sources: [] };
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient.rpc("run_generated_sql" as never, {
      query_text: validated.sql,
    } as never);

    if (error) {
      console.error("crm sql execution failed", { message: error.message });
      return { context: "", sources: [] };
    }

    const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    if (rows.length === 0) {
      return { context: "", sources: [] };
    }

    const context = [
      `CRM SQL: ${validated.sql}`,
      "CRM query results:",
      buildContextFromRows(rows),
    ].join("\n");

    return {
      context,
      sources: [
        {
          file_name: "CRM database",
          document_type: "Structured data",
          similarity: 1,
        },
      ],
    };
  } catch (error) {
    console.error("crm context build failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return { context: "", sources: [] };
  }
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
  documentContext: string;
  crmContext: string;
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing");
  }

  const anthropic = new Anthropic({ apiKey });

  const systemPrompt = [
    "You answer questions only using the provided context.",
    "The context may include structured CRM database results and document excerpts.",
    "Use CRM data for operational facts, counts, customers, contacts, invoices, KPIs, and reporting questions.",
    "Use document context for service, offering, package, and attachment questions.",
    "If both are present, combine them carefully and make the answer clear for a business user.",
    "Do not invent details that are not grounded in the provided context.",
    "If the context is insufficient, say so briefly instead of guessing.",
  ].join(" ");

  const prompt = [
    `Question: ${input.question}`,
    "",
    "CRM database context:",
    input.crmContext || "No CRM database context available.",
    "",
    "Document context:",
    input.documentContext || "No document context available.",
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

    const input = await parseAskDocumentsInput(request);
    const question = input.question;

    if (!question) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 },
      );
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const profile = profileData as { role: string | null } | null;

    const [questionEmbedding, crmContextResult] = await Promise.all([
      embedQuestion(question),
      buildDatabaseContext({
        question,
        userId: user.id,
        role: profile?.role ?? null,
      }),
    ]);

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

    if (rpcError) {
      console.error("search_chunks rpc failed", {
        code: rpcError.code,
        message: rpcError.message,
      });
    }

    let rows = Array.isArray(rpcData) ? (rpcData as ChunkSearchRow[]) : [];

    if (rows.length === 0) {
      const sql = [
        "SELECT",
        "  dc.id AS chunk_id,",
        "  dc.document_id,",
        "  dc.chunk_text,",
        "  d.file_name,",
        "  d.document_type,",
        `  1 - (dc.embedding <=> '${vectorString}'::vector(${questionEmbedding.length})) AS similarity,`,
        "  d.storage_path",
        "FROM document_chunks dc",
        "INNER JOIN documents d ON d.id = dc.document_id",
        `ORDER BY dc.embedding <=> '${vectorString}'::vector(${questionEmbedding.length})`,
        "LIMIT 5",
      ].join("\n");

      const { data: rawSqlData, error: rawSqlError } = await adminClient.rpc(
        "run_generated_sql" as never,
        {
          query_text: sql,
        } as never,
      );

      if (rawSqlError) {
        console.error("run_generated_sql fallback failed", {
          code: rawSqlError.code,
          message: rawSqlError.message,
        });
      }

      rows = Array.isArray(rawSqlData) ? (rawSqlData as ChunkSearchRow[]) : [];
    }

    if (rows.length === 0) {
      const { data: directData, error: directError } = await adminClient
        .from("document_chunks")
        .select(
          "id, document_id, chunk_text, embedding, documents!inner(id, file_name, document_type, storage_path)",
        )
        .limit(500);

      if (directError) {
        console.error("document_chunks direct fallback failed", {
          code: directError.code,
          message: directError.message,
        });
      }

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

    if (rows.length === 0 && !input.attachmentContext && !crmContextResult.context) {
      return NextResponse.json({
        answer: "I could not find relevant information in the available documents or CRM data.",
        sources: crmContextResult.sources,
      });
    }

    const documentContext = [buildContextFromChunks(rows), input.attachmentContext]
      .filter((value) => value.trim().length > 0)
      .join("\n\n");

    const answer = await callOpenAiForDocumentAnswer({
      question,
      documentContext,
      crmContext: crmContextResult.context,
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

    const indexedSources = Array.from(sourceMap.values());

    return NextResponse.json({
      answer,
      sources: [...crmContextResult.sources, ...input.attachmentSources, ...indexedSources],
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
