'use client';

import { useState, useRef, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Plus, ArrowUp, Loader2, X, CheckCircle2, Receipt, Bot, User } from 'lucide-react';
import { Account, InvoiceStatus } from '@/types';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  imagePreview?: string | null;
  extractedDraft?: {
    intent: string;
    entity_name: string; // customer or supplier
    account_name: string;
    amount: number;
    status: InvoiceStatus;
    issue_date: string;
    due_date?: string | null;
    description?: string;
    transactionId?: string;
  } | null;
  timestamp: string;
}

interface AiChatPanelProps {
  chartOfAccounts: Account[];
  onDataChanged: () => void;
  onClose?: () => void;
}

export default function AiChatPanel({ chartOfAccounts, onDataChanged, onClose }: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'ai',
      text: 'Hello! I am your AI SME Bookkeeper. Upload a bill, invoice, or type details (e.g. "I paid AWS 1500 PKR for hosting"), and I will record the double-entry automatically.',
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
    if (!file.type.startsWith('image/')) return alert("Please upload a valid image file.");
    if (file.size > 5 * 1024 * 1024) return alert("Image is too large. Please upload an image under 5MB.");
    
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
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        setImageBase64(canvas.toDataURL('image/jpeg', 0.8));
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

    const newUserMsg: ChatMessage = { id: messageId, sender: 'user', text: userText, imagePreview: currentImage, timestamp };
    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    setPrompt('');
    clearImage();
    setIsExtracting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) throw new Error("Authentication required. Please sign in.");

      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({ 
          prompt: userText, 
          image: currentImage, 
          history: updatedMessages,
          chartOfAccounts: chartOfAccounts 
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to process expense via AI.");
      }

      const aiData = await res.json();

      if (aiData.intent === 'QUERY_FINANCES' || aiData.intent === 'GENERAL_HELP') {
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: aiData.conversational_response || "I'm here to help you manage your finances!",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        return;
      }

      if (!aiData.is_complete) {
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: aiData.clarification_question || "I need a few more details to log this.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        return;
      }

      const ext = aiData;
      const safeAmount = Math.round((ext.amount || 0) * 100) / 100;
      let insertedId = null;

      let receiptUrl = null;
      if (currentImage) {
        // Convert base64 to Blob
        const fetchRes = await fetch(currentImage);
        const blob = await fetchRes.blob();
        const fileName = `receipt-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, blob, { contentType: 'image/jpeg' });
          
        if (!uploadError && uploadData) {
          const { data: publicUrlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
          receiptUrl = publicUrlData.publicUrl;
        }
      }

      // Ensure Account exists
      let targetAccountId = null;
      if (ext.account_name) {
        const extAccLower = ext.account_name.toLowerCase();
        const matchedAccount = chartOfAccounts?.find(c => {
          const cNameLower = c.name.toLowerCase();
          return cNameLower === extAccLower || cNameLower.includes(extAccLower) || extAccLower.includes(cNameLower);
        });
        if (matchedAccount) targetAccountId = matchedAccount.id;
        else {
          const accType = ext.intent === 'LOG_BILL' ? 'expense' : 'revenue';
          const { data: newAccount } = await supabase
            .from('accounts')
            .insert({ user_id: user.id, name: ext.account_name, type: accType })
            .select().single();
          targetAccountId = newAccount?.id;
        }
      }

      if (ext.intent === 'LOG_BILL') {
        // Find/Create Supplier
        let supplierId = null;
        if (ext.supplier_name) {
          const { data: upsertedSupp } = await supabase
            .from('suppliers')
            .upsert({ user_id: user.id, name: ext.supplier_name }, { onConflict: 'user_id,name' })
            .select('id')
            .single();
          supplierId = upsertedSupp?.id;
        }
        
        // Insert Bill atomically
        const { data: billId, error: rpcError } = await supabase.rpc('create_bill_atomic', {
          p_user_id: user.id,
          p_supplier_id: supplierId,
          p_issue_date: ext.issue_date || new Date().toISOString().split('T')[0],
          p_due_date: ext.due_date || null,
          p_status: ext.status || 'open',
          p_total_amount: safeAmount,
          p_account_id: targetAccountId,
          p_description: ext.description || ext.product_name || 'General purchase',
          p_receipt_url: receiptUrl
        });

        if (rpcError) throw rpcError;
        insertedId = billId;

      } else if (ext.intent === 'LOG_INVOICE') {
        // Find/Create Customer
        let customerId = null;
        if (ext.customer_name) {
          const { data: upsertedCust } = await supabase
            .from('customers')
            .upsert({ user_id: user.id, name: ext.customer_name }, { onConflict: 'user_id,name' })
            .select('id')
            .single();
          customerId = upsertedCust?.id;
        }

        // Find or create product
        const productName = ext.product_name || ext.description || 'General Service';
        let productId = null;
        
        const { data: upsertedProd } = await supabase
          .from('products')
          .upsert({ user_id: user.id, name: productName, price: safeAmount }, { onConflict: 'user_id,name' })
          .select('id')
          .single();
        productId = upsertedProd?.id;

        if (!productId) {
          throw new Error('Could not resolve or create product. Invoice line aborted.');
        }

        // Insert Invoice atomically
        const { data: invoiceId, error: rpcError } = await supabase.rpc('create_invoice_atomic', {
          p_user_id: user.id,
          p_customer_id: customerId,
          p_issue_date: ext.issue_date || new Date().toISOString().split('T')[0],
          p_due_date: ext.due_date || null,
          p_status: ext.status || 'open',
          p_total_amount: safeAmount,
          p_product_id: productId,
          p_description: ext.description || ext.product_name || 'General Service',
          p_receipt_url: receiptUrl
        });

        if (rpcError) throw rpcError;
        insertedId = invoiceId;
      }

      const finalAiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: `I successfully extracted the details and staged the ${ext.intent === 'LOG_BILL' ? 'Bill' : 'Invoice'}! Please verify to push it to the Ledger.`,
        extractedDraft: {
          intent: ext.intent,
          entity_name: ext.supplier_name || ext.customer_name || 'Unknown',
          account_name: ext.account_name || 'Uncategorized',
          amount: safeAmount,
          status: ext.status || 'open',
          issue_date: ext.issue_date || new Date().toISOString().split('T')[0],
          due_date: ext.due_date,
          transactionId: insertedId
        },
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const completeTranscript = [...updatedMessages, finalAiMessage];

      // Record Audit Log
      if (insertedId) {
        await supabase.from('ai_chat_logs').insert({
          user_id: user.id,
          reference_type: ext.intent === 'LOG_BILL' ? 'bill' : 'invoice',
          reference_id: insertedId,
          transcript: completeTranscript
        });
      }

      setMessages(completeTranscript);
      onDataChanged();

    } catch (err: any) {
      console.error("Chat Extraction Error:", err);
      let errorText = `Sorry, I encountered an issue: ${err.message || 'Could not process request.'}`;
      if (err.message?.includes('Unauthorized')) errorText = `⚠️ **Session Expired:** Please sign in again.`;
      
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        sender: 'ai',
        text: errorText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleVerifyDraft(msgId: string, txId?: string, intent?: string) {
    if (!txId || !intent) return;
    const table = intent === 'LOG_BILL' ? 'bills' : 'invoices';
    const { error } = await supabase.from(table).update({ is_ai_verified: true }).eq('id', txId);
    if (!error) {
      onDataChanged();
      setMessages(prev => prev.map(m => {
        if (m.id === msgId && m.extractedDraft) {
          return {
            ...m,
            text: "✓ Verified and posted to the General Ledger!",
            extractedDraft: { ...m.extractedDraft, status: 'open' }
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
            <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">AI Bookkeeper</h3>
            <p className="text-[11px] text-gray-500 font-medium">Double-Entry AI Assistant</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5" /></button>
        )}
      </div>

      <div className="flex-1 p-4 overflow-y-auto min-h-0 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.sender === 'ai' && <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 mt-1">AI</div>}
            
            <div className={`max-w-[85%] space-y-2 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
              {msg.imagePreview && (
                <div className="rounded-xl overflow-hidden border border-gray-200 shadow-xs max-w-xs mb-1">
                  <img src={msg.imagePreview} alt="Uploaded receipt" className="max-h-48 object-cover w-full" />
                </div>
              )}
              
              <div className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-2xs break-words whitespace-pre-wrap ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none border border-gray-200/60'}`}>
                {msg.text}
              </div>

              {msg.extractedDraft && (
                <div className="bg-white rounded-xl border border-blue-100 p-3.5 shadow-sm space-y-2.5 mt-2 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <Receipt className="w-4 h-4 text-blue-600" />
                      {msg.extractedDraft.entity_name} 
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      PENDING VERIFICATION
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-400 text-[10px]">Amount:</span>
                      <p className="font-bold text-gray-900">{msg.extractedDraft.amount} PKR</p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[10px]">Issue Date:</span>
                      <p className="font-medium text-gray-700">{msg.extractedDraft.issue_date}</p>
                    </div>
                    {msg.extractedDraft.due_date && (
                      <div>
                        <span className="text-gray-400 text-[10px]">Due Date:</span>
                        <p className="font-medium text-red-600">{msg.extractedDraft.due_date}</p>
                      </div>
                    )}
                    <div className="col-span-2">
                      <span className="text-gray-400 text-[10px]">Account:</span>
                      <p className="font-semibold text-blue-600">{msg.extractedDraft.account_name}</p>
                    </div>
                  </div>
                  
                  {!msg.text.includes('✓ Verified') && (
                    <button
                      onClick={() => handleVerifyDraft(msg.id, msg.extractedDraft?.transactionId, msg.extractedDraft?.intent)}
                      className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer mt-2"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve into Ledger
                    </button>
                  )}
                </div>
              )}
            </div>
            
            {msg.sender === 'user' && <div className="w-7 h-7 rounded-lg bg-gray-900 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-1"><User className="w-4 h-4" /></div>}
          </div>
        ))}
        {isExtracting && (
          <div className="flex gap-3 items-center text-xs text-blue-600 font-medium">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Analyzing receipt & extracting structured financial data...</span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      <div className="p-3 bg-white border-t border-gray-100 sticky bottom-0 z-10">
        {imageBase64 && (
          <div className="mb-2 relative inline-block">
            <img src={imageBase64} alt="Preview" className="h-16 w-16 object-cover rounded-xl border border-gray-300" />
            <button onClick={clearImage} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="relative flex items-center bg-white rounded-full p-1.5 shadow-md pl-3 pr-2 border border-gray-200 focus-within:ring-2 focus-within:ring-blue-100">
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])} />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-blue-600"><Plus className="w-5 h-5" /></button>
          <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask or log bill/invoice..." className="flex-1 bg-transparent border-none text-gray-900 text-xs sm:text-sm px-3 focus:outline-none" disabled={isExtracting} />
          <button type="submit" disabled={isExtracting || (!prompt.trim() && !imageBase64)} className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center"><ArrowUp className="w-5 h-5" /></button>
        </form>
      </div>
    </div>
  );
}