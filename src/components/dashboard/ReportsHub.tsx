'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { FileSpreadsheet, Download, Loader2 } from 'lucide-react';

export default function ReportsHub() {
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
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

    // Fetch journal entries with their lines
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('*, journal_lines(*, accounts(name, type))')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (entries) setJournalEntries(entries);
    setIsLoading(false);
  }

  return (
    <div className="space-y-6">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-xs border border-gray-100">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            Financial Reports
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            General Ledger and certified double-entry accounting records.
          </p>
        </div>

        <button className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-sm font-semibold transition-all cursor-pointer">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* LEDGER CONTENT */}
      <div className="bg-white rounded-2xl shadow-xs border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          <h2 className="font-bold text-gray-900 text-sm">General Ledger</h2>
        </div>

        <div className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-emerald-600">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white text-gray-500 font-semibold border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 w-32">Date</th>
                  <th className="px-6 py-4 w-48">Reference</th>
                  <th className="px-6 py-4">Account</th>
                  <th className="px-6 py-4 text-right w-32">Debit</th>
                  <th className="px-6 py-4 text-right w-32">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {journalEntries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      No journal entries found. Wait for the automated triggers to fire upon invoice/bill creation.
                    </td>
                  </tr>
                )}
                {journalEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 align-top font-medium text-gray-900">
                      {entry.date}
                    </td>
                    <td className="px-6 py-4 align-top text-xs">
                      <span className="font-semibold text-gray-700 block mb-1">
                        {entry.reference_type?.toUpperCase()}
                      </span>
                      <span className="text-gray-400">
                        {entry.description || '-'}
                      </span>
                    </td>
                    <td className="p-0 col-span-3">
                      <table className="w-full">
                        <tbody>
                          {entry.journal_lines?.map((line: any) => (
                            <tr key={line.id} className="border-b border-gray-50 last:border-0">
                              <td className="px-6 py-3 font-medium text-gray-800">
                                {line.accounts?.name}
                              </td>
                              <td className="px-6 py-3 text-right text-gray-900 w-32">
                                {line.debit > 0 ? line.debit.toLocaleString() : '-'}
                              </td>
                              <td className="px-6 py-3 text-right text-gray-900 w-32">
                                {line.credit > 0 ? line.credit.toLocaleString() : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
