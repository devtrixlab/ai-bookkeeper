export type ContactType = 'client' | 'vendor' | 'both';
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type EntryType = 'credit' | 'debit';
export type PaymentStatus = 'paid' | 'unpaid' | 'partial';

export type Profile = {
  id: string;
  email: string;
  business_name?: string;
  base_currency?: string;
  created_at: string;
};

export type Contact = {
  id: string;
  user_id: string;
  name: string;
  type: ContactType;
  contact_email?: string;
  created_at: string;
};

export type ChartOfAccount = {
  id: string;
  user_id: string;
  name: string;
  account_type: AccountType;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  contact_id: string | null;
  account_id: string | null;
  amount: number;
  entry_type: EntryType;
  status: PaymentStatus;
  issue_date: string;
  due_date: string | null;
  description: string | null;
  is_ai_verified: boolean;
  created_at: string;
  // Relational Joins
  contacts?: { name: string; type: ContactType };
  chart_of_accounts?: { name: string; account_type: AccountType };
};