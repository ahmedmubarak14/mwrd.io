# `send-notification` Edge Function

Processes pending rows in `notification_queue` and sends emails using one provider:

- `resend` (recommended)
- `sendgrid`
- `postmark`

## Required Environment Variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (recommended; passed as `x-cron-secret` header)
- `EMAIL_PROVIDER` (`resend`, `sendgrid`, or `postmark`)

Provider-specific:

- Resend: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- SendGrid: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`
- Postmark: `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM_EMAIL`

Optional:

- `NOTIFICATION_BATCH_SIZE` (default `25`)
- `NOTIFICATION_MAX_ATTEMPTS` (default `3`)

## Deploy

```bash
supabase functions deploy send-notification
```

## Test Invocation

```bash
curl -i --location --request POST \
  'https://<project-ref>.supabase.co/functions/v1/send-notification' \
  --header 'Content-Type: application/json' \
  --header 'x-cron-secret: <CRON_SECRET>' \
  --data '{"batchSize":10}'
```

## Dry Run

```bash
curl -i --location --request POST \
  'https://<project-ref>.supabase.co/functions/v1/send-notification' \
  --header 'Content-Type: application/json' \
  --header 'x-cron-secret: <CRON_SECRET>' \
  --data '{"batchSize":10,"dryRun":true}'
```

## Scheduler

Run this function every 1-5 minutes via Supabase Scheduled Functions or your external cron.
