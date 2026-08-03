import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

// We initialize the client securely using the server-side environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// We export this strict schema so our API route can force Gemini to return JSON
export const expenseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    vendor_name: { type: SchemaType.STRING, description: "Name of the merchant" },
    amount: { type: SchemaType.NUMBER, description: "Final total paid" },
    currency: { type: SchemaType.STRING, description: "Currency code (e.g., PKR, USD)" },
    date: { type: SchemaType.STRING, description: "Date in YYYY-MM-DD format" },
    category_name: { type: SchemaType.STRING, description: "Standard accounting category" },
  },
  required: ["vendor_name", "amount", "currency", "date", "category_name"],
};

export const getGeminiModel = () => {
  // flash is extremely fast and cost-effective for data extraction
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: expenseSchema,
      temperature: 0.1, 
    },
  });
};