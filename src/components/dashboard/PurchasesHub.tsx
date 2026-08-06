'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Plus, Search, Receipt, Truck, Edit2, Trash2, Loader2, X, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { parseToCents } from '@/utils/currency';

export default function PurchasesHub() {
  const [activeTab, setActiveTab] = useState<'bills' | 'suppliers'>('bills');
  const [bills, setBills] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [newBill, setNewBill] = useState({ id: '', supplier_id: '', account_id: '', issue_date: '', amount: '' });
  const [isEditing, setIsEditing] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  async function fetchData() {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (activeTab === 'bills') {
      const { data: billsData } = await supabase
        .from('bills')
        .select('*, suppliers(name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (billsData) setBills(billsData);
    } else if (activeTab === 'suppliers') {
      const { data: suppData } = await supabase
        .from('suppliers')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
      if (suppData) setSuppliers(suppData);
    }
    
    setIsLoading(false);
  }

  // Pre-fetch suppliers and accounts for the modal
  useEffect(() => {
    async function getModalData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: supps } = await supabase.from('suppliers').select('*').eq('user_id', user.id);
      if (supps) setSuppliers(supps);
      
      const { data: accs } = await supabase.from('accounts').select('*').eq('user_id', user.id).eq('type', 'expense');
      if (accs) setChartOfAccounts(accs);
    }
    getModalData();
  }, []);

  async function handleCreateOrUpdateBill(e: React.FormEvent) {
    e.preventDefault();
    if (!newBill.supplier_id || !newBill.amount || !newBill.issue_date || !newBill.account_id) {
      toast.error("Please fill in all fields");
      return;
    }
    
    const toastId = toast.loading(isEditing ? "Updating Bill..." : "Creating Bill...");
    const { data: { user } } = await supabase.auth.getUser();
    
    const safeAmountCents = parseToCents(newBill.amount);
    
    if (isEditing) {
      const { error } = await supabase.from('bills').update({
        supplier_id: newBill.supplier_id,
        issue_date: newBill.issue_date,
        total_amount: safeAmountCents / 100,
        balance_due: safeAmountCents / 100,
      }).eq('id', newBill.id);
      
      if (error) {
        toast.error(`Error: ${error.message}`, { id: toastId });
        return;
      }

      const { error: lineError } = await supabase.from('bill_lines').update({
        account_id: newBill.account_id,
        amount: safeAmountCents / 100
      }).eq('bill_id', newBill.id);

      if (lineError) {
        toast.error(`Error linking account: ${lineError.message}`, { id: toastId });
      } else {
        toast.success("Bill updated successfully!", { id: toastId });
        closeModal();
        fetchData();
      }

    } else {
      // Insert Bill
      const { data: insertedBill, error: billError } = await supabase.from('bills').insert({
        user_id: user?.id,
        supplier_id: newBill.supplier_id,
        issue_date: newBill.issue_date,
        total_amount: safeAmountCents / 100,
        balance_due: safeAmountCents / 100,
        status: 'open',
        is_ai_verified: true // Manual entries are verified by default
      }).select().single();

      if (billError) {
        toast.error(`Error: ${billError.message}`, { id: toastId });
        return;
      }

      const { error: lineError } = await supabase.from('bill_lines').insert({
        bill_id: insertedBill.id,
        account_id: newBill.account_id,
        amount: safeAmountCents / 100,
        description: 'Manual entry'
      });

      if (lineError) {
        toast.error(`Error linking account: ${lineError.message}`, { id: toastId });
      } else {
        toast.success("Bill created and posted to ledger!", { id: toastId });
        closeModal();
        fetchData();
      }
    }
  }

  async function handleDeleteBill(id: string) {
    const bill = bills.find(b => b.id === id);
    if (bill?.is_ai_verified) {
      toast.error("Verified bills cannot be deleted. They are part of your permanent ledger.");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this bill? This will also remove the corresponding journal entries.")) return;
    const toastId = toast.loading("Deleting bill...");
    const { error } = await supabase.from('bills').delete().eq('id', id);
    if (error) {
      toast.error(`Error: ${error.message}`, { id: toastId });
    } else {
      toast.success("Bill deleted!", { id: toastId });
      fetchData();
    }
  }

  async function openEditModal(bill: any) {
    setIsEditing(true);
    // Fetch the bill line to get the account_id
    const { data: line } = await supabase.from('bill_lines').select('account_id').eq('bill_id', bill.id).limit(1).single();
    
    setNewBill({
      id: bill.id,
      supplier_id: bill.supplier_id,
      account_id: line?.account_id || '',
      issue_date: bill.issue_date,
      amount: bill.total_amount.toString()
    });
    setIsBillModalOpen(true);
  }

  function closeModal() {
    setIsBillModalOpen(false);
    setIsEditing(false);
    setNewBill({ id: '', supplier_id: '', account_id: '', issue_date: '', amount: '' });
  }

  return (
    <div className="space-y-6 relative">
      
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

          <button 
            onClick={() => {
              if (activeTab === 'bills') {
                setIsEditing(false);
                setNewBill({ id: '', supplier_id: '', account_id: '', issue_date: '', amount: '' });
                setIsBillModalOpen(true);
              }
              else toast('Supplier modal coming soon!', { icon: '🚧' });
            }}
            className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
          >
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
                    <th className="px-6 py-4 text-center">AI Verified</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                )}
                {activeTab === 'suppliers' && (
                  <tr>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Phone</th>
                    <th className="px-6 py-4">Added</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                
                {/* EMPTY STATES */}
                {activeTab === 'bills' && bills.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-500">
                          <Receipt className="w-6 h-6" />
                        </div>
                        <p className="text-gray-500 font-medium">No bills found</p>
                        <p className="text-xs text-gray-400">Create one manually or drag a receipt into the AI Assistant.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {activeTab === 'suppliers' && suppliers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500">
                          <Truck className="w-6 h-6" />
                        </div>
                        <p className="text-gray-500 font-medium">No suppliers found</p>
                        <p className="text-xs text-gray-400">Suppliers are automatically created when the AI logs a new bill.</p>
                      </div>
                    </td>
                  </tr>
                )}

                {/* DATA ROWS */}
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
                    <td className="px-6 py-4 text-center">
                      {bill.is_ai_verified ? (
                        <span className="text-emerald-500 text-xs font-semibold flex justify-center"><AlertCircle className="w-4 h-4 hidden" /> Yes</span>
                      ) : (
                        <span className="text-amber-500 text-xs font-semibold flex justify-center items-center gap-1"><AlertCircle className="w-4 h-4" /> Pending</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                      <button onClick={() => openEditModal(bill)} className="p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteBill(bill.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}

                {activeTab === 'suppliers' && suppliers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-gray-900">{c.name}</td>
                    <td className="px-6 py-4 text-gray-500">{c.email || '-'}</td>
                    <td className="px-6 py-4 text-gray-500">{c.phone || '-'}</td>
                    <td className="px-6 py-4 text-gray-400 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* SLIDE-OVER MODAL FOR NEW BILL */}
      {isBillModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900">{isEditing ? 'Edit Bill' : 'Create New Bill'}</h2>
              <button onClick={closeModal} className="p-2 text-gray-400 hover:text-gray-700 bg-white rounded-full shadow-xs cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateOrUpdateBill} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Supplier</label>
                <select 
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newBill.supplier_id}
                  onChange={e => setNewBill({...newBill, supplier_id: e.target.value})}
                  required
                >
                  <option value="">Select a Supplier</option>
                  {suppliers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">If the supplier is missing, ask the AI to "Create supplier X".</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Expense Account</label>
                <select 
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newBill.account_id}
                  onChange={e => setNewBill({...newBill, account_id: e.target.value})}
                  required
                >
                  <option value="">Select an Expense Account</option>
                  {chartOfAccounts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Issue Date</label>
                <input 
                  type="date" 
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newBill.issue_date}
                  onChange={e => setNewBill({...newBill, issue_date: e.target.value})}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Total Amount (PKR)</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.01"
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newBill.amount}
                  onChange={e => setNewBill({...newBill, amount: e.target.value})}
                  placeholder="0.00"
                  required
                />
              </div>
            </form>

            <div className="p-6 border-t border-gray-100 bg-white flex gap-3">
              <button type="button" onClick={closeModal} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
                Cancel
              </button>
              <button onClick={handleCreateOrUpdateBill} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-500/20 cursor-pointer">
                {isEditing ? 'Save Changes' : 'Create Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
