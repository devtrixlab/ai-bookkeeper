-- 1. Add receipt_url to invoices and bills
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- 2. Create ai_chat_logs table
CREATE TABLE IF NOT EXISTS ai_chat_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    reference_type TEXT CHECK (reference_type IN ('invoice', 'bill', 'other')),
    reference_id UUID,
    transcript JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. We need a Supabase Storage bucket for receipts. 
-- In SQL, we insert into storage.buckets if it doesn't exist.
-- Note: 'storage' schema must exist. Supabase manages this.
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to receipts
CREATE POLICY "Public receipts"
ON storage.objects FOR SELECT
USING (bucket_id = 'receipts');

-- Allow authenticated users to insert receipts
CREATE POLICY "Auth users can upload receipts"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'receipts' 
    AND auth.role() = 'authenticated'
);
