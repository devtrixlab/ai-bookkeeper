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

-- Enable RLS on ai_chat_logs
ALTER TABLE ai_chat_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for ai_chat_logs
CREATE POLICY "Users can insert their own chat logs" 
ON ai_chat_logs FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own chat logs" 
ON ai_chat_logs FOR SELECT 
USING (auth.uid() = user_id);

-- 3. We need a Supabase Storage bucket for receipts. 
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for receipts bucket (storage.objects)
-- Note: RLS is enabled on storage.objects by default in Supabase.
CREATE POLICY "Public receipts read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'receipts');

CREATE POLICY "Auth users can upload receipts"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'receipts' 
    AND auth.role() = 'authenticated'
);
