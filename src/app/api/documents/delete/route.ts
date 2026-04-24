import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type DeleteDocumentsBody = {
  storage_paths?: unknown;
};

function normalizeStoragePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
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

    const body = (await request.json()) as DeleteDocumentsBody;
    const storagePaths = normalizeStoragePaths(body.storage_paths);

    if (storagePaths.length === 0) {
      return NextResponse.json({ error: "storage_paths is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: profileData } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const profile = profileData as { role: string | null } | null;
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: documentsData, error: documentsError } = await adminClient
      .from("documents")
      .select("id, storage_path")
      .in("storage_path", storagePaths as never);

    if (documentsError) {
      return NextResponse.json(
        {
          error: "Failed to load indexed documents",
          detail: documentsError.message,
        },
        { status: 500 },
      );
    }

    const documents = (documentsData ?? []) as Array<{ id: string; storage_path: string }>;
    if (documents.length === 0) {
      return NextResponse.json({ success: true, deleted_documents: 0, deleted_chunks: 0 });
    }

    const documentIds = documents.map((document) => document.id);

    const { error: chunksError, count: deletedChunks } = await adminClient
      .from("document_chunks")
      .delete({ count: "exact" })
      .in("document_id", documentIds as never);

    if (chunksError) {
      return NextResponse.json(
        {
          error: "Failed to delete indexed chunks",
          detail: chunksError.message,
        },
        { status: 500 },
      );
    }

    const { error: deleteDocumentsError, count: deletedDocuments } = await adminClient
      .from("documents")
      .delete({ count: "exact" })
      .in("id", documentIds as never);

    if (deleteDocumentsError) {
      return NextResponse.json(
        {
          error: "Failed to delete indexed documents",
          detail: deleteDocumentsError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      deleted_documents: deletedDocuments ?? documents.length,
      deleted_chunks: deletedChunks ?? 0,
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
