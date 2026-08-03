'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
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

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setIsLoading(true);
    const { data: cats } = await supabase.from('categories').select('*');
    if (cats) setCategories(cats);
    await fetchTransactions();
    setIsLoading(false);
  }

  async function fetchTransactions() {
    const { data } = await supabase
      .from('transactions')
      .select('*, categories(name)')
      .order('created_at', { ascending: false });
    
    if (data) {
      // Split the single database call into our two distinct UI states
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