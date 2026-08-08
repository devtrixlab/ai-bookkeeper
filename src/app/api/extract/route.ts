import { NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/gemini";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignored in server route handlers
            }
          },
        },
      }
    );

    let user = null;
    const { data: cookieAuthData } = await supabase.auth.getUser();
    user = cookieAuthData?.user;

    // Fallback: Check Authorization header for Bearer token
    if (!user) {
      const authHeader = request.headers.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        const { data: tokenAuthData } = await supabase.auth.getUser(token);
        user = tokenAuthData?.user;
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized. Please sign in to log expenses." }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, image: base64Image, history = [], chartOfAccounts = [] } = body;
    
    // Create a string list of valid account names
    const accountNames = chartOfAccounts.map((a: any) => a.name).join(", ") || "No accounts provided";
    const today = new Date().toISOString().split('T')[0];

    // 1. Validation
    if (!prompt && !base64Image) {
      return NextResponse.json(
        { error: "Please provide a prompt or an image." },
        { status: 400 }
      );
    }

    let cleanBase64 = base64Image;
    let detectedMimeType = "image/jpeg";

    if (base64Image && typeof base64Image === 'string') {
      const dataUrlMatches = base64Image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (dataUrlMatches) {
        detectedMimeType = dataUrlMatches[1];
        cleanBase64 = dataUrlMatches[2];
      } else {
        cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
      }
    }

    const model = getGeminiModel();

    // 2. System Instruction
    const systemInstruction = `You are LoopAI, an expert SME autonomous bookkeeper.
    
    You must classify the user's intent and extract structured financial data for double-entry bookkeeping.
    
    INTENTS:
    - LOG_BILL: User received a bill, or incurred a direct expense (e.g. utilities, rent) from a Vendor/Payee. Do not force product names for generic expenses; treat the vendor as the payee.
    - LOG_INVOICE: User sent an invoice, or received alternative income from a Customer/Client.
    - LOG_PAYMENT_MADE: User paid a bill.
    - LOG_PAYMENT_RECEIVED: User received a payment from a customer.
    - UPDATE_TRANSACTION: User wants to update or modify an existing transaction.
    - QUERY_FINANCES: General cash flow or spending queries.
    - GENERAL_HELP: General chat or usage help.
    
    RULES FOR EXTRACTION:
    1. Multi-Line Item Extraction: A single receipt/invoice can contain multiple items. You MUST return an array of line items in "line_items". For each item, extract its "description", "quantity", "unit_price", and "total". Never summarize them into a single line.
    2. Missing Data: If critical fields (total_amount, line_items, customer/supplier name) are missing, DO NOT guess them. Set "is_complete": false and ask a conversational "clarification_question".
    3. Entity Resolution: Extract the exact legal name of the vendor or client into 'supplier_name' (for bills/payments made) or 'customer_name' (for invoices/payments received), separating it from the line items.
    4. Chart of Accounts Grounding: You MUST categorize each line item using ONLY the exact account names provided: [${accountNames}]. You must place the exact account name in the "account_name" field of each line item. Do not hallucinate non-existent accounting categories. If none fit perfectly, pick the closest match.
    5. Dates: Today's date is ${today}. If the user says "yesterday" or "today" or a day of the week, calculate the exact YYYY-MM-DD based on today. The "issue_date" and "due_date" MUST be in strict YYYY-MM-DD format. If no issue_date is given, default to ${today}.
    6. Conversational Queries: If intent is QUERY_FINANCES, you must provide query_parameters to specify what you need (revenue, expenses, all). If intent is UPDATE_TRANSACTION, you must extract the transaction_id from the history and provide update_parameters.
    7. Chat History & Privacy: You MUST know that ALL chat history and financial logs ARE securely stored in the system database. Users can view their entire history at any time by clicking the "Chat History" button in the UI. If a user asks about chat history, memory, or persistence, you must explicitly confirm that their history is safely stored and accessible to them.
    
    OUTPUT FORMAT:
    You must respond ONLY with a raw JSON object matching this schema. Do not include markdown formatting, backticks, or any conversational text outside the JSON:
    {
      "intent": "LOG_BILL" | "LOG_INVOICE" | "LOG_PAYMENT_MADE" | "LOG_PAYMENT_RECEIVED" | "UPDATE_TRANSACTION" | "QUERY_FINANCES" | "GENERAL_HELP",
      "customer_name": "string | null",
      "supplier_name": "string | null",
      "total_amount": number | null,
      "status": "paid" | "open" | "partial" | "draft",
      "issue_date": "YYYY-MM-DD",
      "due_date": "YYYY-MM-DD | null",
      "line_items": [
        {
          "description": "string",
          "quantity": number,
          "unit_price": number,
          "total": number,
          "account_name": "string"
        }
      ],
      "is_complete": boolean,
      "clarification_question": "string | null",
      "conversational_response": "string | null"
    }`;

    // 3. Construct multi-turn contents
    const contents: any[] = [];

    // Map passed history to Gemini format
    for (const msg of history) {
      if (msg.sender === 'user') {
        contents.push({ role: 'user', parts: [{ text: msg.text }] });
      } else if (msg.sender === 'ai') {
        // Only push text AI responses to context
        if (msg.text) {
          contents.push({ role: 'model', parts: [{ text: msg.text }] });
        }
      }
    }

    // Current turn parts
    const currentParts: any[] = [];
    if (cleanBase64) {
      currentParts.push({
        inlineData: {
          data: cleanBase64,
          mimeType: detectedMimeType,
        },
      });
    }
    if (prompt) {
      currentParts.push({ text: prompt });
    }

    contents.push({ role: 'user', parts: currentParts });

    // Ensure we start with system instruction
    const finalContents = [
      { role: 'user', parts: [{ text: systemInstruction }] },
      { role: 'model', parts: [{ text: 'Understood. I will respond strictly in the requested JSON format.' }] },
      ...contents
    ];

    // 4. Execution
    const result = await model.generateContent({ contents: finalContents });
    const responseText = result.response.text();
    
    // 5. Formatting: Strip markdown code blocks before parsing
    const cleanedText = responseText.replace(/```json\n?|```/g, '').trim();
    let structuredData;
    try {
      structuredData = JSON.parse(cleanedText);
      
      // Basic runtime validation of AI response structure
      if (!structuredData.intent) structuredData.intent = 'GENERAL_HELP';
      
      if (['LOG_BILL', 'LOG_INVOICE'].includes(structuredData.intent)) {
        if (
          !structuredData.total_amount || 
          !structuredData.line_items || 
          !Array.isArray(structuredData.line_items) || 
          structuredData.line_items.length === 0
        ) {
          structuredData.is_complete = false;
          structuredData.clarification_question = structuredData.clarification_question || "I couldn't detect the total amount or the individual items. Could you provide those details?";
        }
      }

      if (structuredData.intent === 'QUERY_FINANCES') {
        const target = structuredData.query_parameters?.target || 'all';
        let context = "Real Database Balances:\n";
        let totalRevenue = 0;
        let totalExpenses = 0;

        if (target === 'revenue' || target === 'all') {
          const { data: invoices } = await supabase.from('invoices').select('total_amount').eq('user_id', user.id).neq('status', 'draft');
          totalRevenue = invoices?.reduce((acc, inv) => acc + Number(inv.total_amount), 0) || 0;
          context += `- Total Revenue: ${totalRevenue} PKR\n`;
        }

        if (target === 'expenses' || target === 'all') {
          const { data: bills } = await supabase.from('bills').select('total_amount').eq('user_id', user.id).neq('status', 'draft');
          totalExpenses = bills?.reduce((acc, bill) => acc + Number(bill.total_amount), 0) || 0;
          context += `- Total Expenses: ${totalExpenses} PKR\n`;
        }

        const secondPassContents = [
           ...finalContents,
           { role: 'model', parts: [{ text: cleanedText }] },
           { role: 'user', parts: [{ text: `Do not hallucinate. Using this real database data, answer the user's query accurately in the conversational_response field:\n${context}` }] }
        ];

        const result2 = await model.generateContent({ contents: secondPassContents });
        const cleanedText2 = result2.response.text().replace(/```json\n?|```/g, '').trim();
        structuredData = JSON.parse(cleanedText2);
      }

      if (structuredData.intent === 'UPDATE_TRANSACTION') {
         const up = structuredData.update_parameters;
         if (up?.transaction_id && up?.new_amount && up?.update_type) {
             const safeAmountCents = Math.round(parseFloat(up.new_amount.toString().replace(/[^0-9.-]/g, '')) * 100);
             
             if (up.update_type === 'bill') {
                const { data: currentBill } = await supabase.from('bills').select('*, bill_lines(account_id)').eq('id', up.transaction_id).single();
                if (currentBill) {
                   await supabase.rpc('update_bill_atomic', {
                     p_bill_id: currentBill.id,
                     p_user_id: user.id,
                     p_supplier_id: currentBill.supplier_id,
                     p_issue_date: currentBill.issue_date,
                     p_due_date: currentBill.due_date,
                     p_status: currentBill.status,
                     p_total_amount: Math.round(safeAmountCents) / 100,
                     p_receipt_url: currentBill.receipt_url,
                     p_line_items: [{
                        account_id: currentBill.bill_lines?.[0]?.account_id || null,
                        description: 'Updated via AI',
                        amount: Math.round(safeAmountCents) / 100
                     }]
                   });
                   structuredData.conversational_response = `Successfully updated the bill amount to ${up.new_amount} PKR.`;
                }
             } else {
                const { data: currentInvoice } = await supabase.from('invoices').select('*').eq('id', up.transaction_id).single();
                if (currentInvoice) {
                   await supabase.rpc('update_invoice_atomic', {
                     p_invoice_id: currentInvoice.id,
                     p_user_id: user.id,
                     p_customer_id: currentInvoice.customer_id,
                     p_issue_date: currentInvoice.issue_date,
                     p_due_date: currentInvoice.due_date,
                     p_status: currentInvoice.status,
                     p_total_amount: Math.round(safeAmountCents) / 100,
                     p_receipt_url: currentInvoice.receipt_url,
                     p_line_items: [{
                        product_id: null,
                        description: 'Updated via AI',
                        quantity: 1,
                        unit_price: Math.round(safeAmountCents) / 100,
                        total: Math.round(safeAmountCents) / 100
                     }]
                   });
                   structuredData.conversational_response = `Successfully updated the invoice amount to ${up.new_amount} PKR.`;
                }
             }
         } else {
            structuredData.conversational_response = "I need to know which transaction you want to update and the new amount. (Please click the edit icon in the UI if this is an older transaction).";
         }
      }

    } catch (e) {
      console.error("Failed to parse JSON from AI response:", e);
      // Graceful fallback instead of crashing
      structuredData = {
        intent: 'GENERAL_HELP',
        is_complete: false,
        clarification_question: "I couldn't quite understand that. Could you please rephrase or provide the receipt details again?",
        conversational_response: null,
      };
    }

    return NextResponse.json(structuredData, { status: 200 });

  } catch (error) {
    console.error("AI PARSING ERROR:", error);
    return NextResponse.json(
      { error: "Failed to process the receipt data." },
      { status: 500 }
    );
  }
}