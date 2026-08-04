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
    const { prompt, image: base64Image } = body;

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

    // 2. Construct the Payload
    const promptParts: any[] = [
      {
        text: `SYSTEM INSTRUCTION: You are an expert autonomous bookkeeper and forensic accountant. Extract structured financial data from the provided user input. 
        
        RULES:
        1. Amount: Extract the final total paid. Do not extract subtotals or tax amounts as the main total.
        2. Currency: Identify the currency. If no currency is visible or mentioned, default to PKR.
        3. Date: Format strictly as YYYY-MM-DD. If the year is missing, assume the current year.
        4. Vendor: Extract the exact merchant or vendor name. Clean up messy store terminal names.
        5. Category: Assign the most logical standard accounting category.
        
        OUTPUT FORMAT:
        You must respond ONLY with a raw JSON object matching this schema. Do not include markdown formatting or backticks:
        {
          "amount": number,
          "currency": "string",
          "date": "YYYY-MM-DD",
          "vendor_name": "string",
          "category_name": "string"
        }`
      },
    ];

    if (prompt) {
      promptParts.push({ text: prompt });
    }

    if (cleanBase64) {
      promptParts.push({
        inlineData: {
          data: cleanBase64,
          mimeType: detectedMimeType,
        },
      });
    }

    // 3. Execution
    const result = await model.generateContent(promptParts);
    const responseText = result.response.text();
    
    // 4. Formatting: Strip markdown code blocks before parsing to prevent crashes
    const cleanedText = responseText.replace(/```json\n?|```/g, '').trim();
    const structuredData = JSON.parse(cleanedText);

    return NextResponse.json(structuredData, { status: 200 });

  } catch (error) {
    console.error("Extraction Error:", error);
    return NextResponse.json(
      { error: "Failed to process the receipt data." },
      { status: 500 }
    );
  }
}