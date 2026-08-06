'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Plus, Search, Receipt, Truck, MoreVertical, Loader2 } from 'lucide-react';
import { Bill } from '@/types';

export default function PurchasesHub() {
  const [activeTab, setActiveTab] = useState<'bills' | 'suppliers'>('bills');
  const [bills, setBills] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: billsData } = await supabase
      .from('bills')
      .select('*, suppliers(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (billsData) setBills(billsData);
    setIsLoading(false);
  }

  return (
    <div className="space-y-6">
      
      {/* HEADER & TABS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-xs border border-gray-100">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            Purchases Hub
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Manage your bills, expenses, and supplier catalog.
          </p>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-xl text-sm font-medium">
          <button
            onClick={() => setActiveTab('bills')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${activeTab === 'bills' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Receipt className="w-4 h-4" /> Bills
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${activeTab === 'suppliers' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Truck className="w-4 h-4" /> Suppliers
          </button>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="bg-white rounded-2xl shadow-xs border border-gray-100 overflow-hidden min-h-[400px]">
        
        {/* TOOLBAR */}
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder={`Search ${activeTab}...`} 
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
            />
          </div>

          <button className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 transition-all cursor-pointer">
            <Plus className="w-4 h-4 font-bold" />
            New {activeTab === 'bills' ? 'Bill' : 'Supplier'}
          </button>
        </div>

        {/* LISTING */}
        <div className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-indigo-600">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
                {activeTab === 'bills' && (
                  <tr>
                    <th className="px-6 py-4">Bill ID</th>
                    <th className="px-6 py-4">Supplier</th>
                    <th className="px-6 py-4">Issue Date</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {activeTab === 'bills' && bills.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      No bills found. Create one manually or upload a receipt to the AI Assistant.
                    </td>
                  </tr>
                )}
                {activeTab === 'bills' && bills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      BILL-{bill.id.substring(0, 6).toUpperCase()}
                    </td>
                    <td className="px-6 py-4 font-semibold text-indigo-700">
                      {bill.suppliers?.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {bill.issue_date}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">
                      {bill.total_amount.toLocaleString()} PKR
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${
                        bill.status === 'paid' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                        bill.status === 'draft' ? 'bg-gray-100 text-gray-700 border border-gray-200' :
                        'bg-amber-100 text-amber-700 border border-amber-200'
                      }`}>
                        {bill.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
