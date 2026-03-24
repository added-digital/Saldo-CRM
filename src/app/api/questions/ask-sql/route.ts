import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type AskSqlBody = {
  question?: string;
  customer_id?: string | null;
  user_id?: string | null;
};

type OpenAiSqlResponse = {
  sql: string;
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

const ALLOWED_TABLES = new Set([
  "customers",
  "profiles",
  "teams",
  "invoices",
  "time_reports",
  "contract_accruals",
  "customer_kpis",
  "customer_contacts",
  "customer_contact_relations",
  "customer_segments",
  "segments",
]);

async function readDbContext() {
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
  const firstSelectOrWith = unfenced.match(
    /(?:^|[\s\S]*?)(\b(?:select|with)\b[\s\S]*)/i,
  );
  const extracted = (firstSelectOrWith?.[1] ?? unfenced).trim();

  const trimmed = extracted.replace(/;+\s*$/, "");
  const lowered = trimmed.toLowerCase();

  const startsValid =
    lowered.startsWith("select") || lowered.startsWith("with");
  if (!startsValid) {
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
  customerId: string | null;
  userId: string | null;
  dbContext: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const prompt = [
    "You generate SQL for Postgres.",
    "Return only JSON that matches the provided schema.",
    "Generate a read-only query using only allowed tables from context.",
    "Use placeholders {customer_id} and {user_id} only when relevant.",
    "Do not use markdown fences.",
    "",
    `Question: ${input.question}`,
    `Selected customer id: ${input.customerId ?? "none"}`,
    `Selected user id: ${input.userId ?? "none"}`,
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
          },
          strict: true,
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
    const payloadSnippet = JSON.stringify(payload).slice(0, 800);
    throw new Error(
      `OpenAI SQL generation returned non-JSON payload: ${payloadSnippet}`,
    );
  }

  if (!parsed || !parsed.sql || typeof parsed.sql !== "string") {
    const payloadSnippet = JSON.stringify(payload).slice(0, 800);
    throw new Error(
      `OpenAI SQL generation returned invalid payload: ${payloadSnippet}`,
    );
  }

  return {
    sql: parsed.sql,
    raw_response: joinedOutput,
  };
}

async function callOpenAiForAnswer(input: {
  question: string;
  sql: string;
  rows: Array<Record<string, unknown>>;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return `Query executed successfully. Returned ${input.rows.length} rows.`;
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const prompt = [
    "You summarize SQL query results for business users.",
    "Keep answer concise and grounded in provided rows only.",
    "",
    `Question: ${input.question}`,
    `SQL: ${input.sql}`,
    `Rows: ${JSON.stringify(input.rows.slice(0, 50))}`,
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
    }),
  });
  console.log(response);
  if (!response.ok) {
    return `Query executed successfully. Returned ${input.rows.length} rows.`;
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

  const answer = outputTexts.join("\n").trim();
  return (
    answer || `Query executed successfully. Returned ${input.rows.length} rows.`
  );
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

    const body = (await request.json()) as AskSqlBody;
    const question = body.question?.trim() ?? "";

    if (!question) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 },
      );
    }

    const dbContext = await readDbContext();
    const generated = await callOpenAiForSql({
      question,
      customerId: body.customer_id ?? null,
      userId: body.user_id ?? null,
      dbContext,
    });

    const withTokensReplaced = generated.sql
      .replaceAll("{customer_id}", toSafeUuidLiteral(body.customer_id))
      .replaceAll("{user_id}", toSafeUuidLiteral(body.user_id));

    const validated = validateSql(withTokensReplaced);
    if (!validated.valid) {
      return NextResponse.json(
        {
          error: validated.error,
          openai_sql_response: generated.raw_response,
          sql_candidate: withTokensReplaced,
        },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient.rpc(
      "run_generated_sql" as never,
      {
        query_text: validated.sql,
      } as never,
    );

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          openai_sql_response: generated.raw_response,
          sql_candidate: validated.sql,
        },
        { status: 400 },
      );
    }

    const rows = Array.isArray(data)
      ? (data as Array<Record<string, unknown>>)
      : [];
    const answer = await callOpenAiForAnswer({
      question,
      sql: validated.sql,
      rows,
    });

    return NextResponse.json({
      answer,
      sql: validated.sql,
      openai_sql_response: generated.raw_response,
      rows,
      context_loaded: Boolean(dbContext),
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
