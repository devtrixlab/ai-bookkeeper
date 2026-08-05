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

import { ChartOfAccount, ContactType, AccountType, EntryType, PaymentStatus } from '@/types';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  imagePreview?: string | null;
  extractedDraft?: {
    contact_name: string;
    contact_type: ContactType;
    account_name: string;
    amount: number;
    currency: string;
    issue_date: string;
    due_date?: string | null;
    entry_type: EntryType;
    status: PaymentStatus;
    transactionId?: string;
  } | null;
  timestamp: string;
}

interface AiChatPanelProps {
  chartOfAccounts: ChartOfAccount[];
  onDataChanged: () => void;
  onClose?: () => void;
}

export default function AiChatPanel({ chartOfAccounts, onDataChanged, onClose }: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'ai',
      text: 'Hello! I am your AI B2B Accountant. Upload a bill, invoice, or type details (e.g. "I owe AWS 1500 PKR for hosting"), and I will extract and stage it automatically.',
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

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isExtracting]);

  function handleFileSelect(file: File) {
    if (!file.type.startsWith('image/')) {
      alert("Please upload a valid image file.");
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      alert("Image is too large. Please upload an image under 5MB.");
      return;
    }

    setImageFile(file);
    
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
        setImageBase64(compressedBase64);
      };
      img.src = reader.result as string;
    };
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
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Authentication required. Please sign in.");
      }

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

      if (aiData.is_valid_receipt === false) {
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: "I couldn't clearly read a receipt in that image. Could you please upload a clearer photo or type the details?",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        return;
      }

      if (aiData.intent === 'QUERY_FINANCES' || aiData.intent === 'GENERAL_HELP' || aiData.intent === 'QUERY_AP' || aiData.intent === 'QUERY_AR') {
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: aiData.conversational_response || "I'm here to help you manage your finances!",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        return;
      }

      if ((aiData.intent === 'LOG_BILL' || aiData.intent === 'LOG_INVOICE') && !aiData.is_complete) {
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: aiData.clarification_question || "I need a few more details to log this. What was the amount and contact?",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        return;
      }

      const ext = aiData;
      let targetContactId = null;
      let targetAccountId = null;

      if (ext.contact_name) {
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('user_id', user.id)
          .ilike('name', ext.contact_name)
          .limit(1)
          .maybeSingle();
          
        if (existingContact) {
          targetContactId = existingContact.id;
        } else {
          const { data: newContact } = await supabase
            .from('contacts')
            .insert({ user_id: user.id, name: ext.contact_name, type: ext.contact_type || 'vendor' })
            .select()
            .single();
          targetContactId = newContact?.id;
        }
      }

      if (ext.account_name) {
        const matchedAccount = chartOfAccounts?.find(
          c => c.name.toLowerCase() === ext.account_name.toLowerCase()
        );
        if (matchedAccount) {
          targetAccountId = matchedAccount.id;
        } else {
          const { data: newAccount } = await supabase
            .from('chart_of_accounts')
            .insert({ user_id: user.id, name: ext.account_name, account_type: ext.account_type || 'expense' })
            .select()
            .single();
          targetAccountId = newAccount?.id;
        }
      }

      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('amount', ext.amount || 0)
        .eq('contact_id', targetContactId)
        .eq('entry_type', ext.entry_type)
        .eq('issue_date', ext.issue_date || new Date().toISOString().split('T')[0])
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (existingTx) {
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: `⚠️ **Duplicate Detected:** A ${ext.entry_type} for ${ext.amount} with ${ext.contact_name} on ${ext.issue_date} already exists.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        setIsExtracting(false);
        return;
      }

      const { data: insertedTx, error: insertError } = await supabase.from('transactions').insert({
        user_id: user.id,
        contact_id: targetContactId,
        account_id: targetAccountId,
        amount: ext.amount || 0,
        entry_type: ext.entry_type || 'debit',
        status: ext.status || 'unpaid',
        issue_date: ext.issue_date || new Date().toISOString().split('T')[0],
        due_date: ext.due_date || null,
        description: ext.description || null,
        is_ai_verified: false
      }).select().single();

      if (insertError) throw insertError;

      const aiResponseMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: `I extracted the details and staged it under **Pending Verification**!`,
        extractedDraft: {
          contact_name: ext.contact_name || 'Unknown Entity',
          contact_type: ext.contact_type || 'vendor',
          account_name: ext.account_name || 'Uncategorized',
          amount: ext.amount || 0,
          currency: 'PKR',
          issue_date: ext.issue_date || new Date().toISOString().split('T')[0],
          due_date: ext.due_date,
          entry_type: ext.entry_type || 'debit',
          status: ext.status || 'unpaid',
          transactionId: insertedTx?.id
        },
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, aiResponseMsg]);
      onDataChanged();

    } catch (err: any) {
      console.error("Chat Extraction Error:", err);
      let errorText = `Sorry, I encountered an issue: ${err.message || 'Could not process request.'}`;
      
      if (err.message?.includes('Unauthorized') || err.message?.includes('Authentication required')) {
        errorText = `⚠️ **Session Expired:** Your secure session has timed out. Please refresh the page or [click here to sign in again](/login) to continue.`;
      }

      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'ai',
        text: errorText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleVerifyDraft(msgId: string, txId?: string) {
    if (!txId) return;
    const { error } = await supabase.from('transactions').update({ is_ai_verified: true }).eq('id', txId);
    if (!error) {
      onDataChanged();
      setMessages(prev => prev.map(m => {
        if (m.id === msgId && m.extractedDraft) {
          return {
            ...m,
            text: "✓ Verified and moved to Ledger!",
            extractedDraft: { ...m.extractedDraft, status: 'paid' }
          };
        }
        return m;
      }));
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-white md:bg-white/90 backdrop-blur-md md:rounded-2xl border-0 md:border md:border-gray-100 shadow-sm overflow-hidden relative">
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
            <p className="text-[11px] text-gray-500 font-medium">Conversational B2B Engine</p>
          </div>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="md:hidden p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

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
              {msg.imagePreview && (
                <div className="rounded-xl overflow-hidden border border-gray-200 shadow-xs max-w-xs mb-1">
                  <img src={msg.imagePreview} alt="Uploaded receipt" className="max-h-48 object-cover w-full" />
                </div>
              )}

              <div
                className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-2xs ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-gray-100 text-gray-800 rounded-bl-none border border-gray-200/60'
                }`}
              >
                {msg.text}
              </div>

              {msg.extractedDraft && (
                <div className="bg-white rounded-xl border border-blue-100 p-3.5 shadow-sm space-y-2.5 mt-2 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <Receipt className={`w-4 h-4 ${msg.extractedDraft.entry_type === 'credit' ? 'text-emerald-600' : 'text-red-600'}`} />
                      {msg.extractedDraft.contact_name} 
                      <span className="ml-1 text-[10px] text-gray-400 font-normal">({msg.extractedDraft.contact_type})</span>
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      msg.extractedDraft.status === 'paid'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {msg.extractedDraft.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-400 text-[10px]">Amount:</span>
                      <p className={`font-bold ${msg.extractedDraft.entry_type === 'credit' ? 'text-emerald-600' : 'text-gray-900'}`}>
                        {msg.extractedDraft.entry_type === 'credit' ? '+' : '-'}{msg.extractedDraft.amount} {msg.extractedDraft.currency}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[10px]">Issue Date:</span>
                      <p className="font-medium text-gray-700">{msg.extractedDraft.issue_date}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-400 text-[10px]">Account:</span>
                      <p className="font-semibold text-blue-600">{msg.extractedDraft.account_name}</p>
                    </div>
                    {msg.extractedDraft.due_date && (
                      <div className="col-span-2">
                        <span className="text-gray-400 text-[10px]">Due Date:</span>
                        <p className="font-medium text-red-600">{msg.extractedDraft.due_date}</p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleVerifyDraft(msg.id, msg.extractedDraft?.transactionId)}
                    className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer mt-2"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve into Ledger
                  </button>
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

      <div className="p-3 bg-white border-t border-gray-100 sticky bottom-0 z-10">
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
        <form onSubmit={handleSendMessage} className="relative flex items-center bg-white rounded-full p-1.5 shadow-md pl-3 pr-2 border border-gray-200 transition-shadow focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-300">
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
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={imageBase64 ? "Add details (optional)..." : "Ask or log bill/invoice..."}
            className="flex-1 bg-transparent border-none text-gray-900 text-xs sm:text-sm px-3 focus:outline-none placeholder:text-gray-400"
            disabled={isExtracting}
          />
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