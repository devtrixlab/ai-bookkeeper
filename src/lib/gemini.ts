import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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
} as const satisfies ResponseSchema;

export const getGeminiModel = () => {
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: expenseSchema,
      temperature: 0.1,
    },
  });
};