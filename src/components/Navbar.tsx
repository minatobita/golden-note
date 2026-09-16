'use client';
import { usePathname, useRouter } from 'next/navigation';

const tabs = [
  { id: '/', icon: '🏠', label: 'ホーム' },
  { id: '/notes', icon: '📒', label: 'ノート' },
  { id: '/analysis', icon: '📊', label: '分析' },
  { id: '/settings', icon: '⚙️', label: '設定' },
  { id: '/guide', icon: '📖', label: '使い方' },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => router.push(t.id)}
          className={`flex-1 flex flex-col items-center py-2 text-xs font-semibold transition-colors ${pathname === t.id ? 'text-blue-600' : 'text-gray-400'}`}>
          <span className="text-lg">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
