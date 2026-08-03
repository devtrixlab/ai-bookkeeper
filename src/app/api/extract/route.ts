import { NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/gemini";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, base64Image, mimeType = "image/jpeg" } = body;

    // 1. Validation
    if (!prompt && !base64Image) {
      return NextResponse.json(
        { error: "Please provide a prompt or an image." },
        { status: 400 }
      );
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
        5. Category: Assign the most logical standard accounting category.`
      },
    ];

    if (prompt) {
      promptParts.push({ text: prompt });
    }

    if (base64Image) {
      // The frontend must send raw base64, stripping the "data:image/jpeg;base64," prefix
      promptParts.push({
        inlineData: {
          data: base64Image,
          mimeType: mimeType,
        },
      });
    }

    // 3. Execution
    const result = await model.generateContent(promptParts);
    const responseText = result.response.text();
    
    // 4. Formatting: Gemini guarantees this string will match our schema perfectly
    const structuredData = JSON.parse(responseText);

    return NextResponse.json(structuredData, { status: 200 });

  } catch (error) {
    console.error("Extraction Error:", error);
    return NextResponse.json(
      { error: "Failed to process the receipt data." },
      { status: 500 }
    );
  }
}