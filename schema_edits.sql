-- 1. UPGRADE INVOICE TRIGGER TO HANDLE UPDATES (EDITS)
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
        
        SELECT account_id INTO revenue_account_id FROM invoice_lines WHERE invoice_id = NEW.id LIMIT 1;
        IF revenue_account_id IS NULL THEN
            SELECT id INTO revenue_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Sales Revenue' LIMIT 1;
        END IF;

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

-- Make sure the trigger fires on UPDATE as well, not just specific columns, 
-- or we can just say BEFORE INSERT OR UPDATE ON invoices. 
DROP TRIGGER IF EXISTS trg_invoice_verification ON invoices;
CREATE TRIGGER trg_invoice_verification
AFTER INSERT OR UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION trg_invoice_verification();


-- 2. UPGRADE BILL TRIGGER TO HANDLE UPDATES (EDITS)
CREATE OR REPLACE FUNCTION trg_bill_verification() RETURNS TRIGGER AS $$
DECLARE
    ap_account_id UUID;
    expense_account_id UUID;
    je_id UUID;
BEGIN
    -- Wipe old entry on update
    IF TG_OP = 'UPDATE' AND OLD.is_ai_verified = true THEN
        DELETE FROM journal_entries WHERE reference_id = NEW.id AND reference_type = 'bill';
    END IF;

    -- Create fresh entry if verified
    IF NEW.is_ai_verified = true THEN
        SELECT id INTO ap_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Accounts Payable' LIMIT 1;
        
        SELECT account_id INTO expense_account_id FROM bill_lines WHERE bill_id = NEW.id LIMIT 1;
        IF expense_account_id IS NULL THEN
            SELECT id INTO expense_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'General Expenses' LIMIT 1;
        END IF;

        IF ap_account_id IS NULL OR expense_account_id IS NULL THEN
            RETURN NEW;
        END IF;

        INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
        VALUES (NEW.user_id, NEW.issue_date, 'Bill ' || NEW.id, 'bill', NEW.id)
        RETURNING id INTO je_id;

        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
        VALUES 
            (je_id, expense_account_id, NEW.total_amount, 0),
            (je_id, ap_account_id, 0, NEW.total_amount);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bill_verification ON bills;
CREATE TRIGGER trg_bill_verification
AFTER INSERT OR UPDATE ON bills
FOR EACH ROW EXECUTE FUNCTION trg_bill_verification();


-- 3. DELETE TRIGGERS (Cleanup Ledger when a Source Doc is deleted)

CREATE OR REPLACE FUNCTION trg_invoice_delete() RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM journal_entries WHERE reference_id = OLD.id AND reference_type = 'invoice';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_delete ON invoices;
CREATE TRIGGER trg_invoice_delete
AFTER DELETE ON invoices
FOR EACH ROW EXECUTE FUNCTION trg_invoice_delete();


CREATE OR REPLACE FUNCTION trg_bill_delete() RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM journal_entries WHERE reference_id = OLD.id AND reference_type = 'bill';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bill_delete ON bills;
CREATE TRIGGER trg_bill_delete
AFTER DELETE ON bills
FOR EACH ROW EXECUTE FUNCTION trg_bill_delete();
