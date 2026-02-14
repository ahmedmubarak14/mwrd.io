
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createTestUser() {
    const email = `test.user.${Date.now()}@example.com`;
    const password = 'TestPassword123!';

    console.log(`Creating test user: ${email}`);

    // 1. Sign Up
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                name: 'Test User',
                companyName: 'Test Corp'
            }
        }
    });

    if (authError) {
        console.error('Sign Up Failed:', authError.message);
        return;
    }

    console.log('Sign Up Success. User ID:', authData.user?.id);

    // 2. Try to Sign In (immediately)
    console.log('Attempting Sign In...');
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (signInError) {
        console.error('Sign In Failed:', signInError.message);
        return;
    }

    console.log('Sign In Success.');

    // 3. Try to Fetch Profile (This is the critical step for RLS recursion)
    console.log('Attempting to Fetch Profile...');
    const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', signInData.user.id)
        .single();

    if (profileError) {
        console.error('Profile Fetch Failed:', profileError.message);
        console.error('Code:', profileError.code);
        if (profileError.code === '42P17') {
            console.log('!!! DIAGNOSIS: INFINITE RECURSION DETECTED (Error 42P17) !!!');
        } else if (profileError.code === 'PGRST116') {
            console.log('!!! DIAGNOSIS: PROFILE MISSING (Row not found) !!!');
        }
    } else {
        console.log('Profile Fetch Success:', profile);
    }
}

createTestUser();
