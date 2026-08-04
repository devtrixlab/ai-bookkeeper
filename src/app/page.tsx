'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Loader2 } from 'lucide-react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ExpenseForm from '@/components/dashboard/ExpenseForm';
import PendingTable from '@/components/dashboard/PendingTable';
import VerifiedLedger from '@/components/dashboard/VerifiedLedger';

export default function Dashboard() {
  const [pendingTransactions, setPendingTransactions] = useState<any[]>([]);
  const [verifiedTransactions, setVerifiedTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize the SSR-compatible client
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setIsLoading(true);
    
    // This will now correctly send your authenticated session cookies
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
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <DashboardHeader />
        
        <ExpenseForm 
          categories={categories} 
          onSuccess={fetchTransactions} 
        />
        
        <PendingTable 
          transactions={pendingTransactions} 
          categories={categories} 
          onDataChanged={fetchTransactions} 
        />

        <VerifiedLedger 
          transactions={verifiedTransactions} 
        />
      </div>
    </div>
  );
}