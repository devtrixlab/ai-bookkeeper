-- phase7_payments.sql
-- Run this in your Supabase SQL Editor to add the Atomic Payment RPCs.

CREATE OR REPLACE FUNCTION log_payment_received_atomic(
    p_invoice_id UUID,
    p_user_id UUID,
    p_amount NUMERIC,
    p_date DATE,
    p_method TEXT
)
RETURNS UUID AS $$
DECLARE
    v_invoice_record RECORD;
    v_new_balance NUMERIC;
    v_new_status TEXT;
    v_payment_id UUID;
    v_cash_account_id UUID;
    v_ar_account_id UUID;
    v_journal_id UUID;
BEGIN
    -- 1. Lock the invoice row to prevent race conditions
    SELECT * INTO v_invoice_record 
    FROM invoices 
    WHERE id = p_invoice_id AND user_id = p_user_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found or unauthorized.';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero.';
    END IF;

    -- 2. Calculate new balance and status
    v_new_balance := v_invoice_record.balance_due - p_amount;
    
    IF v_new_balance < 0 THEN
        RAISE EXCEPTION 'Payment amount exceeds the balance due.';
    END IF;

    IF v_new_balance = 0 THEN
        v_new_status := 'paid';
    ELSE
        v_new_status := 'partial';
    END IF;

    -- 3. Update the invoice
    UPDATE invoices
    SET balance_due = v_new_balance,
        status = v_new_status
    WHERE id = p_invoice_id;

    -- 4. Insert the payment record
    INSERT INTO payments_received (user_id, invoice_id, customer_id, amount, date, payment_method)
    VALUES (p_user_id, p_invoice_id, v_invoice_record.customer_id, p_amount, p_date, p_method)
    RETURNING id INTO v_payment_id;

    -- 5. Dynamic Account Resolution (Cash and AR)
    SELECT id INTO v_cash_account_id FROM accounts WHERE user_id = p_user_id AND type = 'asset' AND name ILIKE '%Cash%' LIMIT 1;
    IF v_cash_account_id IS NULL THEN
        INSERT INTO accounts (user_id, name, type, is_system) VALUES (p_user_id, 'Cash', 'asset', true) RETURNING id INTO v_cash_account_id;
    END IF;

    SELECT id INTO v_ar_account_id FROM accounts WHERE user_id = p_user_id AND type = 'asset' AND (name ILIKE '%Accounts Receivable%' OR name ILIKE '%A/R%') LIMIT 1;
    IF v_ar_account_id IS NULL THEN
        INSERT INTO accounts (user_id, name, type, is_system) VALUES (p_user_id, 'Accounts Receivable', 'asset', true) RETURNING id INTO v_ar_account_id;
    END IF;

    -- 6. Create balancing Journal Entry
    INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
    VALUES (p_user_id, p_date, 'Payment received for Invoice ' || p_invoice_id, 'invoice_payment', p_invoice_id)
    RETURNING id INTO v_journal_id;

    -- Debit Cash (Asset increases)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_journal_id, v_cash_account_id, p_amount, 0);

    -- Credit Accounts Receivable (Asset decreases)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_journal_id, v_ar_account_id, 0, p_amount);

    RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION log_payment_made_atomic(
    p_bill_id UUID,
    p_user_id UUID,
    p_amount NUMERIC,
    p_date DATE,
    p_method TEXT
)
RETURNS UUID AS $$
DECLARE
    v_bill_record RECORD;
    v_new_balance NUMERIC;
    v_new_status TEXT;
    v_payment_id UUID;
    v_cash_account_id UUID;
    v_ap_account_id UUID;
    v_journal_id UUID;
BEGIN
    -- 1. Lock the bill row to prevent race conditions
    SELECT * INTO v_bill_record 
    FROM bills 
    WHERE id = p_bill_id AND user_id = p_user_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill not found or unauthorized.';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero.';
    END IF;

    -- 2. Calculate new balance and status
    v_new_balance := v_bill_record.balance_due - p_amount;
    
    IF v_new_balance < 0 THEN
        RAISE EXCEPTION 'Payment amount exceeds the balance due.';
    END IF;

    IF v_new_balance = 0 THEN
        v_new_status := 'paid';
    ELSE
        v_new_status := 'partial';
    END IF;

    -- 3. Update the bill
    UPDATE bills
    SET balance_due = v_new_balance,
        status = v_new_status
    WHERE id = p_bill_id;

    -- 4. Insert the payment record
    INSERT INTO payments_made (user_id, bill_id, supplier_id, amount, date, payment_method)
    VALUES (p_user_id, p_bill_id, v_bill_record.supplier_id, p_amount, p_date, p_method)
    RETURNING id INTO v_payment_id;

    -- 5. Dynamic Account Resolution (Cash and AP)
    SELECT id INTO v_cash_account_id FROM accounts WHERE user_id = p_user_id AND type = 'asset' AND name ILIKE '%Cash%' LIMIT 1;
    IF v_cash_account_id IS NULL THEN
        INSERT INTO accounts (user_id, name, type, is_system) VALUES (p_user_id, 'Cash', 'asset', true) RETURNING id INTO v_cash_account_id;
    END IF;

    SELECT id INTO v_ap_account_id FROM accounts WHERE user_id = p_user_id AND type = 'liability' AND (name ILIKE '%Accounts Payable%' OR name ILIKE '%A/P%') LIMIT 1;
    IF v_ap_account_id IS NULL THEN
        INSERT INTO accounts (user_id, name, type, is_system) VALUES (p_user_id, 'Accounts Payable', 'liability', true) RETURNING id INTO v_ap_account_id;
    END IF;

    -- 6. Create balancing Journal Entry
    INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
    VALUES (p_user_id, p_date, 'Payment made for Bill ' || p_bill_id, 'bill_payment', p_bill_id)
    RETURNING id INTO v_journal_id;

    -- Debit Accounts Payable (Liability decreases)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_journal_id, v_ap_account_id, p_amount, 0);

    -- Credit Cash (Asset decreases)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_journal_id, v_cash_account_id, 0, p_amount);

    RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql;
