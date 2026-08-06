import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testVerificationTrigger() {
  console.log("Starting E2E Database test for AI Verification...");

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'test@gmail.com',
    password: 'password123' // Or whatever it is. Wait, user said 123456
  });
  if (authErr || !authData.user) {
    // Try the other common one
    const { data: authData2, error: authErr2 } = await supabase.auth.signInWithPassword({
      email: 'test@gmail.com',
      password: '123456'
    });
    if (authErr2 || !authData2.user) {
        console.error("Login failed", authErr2);
        return;
    }
  }

  const userId = (await supabase.auth.getUser()).data.user.id;
  console.log("Logged in user:", userId);

  // 2. Ensure supplier exists
  let { data: supplier } = await supabase.from('suppliers').select('*').eq('user_id', userId).limit(1).single();
  if (!supplier) {
    const { data: newSupp } = await supabase.from('suppliers').insert({ user_id: userId, name: 'E2E Test Supplier' }).select().single();
    supplier = newSupp;
  }

  // 3. Ensure expense account exists
  let { data: account } = await supabase.from('accounts').select('*').eq('user_id', userId).eq('type', 'expense').limit(1).single();
  if (!account) {
    const { data: newAcc } = await supabase.from('accounts').insert({ user_id: userId, name: 'General Expenses', type: 'expense', is_system: true }).select().single();
    account = newAcc;
  }

  // 4. Simulate AI inserting a Bill (is_ai_verified = false)
  console.log("Simulating AI Bill creation...");
  const { data: bill, error: billErr } = await supabase.from('bills').insert({
    user_id: userId,
    supplier_id: supplier.id,
    issue_date: '2026-08-01',
    status: 'open',
    total_amount: 5000,
    balance_due: 5000,
    is_ai_verified: false
  }).select().single();

  if (billErr) {
    console.error("Failed to insert bill:", billErr);
    return;
  }
  console.log("Created Bill:", bill.id);

  // 5. Simulate AI inserting Bill Line
  const { error: lineErr } = await supabase.from('bill_lines').insert({
    bill_id: bill.id,
    account_id: account.id,
    amount: 5000,
    description: 'E2E Test Expense'
  });
  if (lineErr) console.error("Failed to insert bill line:", lineErr);

  // 6. Verify the bill via UI (update is_ai_verified to true)
  console.log("Simulating UI Verify...");
  const { error: verifyErr } = await supabase.from('bills').update({ is_ai_verified: true }).eq('id', bill.id);
  if (verifyErr) {
    console.error("Failed to verify bill:", verifyErr);
    return;
  }
  console.log("Bill verified successfully.");

  // 7. Check if Journal Entry was created
  const { data: je, error: jeErr } = await supabase.from('journal_entries').select('*, journal_lines(*)').eq('reference_id', bill.id);
  if (jeErr || !je || je.length === 0) {
    console.error("Trigger failed to create Journal Entry!");
  } else {
    console.log("✅ Trigger success! Created Journal Entry:", JSON.stringify(je, null, 2));
  }
}

testVerificationTrigger();
