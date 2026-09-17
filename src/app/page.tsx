'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthChange, signOut } from '@/lib/auth';
import { seedIfNeeded, getPhrases, addPhrase, deletePhrase, getBatches, createBatch, updateBatch, getCollecting, saveCollecting, clearCollecting } from '@/lib/db';
import { STAGE_CONFIG } from '@/lib/types';
import Navbar from '@/components/Navbar';

interface CollectPhrase {
  id?: string;
  japanese: string;
  english: string;
  situation: string;
  isAI?: boolean;
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<any[]>([]);
  const [collectList, setCollectList] = useState<CollectPhrase[]>([]);
  const [jp, setJp] = useState('');
  const [en, setEn] = useState('');
  const [sit, setSit] = useState('');
  const [toast, setToast] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [translateLoading, setTranslateLoading] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // Load from Firestore on auth
  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      if (!u) { router.push('/login'); return; }
      setUser(u);
      try {
        await seedIfNeeded(u.uid);
        const b = await getBatches(u.uid);
        setBatches(b);
        // Load collecting phrases from Firestore
        const collecting = await getCollecting(u.uid);
        if (collecting.length > 0) {
          setCollectList(collecting);
        } else {
          // Migrate from localStorage if exists
          const saved = localStorage.getItem('golden-note-collect');
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setCollectList(parsed);
                await saveCollecting(u.uid, parsed);
                localStorage.removeItem('golden-note-collect');
              }
            } catch {}
          }
        }
      } catch (err) { console.error(err); }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Save to Firestore whenever collectList changes (after initial load)
  useEffect(() => {
    if (!user || loading) return;
    if (collectList.length > 0) {
      saveCollecting(user.uid, collectList).catch(console.error);
      // Also keep localStorage as backup for workshop
      localStorage.setItem('golden-note-collect', JSON.stringify(collectList));
    } else {
      clearCollecting(user.uid).catch(console.error);
      localStorage.removeItem('golden-note-collect');
    }
  }, [collectList, user, loading]);

  const handleAdd = () => {
    if (!jp && !en) { showToast('日本語または英語を入力してください'); return; }
    setCollectList([...collectList, { japanese: jp, english: en, situation: sit }]);
    setJp(''); setEn(''); setSit('');
  };

  const handleDelete = (idx: number) => {
    setCollectList(collectList.filter((_, i) => i !== idx));
  };

  const handleAIFill = async () => {
    if (!user) return;
    const remaining = 25 - collectList.length;
    if (remaining <= 0) { showToast('既に25個あります'); return; }
    setAiLoading(true);
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: remaining, existingPhrases: collectList }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error); setAiLoading(false); return; }
      const newPhrases = (data.phrases || []).slice(0, remaining).map((p: any) => ({
        japanese: p.japanese || '', english: p.english || '', situation: '', isAI: true,
      }));
      setCollectList([...collectList, ...newPhrases]);
      showToast(`✨ ${newPhrases.length}個を追加しました`);
    } catch (err: any) { showToast('AI補完エラー: ' + (err.message || '')); }
    setAiLoading(false);
  };

  const handleBulkTranslate = async () => {
    if (collectList.length === 0) { showToast('📝 リストにフレーズがありません。先にフレーズを追加してください。'); return; }
    const untranslated = collectList.filter(p => (p.japanese && !p.english) || (!p.japanese && p.english));
    if (untranslated.length === 0) { showToast('翻訳が必要なフレーズがありません'); return; }
    setTranslateLoading(true);
    const updated = [...collectList];
    for (let i = 0; i < updated.length; i++) {
      const p = updated[i];
      if (p.japanese && !p.english) {
        try {
          const res = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ japanese: p.japanese, situation: p.situation }) });
          const data = await res.json();
          if (data.english) updated[i] = { ...p, english: data.english };
        } catch {}
      } else if (!p.japanese && p.english) {
        try {
          const res = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ english: p.english }) });
          const data = await res.json();
          if (data.japanese) updated[i] = { ...p, japanese: data.japanese };
        } catch {}
      }
    }
    setCollectList(updated);
    setTranslateLoading(false);
    showToast('翻訳完了！');
  };

  // Workshop: does NOT create a batch. Saves to localStorage and navigates.
  const handleGoToWorkshop = () => {
    if (collectList.length === 0) { showToast('📝 リストにフレーズがありません。先にフレーズを追加してください。'); return; }
    // Save current list to localStorage for workshop to read
    localStorage.setItem('golden-note-collect', JSON.stringify(collectList));
    router.push('/workshop');
  };

  // Create batch: only when 25 phrases, all translated
  const handleCreateBatch = async () => {
    if (!user || collectList.length < 25) { showToast('25個のフレーズが必要です'); return; }
    const allTranslated = collectList.every(p => p.japanese && p.english);
    if (!allTranslated) { showToast('全てのフレーズに日英の翻訳が必要です'); return; }
    const phrases = collectList.map(p => ({ japanese: p.japanese, english: p.english, situation: p.situation }));
    try {
      const batchId = await createBatch(user.uid, phrases);
      for (const p of phrases) {
        await addPhrase(user.uid, { japanese: p.japanese, english: p.english, situation: p.situation });
      }
      setCollectList([]);
      localStorage.removeItem('golden-note-collect');
      const b = await getBatches(user.uid);
      setBatches(b);
      router.push(`/study/${batchId}`);
    } catch (err: any) { showToast('バッチ作成エラー: ' + (err.message || '')); }
  };

  // Review items
  const today = new Date().toISOString().split('T')[0];
  const reviewBatches = batches.filter(b => b.status === 'reviewing' && b.nextReviewDate && b.nextReviewDate <= today);
  reviewBatches.sort((a, b) => {
    if (a.nextReviewDate !== b.nextReviewDate) return a.nextReviewDate < b.nextReviewDate ? -1 : 1;
    return (a.intervalDays || 0) - (b.intervalDays || 0);
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  const count = collectList.length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
      {/* Toast */}
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-xl text-sm font-semibold z-50 max-w-xs text-center">{toast}</div>}

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold">🏠 Golden Note</h1>
          <p className="text-sm text-gray-500">{user?.email}</p>
        </div>
        <button onClick={() => { signOut(); router.push('/login'); }} className="text-sm text-gray-400 hover:text-gray-600">ログアウト</button>
      </div>

      {/* Today's Review */}
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-3">📌 今日の復習</h2>
        {reviewBatches.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400">今日の復習はありません ✨</div>
        ) : reviewBatches.map(b => {
          const config = STAGE_CONFIG[b.stage] || { from: 25, to: 18 };
          const isOverdue = b.nextReviewDate < today;
          const daysOverdue = Math.floor((new Date(today).getTime() - new Date(b.nextReviewDate).getTime()) / 86400000);
          return (
            <div key={b.id} onClick={() => router.push(`/quiz/${b.id}`)}
              className={`p-4 rounded-xl border-2 mb-2 cursor-pointer transition-transform active:scale-98 ${isOverdue ? 'border-red-400 bg-gradient-to-r from-red-50 to-red-100' : 'border-blue-400 bg-gradient-to-r from-blue-50 to-blue-100'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold">🥉 {config.from}→{config.to}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isOverdue ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>
                  {isOverdue ? `${daysOverdue}日超過` : '今日'}
                </span>
              </div>
              <p className="text-sm text-gray-600">{b.totalPhrases}フレーズ • {b.noteLevel}</p>
              {b.lastReviewDate && <p className="text-xs text-gray-400">前回: {b.lastReviewDate}</p>}
            </div>
          );
        })}
      </div>

      {/* Phrase Collection */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-bold">✏️ フレーズ収集</h2>
          <span className={`text-lg font-bold ${count >= 25 ? 'text-green-600' : 'text-blue-600'}`}>{count} / 25</span>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
          <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (count / 25) * 100)}%` }} />
        </div>
        <p className="text-sm text-gray-500 mb-4">あと <span className="font-bold text-blue-600">{Math.max(0, 25 - count)}</span> フレーズ必要</p>

        {/* Input */}
        <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
          <div>
            <label className="text-sm font-bold text-gray-700">日本語</label>
            <input type="text" value={jp} onChange={e => setJp(e.target.value)} placeholder="言えなかったフレーズ..."
              className="w-full p-3 border border-gray-300 rounded-lg text-base mt-1" style={{ fontSize: '16px' }} />
          </div>
          <div>
            <label className="text-sm font-bold text-gray-700">English</label>
            <input type="text" value={en} onChange={e => setEn(e.target.value)} placeholder="English expression..."
              className="w-full p-3 border border-gray-300 rounded-lg text-base mt-1" style={{ fontSize: '16px' }} />
          </div>
          <div>
            <label className="text-sm font-bold text-gray-700">📍 状況（任意）</label>
            <input type="text" value={sit} onChange={e => setSit(e.target.value)} placeholder="授業中、友人との会話で..."
              className="w-full p-3 border border-gray-300 rounded-lg text-base mt-1" style={{ fontSize: '16px' }} />
          </div>
          <button onClick={handleAdd} className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold text-base">＋ 追加</button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap mb-4">
          <button onClick={handleAIFill} disabled={aiLoading || count >= 25}
            className="flex-1 bg-gradient-to-r from-yellow-400 to-orange-400 text-white px-4 py-3 rounded-lg font-bold text-sm disabled:opacity-50">
            {aiLoading ? '生成中...' : '✨ AIで25個にする'}
          </button>
          <button onClick={handleBulkTranslate} disabled={translateLoading || count === 0}
            className="flex-1 bg-gradient-to-r from-green-500 to-teal-500 text-white px-4 py-3 rounded-lg font-bold text-sm disabled:opacity-50">
            {translateLoading ? '翻訳中...' : '🤖 空欄を一括AI翻訳'}
          </button>
        </div>

        {/* Workshop button - available with 1+ phrases */}
        {count >= 1 && (
          <div className="flex gap-2 mb-4">
            <button onClick={handleGoToWorkshop}
              className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-4 py-3 rounded-lg font-bold text-sm">
              🤖 AI翻訳ワークショップへ
            </button>
          </div>
        )}

        {/* Create batch button - only at 25 with all translated */}
        {count >= 25 && collectList.every(p => p.japanese && p.english) && (
          <div className="mb-4">
            <button onClick={handleCreateBatch}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-3 rounded-lg font-bold text-sm">
              📖 バッチ作成して学習開始！
            </button>
          </div>
        )}

        {/* Collected phrases table */}
        {collectList.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-500 mb-2">収集済みフレーズ</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-2 px-1 text-xs text-gray-400 w-8">#</th>
                  <th className="text-left py-2 px-1 text-xs text-gray-400">日本語</th>
                  <th className="text-left py-2 px-1 text-xs text-gray-400">English</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {collectList.map((p, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${p.isAI ? 'bg-purple-50' : ''}`}>
                    <td className="py-2 px-1 text-xs text-gray-400 align-top">{i + 1}</td>
                    <td className="py-2 px-1 align-top">
                      <div className="font-semibold text-sm">{p.japanese || <span className="text-gray-400 italic">（なし）</span>}</div>
                      {p.situation && <div className="text-xs text-gray-400">📍 {p.situation}</div>}
                      {p.isAI && <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">✨ AI</span>}
                    </td>
                    <td className={`py-2 px-1 align-top text-sm ${p.english ? 'text-blue-700' : 'text-orange-400 italic'}`}>
                      {p.english || '未翻訳'}
                    </td>
                    <td className="py-2 px-1 align-top">
                      <button onClick={() => handleDelete(i)} className="text-gray-400 hover:text-red-500 text-lg">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Navbar />
    </div>
  );
}
