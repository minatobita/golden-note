'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthChange } from '@/lib/auth';
import { getBatches, updateBatch } from '@/lib/db';
import { STAGE_CONFIG } from '@/lib/types';
import Navbar from '@/components/Navbar';

export default function NotesPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [editingPhrase, setEditingPhrase] = useState<{ batchId: string; idx: number } | null>(null);
  const [editJp, setEditJp] = useState('');
  const [editEn, setEditEn] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      if (!u) { router.push('/login'); return; }
      setUser(u);
      try {
        const b = await getBatches(u.uid);
        setBatches(b);
      } catch (err) { console.error(err); }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const today = new Date().toISOString().split('T')[0];

  const getStatusInfo = (batch: any) => {
    if (batch.status === 'translating') {
      return { label: '学習中', color: 'bg-yellow-100 text-yellow-700', action: '📖 学習を再開', route: `/study/${batch.id}` };
    }
    if (batch.status === 'reviewing') {
      if (batch.nextReviewDate && batch.nextReviewDate <= today) {
        const isOverdue = batch.nextReviewDate < today;
        return {
          label: isOverdue ? '期限超過' : '復習日',
          color: isOverdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700',
          action: '🧠 復習テストを開始',
          route: `/quiz/${batch.id}`
        };
      }
      return { label: '復習待ち', color: 'bg-gray-100 text-gray-600', action: '🧠 復習テストを開始（前倒し）', route: `/quiz/${batch.id}` };
    }
    if (batch.status === 'completed') {
      return { label: '完了', color: 'bg-green-100 text-green-700', action: null, route: null };
    }
    return { label: batch.status, color: 'bg-gray-100 text-gray-600', action: null, route: null };
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
    } catch {
      return dateStr;
    }
  };

  const getCreatedDate = (batch: any) => {
    if (batch.createdAt) {
      if (batch.createdAt.seconds) {
        const d = new Date(batch.createdAt.seconds * 1000);
        return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
      }
      if (typeof batch.createdAt === 'string') {
        return formatDate(batch.createdAt);
      }
    }
    return null;
  };

  const startEdit = (batchId: string, idx: number, jp: string, en: string) => {
    setEditingPhrase({ batchId, idx });
    setEditJp(jp);
    setEditEn(en);
  };

  const cancelEdit = () => {
    setEditingPhrase(null);
    setEditJp('');
    setEditEn('');
  };

  const saveEdit = async () => {
    if (!editingPhrase) return;
    setSaving(true);
    try {
      const batch = batches.find(b => b.id === editingPhrase.batchId);
      if (!batch || !batch.phrases) return;
      const updatedPhrases = [...batch.phrases];
      updatedPhrases[editingPhrase.idx] = {
        ...updatedPhrases[editingPhrase.idx],
        japanese: editJp,
        english: editEn,
      };
      await updateBatch(editingPhrase.batchId, { phrases: updatedPhrases });
      // Update local state
      setBatches(prev => prev.map(b =>
        b.id === editingPhrase.batchId ? { ...b, phrases: updatedPhrases } : b
      ));
      cancelEdit();
    } catch (err) {
      console.error(err);
      alert('保存に失敗しました');
    }
    setSaving(false);
  };

  const speak = (text: string) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.9;
    speechSynthesis.speak(u);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
      <h1 className="text-xl font-bold mb-4">📒 ノート管理</h1>

      {batches.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">📄</p>
          <p>まだバッチがありません。ホームでフレーズを収集してください。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((batch) => {
            const statusInfo = getStatusInfo(batch);
            const config = STAGE_CONFIG[batch.stage] || { from: 25, to: 18 };
            const isExpanded = expandedBatch === batch.id;
            const createdDate = getCreatedDate(batch);

            return (
              <div key={batch.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Batch header */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedBatch(isExpanded ? null : batch.id)}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold">🥉 {config.from}→{config.to}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{batch.totalPhrases || batch.phrases?.length || 0}フレーズ • {batch.noteLevel || 'bronze'}</p>

                  {/* Dates */}
                  <div className="mt-2 space-y-0.5">
                    {createdDate && (
                      <p className="text-xs text-gray-400">📅 学習開始日: {createdDate}</p>
                    )}
                    {batch.lastReviewDate && (
                      <p className="text-xs text-gray-400">📝 前回復習: {formatDate(batch.lastReviewDate)}</p>
                    )}
                    {batch.nextReviewDate && (
                      <p className={`text-xs font-semibold ${
                        batch.nextReviewDate < today ? 'text-red-500' :
                        batch.nextReviewDate === today ? 'text-blue-500' :
                        'text-gray-400'
                      }`}>
                        📌 次回復習: {formatDate(batch.nextReviewDate)}
                        {batch.nextReviewDate < today && ' ⚠️ 超過'}
                        {batch.nextReviewDate === today && ' 👈 今日'}
                      </p>
                    )}
                  </div>

                  {/* Action button */}
                  {statusInfo.action && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (statusInfo.route) router.push(statusInfo.route);
                      }}
                      className="mt-2 text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      {statusInfo.action}
                    </button>
                  )}

                  {/* Expand indicator */}
                  <p className="text-xs text-gray-300 mt-2">{isExpanded ? '▲ 閉じる' : '▼ フレーズ一覧を表示'}</p>
                </div>

                {/* Expanded phrase list */}
                {isExpanded && batch.phrases && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                    <div className="space-y-2">
                      {batch.phrases.map((p: any, i: number) => (
                        <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-b-0">
                          <span className="text-xs font-bold text-gray-400 bg-gray-200 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                            {i + 1}
                          </span>

                          {editingPhrase?.batchId === batch.id && editingPhrase?.idx === i ? (
                            /* Edit mode */
                            <div className="flex-1 space-y-2">
                              <div>
                                <label className="text-xs font-bold text-gray-500">日本語</label>
                                <input
                                  type="text"
                                  value={editJp}
                                  onChange={e => setEditJp(e.target.value)}
                                  className="w-full p-2 border border-blue-300 rounded text-sm"
                                  style={{ fontSize: '16px' }}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-bold text-gray-500">English</label>
                                <input
                                  type="text"
                                  value={editEn}
                                  onChange={e => setEditEn(e.target.value)}
                                  className="w-full p-2 border border-blue-300 rounded text-sm"
                                  style={{ fontSize: '16px' }}
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={saveEdit}
                                  disabled={saving}
                                  className="bg-green-600 text-white px-3 py-1 rounded text-xs font-bold"
                                >
                                  {saving ? '保存中...' : '💾 保存'}
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="bg-gray-300 text-gray-700 px-3 py-1 rounded text-xs font-bold"
                                >
                                  キャンセル
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Display mode */
                            <>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm">{p.japanese || '（日本語なし）'}</p>
                                <p className="text-sm text-blue-700">{p.english || '（英語なし）'}</p>
                                {p.situation && <p className="text-xs text-gray-400">📍 {p.situation}</p>}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEdit(batch.id, i, p.japanese || '', p.english || '');
                                  }}
                                  className="text-gray-400 hover:text-blue-500 text-sm"
                                >
                                  ✏️
                                </button>
                                {p.english && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); speak(p.english); }}
                                    className="text-lg"
                                  >
                                    🔊
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Navbar />
    </div>
  );
}
