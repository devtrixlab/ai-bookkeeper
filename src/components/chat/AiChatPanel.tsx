'use client';

import { useState, useRef, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { 
  Plus, 
  ArrowUp, 
  Loader2, 
  X, 
  CheckCircle2, 
  Receipt,
  Bot,
  User
} from 'lucide-react';

type Category = { id: string; name: string; };

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  imagePreview?: string | null;
  extractedDraft?: {
    vendor_name: string;
    amount: number;
    currency: string;
    date: string;
    category_name: string;
    status: 'draft' | 'pending' | 'verified';
    transactionId?: string;
  } | null;
  timestamp: string;
}

interface AiChatPanelProps {
  categories: Category[];
  onDataChanged: () => void;
  onClose?: () => void; // Added for mobile full-screen closing
}

export default function AiChatPanel({ categories, onDataChanged, onClose }: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'ai',
      text: 'Hello! I am your AI Forensic Accountant. Upload a receipt image or type an expense (e.g. "I spent 1500 PKR on fuel"), and I will extract and stage it automatically.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [prompt, setPrompt] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Auto-scroll chat to bottom when messages update
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isExtracting]);

  function handleFileSelect(file: File) {
    if (!file.type.startsWith('image/')) return;
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

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() && !imageBase64) return;

    const userText = prompt.trim() || "Uploaded receipt image";
    const currentImage = imageBase64;
    const messageId = `msg-${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Append User Message
    const newUserMsg: ChatMessage = {
      id: messageId,
      sender: 'user',
      text: userText,
      imagePreview: currentImage,
      timestamp
    };

    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    setPrompt('');
    clearImage();
    setIsExtracting(true);

    try {
      // 2. Fetch User Session
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Authentication required. Please sign in.");
      }

      // 3. Call AI Extract Route with History
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({ prompt: userText, image: currentImage, history: updatedMessages })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to process expense via AI.");
      }

      const aiData = await res.json();

      // Handle Invalid Receipts
      if (aiData.is_valid_receipt === false) {
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: "I couldn't clearly read a receipt in that image. Could you please upload a clearer photo or type the details?",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        return;
      }

      // Handle Queries or General Help
      if (aiData.intent === 'QUERY_FINANCES' || aiData.intent === 'GENERAL_HELP') {
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: aiData.conversational_response || "I'm here to help you manage your finances!",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        return;
      }

      // Handle Incomplete Expense Logging (Needs Clarification)
      if (aiData.intent === 'LOG_EXPENSE' && !aiData.is_complete) {
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: aiData.clarification_question || "I need a few more details to log this. What was the amount and vendor?",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        return;
      }

      // 4. Resolve Category for Complete Expense
      let targetCategoryId: string | null = null;
      const extractedCategory = aiData.expense_data?.category_name;
      const matchedCategory = categories?.find(
        c => c.name.toLowerCase() === extractedCategory?.toLowerCase()
      );

      if (matchedCategory) {
        targetCategoryId = matchedCategory.id;
      } else if (categories && categories.length > 0) {
        targetCategoryId = categories[0].id;
      } else {
        const { data: newCat } = await supabase
          .from('categories')
          .insert({ name: extractedCategory || "General Expenses" })
          .select()
          .single();
        targetCategoryId = newCat?.id || null;
      }

      // 5. Insert Pending Transaction into DB (Edge Case: Duplicate check)
      const exp = aiData.expense_data;
      
      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('amount', exp?.amount || 0)
        .eq('vendor_name', exp?.vendor_name || 'Unknown Merchant')
        .eq('date', exp?.date || new Date().toISOString().split('T')[0])
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (existingTx) {
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: `⚠️ **Duplicate Detected:** A transaction for ${exp?.amount} ${exp?.currency || 'PKR'} at ${exp?.vendor_name} on ${exp?.date} already exists in your records. I have not logged it again to prevent duplicates.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        setIsExtracting(false);
        return;
      }

      const { data: insertedTx, error: insertError } = await supabase.from('transactions').insert({
        user_id: user.id,
        amount: exp?.amount || 0,
        currency: exp?.currency || 'PKR',
        date: exp?.date || new Date().toISOString().split('T')[0],
        vendor_name: exp?.vendor_name || 'Unknown Merchant',
        category_id: targetCategoryId,
        is_user_verified: false
      }).select().single();

      if (insertError) throw insertError;

      // 6. Append AI Confirmation Response Message with Interactive Card
      const aiResponseMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: `I extracted the expense details and staged it under **Pending Verification**!`,
        extractedDraft: {
          vendor_name: exp?.vendor_name || 'Unknown Merchant',
          amount: exp?.amount || 0,
          currency: exp?.currency || 'PKR',
          date: exp?.date || new Date().toISOString().split('T')[0],
          category_name: extractedCategory || 'General Expenses',
          status: 'pending',
          transactionId: insertedTx?.id
        },
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, aiResponseMsg]);
      onDataChanged();

    } catch (err: any) {
      console.error("Chat Extraction Error:", err);
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'ai',
        text: `Sorry, I encountered an issue: ${err.message || 'Could not process request.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsExtracting(false);
    }
  }

  // Quick verify from inside chat message card
  async function handleVerifyDraft(msgId: string, txId?: string) {
    if (!txId) return;
    const { error } = await supabase.from('transactions').update({ is_user_verified: true }).eq('id', txId);
    if (!error) {
      setMessages(prev => prev.map(m => {
        if (m.id === msgId && m.extractedDraft) {
          return {
            ...m,
            extractedDraft: { ...m.extractedDraft, status: 'verified' }
          };
        }
        return m;
      }));
      onDataChanged();
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-white md:bg-white/90 backdrop-blur-md md:rounded-2xl border-0 md:border md:border-gray-100 shadow-sm overflow-hidden relative">
      
      {/* CHAT HEADER */}
      <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-blue-50/30 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
              AI Assistant
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </h3>
            <p className="text-[11px] text-gray-500 font-medium">Conversational Forensic Accountant</p>
          </div>
        </div>

        {/* Mobile Close Button (Displays on phone screens if onClose is provided) */}
        {onClose && (
          <button 
            onClick={onClose}
            className="md:hidden p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* CHAT MESSAGES SCROLL AREA */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.sender === 'ai' && (
              <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 mt-1">
                AI
              </div>
            )}

            <div className={`max-w-[85%] space-y-2 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
              
              {/* Image Preview if user uploaded */}
              {msg.imagePreview && (
                <div className="rounded-xl overflow-hidden border border-gray-200 shadow-xs max-w-xs mb-1">
                  <img src={msg.imagePreview} alt="Uploaded receipt" className="max-h-48 object-cover w-full" />
                </div>
              )}

              {/* Message Bubble */}
              <div
                className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-2xs ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-gray-100 text-gray-800 rounded-bl-none border border-gray-200/60'
                }`}
              >
                {msg.text}
              </div>

              {/* Interactive Extracted Expense Card inside AI Bubble */}
              {msg.extractedDraft && (
                <div className="bg-white rounded-xl border border-blue-100 p-3.5 shadow-sm space-y-2.5 mt-2 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <Receipt className="w-4 h-4 text-blue-600" />
                      {msg.extractedDraft.vendor_name}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      msg.extractedDraft.status === 'verified'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {msg.extractedDraft.status === 'verified' ? '✓ Verified' : 'Pending Verification'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-400 text-[10px]">Amount:</span>
                      <p className="font-bold text-gray-900">{msg.extractedDraft.amount} {msg.extractedDraft.currency}</p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[10px]">Date:</span>
                      <p className="font-medium text-gray-700">{msg.extractedDraft.date}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-400 text-[10px]">Category:</span>
                      <p className="font-semibold text-blue-600">{msg.extractedDraft.category_name}</p>
                    </div>
                  </div>

                  {msg.extractedDraft.status === 'pending' && (
                    <button
                      onClick={() => handleVerifyDraft(msg.id, msg.extractedDraft?.transactionId)}
                      className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve & Move to Ledger
                    </button>
                  )}
                </div>
              )}

              <span className="text-[10px] text-gray-400 px-1 block">{msg.timestamp}</span>
            </div>

            {msg.sender === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-gray-900 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-1">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {/* Loading Indicator */}
        {isExtracting && (
          <div className="flex gap-3 items-center text-xs text-blue-600 font-medium">
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <span>Analyzing receipt & extracting structured financial data...</span>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* FIXED-BOTTOM LIGHT-THEMED INPUT BAR */}
      <div className="p-3 bg-white border-t border-gray-100 sticky bottom-0 z-10">
        
        {/* Image Attachment Thumbnail Preview */}
        {imageBase64 && (
          <div className="mb-2 relative inline-block">
            <img src={imageBase64} alt="Receipt preview" className="h-16 w-16 object-cover rounded-xl border border-gray-300 shadow-xs" />
            <button
              onClick={clearImage}
              className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:bg-red-600"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Sleek Light Input Bar */}
        <form onSubmit={handleSendMessage} className="relative flex items-center bg-white rounded-full p-1.5 shadow-md pl-3 pr-2 border border-gray-200 transition-shadow focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-300">
          
          {/* File Picker Trigger Button (+) */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors cursor-pointer"
            title="Attach Receipt Image"
          >
            <Plus className="w-5 h-5" />
          </button>

          {/* Prompt Text Input */}
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={imageBase64 ? "Add details (optional)..." : "Ask or log expense..."}
            className="flex-1 bg-transparent border-none text-gray-900 text-xs sm:text-sm px-3 focus:outline-none placeholder:text-gray-400"
            disabled={isExtracting}
          />

          {/* Circular Primary Send Button */}
          <button
            type="submit"
            disabled={isExtracting || (!prompt.trim() && !imageBase64)}
            className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shrink-0 disabled:opacity-40 transition-colors shadow-md shadow-blue-500/30 cursor-pointer"
          >
            {isExtracting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-5 h-5 font-bold" />
            )}
          </button>
        </form>

      </div>
    </div>
  );
}