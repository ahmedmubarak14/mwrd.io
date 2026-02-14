# `process-auto-quotes` Edge Function

Server-side auto-quote worker for open RFQs.

## What It Does

1. Optionally calls `close_expired_rfqs()` before processing.
2. Finds eligible RFQs older than the configured delay.
3. Generates `quotes` + `quote_items` (type=`auto`, status=`SENT_TO_CLIENT`).
4. Marks RFQs as `QUOTED` after successful auto-quote generation.
5. Enqueues `auto_quote_generated` notifications via `enqueue_notification`.

## Required Environment Variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (recommended; passed as `x-cron-secret` header)

## Deploy

```bash
supabase functions deploy process-auto-quotes
```

## Test Invocation

```bash
curl -i --location --request POST \
  'https://<project-ref>.supabase.co/functions/v1/process-auto-quotes' \
  --header 'Content-Type: application/json' \
  --header 'x-cron-secret: <CRON_SECRET>' \
  --data '{"limitRfqs":100}'
```

## Dry Run

```bash
curl -i --location --request POST \
  'https://<project-ref>.supabase.co/functions/v1/process-auto-quotes' \
  --header 'Content-Type: application/json' \
  --header 'x-cron-secret: <CRON_SECRET>' \
  --data '{"dryRun":true,"limitRfqs":50}'
```

## Scheduler

Run every 10-15 minutes via Supabase Scheduled Functions or external cron.
