import { NextResponse } from "next/server";
import mammoth from "mammoth";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type IngestBody = {
  storage_path?: string;
  file_name?: string;
  file_type?: string;
  document_type?: string;
};

type EmbeddingResponse = {
  data?: Array<{
    embedding?: number[];
    index?: number;
  }>;
};

type PdfParserErrorEvent = Error | { parserError: Error };

type Chunk = {
  chunk_index: number;
  chunk_text: string;
};

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
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
  if (normalizedType.startsWith("text/") || extension === "txt" || extension === "md") return "txt";

  return "unsupported";
}

async function extractTextFromFile(input: {
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

  throw new Error("Unsupported file type. Supported types are PDF, DOCX, TXT, and MD.");
}

function splitIntoWordChunks(text: string, chunkSize = 400, overlap = 50): Chunk[] {
  const words = normalizeWhitespace(text).split(" ").filter((word) => word.length > 0);
  if (words.length === 0) return [];

  const chunks: Chunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    const chunkWords = words.slice(start, end);
    const chunkText = chunkWords.join(" ").trim();

    if (chunkText.length > 0) {
      chunks.push({
        chunk_index: chunkIndex,
        chunk_text: chunkText,
      });
      chunkIndex += 1;
    }

    if (end === words.length) break;
    start += Math.max(chunkSize - overlap, 1);
  }

  return chunks;
}

async function embedChunks(chunks: Chunk[]): Promise<number[][]> {
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
      input: chunks.map((c) => c.chunk_text),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Voyage embedding failed: ${text}`);
  }

  const payload = (await response.json()) as EmbeddingResponse;
  return (payload.data ?? [])
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((d) => d.embedding ?? []);
}

function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as IngestBody;
    const storagePath = asString(body.storage_path).trim();
    const fileName = asString(body.file_name).trim();
    const fileType = asString(body.file_type).trim();
    const documentType = asString(body.document_type, "services").trim();

    if (!storagePath || !fileName) {
      return NextResponse.json(
        { error: "storage_path and file_name are required" },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();

    const { data: fileBlob, error: downloadError } = await adminClient.storage
      .from("crm-files")
      .download(storagePath);

    if (downloadError || !fileBlob) {
      return NextResponse.json(
        { error: "Failed to download file", detail: downloadError?.message },
        { status: 400 },
      );
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const extractedText = await extractTextFromFile({
      fileBuffer,
      fileName,
      fileType,
    });

    if (!extractedText) {
      return NextResponse.json({ error: "No extractable text found" }, { status: 400 });
    }

    const chunks = splitIntoWordChunks(extractedText, 400, 50);
    if (chunks.length === 0) {
      return NextResponse.json({ error: "No chunks generated from document" }, { status: 400 });
    }

    const embeddings = await embedChunks(chunks);

    const { data: existingDocumentData } = await adminClient
      .from("documents")
      .select("id")
      .eq("storage_path", storagePath)
      .maybeSingle();

    const existingDocument = existingDocumentData as { id: string } | null;

    if (existingDocument?.id) {
      await adminClient.from("document_chunks").delete().eq("document_id", existingDocument.id);
      await adminClient.from("documents").delete().eq("id", existingDocument.id);
    }

    const { data: insertedDocument, error: insertDocumentError } = await adminClient
      .from("documents")
      .insert({
        storage_path: storagePath,
        file_name: fileName,
        file_type: fileType || null,
        document_type: documentType || null,
        content_text: extractedText,
        created_by: user.id,
      } as never)
      .select("id")
      .single();

    if (insertDocumentError || !insertedDocument) {
      return NextResponse.json(
        { error: "Failed to insert document", detail: insertDocumentError?.message },
        { status: 500 },
      );
    }

    const chunkRows = chunks.map((chunk, index) => ({
      document_id: (insertedDocument as { id: string }).id,
      chunk_index: chunk.chunk_index,
      chunk_text: chunk.chunk_text,
      embedding: toVectorLiteral(embeddings[index]),
    }));

    const { error: insertChunksError } = await adminClient
      .from("document_chunks")
      .insert(chunkRows as never);

    if (insertChunksError) {
      return NextResponse.json(
        { error: "Failed to insert chunks", detail: insertChunksError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      document_id: (insertedDocument as { id: string }).id,
      chunk_count: chunkRows.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Document ingest failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
