'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Check, Trash2, Edit2, X, Receipt, FileText } from 'lucide-react';

export type PendingItem = {
  id: string;
  type: 'invoice' | 'bill';
  entityName: string;
  amount: number;
  date: string;
  status: string;
};

interface PendingTableProps {
  items: PendingItem[];
  onDataChanged: () => void;
}

export default function PendingTable({ items, onDataChanged }: PendingTableProps) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleVerify(id: string, type: 'invoice' | 'bill') {
    const table = type === 'invoice' ? 'invoices' : 'bills';
    const { error } = await supabase.from(table).update({ is_ai_verified: true }).eq('id', id);
    if (error) console.error("Verify error:", error);
    onDataChanged();
  }

  async function handleDelete(id: string, type: 'invoice' | 'bill') {
    if (!window.confirm("Are you sure you want to delete this draft?")) return;
    const table = type === 'invoice' ? 'invoices' : 'bills';
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) console.error("Delete error:", error);
    onDataChanged();
  }

  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl shadow-xs border border-amber-200 overflow-hidden mb-6">
      <div className="p-4 border-b border-amber-100 bg-amber-50/50 flex items-center justify-between">
        <h2 className="font-bold text-amber-900 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          Pending AI Verifications ({items.length})
        </h2>
        <span className="text-xs text-amber-700 font-medium bg-amber-100 px-2 py-1 rounded-md">Action Required</span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-white text-gray-400 text-xs uppercase border-b border-gray-100">
            <tr>
              <th className="px-6 py-3 font-semibold">Type</th>
              <th className="px-6 py-3 font-semibold">Date</th>
              <th className="px-6 py-3 font-semibold">Entity</th>
              <th className="px-6 py-3 font-semibold text-right">Amount</th>
              <th className="px-6 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 bg-white">
            {items.map((t) => (
              <tr key={t.id} className="hover:bg-amber-50/30 transition-colors">
                <td className="px-6 py-3">
                  {t.type === 'invoice' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                      <FileText className="w-3.5 h-3.5" /> Invoice
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100">
                      <Receipt className="w-3.5 h-3.5" /> Bill
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 text-gray-500">{t.date}</td>
                <td className="px-6 py-3 font-semibold text-gray-900">{t.entityName}</td>
                <td className="px-6 py-3 font-bold text-gray-900 text-right">{t.amount.toLocaleString()} PKR</td>
                <td className="px-6 py-3 flex justify-end gap-2">
                  <button onClick={() => handleVerify(t.id, t.type)} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer">
                    <Check className="w-3.5 h-3.5" /> Verify
                  </button>
                  <button onClick={() => handleDelete(t.id, t.type)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}