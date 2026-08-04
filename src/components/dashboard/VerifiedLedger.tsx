'use client';

import { useMemo } from 'react';
import { Wallet, Download } from 'lucide-react';

type Transaction = {
  id: string;
  amount: number;
  currency: string;
  date: string;
  vendor_name: string;
  categories: { name: string };
};

interface VerifiedLedgerProps {
  transactions: Transaction[];
}

export default function VerifiedLedger({ transactions }: VerifiedLedgerProps) {
  // Calculate total spend dynamically
  const totalSpend = useMemo(() => {
    return transactions.reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  // Extract the primary currency for the total display
  const currency = transactions.length > 0 ? transactions[0].currency : 'PKR';

  function exportToCSV() {
    if (transactions.length === 0) return;

    // Define CSV headers
    const headers = ['Date', 'Vendor', 'Category', 'Amount', 'Currency'];
    
    // Map transactions to CSV rows
    const rows = transactions.map(t => [
      t.date || '',
      `"${(t.vendor_name || 'Unknown').replace(/"/g, '""')}"`, // Escape quotes for safety
      `"${t.categories?.name || 'Uncategorized'}"`,
      t.amount || 0,
      t.currency || 'PKR'
    ]);

    // Combine headers and rows into a single CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create a downloadable blob and trigger click event
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `verified-ledger-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-semibold text-gray-800">Verified Ledger</h2>
          <p className="text-sm text-gray-500">Your approved and committed expenses.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-lg border border-blue-100">
            <Wallet className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-800">Total Spend:</span>
            <span className="text-lg font-bold text-blue-700">
              {totalSpend.toLocaleString()} {currency}
            </span>
          </div>
          <button
            onClick={exportToCSV}
            disabled={transactions.length === 0}
            className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-3 py-2 rounded-lg font-medium text-sm flex items-center gap-2 disabled:opacity-50 transition-colors shadow-sm"
            title="Export to CSV"
          >
            <Download className="w-4 h-4 text-gray-500" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-gray-700 text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No verified transactions yet. Approve some from the pending tab!
                </td>
              </tr>
            ) : (
              transactions.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3">{t.date}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{t.vendor_name}</td>
                  <td className="px-4 py-3">
                    <span className="bg-green-50 text-green-700 px-2 py-1 rounded-md text-xs font-medium">
                      {t.categories?.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 text-right">
                    {t.amount} {t.currency}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}