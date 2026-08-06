import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log("Checking if is_ai_verified exists on invoices...");
  const { data, error } = await supabase.from('invoices').select('is_ai_verified').limit(1);
  if (error) {
    console.error("Column does not exist:", error.message);
  } else {
    console.log("Column exists!", data);
  }
}

run();
