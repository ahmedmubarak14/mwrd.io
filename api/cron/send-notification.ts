import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Verify cron secret for security
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // Allow if CRON_SECRET is not set (development) or if request comes from Vercel
        if (process.env.CRON_SECRET && !req.headers['x-vercel-cron']) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    if (!SUPABASE_URL) {
        return res.status(500).json({ error: 'SUPABASE_URL not configured' });
    }

    try {
        const functionUrl = `${SUPABASE_URL}/functions/v1/send-notification`;

        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
                'x-cron-secret': CRON_SECRET,
            },
            body: JSON.stringify({
                batchSize: 25,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Notification processing failed:', data);
            return res.status(response.status).json({
                success: false,
                error: data.error || 'Edge function returned error',
                details: data,
            });
        }

        console.log('Notification processing completed:', data);
        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            ...data,
        });
    } catch (error) {
        console.error('Notification cron error:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
