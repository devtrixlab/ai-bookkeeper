'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Check, Trash2, Edit2, X } from 'lucide-react';

type Transaction = {
  id: string; amount: number; issue_date: string; contact_id: string; account_id: string;
  is_ai_verified: boolean; status: 'paid' | 'unpaid' | 'partial'; entry_type: 'credit' | 'debit';
  description: string;
  contacts?: { name: string, type: string };
  chart_of_accounts?: { name: string, account_type: string };
};
type ChartOfAccount = { id: string; name: string; account_type: string };
type Contact = { id: string; name: string; type: string };

interface PendingTableProps {
  transactions: Transaction[];
  chartOfAccounts: ChartOfAccount[];
  contacts: Contact[];
  onDataChanged: () => void;
}

export default function PendingTable({ transactions, chartOfAccounts, contacts, onDataChanged }: PendingTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Transaction>>({});

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleVerify(id: string) {
    const { error } = await supabase.from('transactions').update({ is_ai_verified: true }).eq('id', id);
    if (error) console.error("Verify error:", error);
    onDataChanged();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Are you sure you want to delete this transaction? This action cannot be undone.")) {
      return;
    }
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) console.error("Delete error:", error);
    onDataChanged();
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    const safeAmount = typeof editForm.amount === 'number' && !isNaN(editForm.amount) ? editForm.amount : 0;
    const { error } = await supabase.from('transactions').update({
      issue_date: editForm.issue_date,
      contact_id: editForm.contact_id,
      account_id: editForm.account_id,
      amount: safeAmount,
      entry_type: editForm.entry_type,
      status: editForm.status,
      description: editForm.description
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
              <th className="px-4 py-3">Date</th><th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Account</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No pending transactions.</td></tr>
            ) : (
              transactions.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  {editingId === t.id ? (
                    <>
                      <td className="px-4 py-2"><input type="date" value={editForm.issue_date || ''} onChange={e => setEditForm({...editForm, issue_date: e.target.value})} className="border rounded p-1 text-sm w-full" /></td>
                      <td className="px-4 py-2">
                        <select value={editForm.contact_id || ''} onChange={e => setEditForm({...editForm, contact_id: e.target.value})} className="border rounded p-1 text-sm w-full">
                          <option value="">Select Contact</option>
                          {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select value={editForm.account_id || ''} onChange={e => setEditForm({...editForm, account_id: e.target.value})} className="border rounded p-1 text-sm w-full">
                          <option value="">Select Account</option>
                          {chartOfAccounts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select value={editForm.entry_type || 'debit'} onChange={e => setEditForm({...editForm, entry_type: e.target.value as any})} className="border rounded p-1 text-sm w-full">
                          <option value="debit">Debit (Bill)</option>
                          <option value="credit">Credit (Invoice)</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select value={editForm.status || 'unpaid'} onChange={e => setEditForm({...editForm, status: e.target.value as any})} className="border rounded p-1 text-sm w-full">
                          <option value="unpaid">Unpaid</option>
                          <option value="paid">Paid</option>
                          <option value="partial">Partial</option>
                        </select>
                      </td>
                      <td className="px-4 py-2 flex justify-end">
                        <input type="number" value={editForm.amount || 0} onChange={e => setEditForm({...editForm, amount: parseFloat(e.target.value)})} className="border rounded p-1 text-sm w-24 text-right" />
                      </td>
                      <td className="px-4 py-2 text-right flex justify-end gap-1">
                        <button onClick={handleSaveEdit} className="p-1.5 text-green-600 hover:bg-green-50 rounded-md"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md"><X className="w-4 h-4" /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3">{t.issue_date}</td><td className="px-4 py-3 font-medium text-gray-900">{t.contacts?.name || 'Unknown Contact'}</td>
                      <td className="px-4 py-3"><span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-xs font-medium">{t.chart_of_accounts?.name || 'Unknown Account'}</span></td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 rounded-md text-xs font-medium ${t.entry_type === 'credit' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{t.entry_type === 'credit' ? 'Invoice/AR' : 'Bill/AP'}</span></td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 rounded-md text-xs font-medium ${t.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : t.status === 'partial' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>{t.status}</span></td>
                      <td className="px-4 py-3 font-medium text-gray-900 text-right">{t.amount.toLocaleString()}</td>
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