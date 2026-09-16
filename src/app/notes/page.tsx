'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getBatches } from '@/lib/db';
import { STAGE_CONFIG } from '@/lib/types';
import Navbar from '@/components/Navbar';

export default function NotesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [batches, setBatches] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => { setBatches(await getBatches(user.uid)); })();
  }, [user]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) { router.push('/login'); return null; }

  const today = new Date().toISOString().split('T')[0];

  const getStatusBadge = (b: any) => {
    if (b.status === 'translating') return { text: '翻訳中', color: 'bg-yellow-100 text-yellow-700' };
    if (b.status === 'studying') return { text: '学習中', color: 'bg-blue-100 text-blue-700' };
    if (b.status === 'completed') return { text: '完了', color: 'bg-green-100 text-green-700' };
    if (!b.nextReviewDate) return { text: '待機中', color: 'bg-gray-100 text-gray-700' };
    if (b.nextReviewDate < today) { const days = Math.floor((new Date(today).getTime() - new Date(b.nextReviewDate).getTime()) / 86400000); return { text: `${days}日超過`, color: 'bg-red-100 text-red-700' }; }
    if (b.nextReviewDate === today) return { text: '今日', color: 'bg-blue-100 text-blue-700' };
    const days = Math.floor((new Date(b.nextReviewDate).getTime() - new Date(today).getTime()) / 86400000);
    return { text: `${days}日後`, color: 'bg-gray-100 text-gray-500' };
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
      <h1 className="text-2xl font-bold mb-4">📒 ノート管理</h1>
      {batches.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-5xl mb-3">📝</p>
          <p>まだバッチがありません。ホームでフレーズを収集してください。</p>
        </div>
      ) : batches.map(b => {
        const config = STAGE_CONFIG[b.stage] || { from: 25, to: 18 };
        const badge = getStatusBadge(b);
        const isExpanded = expanded === b.id;
        return (
          <div key={b.id} className="bg-white rounded-xl border border-gray-200 mb-3 overflow-hidden">
            <div className="p-4 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : b.id)}>
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold">🥉 {config.from}→{config.to}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.color}`}>{badge.text}</span>
              </div>
              <p className="text-sm text-gray-600">{b.totalPhrases}フレーズ • {b.noteLevel}</p>
              {b.nextReviewDate && <p className="text-xs text-gray-400">次回復習: {b.nextReviewDate}</p>}
              {b.lastReviewDate && <p className="text-xs text-gray-400">前回: {b.lastReviewDate}</p>}
              {/* Action buttons */}
              <div className="flex gap-2 mt-2">
                {b.status === 'translating' && (
                  <button onClick={(e) => { e.stopPropagation(); router.push(`/workshop?batchId=${b.id}`); }}
                    className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-bold">🤖 翻訳を再開</button>
                )}
                {b.status === 'studying' && (
                  <button onClick={(e) => { e.stopPropagation(); router.push(`/study/${b.id}`); }}
                    className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold">📖 学習を再開</button>
                )}
                {b.status === 'reviewing' && b.nextReviewDate && b.nextReviewDate <= today && (
                  <button onClick={(e) => { e.stopPropagation(); router.push(`/quiz/${b.id}`); }}
                    className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-bold">🧠 復習テスト</button>
                )}
                {b.status === 'reviewing' && b.nextReviewDate && b.nextReviewDate > today && (
                  <button onClick={(e) => { e.stopPropagation(); router.push(`/quiz/${b.id}`); }}
                    className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-bold">🧠 前倒し復習</button>
                )}
              </div>
            </div>
            {isExpanded && b.phrases && (
              <div className="border-t border-gray-100 p-4 bg-gray-50">
                {b.phrases.map((p: any, i: number) => (
                  <div key={i} className="py-2 border-b border-gray-100 last:border-0">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 font-bold min-w-[20px]">{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{p.japanese}</p>
                        <p className="text-sm text-blue-700">{p.english || '未翻訳'}</p>
                        {p.situation && <p className="text-xs text-gray-400">📍 {p.situation}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <Navbar />
    </div>
  );
}
