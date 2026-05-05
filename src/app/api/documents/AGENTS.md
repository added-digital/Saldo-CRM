# DOCUMENT API KNOWLEDGE

## Scope
Applies to `src/app/api/documents`.

## Overview
Document APIs ingest, chunk, embed, delete, and reindex firm-wide documents for assistant/search workflows.

## Where To Look
| Task | Location |
|------|----------|
| Ingest/chunk/embed | `ingest/route.ts` |
| Delete/reindex cleanup | `delete/route.ts` |
| Settings UI | `src/app/(dashboard)/settings/files/page.tsx` |
| Vector search consumers | `src/app/api/chat/tools/search-documents.ts`, `src/app/api/questions` |

## Runtime And Parsing
- Use Node runtime for parser-heavy routes.
- Preserve supported file types already handled by ingestion: PDF, DOCX, TXT, and Markdown-like text.
- Normalize whitespace before chunking.
- Keep chunking close to the existing 400-word chunk and 50-word overlap convention unless reindexing all content.

## Embeddings And Storage
- Voyage embeddings use the existing model/dimension assumptions; keep database vector dimensions aligned.
- Delete/reindex by stable `storage_path` and related document chunk rows.
- Admin client use is allowed for firm-wide document tables/storage, but keep it server-only.

## Security
- Do not assume documents are customer-scoped unless schema/RLS changes make that explicit.
- Do not log extracted document text, embeddings, provider payloads, or storage credentials.

## Verification
- Test small text-like files and parser-backed files when changing extraction.
- Verify delete removes storage and related metadata/chunks.
