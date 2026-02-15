import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const EMAIL_PROVIDER = (Deno.env.get("EMAIL_PROVIDER") ?? "resend").toLowerCase();
const DEFAULT_BATCH_SIZE = Number(Deno.env.get("NOTIFICATION_BATCH_SIZE") ?? 25);
const MAX_ATTEMPTS = Number(Deno.env.get("NOTIFICATION_MAX_ATTEMPTS") ?? 3);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") ?? "";
const SENDGRID_FROM_EMAIL = Deno.env.get("SENDGRID_FROM_EMAIL") ?? "";
const POSTMARK_SERVER_TOKEN = Deno.env.get("POSTMARK_SERVER_TOKEN") ?? "";
const POSTMARK_FROM_EMAIL = Deno.env.get("POSTMARK_FROM_EMAIL") ?? "";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || Deno.env.get("SITE_URL") || "";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN || "https://localhost",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const adminClient = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;

type QueueRow = {
  id: string;
  recipient_user_id: string | null;
  recipient_email: string;
  event_type: string;
  template_id: string | null;
  variables: Record<string, unknown> | null;
  attempts: number | null;
  status: "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "SKIPPED";
};

type TemplateRow = {
  id: string;
  event_type: string;
  subject_template: string;
  body_template: string;
  is_active: boolean;
};

type EmailSendResult = {
  provider: "resend" | "sendgrid" | "postmark";
  messageId?: string;
};

type ProcessingSummary = {
  fetched: number;
  sent: number;
  failed: number;
  skipped: number;
  retried: number;
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

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function interpolateTemplate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, key) => {
    const value = key
      .split(".")
      .reduce<unknown>((acc, part) => {
        if (!acc || typeof acc !== "object") return undefined;
        return (acc as Record<string, unknown>)[part];
      }, variables);

    if (value === undefined || value === null) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return escapeHtml(String(value));
    }

    try {
      return escapeHtml(JSON.stringify(value));
    } catch {
      return "";
    }
  });
}

function ensureAuthorized(req: Request): boolean {
  if (!CRON_SECRET) {
    console.error("CRON_SECRET is not configured — rejecting request");
    return false;
  }
  return req.headers.get("x-cron-secret") === CRON_SECRET;
}

function clampBatchSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(100, Math.floor(value)));
}

async function sendViaResend(to: string, subject: string, html: string): Promise<EmailSendResult> {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    throw new Error("Missing RESEND_API_KEY or RESEND_FROM_EMAIL");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return {
    provider: "resend",
    messageId: String(payload?.id || ""),
  };
}

async function sendViaSendGrid(to: string, subject: string, html: string): Promise<EmailSendResult> {
  if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
    throw new Error("Missing SENDGRID_API_KEY or SENDGRID_FROM_EMAIL");
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: SENDGRID_FROM_EMAIL },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`SendGrid failed (${response.status}): ${payload}`);
  }

  return {
    provider: "sendgrid",
    messageId: response.headers.get("x-message-id") || undefined,
  };
}

async function sendViaPostmark(to: string, subject: string, html: string): Promise<EmailSendResult> {
  if (!POSTMARK_SERVER_TOKEN || !POSTMARK_FROM_EMAIL) {
    throw new Error("Missing POSTMARK_SERVER_TOKEN or POSTMARK_FROM_EMAIL");
  }

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": POSTMARK_SERVER_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      From: POSTMARK_FROM_EMAIL,
      To: to,
      Subject: subject,
      HtmlBody: html,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Postmark failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return {
    provider: "postmark",
    messageId: String(payload?.MessageID || ""),
  };
}

async function sendEmail(to: string, subject: string, html: string): Promise<EmailSendResult> {
  if (EMAIL_PROVIDER === "sendgrid") {
    return sendViaSendGrid(to, subject, html);
  }
  if (EMAIL_PROVIDER === "postmark") {
    return sendViaPostmark(to, subject, html);
  }
  return sendViaResend(to, subject, html);
}

async function loadTemplate(queueItem: QueueRow): Promise<TemplateRow | null> {
  if (!adminClient) return null;

  if (queueItem.template_id) {
    const { data: templateById, error } = await adminClient
      .from("notification_templates")
      .select("id, event_type, subject_template, body_template, is_active")
      .eq("id", queueItem.template_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!error && templateById) {
      return templateById as TemplateRow;
    }
  }

  const { data: templateByEvent, error } = await adminClient
    .from("notification_templates")
    .select("id, event_type, subject_template, body_template, is_active")
    .eq("event_type", queueItem.event_type)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Template lookup failed:", error.message);
    return null;
  }

  return templateByEvent as TemplateRow | null;
}

