
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

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkUser(email: string) {
    console.log(`Checking status for: ${email}`);

    // Try to sign in with a dummy password to see the error message
    // If user doesn't exist: "Invalid login credentials" (generic) or specific message
    // BUT we can try "signUp" - if user exists, it will say "User already registered" or send a confirmation email

    console.log('Attempting SIGN UP (safe check)...');
    const { data, error } = await supabase.auth.signUp({
        email,
        password: 'TemporaryPassword123!', // Dummy password
    });

    if (error) {
        console.log('Sign Up Result:', error.message);
        if (error.message.includes('already registered')) {
            console.log('CONCLUSION: User EXISTS in Auth system.');
            console.log('Run the password reset flow or use the correct password.');
        } else {
            console.log('CONCLUSION: Error during signup check:', error.message);
        }
    } else {
        if (data.user && data.user.identities && data.user.identities.length === 0) {
            console.log('CONCLUSION: User EXISTS (identities empty usually means existing user for email provider).');
        } else if (data.user) {
            console.log('CONCLUSION: User did NOT exist. Created a new pending user.');
            console.log('User ID:', data.user.id);
            console.log('NOTE: You might need to confirm email if confirmation is enabled.');
        } else {
            console.log('CONCLUSION: Unexpected state.');
        }
    }
}

const email = process.argv[2] || 'ahmedmubaraks@hotmail.com';
checkUser(email);
