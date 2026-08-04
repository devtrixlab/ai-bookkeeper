'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Check, Trash2, Edit2, X } from 'lucide-react';

type Transaction = {
  id: string; amount: number; currency: string; date: string; vendor_name: string;
  category_id: string; is_user_verified: boolean; categories: { name: string };
};
type Category = { id: string; name: string; };

interface PendingTableProps {
  transactions: Transaction[];
  categories: Category[];
  onDataChanged: () => void;
}

export default function PendingTable({ transactions, categories, onDataChanged }: PendingTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Transaction>>({});

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleVerify(id: string) {
    const { error } = await supabase.from('transactions').update({ is_user_verified: true }).eq('id', id);
    if (error) console.error("Verify error:", error);
    onDataChanged();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) console.error("Delete error:", error);
    onDataChanged();
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    const safeAmount = typeof editForm.amount === 'number' && !isNaN(editForm.amount) ? editForm.amount : 0;
    const { error } = await supabase.from('transactions').update({
      date: editForm.date,
      vendor_name: editForm.vendor_name,
      category_id: editForm.category_id,
      amount: safeAmount,
      currency: editForm.currency
    }).eq('id', editingId);

    if (error) console.error("Save edit error:", error);
    setEditingId(null);
    onDataChanged();
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50/50">
        <h2 className="font-semibold text-gray-800">Pending Verification ({transactions.length})</h2>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-gray-700 text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Date</th><th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Category</th><th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No pending transactions.</td></tr>
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
                      <td className="px-4 py-2 text-right flex justify-end gap-1">
                        <button onClick={handleSaveEdit} className="p-1.5 text-green-600 hover:bg-green-50 rounded-md"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md"><X className="w-4 h-4" /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3">{t.date}</td><td className="px-4 py-3 font-medium text-gray-900">{t.vendor_name}</td>
                      <td className="px-4 py-3"><span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-xs font-medium">{t.categories?.name}</span></td>
                      <td className="px-4 py-3 font-medium text-gray-900">{t.amount} {t.currency}</td>
                      <td className="px-4 py-3 flex justify-end gap-1">
                        <button onClick={() => handleVerify(t.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-md"><Check className="w-4 h-4" /></button>
                        <button onClick={() => { setEditingId(t.id); setEditForm({ ...t }); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md"><Edit2 className="w-4 h-4" /></button>
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
  );
}