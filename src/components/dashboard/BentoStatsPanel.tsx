'use client';

import { useMemo, useState } from 'react';
import { 
  Wallet, 
  Clock, 
  CheckCircle, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  Download, 
  PieChart as PieIcon, 
  BarChart2, 
  Sparkles,
  Layers
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import PendingTable from './PendingTable';
import VerifiedLedger from './VerifiedLedger';

type Transaction = {
  id: string; amount: number; issue_date: string; contact_id: string; account_id: string;
  is_ai_verified: boolean; status: 'paid' | 'unpaid' | 'partial'; entry_type: 'credit' | 'debit';
  description: string;
  contacts?: { name: string, type: string };
  chart_of_accounts?: { name: string, account_type: string };
};

type ChartOfAccount = { id: string; name: string; account_type: string };
type Contact = { id: string; name: string; type: string };

interface BentoStatsPanelProps {
  userEmail?: string;
  pendingTransactions: Transaction[];
  verifiedTransactions: Transaction[];
  chartOfAccounts: ChartOfAccount[];
  contacts: Contact[];
  onDataChanged: () => void;
  activeTab: 'overview' | 'ledger' | 'analytics';
}

const CATEGORY_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1'];

export default function BentoStatsPanel({
  userEmail = 'user@aibookkeeper.com',
  pendingTransactions,
  verifiedTransactions,
  chartOfAccounts,
  contacts,
  onDataChanged,
  activeTab
}: BentoStatsPanelProps) {
  const [timeRange, setTimeRange] = useState<'Daily' | 'Monthly'>('Monthly');

  // Compute metrics
  const totalRevenue = useMemo(() => {
    return verifiedTransactions.filter(t => t.entry_type === 'credit').reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [verifiedTransactions]);

  const totalExpenses = useMemo(() => {
    return verifiedTransactions.filter(t => t.entry_type === 'debit').reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [verifiedTransactions]);

  const primaryCurrency = 'PKR';

  // Format data for Spend Distribution Donut Chart
  const categoryChartData = useMemo(() => {
    const map = new Map<string, number>();
    verifiedTransactions.forEach(t => {
      const catName = t.chart_of_accounts?.name || 'Uncategorized';
      map.set(catName, (map.get(catName) || 0) + t.amount);
    });

    const items = Array.from(map.entries()).map(([name, value]) => ({ name, value }));
    return items.length > 0 ? items : [
      { name: 'Services', value: 4200 },
      { name: 'Software', value: 2800 },
      { name: 'Office', value: 1900 },
      { name: 'Travel', value: 1100 }
    ];
  }, [verifiedTransactions]);

  // Format data for Spend Trend Area Chart
  const trendData = useMemo(() => {
    if (verifiedTransactions.length === 0) {
      return [
        { name: 'Mon', revenue: 1200, expenses: 800 },
        { name: 'Tue', revenue: 2100, expenses: 1500 },
        { name: 'Wed', revenue: 1800, expenses: 2200 },
        { name: 'Thu', revenue: 3400, expenses: 1900 },
        { name: 'Fri', revenue: 2900, expenses: 3100 },
        { name: 'Sat', revenue: 4100, expenses: 2800 },
        { name: 'Sun', revenue: 3800, expenses: 3600 },
      ];
    }

    // Group transactions by date
    const dateMap = new Map<string, { revenue: number, expenses: number }>();
    verifiedTransactions.forEach(t => {
      const existing = dateMap.get(t.issue_date) || { revenue: 0, expenses: 0 };
      if (t.entry_type === 'credit') existing.revenue += t.amount;
      if (t.entry_type === 'debit') existing.expenses += t.amount;
      dateMap.set(t.issue_date, existing);
    });

    return Array.from(dateMap.entries()).slice(0, 7).map(([date, data]) => ({
      name: date.split('-').slice(1).join('/'),
      revenue: data.revenue,
      expenses: data.expenses
    }));
  }, [verifiedTransactions]);

  const userName = userEmail.split('@')[0];

  return (
    <div className="space-y-6">
      
      {/* PERSONALIZED GREETING HEADER (Reference: 22.png) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-xs border border-gray-100">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            Welcome back, <span className="capitalize text-blue-600">{userName}</span>
            <span className="text-xl">👋</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Here is your financial ledger activity and AI bookkeeping summary.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-100 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> AI Engine Active
          </span>
          <span className="text-xs font-medium text-gray-400">
            {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>

      {/* OVERVIEW TAB CONTENT (BENTO GRID - Reference: 22.png) */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          
          {/* BENTO TOP ROW: 3 KEY METRIC CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Card 1: Total Spend (Ref 22.png Active Projects format) */}
            <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 relative overflow-hidden group hover:border-blue-200 transition-all">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Wallet className="w-5 h-5" />
                </div>
                <button className="w-8 h-8 rounded-full bg-gray-50 text-gray-400 hover:text-gray-700 flex items-center justify-center cursor-pointer">
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4">
                <span className="text-xs font-medium text-gray-500">Total Revenue (AR)</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-gray-900">
                    {totalRevenue.toLocaleString()} {primaryCurrency}
                  </span>
                  <span className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
                    <TrendingUp className="w-3 h-3" /> +12%
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-3 flex items-center gap-1">
                <span>Invoices & Credits</span>
                <span className="ml-auto font-medium text-gray-500">Monthly</span>
              </p>
            </div>

            {/* Card 2: Pending Verifications */}
            <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 relative overflow-hidden group hover:border-amber-200 transition-all">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <button className="w-8 h-8 rounded-full bg-gray-50 text-gray-400 hover:text-gray-700 flex items-center justify-center cursor-pointer">
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4">
                <span className="text-xs font-medium text-gray-500">Pending Verification</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-gray-900">
                    {pendingTransactions.length}
                  </span>
                  <span className="text-xs font-semibold text-amber-600 flex items-center gap-0.5">
                    <Clock className="w-3 h-3" /> Awaiting Review
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-3 flex items-center gap-1">
                <span>AI extracted drafts</span>
                <span className="ml-auto font-medium text-amber-600">Action Required</span>
              </p>
            </div>

            {/* Card 3: Verified Ledger Items */}
            <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 relative overflow-hidden group hover:border-emerald-200 transition-all">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <button className="w-8 h-8 rounded-full bg-gray-50 text-gray-400 hover:text-gray-700 flex items-center justify-center cursor-pointer">
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4">
                <span className="text-xs font-medium text-gray-500">Total Expenses (AP)</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-gray-900">
                    {totalExpenses.toLocaleString()} {primaryCurrency}
                  </span>
                  <span className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
                    <CheckCircle className="w-3 h-3" /> 100% Verified
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-3 flex items-center gap-1">
                <span>Bills & Debits</span>
                <span className="ml-auto font-medium text-emerald-600">Committed</span>
              </p>
            </div>

          </div>

          {/* BENTO MIDDLE ROW: CHARTS (Reference: 22.png Project Status & Productivity Trend) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Card 4: Category Distribution Donut Chart (Ref 22.png Project Status) */}
            <div className="bg-white p-6 rounded-2xl shadow-xs border border-gray-100 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                    <PieIcon className="w-4 h-4 text-blue-600" />
                    Ledger Breakdown by Account
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">Distribution of committed records</p>
                </div>
              </div>

              {/* Donut Chart Component */}
              <div className="h-52 w-full flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {categoryChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => [`${Number(value || 0).toLocaleString()} ${primaryCurrency}`, 'Amount']} />
                  </PieChart>
                </ResponsiveContainer>

                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-extrabold text-gray-900">{categoryChartData.length}</span>
                  <span className="text-[10px] text-gray-400 uppercase font-semibold">Accounts</span>
                </div>
              </div>

              {/* Legend Breakdown */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                {categoryChartData.map((item, idx) => (
                  <div key={item.name} className="flex items-center gap-2 text-xs">
                    <span 
                      className="w-2.5 h-2.5 rounded-full shrink-0" 
                      style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }} 
                    />
                    <span className="text-gray-600 truncate">{item.name}</span>
                    <span className="font-bold text-gray-900 ml-auto">{item.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 5: Productivity & Spend Trend Area Chart (Ref 22.png Productivity Trend) */}
            <div className="bg-white p-6 rounded-2xl shadow-xs border border-gray-100 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-purple-600" />
                    AR vs AP Timeline
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">Track daily and weekly expenditure curves</p>
                </div>

                {/* Timeline Toggle */}
                <div className="flex bg-gray-100 p-0.5 rounded-lg text-xs font-semibold">
                  <button
                    onClick={() => setTimeRange('Daily')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${timeRange === 'Daily' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500'}`}
                  >
                    Daily
                  </button>
                  <button
                    onClick={() => setTimeRange('Monthly')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${timeRange === 'Monthly' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500'}`}
                  >
                    Monthly
                  </button>
                </div>
              </div>

              {/* Area Chart Component */}
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EC4899" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#EC4899" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" stroke="#9CA3AF" fontSize={11} tickLine={false} />
                    <YAxis stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorSpend)" />
                    <Area type="monotone" dataKey="expenses" stroke="#EC4899" strokeWidth={2} strokeDasharray="3 3" fillOpacity={1} fill="url(#colorActive)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* BENTO BOTTOM ROW: PENDING TABLE & VERIFIED LEDGER */}
          <div className="space-y-6">
            <PendingTable 
              transactions={pendingTransactions} 
              chartOfAccounts={chartOfAccounts} 
              contacts={contacts}
              onDataChanged={onDataChanged} 
            />

            <VerifiedLedger 
              transactions={verifiedTransactions} 
            />
          </div>

        </div>
      )}

      {/* LEDGER TAB CONTENT */}
      {activeTab === 'ledger' && (
        <div className="space-y-6">
          <VerifiedLedger transactions={verifiedTransactions} />
          <PendingTable transactions={pendingTransactions} chartOfAccounts={chartOfAccounts} contacts={contacts} onDataChanged={onDataChanged} />
        </div>
      )}

      {/* ANALYTICS TAB CONTENT */}
      {activeTab === 'analytics' && (
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-gray-100 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Advanced Analytics & Financial Intelligence</h2>
            <p className="text-xs text-gray-500 mt-1">Deep breakdown of your accounting ledgers and AI categorizations.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <span className="text-xs font-bold text-gray-700">Account Allocations</span>
              <div className="mt-3 space-y-3">
                {categoryChartData.map((c, i) => (
                  <div key={c.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-gray-700">
                      <span>{c.name}</span>
                      <span>{c.value.toLocaleString()} {primaryCurrency}</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all" 
                        style={{ 
                          width: `${Math.min(100, (c.value / (totalExpenses || 1)) * 100)}%`,
                          backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length]
                        }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-gray-700">AI Bookkeeper Audit Summary</span>
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                  All transactions have been classified using Google Gemini forensic accounting rules. Pending transactions require human verification before inclusion in certified reporting.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200 flex justify-between items-center">
                <span className="text-xs text-gray-500">Need PDF export?</span>
                <button className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-1.5 cursor-pointer">
                  <Download className="w-4 h-4" /> Download Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
