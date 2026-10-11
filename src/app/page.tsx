'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthChange, signOut } from '@/lib/auth';
import { seedIfNeeded, getPhrases, addPhrase, deletePhrase, getBatches, createBatch, updateBatch, getCollecting, saveCollecting, clearCollecting, getSilverPool, getGoldenPool } from '@/lib/db';
import { STAGE_CONFIG, getNoteLevelEmoji } from '@/lib/types';
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
  const [silverCount, setSilverCount] = useState(0);
  const [goldenCount, setGoldenCount] = useState(0);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      if (!u) { router.push('/login'); return; }
      setUser(u);
      try {
        await seedIfNeeded(u.uid);
        const b = await getBatches(u.uid);
        setBatches(b);
        const collecting = await getCollecting(u.uid);
        setCollectList(collecting);
        localStorage.removeItem('golden-note-collect');
        // Pool counts
        const sp = await getSilverPool(u.uid);
        setSilverCount(sp.length);
        const gp = await getGoldenPool(u.uid);
        setGoldenCount(gp.length);
      } catch (err) { console.error(err); }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || loading) return;
    if (collectList.length > 0) {
      saveCollecting(user.uid, collectList).catch(console.error);
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
    const pairCount = collectList.filter(p => p.japanese && p.english).length;
    const remaining = 25 - pairCount;
    if (remaining <= 0) { showToast('既にペアが25個以上あります'); return; }
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

  const handleGoToWorkshop = () => {
    if (collectList.length === 0) { showToast('📝 フレーズを追加してください。'); return; }
    localStorage.setItem('golden-note-collect', JSON.stringify(collectList));
    router.push('/workshop');
  };

  const handleCreateBatch = async () => {
    if (!user) return;
    // Find first 25 phrases that have both japanese and english
    const pairs: { idx: number; phrase: CollectPhrase }[] = [];
    collectList.forEach((p, i) => {
      if (p.japanese && p.english && pairs.length < 25) {
        pairs.push({ idx: i, phrase: p });
      }
    });
    if (pairs.length < 25) { showToast('日英ペアが25個必要です'); return; }

    const batchPhrases = pairs.map(p => ({ japanese: p.phrase.japanese, english: p.phrase.english, situation: p.phrase.situation || '' }));
    const usedIndices = new Set(pairs.map(p => p.idx));
    const remaining = collectList.filter((_, i) => !usedIndices.has(i));

    try {
      const batchId = await createBatch(user.uid, batchPhrases);
      for (const p of batchPhrases) {
        await addPhrase(user.uid, { japanese: p.japanese, english: p.english, situation: p.situation });
      }
      setCollectList(remaining);
      const b = await getBatches(user.uid);
      setBatches(b);
      router.push(`/study/${batchId}`);
    } catch (err: any) { showToast('バッチ作成エラー: ' + (err.message || '')); }
  };

  // Review items - use local date
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const reviewBatches = batches.filter((b: any) => b.status === 'reviewing' && b.nextReviewDate && b.nextReviewDate <= today);
  reviewBatches.sort((a: any, b: any) => {
    if (a.nextReviewDate !== b.nextReviewDate) return a.nextReviewDate < b.nextReviewDate ? -1 : 1;
    return (a.intervalDays || 0) - (b.intervalDays || 0);
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  const count = collectList.length;
  const pairCount = collectList.filter(p => p.japanese && p.english).length;
  const canStartLearning = pairCount >= 25;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-xl text-sm font-semibold z-50 max-w-xs text-center">{toast}</div>}

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
        ) : reviewBatches.map((b: any) => {
          const cfg = STAGE_CONFIG[b.stage] || { from: 25, to: 18 };
          const emoji = getNoteLevelEmoji(b.noteLevel || 'bronze');
          const isOverdue = b.nextReviewDate < today;
          const daysOverdue = Math.floor((new Date(today).getTime() - new Date(b.nextReviewDate).getTime()) / 86400000);
          return (
            <div key={b.id} onClick={() => router.push(`/quiz/${b.id}`)}
              className={`p-4 rounded-xl border-2 mb-2 cursor-pointer transition-transform active:scale-98 ${isOverdue ? 'border-red-400 bg-gradient-to-r from-red-50 to-red-100' : 'border-blue-400 bg-gradient-to-r from-blue-50 to-blue-100'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold">{emoji} {cfg.from}→{cfg.to}</span>
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

      {/* Pool Status */}
      {(silverCount > 0 || goldenCount > 0) && (
        <div className="flex gap-2 mb-4">
          {silverCount > 0 && (
            <div className="flex-1 bg-gray-100 rounded-lg p-3 text-center">
              <span className="text-sm">🥈 シルバープール: {silverCount}/25</span>
            </div>
          )}
          {goldenCount > 0 && (
            <div className="flex-1 bg-yellow-50 rounded-lg p-3 text-center">
              <span className="text-sm">🥇 ゴールデンプール: {goldenCount}/25</span>
            </div>
          )}
        </div>
      )}

      {/* Phrase Collection */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-bold">✏️ フレーズ収集</h2>
          <span className={`text-lg font-bold ${pairCount >= 25 ? 'text-green-600' : 'text-blue-600'}`}>{count}個 ({pairCount}ペア)</span>
        </div>
        {pairCount < 25 && (
          <>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (pairCount / 25) * 100)}%` }} />
            </div>
            <p className="text-sm text-gray-500 mb-4">あと {25 - pairCount} ペア必要</p>
          </>
        )}
        {pairCount >= 25 && (
          <p className="text-sm text-green-600 font-semibold mb-4">✅ 25ペア以上あります！学習開始できます</p>
        )}

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

        <div className="flex gap-2 flex-wrap mb-4">
          {pairCount < 25 && (
            <button onClick={handleAIFill} disabled={aiLoading}
              className="flex-1 bg-gradient-to-r from-yellow-400 to-orange-400 text-white px-4 py-3 rounded-lg font-bold text-sm disabled:opacity-50">
              {aiLoading ? '生成中...' : '✨ AIで25個にする'}
            </button>
          )}
          {count >= 1 && (
            <button onClick={handleGoToWorkshop}
              className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-4 py-3 rounded-lg font-bold text-sm">
              🤖 AI翻訳ワークショップへ
            </button>
          )}
        </div>

        {canStartLearning && (
          <button onClick={handleCreateBatch}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-3 rounded-lg font-bold text-sm mb-4">
            📖 25ペアで学習開始（残りはここに残ります）
          </button>
        )}

        {collectList.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-500 mb-2">収集済みフレーズ</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-2 px-1 text-xs text-gray-500 w-8">#</th>
                  <th className="text-left py-2 px-1 text-xs text-gray-500">日本語</th>
                  <th className="text-left py-2 px-1 text-xs text-gray-500">English</th>
                  <th className="w-6"></th>
                </tr>
              </thead>
              <tbody>
                {collectList.map((p, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${p.isAI ? 'bg-purple-50' : ''}`}>
                    <td className="py-2 px-1 text-xs text-gray-400 font-bold">{i + 1}</td>
                    <td className="py-2 px-1">
                      <span className="font-semibold text-sm">{p.japanese || <span className="text-gray-400 italic">—</span>}</span>
                      {p.situation && <p className="text-xs text-gray-400">📍 {p.situation}</p>}
                    </td>
                    <td className={`py-2 px-1 text-sm ${p.english ? 'text-blue-700' : 'text-orange-400 italic'}`}>
                      {p.english || '未翻訳'}
                    </td>
                    <td className="py-2 px-1">
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