async function writeLog(queueItem: QueueRow, status: string, metadata: Record<string, unknown>) {
  if (!adminClient) return;
  const { error } = await adminClient
    .from("notification_log")
    .insert({
      queue_id: queueItem.id,
      user_id: queueItem.recipient_user_id,
      event_type: queueItem.event_type,
      channel: "email",
      status,
      metadata,
    });
  if (error) {
    console.error("Failed to write notification log:", error.message);
  }
}

async function markSkipped(queueItem: QueueRow, reason: string) {
  if (!adminClient) return;
  await adminClient
    .from("notification_queue")
    .update({
      status: "SKIPPED",
      error_message: reason,
    })
    .eq("id", queueItem.id);
  await writeLog(queueItem, "SKIPPED", { reason });
}

async function processQueueItem(queueItem: QueueRow): Promise<"sent" | "failed" | "skipped" | "retried"> {
  if (!adminClient) return "failed";

  const attempts = Math.max(Number(queueItem.attempts || 0), 0) + 1;
  const { data: claimedItem, error: claimError } = await adminClient
    .from("notification_queue")
    .update({
      status: "PROCESSING",
      attempts,
      error_message: null,
    })
    .eq("id", queueItem.id)
    .eq("status", "PENDING")
    .select("id, recipient_user_id, recipient_email, event_type, template_id, variables, attempts, status")
    .maybeSingle();

  if (claimError) {
    console.error(`Failed to claim queue item ${queueItem.id}:`, claimError.message);
    return "failed";
  }

  if (!claimedItem) {
    return "skipped";
  }

  const claimed = claimedItem as QueueRow;
  const template = await loadTemplate(claimed);
  if (!template) {
    await markSkipped(claimed, `No active template found for event "${claimed.event_type}"`);
    return "skipped";
  }

  const variables = toObject(claimed.variables);
  const subject = interpolateTemplate(template.subject_template, variables);
  const html = interpolateTemplate(template.body_template, variables);

  try {
    const sent = await sendEmail(claimed.recipient_email, subject, html);
    const nowIso = new Date().toISOString();
    await adminClient
      .from("notification_queue")
      .update({
        status: "SENT",
        sent_at: nowIso,
        error_message: null,
      })
      .eq("id", claimed.id);

    await writeLog(claimed, "SENT", {
      provider: sent.provider,
      message_id: sent.messageId || null,
      attempts,
    });

    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldRetry = attempts < MAX_ATTEMPTS;

    await adminClient
      .from("notification_queue")
      .update({
        status: shouldRetry ? "PENDING" : "FAILED",
        error_message: message,
      })
      .eq("id", claimed.id);

    await writeLog(claimed, shouldRetry ? "RETRY_PENDING" : "FAILED", {
      provider: EMAIL_PROVIDER,
      attempts,
      error: message,
      retry_pending: shouldRetry,
    });

    return shouldRetry ? "retried" : "failed";
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed" });
  }

  if (!ensureAuthorized(req)) {
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

  const batchSize = clampBatchSize(Number(body.batchSize || DEFAULT_BATCH_SIZE));
  const dryRun = Boolean(body.dryRun);

  const { data: queueRows, error: queueError } = await adminClient
    .from("notification_queue")
    .select("id, recipient_user_id, recipient_email, event_type, template_id, variables, attempts, status")
    .eq("status", "PENDING")
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (queueError) {
    return jsonResponse(500, {
      success: false,
      error: `Failed to fetch notification queue: ${queueError.message}`,
    });
  }

  const pendingQueueItems = (queueRows || []) as QueueRow[];
  if (dryRun) {
    return jsonResponse(200, {
      success: true,
      dryRun: true,
      fetched: pendingQueueItems.length,
      items: pendingQueueItems.map((item) => ({
        id: item.id,
        recipient: item.recipient_email,
        eventType: item.event_type,
        attempts: item.attempts || 0,
      })),
    });
  }

  const summary: ProcessingSummary = {
    fetched: pendingQueueItems.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    retried: 0,
  };

  for (const queueItem of pendingQueueItems) {
    const result = await processQueueItem(queueItem);
    if (result === "sent") summary.sent += 1;
    if (result === "failed") summary.failed += 1;
    if (result === "skipped") summary.skipped += 1;
    if (result === "retried") summary.retried += 1;
  }

  return jsonResponse(200, {
    success: true,
    provider: EMAIL_PROVIDER,
    summary,
  });
});
