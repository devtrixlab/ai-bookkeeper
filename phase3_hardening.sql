-- PHASE 3 HARDENING SCRIPT

-- ==========================================
-- 1. RPCs for Atomic Writes (Vuln 1)
-- ==========================================
CREATE OR REPLACE FUNCTION create_bill_atomic(
  p_user_id UUID,
  p_supplier_id UUID,
  p_issue_date DATE,
  p_due_date DATE,
  p_status TEXT,
  p_total_amount NUMERIC,
  p_account_id UUID,
  p_description TEXT,
  p_receipt_url TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_bill_id UUID;
BEGIN
  -- Insert bill
  INSERT INTO bills (user_id, supplier_id, issue_date, due_date, status, total_amount, balance_due, is_ai_verified, receipt_url)
  VALUES (p_user_id, p_supplier_id, p_issue_date, p_due_date, p_status, p_total_amount,
          CASE WHEN p_status = 'paid' THEN 0 ELSE p_total_amount END, false, p_receipt_url)
  RETURNING id INTO v_bill_id;

  -- Insert bill_line
  INSERT INTO bill_lines (bill_id, account_id, description, amount)
  VALUES (v_bill_id, p_account_id, p_description, p_total_amount);

  RETURN v_bill_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION create_invoice_atomic(
  p_user_id UUID,
  p_customer_id UUID,
  p_issue_date DATE,
  p_due_date DATE,
  p_status TEXT,
  p_total_amount NUMERIC,
  p_product_id UUID,
  p_description TEXT,
  p_receipt_url TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_invoice_id UUID;
BEGIN
  -- Insert invoice
  INSERT INTO invoices (user_id, customer_id, issue_date, due_date, status, total_amount, balance_due, is_ai_verified, receipt_url)
  VALUES (p_user_id, p_customer_id, p_issue_date, p_due_date, p_status, p_total_amount,
          CASE WHEN p_status = 'paid' THEN 0 ELSE p_total_amount END, false, p_receipt_url)
  RETURNING id INTO v_invoice_id;

  -- Insert invoice_line
  INSERT INTO invoice_lines (invoice_id, product_id, description, quantity, unit_price, total)
  VALUES (v_invoice_id, p_product_id, p_description, 1, p_total_amount, p_total_amount);

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================
-- 2. Concurrency Constraints (Vuln 3)
-- ==========================================
ALTER TABLE suppliers ADD CONSTRAINT suppliers_user_name_unique UNIQUE (user_id, name);
ALTER TABLE customers ADD CONSTRAINT customers_user_name_unique UNIQUE (user_id, name);
ALTER TABLE products ADD CONSTRAINT products_user_name_unique UNIQUE (user_id, name);
ALTER TABLE accounts ADD CONSTRAINT accounts_user_name_unique UNIQUE (user_id, name);


-- ==========================================
-- 3. Ledger Immutability (Vuln 4)
-- ==========================================
CREATE OR REPLACE FUNCTION prevent_verified_delete() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_ai_verified = true THEN
    RAISE EXCEPTION 'Cannot delete a verified transaction. Reverse it with a credit/debit note instead.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_verified_invoice_delete ON invoices;
CREATE TRIGGER trg_prevent_verified_invoice_delete
BEFORE DELETE ON invoices
FOR EACH ROW EXECUTE FUNCTION prevent_verified_delete();

DROP TRIGGER IF EXISTS trg_prevent_verified_bill_delete ON bills;
CREATE TRIGGER trg_prevent_verified_bill_delete
BEFORE DELETE ON bills
FOR EACH ROW EXECUTE FUNCTION prevent_verified_delete();


-- ==========================================
-- 4. Performance & RLS (Vuln 5)
-- ==========================================
-- Add the missing DELETE policy for ai_chat_logs
CREATE POLICY "Users can delete their own chat logs"
ON ai_chat_logs FOR DELETE
USING (auth.uid() = user_id);

-- Create INDEX statements for RLS join checks and fuzzy lookups
CREATE INDEX IF NOT EXISTS idx_invoices_id_user ON invoices(id, user_id);
CREATE INDEX IF NOT EXISTS idx_bills_id_user ON bills(id, user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_id_user ON journal_entries(id, user_id);

CREATE INDEX IF NOT EXISTS idx_suppliers_user_name ON suppliers(user_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_customers_user_name ON customers(user_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_products_user_name ON products(user_id, lower(name));
