import { createAdminClient } from "../_shared/supabase.ts"
import { getFortnoxClient, updateSyncJob, delay, corsHeaders } from "../_shared/sync-helpers.ts"

const RATE_LIMIT_DELAY_MS = 220
const PAGES_PER_BATCH = 10
const PAGE_LIMIT = 500

type ArticleRow = {
  article_number: string
  article_name: string | null
  description: string | null
  unit: string | null
  active: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

function extractArticles(response: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = [
    response.Articles,
    response.articles,
    response.Items,
    response.items,
    response.Data,
    response.data,
  ]

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue
    return candidate
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
  }

  return []
}

function extractTotalPages(response: Record<string, unknown>, fallback: number): number {
  const meta = asRecord(response.MetaInformation) ?? asRecord(response.meta) ?? asRecord(response.Pagination)
  if (!meta) return fallback

  const candidates = [
    meta["@TotalPages"],
    meta.totalPages,
    meta.total_pages,
    meta.TotalPages,
  ]

  for (const candidate of candidates) {
    const parsed = Number(candidate)
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }

  return fallback
}

function mapArticle(article: Record<string, unknown>): ArticleRow | null {
  const articleNumber = article.ArticleNumber ?? article.articleNumber ?? article.article_number ?? article.Number
  if (!articleNumber) return null

  const activeRaw = article.Active ?? article.active ?? article.IsActive
  const active = typeof activeRaw === "boolean" ? activeRaw : true

  return {
    article_number: String(articleNumber),
    article_name: article.ArticleName != null
      ? String(article.ArticleName)
      : (article.Name != null ? String(article.Name) : null),
    description: article.Description != null ? String(article.Description) : null,
    unit: article.Unit != null ? String(article.Unit) : null,
    active,
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() })
  }

  const supabase = createAdminClient()
  let jobId: string | null = null

  try {
    const body = await req.json().catch(() => ({}))
    jobId = body.job_id ?? null
    const phase: string = body.phase ?? "list"
    const offset: number = body.offset ?? 0

    if (phase !== "list") {
      return new Response(
        JSON.stringify({ error: `Unknown phase: ${phase}` }),
        { status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      )
    }

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        status: "processing",
        current_step: "Fetching article registry from Fortnox...",
      })
    }

    const client = await getFortnoxClient(supabase)

    let prevSynced = 0
    let prevErrors = 0
    let prevTotal = 0

    if (jobId && offset > 0) {
      const { data: jobRow } = await supabase
        .from("sync_jobs")
        .select("payload")
        .eq("id", jobId)
        .single()

      const payload = (jobRow as unknown as { payload: Record<string, unknown> } | null)?.payload
      prevSynced = (payload?.synced as number) ?? 0
      prevErrors = (payload?.errors as number) ?? 0
      prevTotal = (payload?.total as number) ?? 0
    }

    let synced = prevSynced
    let errors = prevErrors
    let totalFetched = prevTotal
    let firstError: string | null = null

    const startPage = offset + 1
    let currentPage = startPage
    let totalPages = 1
    let pagesThisBatch = 0

    do {
      const response = await client.getTimeArticles(currentPage, PAGE_LIMIT)
      const articles = extractArticles(response)
      totalPages = extractTotalPages(response, articles.length === PAGE_LIMIT ? currentPage + 1 : currentPage)

      const mapped = articles
        .map((article) => mapArticle(article))
        .filter((row): row is ArticleRow => Boolean(row))

      if (mapped.length > 0) {
        const { error: upsertError } = await supabase
          .from("article_registry")
          .upsert(mapped as never, { onConflict: "article_number" })

        if (upsertError) {
          console.error("Article registry upsert error:", upsertError.message, upsertError.details)
          if (!firstError) firstError = upsertError.message
          errors += mapped.length
        } else {
          synced += mapped.length
        }
      }

      totalFetched += articles.length
      pagesThisBatch += 1
      currentPage += 1

      if (currentPage <= totalPages && pagesThisBatch < PAGES_PER_BATCH) {
        await delay(RATE_LIMIT_DELAY_MS)
      }
    } while (currentPage <= totalPages && pagesThisBatch < PAGES_PER_BATCH)

    const morePages = currentPage <= totalPages

    if (jobId) {
      const updatePayload: Record<string, unknown> = {
        step_name: "articles",
        step_label: "Articles",
        synced,
        errors,
        total: totalFetched,
      }
      if (firstError) updatePayload.upsert_error = firstError

      await updateSyncJob(supabase, jobId, {
        status: morePages ? "processing" : "completed",
        current_step: morePages
          ? `Syncing articles (page ${currentPage - 1}/${totalPages}, ${synced} saved)...`
          : `Article registry synced (${synced} saved).`,
        total_items: totalPages * PAGE_LIMIT,
        processed_items: totalFetched,
        progress: morePages ? Math.min(95, Math.round(((currentPage - 1) / totalPages) * 100)) : 100,
        payload: updatePayload,
        batch_phase: morePages ? "list" : null,
        batch_offset: morePages ? currentPage - 1 : 0,
        dispatch_lock: false,
      })
    }

    return new Response(
      JSON.stringify({
        ok: true,
        phase: "list",
        morePages,
        synced,
        errors,
        total: totalFetched,
      }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        status: "failed",
        error_message: message,
        dispatch_lock: false,
        batch_phase: null,
      })
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    )
  }
})
