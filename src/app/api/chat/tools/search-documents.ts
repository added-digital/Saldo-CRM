import { createAdminClient } from "@/lib/supabase/admin";

import type { ToolHandler } from "./types";

export type SearchDocumentsInput = {
  query: string;
  match_count?: number;
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

type EmbeddingResponse = {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
};

type DocumentSource = {
  file_name: string;
  document_type: string | null;
  similarity: number;
};

const VOYAGE_MODEL = "voyage-3";
const EXPECTED_EMBEDDING_DIM = 1024;
const DEFAULT_MATCH_COUNT = 5;
const MAX_MATCH_COUNT = 10;

function toVectorString(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
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
      model: VOYAGE_MODEL,
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

  if (embedding.length !== EXPECTED_EMBEDDING_DIM) {
    throw new Error(
      `Voyage question embedding had unexpected length ${embedding.length} (expected ${EXPECTED_EMBEDDING_DIM}).`,
    );
  }

  return embedding;
}

/**
 * Vector search over uploaded documents (notes, contracts, service docs,
 * attachments). Mirrors the existing /api/questions/ask-documents pipeline:
 *  1. Embed the question with Voyage AI (voyage-3, 1024 dims).
 *  2. Call the `search_chunks` Postgres RPC, which sorts chunks by cosine
 *     distance against the query vector and returns the top N.
 *
 * Documents in this CRM are not customer-scoped (firm-wide policies, service
 * descriptions, etc.) — the RPC is invoked via the admin client because
 * `document_chunks` doesn't enforce per-customer RLS. If you ever start
 * tagging documents to customers, this is the place to add a pre-filter.
 *
 * The tool result includes both the raw chunks (so Claude can quote them in
 * its answer) and a deduped `sources` array (so the chat route can attach
 * file metadata to the final response for the UI's "Källa: ..." footer).
 */
export const searchDocuments: ToolHandler<SearchDocumentsInput> = async (
  input,
) => {
  const query = input.query?.trim();
  if (!query) {
    return { error: "`query` is required.", chunks: [], sources: [] };
  }

  const matchCount = Math.min(
    Math.max(input.match_count ?? DEFAULT_MATCH_COUNT, 1),
    MAX_MATCH_COUNT,
  );

  let embedding: number[];
  try {
    embedding = await embedQuestion(query);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `Embedding failed: ${error.message}`
          : "Embedding failed.",
      chunks: [],
      sources: [],
    };
  }

  const adminClient = createAdminClient();
  const vectorString = toVectorString(embedding);
  const vectorWithCast = `${vectorString}::vector`;

  const { data, error } = await adminClient.rpc("search_chunks" as never, {
    query_embedding: vectorWithCast,
    match_count: matchCount,
  } as never);

  if (error) {
    return {
      error: `search_chunks RPC failed: ${error.message}`,
      chunks: [],
      sources: [],
    };
  }

  const rows = (Array.isArray(data) ? data : []) as ChunkSearchRow[];

  // Compact chunks for Claude — keep the text but trim metadata. The full
  // sources list is returned separately for the UI.
  const chunks = rows.map((row, index) => ({
    rank: index + 1,
    file_name: row.file_name,
    document_type: row.document_type,
    similarity: row.similarity,
    excerpt: row.chunk_text,
  }));

  // Dedupe sources by file_name, keep the highest similarity.
  const sourceMap = new Map<string, DocumentSource>();
  for (const row of rows) {
    const key = row.file_name?.trim().toLowerCase();
    if (!key) continue;
    const existing = sourceMap.get(key);
    if (!existing || row.similarity > existing.similarity) {
      sourceMap.set(key, {
        file_name: row.file_name,
        document_type: row.document_type,
        similarity: row.similarity,
      });
    }
  }

  return {
    query,
    chunk_count: chunks.length,
    chunks,
    sources: Array.from(sourceMap.values()),
  };
};
