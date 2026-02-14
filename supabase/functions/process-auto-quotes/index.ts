import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const DEFAULT_AUTO_QUOTE_DELAY_MINUTES = 30;
const DEFAULT_GLOBAL_MARGIN_PERCENT = 15;
const DEFAULT_INCLUDE_LIMITED_STOCK = false;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const adminClient = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;

type RfqRow = {
  id: string;
  client_id: string;
  status: string;
  created_at: string;
  expires_at?: string | null;
};

type RfqItemRow = {
  id: string;
  rfq_id: string;
  product_id: string;
  quantity: number;
};

type ProductRow = {
  id: string;
  supplier_id: string;
  name: string;
  category: string;
  cost_price: number | null;
  status?: string | null;
  brand?: string | null;
  availability_status?: string | null;
  lead_time_days?: number | null;
};

type ExistingQuoteRow = {
  id: string;
  rfq_id: string;
  supplier_id: string;
};

type MarginSettingRow = {
  category: string | null;
  margin_percent: number | null;
  is_default?: boolean | null;
};

type SystemSettingsRow = {
  auto_quote_delay_minutes?: number | null;
  default_margin_percent?: number | null;
  auto_quote_enabled?: boolean | null;
  auto_quote_include_limited_stock?: boolean | null;
};

type AggregatedItem = {
  rfqItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  supplierUnitPrice: number;
  supplierLineTotal: number;
  marginPercent: number;
  finalUnitPrice: number;
  finalLineTotal: number;
  leadTimeDays: number;
};

