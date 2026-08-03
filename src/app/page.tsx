'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ExpenseForm from '@/components/dashboard/ExpenseForm';
import PendingTable from '@/components/dashboard/PendingTable';

export default function Dashboard() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setIsLoading(true);
    const { data: cats } = await supabase.from('categories').select('*');
    if (cats) setCategories(cats);
    await fetchPendingTransactions();
    setIsLoading(false);
  }

  async function fetchPendingTransactions() {
    const { data } = await supabase
      .from('transactions')
      .select('*, categories(name)')
      .eq('is_user_verified', false)
      .order('created_at', { ascending: false });
    if (data) setTransactions(data);
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
          onSuccess={fetchPendingTransactions} 
        />
        
        <PendingTable 
          transactions={transactions} 
          categories={categories} 
          onDataChanged={fetchPendingTransactions} 
        />
      </div>
    </div>
  );
}