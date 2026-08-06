'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Plus, Search, FileText, Users, Package, Edit2, Trash2, Loader2, X, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SalesHub() {
  const [activeTab, setActiveTab] = useState<'invoices' | 'customers' | 'products'>('invoices');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [newInvoice, setNewInvoice] = useState({ id: '', customer_id: '', issue_date: '', amount: '' });
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

    if (activeTab === 'invoices') {
      const { data: invData } = await supabase
        .from('invoices')
        .select('*, customers(name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (invData) setInvoices(invData);
    } else if (activeTab === 'customers') {
      const { data: custData } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
      if (custData) setCustomers(custData);
    }
    
    setIsLoading(false);
  }

  // Pre-fetch customers for the modal
  useEffect(() => {
    async function getCustomers() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('customers').select('*').eq('user_id', user.id);
      if (data) setCustomers(data);
    }
    getCustomers();
  }, []);

  async function handleCreateOrUpdateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!newInvoice.customer_id || !newInvoice.amount || !newInvoice.issue_date) {
      toast.error("Please fill in all fields");
      return;
    }
    
    const toastId = toast.loading(isEditing ? "Updating Invoice..." : "Creating Invoice...");
    const { data: { user } } = await supabase.auth.getUser();
    
    const safeAmount = Math.round(parseFloat(newInvoice.amount) * 100) / 100;
    
    if (isEditing) {
      const { error } = await supabase.from('invoices').update({
        customer_id: newInvoice.customer_id,
        issue_date: newInvoice.issue_date,
        total_amount: safeAmount,
        balance_due: safeAmount,
      }).eq('id', newInvoice.id);
      
      if (error) {
        toast.error(`Error: ${error.message}`, { id: toastId });
      } else {
        toast.success("Invoice updated successfully!", { id: toastId });
        closeModal();
        fetchData();
      }
    } else {
      const { error } = await supabase.from('invoices').insert({
        user_id: user?.id,
        customer_id: newInvoice.customer_id,
        issue_date: newInvoice.issue_date,
        total_amount: safeAmount,
        balance_due: safeAmount,
        status: 'open',
        is_ai_verified: true // Manual entries are verified by default
      });

      if (error) {
        toast.error(`Error: ${error.message}`, { id: toastId });
      } else {
        toast.success("Invoice created successfully!", { id: toastId });
        closeModal();
        fetchData();
      }
    }
  }

  async function handleDeleteInvoice(id: string) {
    const inv = invoices.find(i => i.id === id);
    if (inv?.is_ai_verified) {
      toast.error("Verified invoices cannot be deleted. They are part of your permanent ledger.");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this invoice? This will also remove the corresponding journal entries.")) return;
    const toastId = toast.loading("Deleting invoice...");
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) {
      toast.error(`Error: ${error.message}`, { id: toastId });
    } else {
      toast.success("Invoice deleted!", { id: toastId });
      fetchData();
    }
  }

  function openEditModal(inv: any) {
    setIsEditing(true);
    setNewInvoice({
      id: inv.id,
      customer_id: inv.customer_id,
      issue_date: inv.issue_date,
      amount: inv.total_amount.toString()
    });
    setIsInvoiceModalOpen(true);
  }

  function closeModal() {
    setIsInvoiceModalOpen(false);
    setIsEditing(false);
    setNewInvoice({ id: '', customer_id: '', issue_date: '', amount: '' });
  }

  return (
    <div className="space-y-6 relative">
      
      {/* HEADER & TABS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-xs border border-gray-100">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            Sales Hub
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Manage your invoices, customers, and product catalogs.
          </p>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-xl text-sm font-medium">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${activeTab === 'invoices' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <FileText className="w-4 h-4" /> Invoices
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${activeTab === 'customers' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Users className="w-4 h-4" /> Customers
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
              if (activeTab === 'invoices') {
                setIsEditing(false);
                setNewInvoice({ id: '', customer_id: '', issue_date: '', amount: '' });
                setIsInvoiceModalOpen(true);
              }
              else toast('Customer modal coming soon!', { icon: '🚧' });
            }}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 font-bold" />
            New {activeTab === 'invoices' ? 'Invoice' : 'Customer'}
          </button>
        </div>

        {/* LISTING */}
        <div className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-blue-600">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
                {activeTab === 'invoices' && (
                  <tr>
                    <th className="px-6 py-4">Invoice ID</th>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Issue Date</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-center">AI Verified</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                )}
                {activeTab === 'customers' && (
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
                {activeTab === 'invoices' && invoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-500">
                          <FileText className="w-6 h-6" />
                        </div>
                        <p className="text-gray-500 font-medium">No invoices found</p>
                        <p className="text-xs text-gray-400">Create one manually or use the AI Assistant to extract from a receipt.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {activeTab === 'customers' && customers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500">
                          <Users className="w-6 h-6" />
                        </div>
                        <p className="text-gray-500 font-medium">No customers found</p>
                        <p className="text-xs text-gray-400">Customers are automatically created when the AI logs a new invoice.</p>
                      </div>
                    </td>
                  </tr>
                )}

                {/* DATA ROWS */}
                {activeTab === 'invoices' && invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      INV-{inv.id.substring(0, 6).toUpperCase()}
                    </td>
                    <td className="px-6 py-4 font-semibold text-blue-700">
                      {inv.customers?.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {inv.issue_date}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">
                      {inv.total_amount.toLocaleString()} PKR
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${
                        inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                        inv.status === 'draft' ? 'bg-gray-100 text-gray-700 border border-gray-200' :
                        'bg-amber-100 text-amber-700 border border-amber-200'
                      }`}>
                        {inv.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {inv.is_ai_verified ? (
                        <span className="text-emerald-500 text-xs font-semibold flex justify-center"><AlertCircle className="w-4 h-4 hidden" /> Yes</span>
                      ) : (
                        <span className="text-amber-500 text-xs font-semibold flex justify-center items-center gap-1"><AlertCircle className="w-4 h-4" /> Pending</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                      <button onClick={() => openEditModal(inv)} className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteInvoice(inv.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}

                {activeTab === 'customers' && customers.map((c) => (
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

      {/* SLIDE-OVER MODAL FOR NEW INVOICE */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900">{isEditing ? 'Edit Invoice' : 'Create New Invoice'}</h2>
              <button onClick={closeModal} className="p-2 text-gray-400 hover:text-gray-700 bg-white rounded-full shadow-xs cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateOrUpdateInvoice} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Customer</label>
                <select 
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newInvoice.customer_id}
                  onChange={e => setNewInvoice({...newInvoice, customer_id: e.target.value})}
                  required
                >
                  <option value="">Select a Customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">If the customer is missing, ask the AI to "Create customer X".</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Issue Date</label>
                <input 
                  type="date" 
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newInvoice.issue_date}
                  onChange={e => setNewInvoice({...newInvoice, issue_date: e.target.value})}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Total Amount (PKR)</label>
                <input 
                  type="number" 
                  min="0"
                  step="0.01"
                  className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newInvoice.amount}
                  onChange={e => setNewInvoice({...newInvoice, amount: e.target.value})}
                  placeholder="0.00"
                  required
                />
              </div>
            </form>

            <div className="p-6 border-t border-gray-100 bg-white flex gap-3">
              <button type="button" onClick={closeModal} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
                Cancel
              </button>
              <button onClick={handleCreateOrUpdateInvoice} className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 cursor-pointer">
                {isEditing ? 'Save Changes' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