type RunSummary = {
  closedExpiredRfqs: number;
  fetchedRfqs: number;
  eligibleRfqs: number;
  generatedQuotes: number;
  generatedQuoteItems: number;
  skippedExistingQuoteSuppliers: number;
  skippedUnavailableItems: number;
  failedQuotes: number;
  failedQuoteItems: number;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function isAuthorized(req: Request): boolean {
  if (!CRON_SECRET) return true;
  return req.headers.get("x-cron-secret") === CRON_SECRET;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function normalizeAvailability(value: string | null | undefined): "available" | "limited_stock" | "out_of_stock" {
  const normalized = String(value || "available").trim().toLowerCase();
  if (normalized === "out_of_stock") return "out_of_stock";
  if (normalized === "limited_stock" || normalized === "limited") return "limited_stock";
  return "available";
}

async function closeExpiredRfqs(): Promise<number> {
  if (!adminClient) return 0;
  const { data, error } = await adminClient.rpc("close_expired_rfqs");
  if (error) {
    console.error("close_expired_rfqs failed:", error.message);
    return 0;
  }
  return Math.max(0, Number(data || 0));
}

async function loadSystemSettings(): Promise<{
  autoQuoteDelayMinutes: number;
  defaultMarginPercent: number;
  autoQuoteEnabled: boolean;
  includeLimitedStock: boolean;
}> {
  if (!adminClient) {
    return {
      autoQuoteDelayMinutes: DEFAULT_AUTO_QUOTE_DELAY_MINUTES,
      defaultMarginPercent: DEFAULT_GLOBAL_MARGIN_PERCENT,
      autoQuoteEnabled: true,
      includeLimitedStock: DEFAULT_INCLUDE_LIMITED_STOCK,
    };
  }

  const { data, error } = await adminClient
    .from("system_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      autoQuoteDelayMinutes: DEFAULT_AUTO_QUOTE_DELAY_MINUTES,
      defaultMarginPercent: DEFAULT_GLOBAL_MARGIN_PERCENT,
      autoQuoteEnabled: true,
      includeLimitedStock: DEFAULT_INCLUDE_LIMITED_STOCK,
    };
  }

  const row = data as SystemSettingsRow;
  return {
    autoQuoteDelayMinutes: Math.max(1, toNumber(row.auto_quote_delay_minutes, DEFAULT_AUTO_QUOTE_DELAY_MINUTES)),
    defaultMarginPercent: Math.max(0, toNumber(row.default_margin_percent, DEFAULT_GLOBAL_MARGIN_PERCENT)),
    autoQuoteEnabled: row.auto_quote_enabled !== false,
    includeLimitedStock: row.auto_quote_include_limited_stock === true,
  };
}

async function loadMarginSettings(): Promise<MarginSettingRow[]> {
  if (!adminClient) return [];
  const { data, error } = await adminClient
    .from("margin_settings")
    .select("category, margin_percent, is_default");

  if (error) {
    console.error("Failed to load margin settings:", error.message);
    return [];
  }

  return (data || []) as MarginSettingRow[];
}

async function loadOpenRfqs(cutoffIso: string, limitRfqs: number): Promise<RfqRow[]> {
  if (!adminClient) return [];

  let { data, error } = await adminClient
    .from("rfqs")
    .select("id, client_id, status, created_at, expires_at")
    .eq("status", "OPEN")
    .lte("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(limitRfqs);

  if (error) {
    ({ data, error } = await adminClient
      .from("rfqs")
      .select("id, client_id, status, created_at")
      .eq("status", "OPEN")
      .lte("created_at", cutoffIso)
      .order("created_at", { ascending: true })
      .limit(limitRfqs));
  }

  if (error) {
    console.error("Failed to fetch open RFQs:", error.message);
    return [];
  }

  const nowMs = Date.now();
  return ((data || []) as RfqRow[]).filter((rfq) => {
    if (!rfq.expires_at) return true;
    const expiresMs = new Date(rfq.expires_at).getTime();
    if (!Number.isFinite(expiresMs)) return true;
    return expiresMs > nowMs;
  });
}

async function loadProductsByIds(productIds: string[]): Promise<ProductRow[]> {
  if (!adminClient || productIds.length === 0) return [];

  const wideSelect = "id, supplier_id, name, category, cost_price, status, brand, availability_status, lead_time_days";
  const narrowSelect = "id, supplier_id, name, category, cost_price, status";

  let { data, error } = await adminClient
    .from("products")
    .select(wideSelect)
    .in("id", productIds);

  if (error) {
    ({ data, error } = await adminClient
      .from("products")
      .select(narrowSelect)
      .in("id", productIds));
  }

  if (error) {
    console.error("Failed to fetch products for auto quotes:", error.message);
    return [];
  }

  return (data || []) as ProductRow[];
}

async function updateRfqsAfterAutoQuote(rfqIds: string[]) {
  if (!adminClient || rfqIds.length === 0) return;

  const baseUpdate = {
    status: "QUOTED",
    updated_at: new Date().toISOString(),
  };

  const withAutoTrigger = {
    ...baseUpdate,
    auto_quote_triggered: true,
  };

  const { error } = await adminClient
    .from("rfqs")
    .update(withAutoTrigger)
    .in("id", rfqIds)
    .eq("status", "OPEN");

  if (!error) return;

  const { error: fallbackError } = await adminClient
    .from("rfqs")
    .update(baseUpdate)
    .in("id", rfqIds)
    .eq("status", "OPEN");

  if (fallbackError) {
    console.error("Failed to update RFQ status after auto quote generation:", fallbackError.message);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return jsonResponse(401, { success: false, error: "Unauthorized" });
  }

  if (!adminClient) {
    return jsonResponse(500, { success: false, error: "Missing Supabase service configuration" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const dryRun = Boolean(body.dryRun);
  const closeExpiredFirst = body.closeExpiredRfqs !== false;
  const limitRfqs = clamp(Number(body.limitRfqs || 100), 1, 500);

  const summary: RunSummary = {
    closedExpiredRfqs: 0,
    fetchedRfqs: 0,
    eligibleRfqs: 0,
    generatedQuotes: 0,
    generatedQuoteItems: 0,
    skippedExistingQuoteSuppliers: 0,
    skippedUnavailableItems: 0,
    failedQuotes: 0,
    failedQuoteItems: 0,
  };

  if (closeExpiredFirst) {
    summary.closedExpiredRfqs = await closeExpiredRfqs();
  }

  const systemSettings = await loadSystemSettings();
  if (!systemSettings.autoQuoteEnabled) {
    return jsonResponse(200, {
      success: true,
      dryRun,
      autoQuoteEnabled: false,
      summary,
    });
  }

  const cutoffIso = new Date(Date.now() - systemSettings.autoQuoteDelayMinutes * 60 * 1000).toISOString();
  const rfqs = await loadOpenRfqs(cutoffIso, limitRfqs);
  summary.fetchedRfqs = rfqs.length;
  if (rfqs.length === 0) {
    return jsonResponse(200, { success: true, dryRun, summary });
  }

  const rfqIds = rfqs.map((rfq) => rfq.id);
  const { data: rfqItemsData, error: rfqItemsError } = await adminClient
    .from("rfq_items")
    .select("id, rfq_id, product_id, quantity")
    .in("rfq_id", rfqIds);

  if (rfqItemsError) {
    return jsonResponse(500, {
      success: false,
      error: `Failed to fetch RFQ items: ${rfqItemsError.message}`,
      summary,
    });
  }

  const rfqItems = (rfqItemsData || []) as RfqItemRow[];
  if (rfqItems.length === 0) {
    return jsonResponse(200, { success: true, dryRun, summary });
  }

  const uniqueProductIds = Array.from(new Set(rfqItems.map((item) => item.product_id)));
  const products = await loadProductsByIds(uniqueProductIds);
  const productsById = new Map(products.map((product) => [product.id, product]));

  const { data: existingQuotesData, error: existingQuotesError } = await adminClient
    .from("quotes")
    .select("id, rfq_id, supplier_id")
    .in("rfq_id", rfqIds);

  if (existingQuotesError) {
    return jsonResponse(500, {
      success: false,
      error: `Failed to fetch existing quotes: ${existingQuotesError.message}`,
      summary,
    });
  }

  const existingQuotes = (existingQuotesData || []) as ExistingQuoteRow[];
  const existingQuoteKeys = new Set(existingQuotes.map((quote) => `${quote.rfq_id}:${quote.supplier_id}`));

  const marginSettings = await loadMarginSettings();
  const categoryMargins = new Map<string, number>();
  let defaultMarginPercent = systemSettings.defaultMarginPercent;

  marginSettings.forEach((row) => {
    const marginPercent = Math.max(0, toNumber(row.margin_percent, 0));
    if (row.category) {
      categoryMargins.set(row.category, marginPercent);
    }
    if (row.is_default || row.category === null) {
      defaultMarginPercent = marginPercent;
    }
  });

  const { data: clientsData } = await adminClient
    .from("users")
    .select("id, name, company_name")
    .in("id", Array.from(new Set(rfqs.map((rfq) => rfq.client_id))));

  const clientLabelById = new Map<string, string>();
  (clientsData || []).forEach((client: { id: string; name?: string | null; company_name?: string | null }) => {
    clientLabelById.set(client.id, String(client.company_name || client.name || "Client"));
  });

  const touchedRfqIds = new Set<string>();

  for (const rfq of rfqs) {
    const itemsForRfq = rfqItems.filter((item) => item.rfq_id === rfq.id);
    if (itemsForRfq.length === 0) {
      continue;
    }

    summary.eligibleRfqs += 1;

    const supplierGroups = new Map<string, AggregatedItem[]>();
    for (const item of itemsForRfq) {
      const product = productsById.get(item.product_id);
      if (!product) continue;

      const supplierId = product.supplier_id;
      const existingKey = `${rfq.id}:${supplierId}`;
      if (existingQuoteKeys.has(existingKey)) {
        summary.skippedExistingQuoteSuppliers += 1;
        continue;
      }

      if (product.status && String(product.status).toUpperCase() !== "APPROVED") {
        summary.skippedUnavailableItems += 1;
        continue;
      }

      const availability = normalizeAvailability(product.availability_status);
      if (availability === "out_of_stock") {
        summary.skippedUnavailableItems += 1;
        continue;
      }
      if (availability === "limited_stock" && !systemSettings.includeLimitedStock) {
        summary.skippedUnavailableItems += 1;
        continue;
      }

      const supplierUnitPrice = Math.max(0, toNumber(product.cost_price, 0));
      if (supplierUnitPrice <= 0) {
        summary.skippedUnavailableItems += 1;
        continue;
      }

      const quantity = Math.max(1, toNumber(item.quantity, 1));
      const categoryMargin = categoryMargins.get(product.category) ?? 0;
      const appliedMarginPercent = Math.max(categoryMargin, defaultMarginPercent);
      const supplierLineTotal = supplierUnitPrice * quantity;
      const finalUnitPrice = supplierUnitPrice * (1 + appliedMarginPercent / 100);
      const finalLineTotal = finalUnitPrice * quantity;

      const entry: AggregatedItem = {
        rfqItemId: item.id,
        productId: item.product_id,
        productName: product.name,
        quantity,
        supplierUnitPrice,
        supplierLineTotal,
        marginPercent: appliedMarginPercent,
        finalUnitPrice,
        finalLineTotal,
        leadTimeDays: Math.max(1, toNumber(product.lead_time_days, 3)),
      };

      if (!supplierGroups.has(supplierId)) {
        supplierGroups.set(supplierId, []);
      }
      supplierGroups.get(supplierId)?.push(entry);
    }

    for (const [supplierId, groupedItems] of supplierGroups.entries()) {
      if (groupedItems.length === 0) continue;

      const supplierPriceTotal = groupedItems.reduce((sum, item) => sum + item.supplierLineTotal, 0);
      const clientPriceTotal = groupedItems.reduce((sum, item) => sum + item.finalLineTotal, 0);
      const marginWeightedTotal = groupedItems.reduce((sum, item) => sum + (item.marginPercent * item.supplierLineTotal), 0);
      const weightedMarginPercent = supplierPriceTotal > 0
        ? marginWeightedTotal / supplierPriceTotal
        : defaultMarginPercent;
      const maxLeadTimeDays = groupedItems.reduce((max, item) => Math.max(max, item.leadTimeDays), 1);
      const leadTimeLabel = maxLeadTimeDays === 1
        ? "1 day (auto)"
        : `${maxLeadTimeDays} days (auto)`;

      if (dryRun) {
        summary.generatedQuotes += 1;
        summary.generatedQuoteItems += groupedItems.length;
        continue;
      }

      const { data: insertedQuote, error: insertQuoteError } = await adminClient
        .from("quotes")
        .insert({
          rfq_id: rfq.id,
          supplier_id: supplierId,
          supplier_price: round2(supplierPriceTotal),
          lead_time: leadTimeLabel,
          margin_percent: round2(weightedMarginPercent),
          final_price: round2(clientPriceTotal),
          status: "SENT_TO_CLIENT",
          type: "auto",
        })
        .select("id")
        .single();

      if (insertQuoteError || !insertedQuote) {
        if (insertQuoteError?.code === "23505") {
          existingQuoteKeys.add(`${rfq.id}:${supplierId}`);
          summary.skippedExistingQuoteSuppliers += 1;
          continue;
        }
        console.error("Auto quote insert failed:", insertQuoteError?.message || "unknown error");
        summary.failedQuotes += 1;
        continue;
      }

      const quoteId = String((insertedQuote as { id: string }).id);
      const quoteItemRows = groupedItems.map((item) => ({
        quote_id: quoteId,
        rfq_item_id: item.rfqItemId,
        product_id: item.productId,
        unit_price: round2(item.supplierUnitPrice),
        quantity: item.quantity,
        margin_percent: round2(item.marginPercent),
        final_unit_price: round2(item.finalUnitPrice),
        final_line_total: round2(item.finalLineTotal),
        is_quoted: true,
      }));

      const { error: quoteItemsError } = await adminClient
        .from("quote_items")
        .insert(quoteItemRows);

      if (quoteItemsError) {
        console.error("Auto quote_items insert failed:", quoteItemsError.message);
        summary.failedQuoteItems += quoteItemRows.length;
        continue;
      }

      summary.generatedQuotes += 1;
      summary.generatedQuoteItems += quoteItemRows.length;
      touchedRfqIds.add(rfq.id);
      existingQuoteKeys.add(`${rfq.id}:${supplierId}`);

      const clientLabel = clientLabelById.get(rfq.client_id) || "Client";
      await adminClient.rpc("enqueue_notification", {
        p_user_id: rfq.client_id,
        p_event_type: "auto_quote_generated",
        p_variables: {
          client_name: clientLabel,
          rfq_number: rfq.id.slice(0, 8).toUpperCase(),
          total_amount: round2(clientPriceTotal).toFixed(2),
        },
      }).catch((error) => {
        console.error("Failed to enqueue auto quote notification:", error?.message || error);
      });
    }
  }

  if (!dryRun) {
    await updateRfqsAfterAutoQuote(Array.from(touchedRfqIds));
  }

  return jsonResponse(200, {
    success: true,
    dryRun,
    config: {
      autoQuoteDelayMinutes: systemSettings.autoQuoteDelayMinutes,
      defaultMarginPercent: defaultMarginPercent,
      includeLimitedStock: systemSettings.includeLimitedStock,
    },
    summary,
  });
});
