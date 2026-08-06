-- PHASE 5: Enforce zero-assumption architecture with JSONB multi-line insertion

CREATE OR REPLACE FUNCTION create_bill_with_lines_atomic(
  p_user_id UUID,
  p_supplier_id UUID,
  p_issue_date DATE,
  p_due_date DATE,
  p_status TEXT,
  p_total_amount NUMERIC,
  p_receipt_url TEXT,
  p_line_items JSONB
) RETURNS UUID AS $$
DECLARE
  v_bill_id UUID;
  v_item JSONB;
BEGIN
  -- Insert bill
  INSERT INTO bills (user_id, supplier_id, issue_date, due_date, status, total_amount, balance_due, is_ai_verified, receipt_url)
  VALUES (p_user_id, p_supplier_id, p_issue_date, p_due_date, p_status, p_total_amount,
          CASE WHEN p_status = 'paid' THEN 0 ELSE p_total_amount END, false, p_receipt_url)
  RETURNING id INTO v_bill_id;

  -- Insert bill_lines safely from JSONB
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    INSERT INTO bill_lines (bill_id, account_id, description, amount)
    VALUES (
      v_bill_id, 
      (v_item->>'account_id')::UUID, 
      v_item->>'description', 
      (v_item->>'amount')::NUMERIC
    );
  END LOOP;

  RETURN v_bill_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION create_invoice_with_lines_atomic(
  p_user_id UUID,
  p_customer_id UUID,
  p_issue_date DATE,
  p_due_date DATE,
  p_status TEXT,
  p_total_amount NUMERIC,
  p_receipt_url TEXT,
  p_line_items JSONB
) RETURNS UUID AS $$
DECLARE
  v_invoice_id UUID;
  v_item JSONB;
BEGIN
  -- Insert invoice
  INSERT INTO invoices (user_id, customer_id, issue_date, due_date, status, total_amount, balance_due, is_ai_verified, receipt_url)
  VALUES (p_user_id, p_customer_id, p_issue_date, p_due_date, p_status, p_total_amount,
          CASE WHEN p_status = 'paid' THEN 0 ELSE p_total_amount END, false, p_receipt_url)
  RETURNING id INTO v_invoice_id;

  -- Insert invoice_lines safely from JSONB
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    INSERT INTO invoice_lines (invoice_id, product_id, description, quantity, unit_price, total)
    VALUES (
      v_invoice_id, 
      (v_item->>'product_id')::UUID, 
      v_item->>'description', 
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total')::NUMERIC
    );
  END LOOP;

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
