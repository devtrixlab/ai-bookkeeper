-- expert_patches.sql
-- Execute this script in your Supabase SQL Editor to resolve deep logical bugs 
-- discovered during the expert review of the atomic update functions.

-- 1. FIX: `update_invoice_atomic` clobbering payment history
-- Problem: The original phase6_editing.sql hardcoded `balance_due = p_total_amount`.
-- If an invoice was partially paid, editing it would reset the balance and wipe the payment history.
-- Solution: Calculate `new_balance = new_total - (old_total - old_balance)`.

CREATE OR REPLACE FUNCTION update_invoice_atomic(
  p_invoice_id UUID,
  p_user_id UUID,
  p_customer_id UUID,
  p_issue_date DATE,
  p_due_date DATE,
  p_status TEXT,
  p_total_amount NUMERIC,
  p_receipt_url TEXT,
  p_line_items JSONB
) RETURNS VOID AS $$
DECLARE
  v_item JSONB;
  v_is_verified BOOLEAN;
  v_old_total NUMERIC;
  v_old_balance NUMERIC;
  v_new_balance NUMERIC;
  v_je_id UUID;
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
BEGIN
  SELECT is_ai_verified, total_amount, balance_due INTO v_is_verified, v_old_total, v_old_balance 
  FROM invoices WHERE id = p_invoice_id AND user_id = p_user_id;

  -- Calculate new balance_due preserving existing payments
  IF p_status = 'paid' THEN
     v_new_balance := 0;
  ELSE
     v_new_balance := p_total_amount - (v_old_total - v_old_balance);
  END IF;

  -- Update invoice
  UPDATE invoices SET 
    customer_id = p_customer_id,
    issue_date = p_issue_date,
    due_date = p_due_date,
    status = p_status,
    total_amount = p_total_amount,
    balance_due = v_new_balance,
    receipt_url = COALESCE(p_receipt_url, receipt_url)
  WHERE id = p_invoice_id AND user_id = p_user_id;

  -- Delete existing lines
  DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id;

  -- Insert new lines
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    INSERT INTO invoice_lines (invoice_id, product_id, description, quantity, unit_price, total)
    VALUES (
      p_invoice_id, 
      (v_item->>'product_id')::UUID, 
      v_item->>'description', 
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total')::NUMERIC
    );
  END LOOP;

  IF v_is_verified THEN
     DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE reference_id = p_invoice_id AND reference_type = 'invoice');
     DELETE FROM journal_entries WHERE reference_id = p_invoice_id AND reference_type = 'invoice';
     
     SELECT id INTO v_ar_account_id FROM accounts WHERE user_id = p_user_id AND is_system = true AND name = 'Accounts Receivable' LIMIT 1;
     SELECT id INTO v_revenue_account_id FROM accounts WHERE user_id = p_user_id AND is_system = true AND name = 'Sales Revenue' LIMIT 1;

     INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
     VALUES (p_user_id, p_issue_date, 'Invoice ' || p_invoice_id, 'invoice', p_invoice_id)
     RETURNING id INTO v_je_id;

     INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) 
     VALUES (v_je_id, v_ar_account_id, p_total_amount, 0);

     INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) 
     VALUES (v_je_id, v_revenue_account_id, 0, p_total_amount);
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. FIX: `update_bill_atomic` clobbering payment history

CREATE OR REPLACE FUNCTION update_bill_atomic(
  p_bill_id UUID,
  p_user_id UUID,
  p_supplier_id UUID,
  p_issue_date DATE,
  p_due_date DATE,
  p_status TEXT,
  p_total_amount NUMERIC,
  p_receipt_url TEXT,
  p_line_items JSONB
) RETURNS VOID AS $$
DECLARE
  v_item JSONB;
  v_is_verified BOOLEAN;
  v_old_total NUMERIC;
  v_old_balance NUMERIC;
  v_new_balance NUMERIC;
  v_je_id UUID;
  v_ap_account_id UUID;
