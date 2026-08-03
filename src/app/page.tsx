'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Send, Check, Trash2, Loader2, LogOut, Receipt, Edit2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Transaction = {
  id: string;
  amount: number;
  currency: string;
  date: string;
  vendor_name: string;
  category_id: string;
  is_user_verified: boolean;
  categories: { name: string };
};

type Category = {
  id: string;
  name: string;
};

export default function Dashboard() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Inline Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Transaction>>({});

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
    if (data) setTransactions(data as any);
  }

  async function handleExtract(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setIsExtracting(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication error.");

      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      
      if (!res.ok) throw new Error("Failed to process expense.");
      const aiData = await res.json();

      const matchedCategory = categories.find(
        c => c.name.toLowerCase() === aiData.category_name?.toLowerCase()
      ) || categories[0];

      const { error: insertError } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          amount: aiData.amount,
          currency: aiData.currency || 'PKR',
          date: aiData.date,
          vendor_name: aiData.vendor_name,
          category_id: matchedCategory.id,
          is_user_verified: false
        });

      if (insertError) throw insertError;
      setPrompt('');
      await fetchPendingTransactions();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsExtracting(false);
    }
  }

  // HITL Actions
  async function handleVerify(id: string) {
    await supabase.from('transactions').update({ is_user_verified: true }).eq('id', id);
    setTransactions(prev => prev.filter(t => t.id !== id));
  }

  async function handleDelete(id: string) {
    await supabase.from('transactions').delete().eq('id', id);
    setTransactions(prev => prev.filter(t => t.id !== id));
  }

  function startEditing(t: Transaction) {
    setEditingId(t.id);
    setEditForm({ ...t });
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    
    // Update database
    await supabase
      .from('transactions')
      .update({
        date: editForm.date,
        vendor_name: editForm.vendor_name,
        category_id: editForm.category_id,
        amount: editForm.amount,
        currency: editForm.currency
      })
      .eq('id', editingId);

    // Refresh UI
    await fetchPendingTransactions();
    setEditingId(null);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center space-x-2 text-blue-600 font-bold text-xl">
            <Receipt />
            <span>AI Bookkeeper</span>
          </div>
          <button onClick={handleLogout} className="text-gray-500 hover:text-gray-800 flex items-center text-sm font-medium">
            <LogOut className="w-4 h-4 mr-1" /> Sign Out
          </button>
        </div>

        <form onSubmit={handleExtract} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Log a new expense</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. I spent 1500 PKR on a Zong mobile top up via NayaPay yesterday"
              className="flex-1 rounded-lg border-gray-300 ring-1 ring-inset ring-gray-300 py-3 px-4 focus:ring-2 focus:ring-blue-600 outline-none transition-all"
              disabled={isExtracting}
            />
            <button
              type="submit"
              disabled={isExtracting || !prompt.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 rounded-lg font-medium flex items-center justify-center disabled:opacity-50 transition-colors"
            >
              {isExtracting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </form>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="font-semibold text-gray-800">Pending Verification ({transactions.length})</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-gray-700 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No pending transactions. You're all caught up!
                    </td>
                  </tr>
                ) : (
                  transactions.map((t) => (
                    <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      {editingId === t.id ? (
                        <>
                          <td className="px-4 py-2"><input type="date" value={editForm.date} onChange={e => setEditForm({...editForm, date: e.target.value})} className="border rounded p-1 text-sm w-full" /></td>
                          <td className="px-4 py-2"><input type="text" value={editForm.vendor_name} onChange={e => setEditForm({...editForm, vendor_name: e.target.value})} className="border rounded p-1 text-sm w-full" /></td>
                          <td className="px-4 py-2">
                            <select value={editForm.category_id} onChange={e => setEditForm({...editForm, category_id: e.target.value})} className="border rounded p-1 text-sm w-full">
                              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-2 flex gap-1">
                            <input type="number" value={editForm.amount} onChange={e => setEditForm({...editForm, amount: parseFloat(e.target.value)})} className="border rounded p-1 text-sm w-24" />
                            <input type="text" value={editForm.currency} onChange={e => setEditForm({...editForm, currency: e.target.value})} className="border rounded p-1 text-sm w-16" />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button onClick={handleSaveEdit} className="p-1.5 text-green-600 hover:bg-green-50 rounded-md"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md"><X className="w-4 h-4" /></button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3">{t.date}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{t.vendor_name}</td>
                          <td className="px-4 py-3"><span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-xs font-medium">{t.categories?.name}</span></td>
                          <td className="px-4 py-3 font-medium text-gray-900">{t.amount} {t.currency}</td>
                          <td className="px-4 py-3 flex justify-end gap-1">
                            <button onClick={() => handleVerify(t.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-md"><Check className="w-4 h-4" /></button>
                            <button onClick={() => startEditing(t)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(t.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}