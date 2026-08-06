-- Fix invoice_lines Schema
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS description TEXT;

-- Fix Storage RLS Policies
-- Allow users to delete their own receipts
CREATE POLICY "Auth users can delete their receipts"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'receipts' 
    AND auth.role() = 'authenticated'
    -- If using folder structure based on user ID:
    -- AND auth.uid()::text = (storage.foldername(name))[1]
);
