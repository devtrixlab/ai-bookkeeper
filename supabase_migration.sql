-- SME Bookkeeping Double-Entry Engine Schema
-- WIPE EXISTING DATA (WARNING: Destructive)
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS chart_of_accounts CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;

-- 1. ACCOUNTS (Chart of Accounts)
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    is_system BOOLEAN DEFAULT false, -- e.g. Accounts Receivable, Accounts Payable
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. JOURNAL ENTRIES & LINES
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    description TEXT,
    reference_type TEXT, -- 'invoice', 'bill', 'payment_received', 'payment_made'
    reference_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
    debit NUMERIC(15,2) DEFAULT 0,
    credit NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. CRM & PRODUCTS
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(15,2) NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. SALES (Invoices & Payments Received)
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
    issue_date DATE NOT NULL,
    due_date DATE,
    status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'partial', 'paid')),
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    balance_due NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(15,2) NOT NULL DEFAULT 1,
    unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
    total NUMERIC(15,2) NOT NULL DEFAULT 0
);

CREATE TABLE payments_received (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
    amount NUMERIC(15,2) NOT NULL,
    date DATE NOT NULL,
    payment_method TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. PURCHASES (Bills & Payments Made)
CREATE TABLE bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
    issue_date DATE NOT NULL,
    due_date DATE,
    status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'partial', 'paid')),
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    balance_due NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE bill_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT, -- The expense account
    description TEXT,
    amount NUMERIC(15,2) NOT NULL DEFAULT 0
);

CREATE TABLE payments_made (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
    amount NUMERIC(15,2) NOT NULL,
    date DATE NOT NULL,
    payment_method TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. RLS Policies
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments_received ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments_made ENABLE ROW LEVEL SECURITY;

-- Helper to create policies
CREATE OR REPLACE FUNCTION create_user_policy(table_name text) RETURNS void AS $$
BEGIN
    EXECUTE format('CREATE POLICY "Users can only access their own data" ON %I FOR ALL USING (auth.uid() = user_id)', table_name);
END;
$$ LANGUAGE plpgsql;

-- Apply to all user-owned tables
SELECT create_user_policy('accounts');
SELECT create_user_policy('journal_entries');
SELECT create_user_policy('customers');
SELECT create_user_policy('suppliers');
SELECT create_user_policy('products');
SELECT create_user_policy('invoices');
SELECT create_user_policy('payments_received');
SELECT create_user_policy('bills');
SELECT create_user_policy('payments_made');

-- For child tables without user_id, we join to parent
CREATE POLICY "Users can access their invoice lines" ON invoice_lines FOR ALL 
USING (EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_lines.invoice_id AND invoices.user_id = auth.uid()));

CREATE POLICY "Users can access their bill lines" ON bill_lines FOR ALL 
USING (EXISTS (SELECT 1 FROM bills WHERE bills.id = bill_lines.bill_id AND bills.user_id = auth.uid()));

CREATE POLICY "Users can access their journal lines" ON journal_lines FOR ALL 
USING (EXISTS (SELECT 1 FROM journal_entries WHERE journal_entries.id = journal_lines.journal_entry_id AND journal_entries.user_id = auth.uid()));

-- 7. Automated Seed for New Users (System Accounts)
CREATE OR REPLACE FUNCTION create_default_accounts_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.accounts (user_id, name, type, is_system) VALUES
    (NEW.id, 'Cash & Equivalents', 'asset', true),
    (NEW.id, 'Accounts Receivable', 'asset', true),
    (NEW.id, 'Inventory', 'asset', true),
    (NEW.id, 'Accounts Payable', 'liability', true),
    (NEW.id, 'Sales Revenue', 'revenue', true),
    (NEW.id, 'Cost of Goods Sold', 'expense', true),
    (NEW.id, 'General Expenses', 'expense', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE create_default_accounts_for_user();
