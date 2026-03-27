import { createAdminClient } from "../_shared/supabase.ts"
import { getFortnoxClient, updateSyncJob, delay, corsHeaders } from "../_shared/sync-helpers.ts"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

const RATE_LIMIT_DELAY_MS = 220
const RETRY_BASE_DELAY_MS = 700
const PAGES_PER_BATCH = 30
const PAGE_LIMIT = 500
const MAX_PAGES = 200

type EndpointName = "time-articles-v1" | "articles-v3"

const ARTICLE_ENDPOINTS: Array<{ name: EndpointName; path: string }> = [
  { name: "time-articles-v1", path: "/api/time/articles-v1" },
  { name: "articles-v3", path: "/3/articles" },
]

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

function hasErrorInformation(response: Record<string, unknown>): boolean {
  return Boolean(asRecord(response.ErrorInformation) ?? asRecord(response.error))
}

function extractErrorMessage(response: Record<string, unknown>): string | null {
  const errorInfo = asRecord(response.ErrorInformation) ?? asRecord(response.error)
  if (!errorInfo) return null

  const message = errorInfo.Message ?? errorInfo.message ?? errorInfo.Details ?? errorInfo.details
  if (message == null) return null
  return String(message)
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

function hasMetaInformation(response: Record<string, unknown>): boolean {
  return Boolean(asRecord(response.MetaInformation) ?? asRecord(response.meta) ?? asRecord(response.Pagination))
}

async function withRetry<T>(operation: () => Promise<T>, retries = 4): Promise<T> {
  let attempt = 0

  while (attempt < retries) {
    attempt += 1
    try {
      return await operation()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const isRateLimit = message.includes("Rate limited") || message.includes("429")
      const isRetriable = isRateLimit || message.includes("Fortnox API error (5") || message.includes("fetch failed")

      if (!isRetriable || attempt >= retries) {
        throw error
      }

      const delayMs = isRateLimit
        ? RATE_LIMIT_DELAY_MS * 4 + RETRY_BASE_DELAY_MS
        : RETRY_BASE_DELAY_MS * attempt

      await delay(delayMs)
    }
  }

  throw new Error("Failed to fetch Fortnox articles after retries")
}

async function fetchArticlesPage(
  client: { requestPath: <T>(path: string) => Promise<T> },
  page: number,
  limit: number,
): Promise<{ endpoint: EndpointName; response: Record<string, unknown>; articles: Array<Record<string, unknown>> }> {
  let lastErrorMessage: string | null = null

  for (const endpoint of ARTICLE_ENDPOINTS) {
    const response = await withRetry(() => client.requestPath<Record<string, unknown>>(`${endpoint.path}?limit=${limit}&page=${page}`))

    if (hasErrorInformation(response)) {
      lastErrorMessage = extractErrorMessage(response)
      continue
    }

    const articles = extractArticles(response)
    const hasMeta = hasMetaInformation(response)

    if (articles.length === 0 && !hasMeta && endpoint.name === "time-articles-v1") {
      continue
    }

    return { endpoint: endpoint.name, response, articles }
  }

  throw new Error(lastErrorMessage ?? "No usable response from Fortnox article endpoints")
}

function mapArticle(article: Record<string, unknown>): ArticleRow | null {
  const articleNumber = article.ArticleNumber
    ?? article.articleNumber
    ?? article.article_number
    ?? article.Number
    ?? article.ArticleNo
    ?? article.ArticleId
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
    const offset: number = Number(body.offset ?? 0)
    const maxPages = Math.max(1, Math.min(MAX_PAGES, Number(body.maxPages ?? MAX_PAGES)))

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
    let activeEndpoint: EndpointName | null = null

    const startPage = offset + 1
    let currentPage = startPage
    let totalPages = 1
    let pagesThisBatch = 0

    do {
      const { endpoint, response, articles } = await fetchArticlesPage(client, currentPage, PAGE_LIMIT)
      activeEndpoint = endpoint
      totalPages = extractTotalPages(response, articles.length === PAGE_LIMIT ? currentPage + 1 : currentPage)
      totalPages = Math.min(totalPages, maxPages)

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

      if (currentPage <= totalPages && currentPage <= maxPages && pagesThisBatch < PAGES_PER_BATCH) {
        await delay(RATE_LIMIT_DELAY_MS)
      }
    } while (currentPage <= totalPages && currentPage <= maxPages && pagesThisBatch < PAGES_PER_BATCH)

    const morePages = currentPage <= totalPages && currentPage <= maxPages

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
          ? `Syncing articles via ${activeEndpoint ?? "fallback"} (page ${currentPage - 1}/${totalPages}, ${synced} saved)...`
          : `Article registry synced via ${activeEndpoint ?? "fallback"} (${synced} saved).`,
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
