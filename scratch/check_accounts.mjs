import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'test@gmail.com',
    password: 'password123'
  });
  if (authErr || !authData.user) {
    await supabase.auth.signInWithPassword({
      email: 'test@gmail.com',
      password: '123456'
    });
  }

  const userId = (await supabase.auth.getUser()).data.user.id;
  const { data } = await supabase.from('accounts').select('*').eq('user_id', userId);
  console.log("Accounts for user:", data);
}
check();
