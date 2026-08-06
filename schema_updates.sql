-- 1. Add Verification Flags
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_ai_verified BOOLEAN DEFAULT true;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS is_ai_verified BOOLEAN DEFAULT true;

-- 2. Trigger Function for Invoices
-- When an invoice is created (and is verified) or transitions from unverified to verified, create the journal entry.
CREATE OR REPLACE FUNCTION trg_invoice_verification() RETURNS TRIGGER AS $$
DECLARE
    ar_account_id UUID;
    revenue_account_id UUID;
    je_id UUID;
BEGIN
    -- Only trigger if verified just now
    IF (TG_OP = 'INSERT' AND NEW.is_ai_verified = true) OR (TG_OP = 'UPDATE' AND OLD.is_ai_verified = false AND NEW.is_ai_verified = true) THEN
        
        -- Get system accounts for the user
        SELECT id INTO ar_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Accounts Receivable' LIMIT 1;
        SELECT id INTO revenue_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Sales Revenue' LIMIT 1;

        IF ar_account_id IS NULL OR revenue_account_id IS NULL THEN
            RETURN NEW; -- Skip if accounts don't exist
        END IF;

        -- Create Journal Entry
        INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
        VALUES (NEW.user_id, NEW.issue_date, 'Invoice ' || NEW.id, 'invoice', NEW.id)
        RETURNING id INTO je_id;

        -- Create Lines (Debit AR, Credit Revenue)
        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (je_id, ar_account_id, NEW.total_amount, 0);
        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (je_id, revenue_account_id, 0, NEW.total_amount);

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_invoice_verified ON invoices;
CREATE TRIGGER on_invoice_verified
    AFTER INSERT OR UPDATE OF is_ai_verified ON invoices
    FOR EACH ROW EXECUTE PROCEDURE trg_invoice_verification();


-- 3. Trigger Function for Bills
-- When a bill is created (and is verified) or transitions from unverified to verified, create the journal entry.
CREATE OR REPLACE FUNCTION trg_bill_verification() RETURNS TRIGGER AS $$
DECLARE
    ap_account_id UUID;
    expense_account_id UUID;
    je_id UUID;
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.is_ai_verified = true) OR (TG_OP = 'UPDATE' AND OLD.is_ai_verified = false AND NEW.is_ai_verified = true) THEN
        
        SELECT id INTO ap_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Accounts Payable' LIMIT 1;
        
        -- For Bills, we debit the specific expense account chosen in the bill_lines.
        -- But since bill_lines might not be inserted YET when the bill is inserted, we must be careful.
        -- Wait, if it's AI extracted, both bill and bill_lines are inserted, THEN verification happens on UPDATE. This is safe.
        -- If it's manually created, the UI must insert bill_lines BEFORE verifying, OR we can just use a default expense account and let them fix it later.
        -- For simplicity, let's just debit "General Expenses" if we can't find a line, or aggregate the lines.
        
        SELECT account_id INTO expense_account_id FROM bill_lines WHERE bill_id = NEW.id LIMIT 1;
        
        IF expense_account_id IS NULL THEN
            SELECT id INTO expense_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'General Expenses' LIMIT 1;
        END IF;

        IF ap_account_id IS NULL OR expense_account_id IS NULL THEN
            RETURN NEW;
        END IF;

        -- Create Journal Entry
        INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
        VALUES (NEW.user_id, NEW.issue_date, 'Bill ' || NEW.id, 'bill', NEW.id)
        RETURNING id INTO je_id;

        -- Create Lines (Credit AP, Debit Expense)
        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (je_id, expense_account_id, NEW.total_amount, 0);
        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (je_id, ap_account_id, 0, NEW.total_amount);

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_bill_verified ON bills;
CREATE TRIGGER on_bill_verified
    AFTER INSERT OR UPDATE OF is_ai_verified ON bills
    FOR EACH ROW EXECUTE PROCEDURE trg_bill_verification();
