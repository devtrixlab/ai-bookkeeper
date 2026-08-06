import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function seed() {
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
  
  const accountsToSeed = [
    { user_id: userId, name: 'Cash & Equivalents', type: 'asset', is_system: true },
    { user_id: userId, name: 'Accounts Receivable', type: 'asset', is_system: true },
    { user_id: userId, name: 'Inventory', type: 'asset', is_system: true },
    { user_id: userId, name: 'Accounts Payable', type: 'liability', is_system: true },
    { user_id: userId, name: 'Sales Revenue', type: 'revenue', is_system: true },
    { user_id: userId, name: 'Cost of Goods Sold', type: 'expense', is_system: true },
    { user_id: userId, name: 'General Expenses', type: 'expense', is_system: true }
  ];

  for (const acc of accountsToSeed) {
    const { data: existing } = await supabase.from('accounts').select('id').eq('user_id', userId).eq('name', acc.name).limit(1);
    if (!existing || existing.length === 0) {
      await supabase.from('accounts').insert(acc);
      console.log(`Inserted ${acc.name}`);
    }
  }
  console.log("Seeding complete.");
}
seed();
