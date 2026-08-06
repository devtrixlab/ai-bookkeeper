import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const expenseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    intent: { type: SchemaType.STRING, description: "LOG_BILL | LOG_INVOICE | LOG_PAYMENT_MADE | LOG_PAYMENT_RECEIVED | QUERY_FINANCES | GENERAL_HELP" },
    customer_name: { type: SchemaType.STRING, description: "Name of the customer (for invoices/payments received)", nullable: true },
    supplier_name: { type: SchemaType.STRING, description: "Name of the supplier (for bills/payments made)", nullable: true },
    product_name: { type: SchemaType.STRING, description: "Name of the product or service", nullable: true },
    account_name: { type: SchemaType.STRING, description: "Standard accounting category (e.g. Rent Expense, Sales Revenue)", nullable: true },
    amount: { type: SchemaType.NUMBER, description: "Total amount", nullable: true },
    status: { type: SchemaType.STRING, description: "paid | open | partial | draft", nullable: true },
    issue_date: { type: SchemaType.STRING, description: "Date in YYYY-MM-DD format", nullable: true },
    due_date: { type: SchemaType.STRING, description: "Date in YYYY-MM-DD format", nullable: true },
    description: { type: SchemaType.STRING, description: "Optional description", nullable: true },
    is_complete: { type: SchemaType.BOOLEAN, description: "Whether all required fields to log the entry are present" },
    clarification_question: { type: SchemaType.STRING, description: "Question to ask the user if is_complete is false", nullable: true },
    conversational_response: { type: SchemaType.STRING, description: "Response to the user", nullable: true }
  },
  required: ["intent", "is_complete"],
} as const;

export const getGeminiModel = () => {
  return genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: expenseSchema as any,
      temperature: 0.1,
    },
  });
};