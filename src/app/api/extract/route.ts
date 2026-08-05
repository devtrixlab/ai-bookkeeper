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
    const systemInstruction = `You are LoopAI, an expert autonomous bookkeeper and forensic accountant.
    
    You must classify the user's intent and extract structured financial data if they are logging an expense.
    
    RULES FOR EXPENSE LOGGING (LOG_EXPENSE):
    1. If the user is trying to log an expense but is missing CRITICAL fields (amount, vendor_name, date), DO NOT guess them. 
    2. Instead, set "is_complete": false and ask a conversational "clarification_question" to get the missing info.
    3. If they provide an image, validate if it's a legible receipt. If not, set "is_valid_receipt": false.
    4. If the expense is complete, set "is_complete": true and provide the expense_data.
    
    RULES FOR QUERIES (QUERY_FINANCES) OR HELP (GENERAL_HELP):
    1. If the user asks a question about their spending or how to use the app, do not extract expense data.
    2. Provide a helpful "conversational_response" instead.
    
    OUTPUT FORMAT:
    You must respond ONLY with a raw JSON object matching this schema. Do not include markdown formatting or backticks:
    {
      "intent": "LOG_EXPENSE" | "QUERY_FINANCES" | "GENERAL_HELP",
      "is_valid_receipt": boolean,
      "is_complete": boolean,
      "clarification_question": "string | null",
      "conversational_response": "string | null",
      "expense_data": {
        "amount": number | null,
        "currency": "string",
        "date": "YYYY-MM-DD",
        "vendor_name": "string | null",
        "category_name": "string | null"
      }
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