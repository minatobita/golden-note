'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthChange } from '@/lib/auth';
import { getUserPreferences, saveUserPreferences, getMemorized, getSilverPool, getGoldenPool } from '@/lib/db';
import Navbar from '@/components/Navbar';

export default function AnalysisPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [memorizedList, setMemorizedList] = useState<any[]>([]);
  const [silverPool, setSilverPool] = useState<any[]>([]);
  const [goldenPool, setGoldenPool] = useState<any[]>([]);
  const [showMemorized, setShowMemorized] = useState(false);

  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      if (!u) { router.push('/login'); return; }
      setUser(u);
      try {
        const prefs = await getUserPreferences(u.uid);
        setNotes(prefs);
        const mem = await getMemorized(u.uid);
        setMemorizedList(mem);
        const sp = await getSilverPool(u.uid);
        setSilverPool(sp);
        const gp = await getGoldenPool(u.uid);
        setGoldenPool(gp);
      } catch (e) { console.error(e); }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSave = async () => {
    if (!user) return;
    await saveUserPreferences(user.uid, notes);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const totalMemorized = memorizedList.reduce((sum, m) => sum + (m.phrases?.length || 0), 0);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
      <h1 className="text-2xl font-bold mb-6">📊 分析 & 設定</h1>

      {/* Translation Preferences */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <h2 className="text-lg font-bold mb-2">✍️ 翻訳スタイルの要望</h2>
        <p className="text-sm text-gray-500 mb-3">
          ここに書いた内容がAI翻訳に反映されます。好みの表現、避けたいパターン、注意点などを自由に書いてください。
        </p>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={`例:\n- I主語を使いたい\n- カジュアルな表現が好き\n- 句動詞を積極的に使ってほしい\n- カタカナ語は避けて和語で訳してほしい\n- MBA授業のフォーマルな場面が多い`}
          className="w-full p-3 border border-gray-300 rounded-lg text-sm min-h-[200px] resize-y"
          style={{ fontSize: '16px' }}
        />
        <div className="flex justify-between items-center mt-3">
          <p className="text-xs text-gray-400">保存するとAI翻訳・チャットに自動反映されます</p>
          <button onClick={handleSave}
            className={`px-6 py-2 rounded-lg font-bold text-sm ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'}`}>
            {saved ? '✅ 保存しました' : '💾 保存'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <h2 className="text-lg font-bold mb-3">📈 学習状況</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{totalMemorized}</p>
            <p className="text-xs text-amber-700">🔒 長期記憶</p>
          </div>
          <div className="bg-gray-100 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-600">{silverPool.length}</p>
            <p className="text-xs text-gray-700">🥈 シルバー待ち</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-yellow-600">{goldenPool.length}</p>
            <p className="text-xs text-yellow-700">🥇 ゴールデン待ち</p>
          </div>
        </div>
      </div>

      {/* Memorized Phrases */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <button onClick={() => setShowMemorized(!showMemorized)} className="w-full flex justify-between items-center">
          <h2 className="text-lg font-bold">🔒 長期記憶フレーズ一覧</h2>
          <span className="text-gray-400">{showMemorized ? '▲ 閉じる' : '▼ 表示'}</span>
        </button>
        {showMemorized && (
          <div className="mt-3 space-y-3">
            {memorizedList.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">まだありません</p>
            ) : memorizedList.map((m, mi) => (
              <div key={mi} className="border border-gray-100 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-2">📅 {m.memorizedAt} • {m.noteLevel} • {m.stage}</p>
                {(m.phrases || []).map((p: any, pi: number) => (
                  <div key={pi} className="flex gap-2 py-1 border-b border-gray-50 last:border-0">
                    <span className="text-sm font-semibold flex-1">{p.japanese}</span>
                    <span className="text-sm text-blue-700 flex-1">{p.english}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Silver Pool */}
      {silverPool.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <h2 className="text-lg font-bold mb-3">🥈 シルバープール ({silverPool.length}/25)</h2>
          <div className="space-y-1">
            {silverPool.map((p, i) => (
              <div key={i} className="flex gap-2 py-1 border-b border-gray-50">
                <span className="text-xs text-gray-400 w-5">{i+1}</span>
                <span className="text-sm font-semibold flex-1">{p.japanese}</span>
                <span className="text-sm text-blue-700 flex-1">{p.english}</span>
              </div>
            ))}
          </div>
          {silverPool.length >= 25 && (
            <p className="text-sm text-green-600 font-bold mt-2">✅ 25個到達！次の復習完了時にシルバーバッチが自動作成されます</p>
          )}
        </div>
      )}

      {/* Golden Pool */}
      {goldenPool.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <h2 className="text-lg font-bold mb-3">🥇 ゴールデンプール ({goldenPool.length}/25)</h2>
          <div className="space-y-1">
            {goldenPool.map((p, i) => (
              <div key={i} className="flex gap-2 py-1 border-b border-gray-50">
                <span className="text-xs text-gray-400 w-5">{i+1}</span>
                <span className="text-sm font-semibold flex-1">{p.japanese}</span>
                <span className="text-sm text-blue-700 flex-1">{p.english}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Navbar />
    </div>
  );
}
