'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Loader2, MessageSquare, X } from 'lucide-react';
import HeaderNav from '@/components/layout/HeaderNav';
import BentoStatsPanel from '@/components/dashboard/BentoStatsPanel';
import AiChatPanel from '@/components/chat/AiChatPanel';

export default function DashboardPage() {
  const [pendingTransactions, setPendingTransactions] = useState<any[]>([]);
  const [verifiedTransactions, setVerifiedTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [userEmail, setUserEmail] = useState<string>('user@aibookkeeper.com');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'ledger' | 'analytics'>('overview');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setIsLoading(true);
    
    // Fetch User
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      setUserEmail(user.email);
    }

    // Fetch Categories
    const { data: cats, error: catsError } = await supabase.from('categories').select('*');
    if (catsError) {
      console.error("Error fetching categories:", catsError);
    } else if (cats) {
      setCategories(cats);
    }
    
    await fetchTransactions();
    setIsLoading(false);
  }

  async function fetchTransactions() {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, categories(name)')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error("Error fetching transactions:", error);
    } else if (data) {
      setPendingTransactions(data.filter(t => !t.is_user_verified));
      setVerifiedTransactions(data.filter(t => t.is_user_verified));
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="text-xs font-semibold text-gray-500">Loading AI Financial Engine...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      
      {/* GLOBAL HEADER (Reference: Red Box in Untitled.png) */}
      <HeaderNav 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        userEmail={userEmail}
        pendingCount={pendingTransactions.length}
      />

      {/* MAIN DASHBOARD SPLIT CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        
        {/* DESKTOP SPLIT VIEW: Bento Stats on Left, AI Chat on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start h-[calc(100vh-6rem)] min-h-[650px]">
          
          {/* LEFT CONTENT AREA: Bento Box Stats & Charts (Reference: Black Box & 22.png) */}
          <div className="lg:col-span-7 xl:col-span-8 overflow-y-auto pr-1 h-full space-y-6 scrollbar-thin">
            <BentoStatsPanel
              userEmail={userEmail}
              pendingTransactions={pendingTransactions}
              verifiedTransactions={verifiedTransactions}
              categories={categories}
              onDataChanged={fetchTransactions}
              activeTab={activeTab}
            />
          </div>

          {/* RIGHT SIDEBAR: Conversational AI Assistant Chat (Reference: Green Box & 11.png) */}
          <div className="hidden lg:block lg:col-span-5 xl:col-span-4 h-full sticky top-20">
            <AiChatPanel
              categories={categories}
              onDataChanged={fetchTransactions}
            />
          </div>

        </div>

      </main>

      {/* MOBILE AI CHAT FLOATING TOGGLE & SLIDE-UP DRAWER */}
      <div className="lg:hidden">
        
        {/* Floating Chat Button */}
        <button
          onClick={() => setMobileChatOpen(!mobileChatOpen)}
          className="fixed bottom-6 right-6 z-50 p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-2xl hover:scale-105 transition-all flex items-center gap-2 font-bold text-xs"
        >
          <MessageSquare className="w-5 h-5" />
          <span>AI Assistant</span>
        </button>

        {/* Slide-Up Drawer */}
        {mobileChatOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex flex-col justify-end p-2 sm:p-4">
            <div className="bg-white rounded-3xl h-[85vh] w-full max-w-lg mx-auto flex flex-col shadow-2xl overflow-hidden relative">
              <button
                onClick={() => setMobileChatOpen(false)}
                className="absolute top-3 right-3 z-50 p-2 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
              
              <AiChatPanel
                categories={categories}
                onDataChanged={fetchTransactions}
              />
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
