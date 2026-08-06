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
    const { prompt, image: base64Image, history = [] } = body;

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
    - LOG_BILL: User received a bill or incurred an expense from a Supplier.
    - LOG_INVOICE: User sent an invoice or sold a product/service to a Customer.
    - LOG_PAYMENT_MADE: User paid a bill.
    - LOG_PAYMENT_RECEIVED: User received a payment from a customer.
    - QUERY_FINANCES: General cash flow or spending queries.
    - GENERAL_HELP: General chat or usage help.
    
    RULES FOR EXTRACTION:
    1. If critical fields (amount, customer/supplier name) are missing, DO NOT guess them. Set "is_complete": false and ask a conversational "clarification_question".
    2. Use 'supplier_name' for bills and payments made. Use 'customer_name' for invoices and payments received.
    3. Determine if the transaction is fully paid ("status": "paid") or just an open invoice/bill ("status": "open").
    
    OUTPUT FORMAT:
    You must respond ONLY with a raw JSON object matching this schema. Do not include markdown formatting or backticks:
    {
      "intent": "LOG_BILL" | "LOG_INVOICE" | "LOG_PAYMENT_MADE" | "LOG_PAYMENT_RECEIVED" | "QUERY_FINANCES" | "GENERAL_HELP",
      "customer_name": "string | null",
      "supplier_name": "string | null",
      "product_name": "string | null",
      "account_name": "string | null",
      "amount": number | null,
      "status": "paid" | "open" | "partial" | "draft",
      "issue_date": "YYYY-MM-DD",
      "due_date": "YYYY-MM-DD | null",
      "description": "string | null",
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
    } catch (e) {
      console.error("Failed to parse JSON from AI response:", cleanedText);
      throw new Error("AI returned malformed JSON response.");
    }

    return NextResponse.json(structuredData, { status: 200 });

  } catch (error) {
    console.error("Extraction Error:", error);
    return NextResponse.json(
      { error: "Failed to process the receipt data." },
      { status: 500 }
    );
  }
}