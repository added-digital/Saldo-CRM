import type Anthropic from "@anthropic-ai/sdk";

import { getConsultantCustomers } from "./get-consultant-customers";
import { getCostCenterDetails } from "./get-cost-center-details";
import { getCustomerOverview } from "./get-customer-overview";
import { listCostCenters } from "./list-cost-centers";
import { resolveConsultant } from "./resolve-consultant";
import { resolveCustomer } from "./resolve-customer";
import { searchInvoices } from "./search-invoices";
import type { ToolContext, ToolResult } from "./types";

/**
 * Tool definitions sent to Claude. Names are snake_case to match Anthropic's
 * convention. Keep input_schema strict — Claude will refuse to call a tool
 * whose schema rejects valid inputs, so over-narrow constraints hurt.
 */
export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "resolve_customer",
    description:
      "Look up customers by name, organisation number, or Fortnox customer " +
      "number. Returns up to `limit` candidates so you can disambiguate before " +
      "calling other tools that need a customer_id (UUID). Always call this " +
      "first when the user references a customer by name.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Free-text fragment — customer name, org number, or Fortnox " +
            "number. Case-insensitive substring match.",
        },
        limit: {
          type: "integer",
          description: "Max candidates to return (1-20). Default 5.",
          minimum: 1,
          maximum: 20,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_customer_overview",
    description:
      "Return a compact dossier for a single customer: profile fields, the " +
      "latest monthly KPI snapshot (turnover, hours, contract value), the " +
      "count of active contracts, and recent activities. Use this as the " +
      "first call for any customer-scoped question — it usually answers " +
      "'how's customer X doing?' without further tool calls.",
    input_schema: {
      type: "object",
      properties: {
        customer_id: {
          type: "string",
          description: "Customer UUID (from resolve_customer.matches[].id).",
        },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "search_invoices",
    description:
      "Return invoices filtered by customer and/or date range, sorted newest " +
      "first. Turnover is normalised via the same strict-ex-VAT rule the " +
      "reports page uses, so numbers will agree with the UI. Useful for " +
      "questions like 'show me last quarter's invoices for Acme' or 'what " +
      "did we invoice in March?'.",
    input_schema: {
      type: "object",
      properties: {
        customer_id: {
          type: "string",
          description: "Optional customer UUID.",
        },
        date_from: {
          type: "string",
          description: "Inclusive start date (YYYY-MM-DD).",
        },
        date_to: {
          type: "string",
          description: "Inclusive end date (YYYY-MM-DD).",
        },
        limit: {
          type: "integer",
          description:
            "Max rows to return (1-1000, capped by Supabase's per-query " +
            "ceiling). Default 25. For aggregate questions ('total turnover " +
            "for the year') prefer a future aggregation tool over fetching " +
            "all rows.",
          minimum: 1,
          maximum: 1000,
        },
      },
    },
  },
  {
    name: "list_cost_centers",
    description:
      "List the firm's cost centers (Fortnox cost centers) with the number " +
      "of customers and consultants assigned to each. Use this for questions " +
      "like 'which cost centers do we have?' or 'how many customers in each " +
      "cost center?'. By default only active centers are returned — pass " +
      "active_only=false to include retired ones.",
    input_schema: {
      type: "object",
      properties: {
        active_only: {
          type: "boolean",
          description:
            "If true (default), only active cost centers are returned. Set " +
            "false to include inactive ones.",
        },
      },
    },
  },
  {
    name: "get_cost_center_details",
    description:
      "Drill into a single cost center: returns the cost center record plus " +
      "every customer and consultant assigned to it. Look up by `code` (the " +
      "Fortnox cost center code, e.g. '101') — call list_cost_centers first " +
      "if you don't know the code. Customers are paginated via " +
      "customer_limit (default 50); raise it for full lists.",
    input_schema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "The cost center code (e.g. '101', 'STO').",
        },
        customer_limit: {
          type: "integer",
          description: "Max customers to return (1-500). Default 50.",
          minimum: 1,
          maximum: 500,
        },
      },
      required: ["code"],
    },
  },
  {
    name: "resolve_consultant",
    description:
      "Look up a consultant / employee (a profile row) by name or email. " +
      "Returns up to `limit` candidates with id, full_name, email, role, " +
      "team_id, fortnox_cost_center and is_active so you can pick the right " +
      "person. Always call this first when the user references a consultant " +
      "by name (e.g. 'Alex Chaumon').",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Free-text fragment — full name or email. Case-insensitive " +
            "substring match.",
        },
        limit: {
          type: "integer",
          description: "Max candidates (1-20). Default 5.",
          minimum: 1,
          maximum: 20,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_consultant_customers",
    description:
      "Return every customer in a consultant's portfolio. Customers are " +
      "matched to consultants via Fortnox cost center (consultant's " +
      "profiles.fortnox_cost_center == customer.fortnox_cost_center). Use " +
      "this for questions like 'how many customers does X have?' or 'list " +
      "Y's clients'. Defaults to active customers only — set " +
      "active_only=false to include inactive.",
    input_schema: {
      type: "object",
      properties: {
        consultant_id: {
          type: "string",
          description:
            "Consultant profile UUID (from resolve_consultant.matches[].id).",
        },
        active_only: {
          type: "boolean",
          description:
            "If true (default), only customers with status='active' are " +
            "returned.",
        },
        limit: {
          type: "integer",
          description: "Max customers to return (1-1000). Default 100.",
          minimum: 1,
          maximum: 1000,
        },
      },
      required: ["consultant_id"],
    },
  },
];

type AnyToolHandler = (
  input: unknown,
  context: ToolContext,
) => Promise<ToolResult>;

const HANDLERS: Record<string, AnyToolHandler> = {
  resolve_customer: resolveCustomer as AnyToolHandler,
  get_customer_overview: getCustomerOverview as AnyToolHandler,
  search_invoices: searchInvoices as AnyToolHandler,
  list_cost_centers: listCostCenters as AnyToolHandler,
  get_cost_center_details: getCostCenterDetails as AnyToolHandler,
  resolve_consultant: resolveConsultant as AnyToolHandler,
  get_consultant_customers: getConsultantCustomers as AnyToolHandler,
};

/**
 * Dispatcher. Returns a JSON-serialisable result Claude can read back as a
 * tool_result block. Errors are returned as `{ error: string }` rather than
 * thrown, so a single bad tool call doesn't poison the whole turn.
 */
export async function executeTool(
  name: string,
  input: unknown,
  context: ToolContext,
): Promise<ToolResult> {
  const handler = HANDLERS[name];
  if (!handler) {
    return { error: `Unknown tool: ${name}` };
  }

  try {
    return await handler(input, context);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Tool execution failed.",
    };
  }
}
