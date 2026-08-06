import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing Supabase credentials in environment");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log("Logging in as test user...");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'test55@example.com',
    password: 'password123'
  });

  if (error || !data.session) {
    console.error("Login failed:", error?.message);
    process.exit(1);
  }

  const token = data.session.access_token;
  console.log("Logged in successfully. Token acquired.");

  const turns = [
    { prompt: "I bought 3 monitors from Dell for 120000 PKR total. Use Tech Hardware account." },
    { prompt: "Hello, what can you do?" },
    { prompt: "I paid AWS 15000 PKR for hosting services yesterday." },
    { prompt: "I sold 5 web design packages to ACME Corp for 500,000 PKR total. Invoice is paid." },
    { prompt: "What is my total revenue?" }
  ];

  let history = [];

  for (let i = 0; i < turns.length; i++) {
    console.log(`\n--- Turn ${i + 1} ---`);
    console.log(`User: ${turns[i].prompt}`);
    
    try {
      const res = await fetch('http://localhost:3000/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt: turns[i].prompt,
          history: history,
          chartOfAccounts: [
            { name: 'Tech Hardware' },
            { name: 'Hosting Expenses' },
            { name: 'Sales Revenue' }
          ]
        })
      });

      const text = await res.text();
      if (!res.ok) {
        console.error(`Error ${res.status}:`, text);
      } else {
        const json = JSON.parse(text);
        console.log(`AI Intent: ${json.intent}`);
        console.log(`AI Response Data:`, JSON.stringify(json, null, 2));
        
        // Append to history
        history.push({ sender: 'user', text: turns[i].prompt });
        if (json.conversational_response) {
          history.push({ sender: 'ai', text: json.conversational_response });
        } else if (json.clarification_question) {
          history.push({ sender: 'ai', text: json.clarification_question });
        } else {
          history.push({ sender: 'ai', text: "Extracted data successfully." });
        }
      }
    } catch (e) {
      console.error("Fetch failed:", e.message);
    }
    
    // wait a moment between turns
    await new Promise(r => setTimeout(r, 1000));
  }
}

run();
