-- PHASE 6: Editable verified transactions with Atomic RPC updates

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
  v_je_id UUID;
  v_ap_account_id UUID;
BEGIN
  -- Get verification status
  SELECT is_ai_verified INTO v_is_verified FROM bills WHERE id = p_bill_id AND user_id = p_user_id;
  
  -- Update bill
  UPDATE bills SET 
    supplier_id = p_supplier_id,
    issue_date = p_issue_date,
    due_date = p_due_date,
    status = p_status,
    total_amount = p_total_amount,
    balance_due = CASE WHEN p_status = 'paid' THEN 0 ELSE p_total_amount END,
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
     -- The easiest way is to delete the old journal entry and re-create it.
     DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE reference_id = p_bill_id AND reference_type = 'bill');
     DELETE FROM journal_entries WHERE reference_id = p_bill_id AND reference_type = 'bill';
     
     -- Create new journal entry
     SELECT id INTO v_ap_account_id FROM accounts WHERE user_id = p_user_id AND is_system = true AND name = 'Accounts Payable' LIMIT 1;
     
     INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
     VALUES (p_user_id, p_issue_date, 'Bill ' || p_bill_id, 'bill', p_bill_id)
     RETURNING id INTO v_je_id;

     -- Insert new journal lines. Credit AP, Debit Expenses.
     -- We will debit for each line item.
     FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
     LOOP
       INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) 
       VALUES (v_je_id, (v_item->>'account_id')::UUID, (v_item->>'amount')::NUMERIC, 0);
     END LOOP;

     -- Credit AP for the total amount
     INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) 
       VALUES (v_je_id, v_ap_account_id, 0, p_total_amount);
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


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
  v_je_id UUID;
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
BEGIN
  SELECT is_ai_verified INTO v_is_verified FROM invoices WHERE id = p_invoice_id AND user_id = p_user_id;

  -- Update invoice
  UPDATE invoices SET 
    customer_id = p_customer_id,
    issue_date = p_issue_date,
    due_date = p_due_date,
    status = p_status,
    total_amount = p_total_amount,
    balance_due = CASE WHEN p_status = 'paid' THEN 0 ELSE p_total_amount END,
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

     -- Debit AR for the total amount
     INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) 
     VALUES (v_je_id, v_ar_account_id, p_total_amount, 0);

     -- Credit Sales Revenue
     INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) 
     VALUES (v_je_id, v_revenue_account_id, 0, p_total_amount);
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
