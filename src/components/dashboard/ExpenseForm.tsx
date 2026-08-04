'use client';

import { useState, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Send, Loader2, UploadCloud, X } from 'lucide-react';

type Category = { id: string; name: string; };

interface ExpenseFormProps {
  categories: Category[];
  onSuccess: () => void;
}

export default function ExpenseForm({ categories, onSuccess }: ExpenseFormProps) {
  const [prompt, setPrompt] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file.');
      return;
    }
    setError(null);
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImageBase64(reader.result as string);
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setImageFile(null);
    setImageBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleExtract(e: React.FormEvent) {
  e.preventDefault();
  if (!prompt.trim() && !imageBase64) return;
  
  setIsExtracting(true);
  setError(null);

  try {
    // 1. Instantiate the SSR-compatible Supabase client
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 2. Safely fetch the user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      throw new Error("Authentication error. Please refresh the page or sign in again.");
    }

    // 3. Prepare and send the payload to your Gemini API route
    const submitPrompt = prompt.trim() || "Extract expense details from this receipt.";

    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: submitPrompt, image: imageBase64 })
    });
    
    if (!res.ok) {
      throw new Error("Failed to process expense via AI. Please try again.");
    }
    
    const aiData = await res.json();

    // 4. Match the AI's category to your database categories (fallback to index 0)
    const matchedCategory = categories.find(
      c => c.name.toLowerCase() === aiData.category_name?.toLowerCase()
    ) || categories[0];

    // 5. Insert the pending transaction into the database
    const { error: insertError } = await supabase.from('transactions').insert({
      user_id: user.id,
      amount: aiData.amount,
      currency: aiData.currency || 'PKR',
      date: aiData.date,
      vendor_name: aiData.vendor_name,
      category_id: matchedCategory.id,
      is_user_verified: false
    });

    if (insertError) throw insertError;
    
    // 6. Reset form states and trigger UI refresh
    setPrompt('');
    clearImage();
    onSuccess();

  } catch (err: any) {
    console.error("Expense extraction failed:", err);
    setError(err.message || "An unexpected error occurred.");
  } finally {
    setIsExtracting(false);
  }
}

  return (
    <form onSubmit={handleExtract} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Log a new expense</label>
        
        {/* Dropzone UI */}
        {!imageBase64 ? (
          <div 
            className={`mb-4 border-2 border-dashed rounded-lg p-6 text-center transition-colors ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files && handleFile(e.target.files[0])} />
            <UploadCloud className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Drag and drop a receipt, or <span className="text-blue-600 font-medium cursor-pointer">browse</span></p>
          </div>
        ) : (
          <div className="mb-4 relative inline-block">
            <div className="relative h-24 w-24 rounded-lg overflow-hidden border border-gray-200">
              <img src={imageBase64} alt="Preview" className="object-cover w-full h-full" />
            </div>
            <button type="button" onClick={clearImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow-sm">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={imageBase64 ? "Add extra context (optional)" : "e.g. I spent 1500 PKR on a Zong mobile top up..."}
            className="flex-1 rounded-lg border-gray-300 ring-1 ring-inset ring-gray-300 py-3 px-4 focus:ring-2 focus:ring-blue-600 outline-none transition-all"
            disabled={isExtracting}
          />
          <button
            type="submit"
            disabled={isExtracting || (!prompt.trim() && !imageBase64)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 rounded-lg font-medium flex items-center justify-center disabled:opacity-50 transition-colors"
          >
            {isExtracting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </form>
  );
}