'use client';

import { supabase } from '@/lib/supabase';
import { LogOut, Receipt } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function DashboardHeader() {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center space-x-2 text-blue-600 font-bold text-xl">
        <Receipt />
        <span>AI Bookkeeper</span>
      </div>
      <button onClick={handleLogout} className="text-gray-500 hover:text-gray-800 flex items-center text-sm font-medium">
        <LogOut className="w-4 h-4 mr-1" /> Sign Out
      </button>
    </div>
  );
}