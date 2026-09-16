'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getBatch, updateBatch, getSettings } from '@/lib/db';

export default function StudyPage() {
  const router = useRouter();
  const { batchId } = useParams();
  const [batch, setBatch] = useState<any>(null);
  const [phase, setPhase] = useState<'learn' | 'test' | 'done'>('learn');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [testPhrases, setTestPhrases] = useState<any[]>([]);
  const [results, setResults] = useState<boolean[]>([]);
  const [wrongOnes, setWrongOnes] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const b = await getBatch(batchId as string);
      if (b) { setBatch(b); setTestPhrases(b.phrases || []); }
    })();
  }, [batchId]);

  const handleNext = () => {
    if (!batch) return;
    if (currentIdx < batch.phrases.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setShowAnswer(false);
    } else {
      // Move to test phase
      setPhase('test');
      setCurrentIdx(0);
      setShowAnswer(false);
      setResults([]);
      const shuffled = [...batch.phrases].sort(() => Math.random() - 0.5);
      setTestPhrases(shuffled);
    }
  };

  const handleAnswer = (correct: boolean) => {
    const newResults = [...results, correct];
    setResults(newResults);
    if (currentIdx < testPhrases.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setShowAnswer(false);
    } else {
      // Check wrong ones
      const wrong = testPhrases.filter((_, i) => !newResults[i]);
      if (wrong.length === 0) {
        setPhase('done');
      } else {
        setWrongOnes(wrong);
        // Restart test with only wrong ones
        setTestPhrases(wrong.sort(() => Math.random() - 0.5));
        setCurrentIdx(0);
        setResults([]);
        setShowAnswer(false);
      }
    }
  };

  const handleComplete = async () => {
    if (!batch) return;
    const settings = await getSettings(batch.userId);
    const intervalDays = settings.intervals?.['bronze_25_18'] || 1;
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + intervalDays);
    await updateBatch(batchId as string, {
      status: 'reviewing',
      nextReviewDate: nextDate.toISOString().split('T')[0],
      lastReviewDate: new Date().toISOString().split('T')[0],
      intervalDays,
    });
    router.push('/');
  };

  const speak = (text: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
  };

  if (!batch) return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>;

  if (phase === 'learn') {
    const p = batch.phrases[currentIdx];
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => router.push('/')} className="text-blue-600 font-semibold text-sm">← 戻る</button>
          <span className="text-sm font-bold text-gray-500">学習 {currentIdx + 1}/{batch.phrases.length}</span>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
          <p className="text-2xl font-bold mb-4">{p.japanese}</p>
          <p className="text-xl text-blue-700 mb-4">{p.english}</p>
          <button onClick={() => speak(p.english)} className="text-3xl mb-4">🔊</button>
          {p.situation && <p className="text-sm text-gray-400">📍 {p.situation}</p>}
        </div>
        <button onClick={handleNext} className="w-full mt-6 bg-blue-600 text-white p-4 rounded-xl font-bold text-lg">
          {currentIdx < batch.phrases.length - 1 ? '次へ →' : 'テスト開始 →'}
        </button>
      </div>
    );
  }

  if (phase === 'test') {
    const p = testPhrases[currentIdx];
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <span className="text-sm font-bold text-gray-500">テスト {currentIdx + 1}/{testPhrases.length}</span>
          {wrongOnes.length > 0 && <span className="text-xs text-orange-500 font-bold">不正解フレーズの再テスト中</span>}
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
          <p className="text-2xl font-bold mb-6">{p.japanese}</p>
          {showAnswer ? (
            <>
              <p className="text-xl text-blue-700 mb-4">{p.english}</p>
              <button onClick={() => speak(p.english)} className="text-3xl mb-6">🔊</button>
              <div className="flex gap-4">
                <button onClick={() => handleAnswer(true)} className="flex-1 bg-green-500 text-white p-4 rounded-xl font-bold text-lg">✅ 正解</button>
                <button onClick={() => handleAnswer(false)} className="flex-1 bg-red-500 text-white p-4 rounded-xl font-bold text-lg">❌ 不正解</button>
              </div>
            </>
          ) : (
            <button onClick={() => setShowAnswer(true)} className="w-full bg-gray-800 text-white p-4 rounded-xl font-bold text-lg">答えを見る</button>
          )}
        </div>
      </div>
    );
  }

  // Done
  return (
    <div className="max-w-lg mx-auto px-4 py-8 text-center">
      <p className="text-6xl mb-4">🎉</p>
      <h2 className="text-2xl font-bold mb-2">全問正解！</h2>
      <p className="text-gray-500 mb-8">学習完了です。復習スケジュールに登録します。</p>
      <button onClick={handleComplete} className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg">
        📒 ノートに追加して復習開始
      </button>
    </div>
  );
}