BEGIN
  -- Get verification status and balances
  SELECT is_ai_verified, total_amount, balance_due INTO v_is_verified, v_old_total, v_old_balance 
  FROM bills WHERE id = p_bill_id AND user_id = p_user_id;
  
  -- Calculate new balance_due preserving existing payments
  IF p_status = 'paid' THEN
     v_new_balance := 0;
  ELSE
     v_new_balance := p_total_amount - (v_old_total - v_old_balance);
  END IF;

  -- Update bill
  UPDATE bills SET 
    supplier_id = p_supplier_id,
    issue_date = p_issue_date,
    due_date = p_due_date,
    status = p_status,
    total_amount = p_total_amount,
    balance_due = v_new_balance,
    receipt_url = COALESCE(p_receipt_url, receipt_url)
  WHERE id = p_bill_id AND user_id = p_user_id;

  -- Delete existing lines
  DELETE FROM bill_lines WHERE bill_id = p_bill_id;

  -- Insert new lines
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    INSERT INTO bill_lines (bill_id, account_id, description, amount)
    VALUES (
      p_bill_id, 
      (v_item->>'account_id')::UUID, 
      v_item->>'description', 
      (v_item->>'amount')::NUMERIC
    );
  END LOOP;

  -- If it was verified, we need to update the journal entry
  IF v_is_verified THEN
     DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE reference_id = p_bill_id AND reference_type = 'bill');
     DELETE FROM journal_entries WHERE reference_id = p_bill_id AND reference_type = 'bill';
     
     SELECT id INTO v_ap_account_id FROM accounts WHERE user_id = p_user_id AND is_system = true AND name = 'Accounts Payable' LIMIT 1;
     
     INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
     VALUES (p_user_id, p_issue_date, 'Bill ' || p_bill_id, 'bill', p_bill_id)
     RETURNING id INTO v_je_id;

     FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
     LOOP
       INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) 
       VALUES (v_je_id, (v_item->>'account_id')::UUID, (v_item->>'amount')::NUMERIC, 0);
     END LOOP;

     INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) 
       VALUES (v_je_id, v_ap_account_id, 0, p_total_amount);
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. FIX: `trg_invoice_verification` runtime crash due to non-existent column
-- Problem: The trigger attempted to query `account_id` from `invoice_lines`, which does not exist in the schema.
-- Solution: Remove the invalid query and strictly map all revenue to the default 'Sales Revenue' account.

CREATE OR REPLACE FUNCTION trg_invoice_verification() RETURNS TRIGGER AS $$
DECLARE
    ar_account_id UUID;
    revenue_account_id UUID;
    je_id UUID;
BEGIN
    -- If it's an UPDATE and the invoice was already verified, 
    -- we wipe the old journal entry to prepare for a fresh one with new amounts.
    IF TG_OP = 'UPDATE' AND OLD.is_ai_verified = true THEN
        DELETE FROM journal_entries WHERE reference_id = NEW.id AND reference_type = 'invoice';
    END IF;

    -- If the new state is verified (or remains verified), we build the ledger entry.
    IF NEW.is_ai_verified = true THEN
        SELECT id INTO ar_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Accounts Receivable' LIMIT 1;
        
        -- invoice_lines does NOT have an account_id column. All invoice revenue goes to Sales Revenue by default.
        SELECT id INTO revenue_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Sales Revenue' LIMIT 1;

        IF ar_account_id IS NULL OR revenue_account_id IS NULL THEN
            RETURN NEW;
        END IF;

        INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
        VALUES (NEW.user_id, NEW.issue_date, 'Invoice ' || NEW.id, 'invoice', NEW.id)
        RETURNING id INTO je_id;

        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
        VALUES 
            (je_id, ar_account_id, NEW.total_amount, 0),
            (je_id, revenue_account_id, 0, NEW.total_amount);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
