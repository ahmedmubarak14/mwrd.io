
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local manually since we are running this with ts-node/node
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
    process.exit(1);
}

console.log(`Testing connection to: ${supabaseUrl}`);
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
    try {
        // Try to selecting from a public table (e.g. products or just health check)
        // We'll try to get the session first (should be null)
        const { data: session, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
            console.error('Auth Session Error:', sessionError.message);
        } else {
            console.log('Auth Service: Reachable');
        }

        // Try a simple query
        // NOTE: This might fail if RLS is strict and we are anon
        const { data, error, count } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.error('Database Query Error:', error.message);
            console.error('Details:', error);
        } else {
            console.log('Database Connection: Success');
            console.log('Products Count:', count);
        }

        console.log('--- Test Complete ---');
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

testConnection();
