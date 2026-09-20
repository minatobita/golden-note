'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getBatch, updateBatch, getSettings } from '@/lib/db';
import { STAGE_CONFIG } from '@/lib/types';

export default function QuizPage() {
  const router = useRouter();
  const { batchId } = useParams();
  const [batch, setBatch] = useState<any>(null);
  const [phase, setPhase] = useState<'quiz' | 'results' | 'select'>('quiz');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [quizResults, setQuizResults] = useState<{ phrase: any; correct: boolean }[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      const b = await getBatch(batchId as string);
      if (b) setBatch(b);
    })();
  }, [batchId]);

  const phrases = batch?.phrases || [];
  const config = STAGE_CONFIG[batch?.stage] || { from: 25, to: 18, next: null };

  const handleAnswer = (correct: boolean) => {
    const newResults = [...quizResults, { phrase: phrases[currentIdx], correct }];
    setQuizResults(newResults);
    if (currentIdx < phrases.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setShowAnswer(false);
    } else {
      setPhase('results');
    }
  };

  const goToSelect = () => {
    const preSelected = new Set<number>();
    quizResults.forEach((r, i) => { if (!r.correct) preSelected.add(i); });
    setSelectedIndices(preSelected);
    setPhase('select');
  };

  const toggleSelect = (idx: number) => {
    const newSet = new Set(selectedIndices);
    if (newSet.has(idx)) newSet.delete(idx); else newSet.add(idx);
    setSelectedIndices(newSet);
  };

  const handleConfirmSelection = async () => {
    if (!batch) return;
    const target = config.to;
    const selectedArr = Array.from(selectedIndices);
    const selectedPhrases = selectedArr.map(i => quizResults[i].phrase);
    const nextPhrases = selectedPhrases.slice(0, target);

    const settings = await getSettings(batch.userId);
    const nextStage = config.next;

    // 今日の日付（実際の復習日）
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (nextStage) {
      const nextConfig = STAGE_CONFIG[nextStage];
      const intervalDays = settings.intervals?.[nextStage] || 7;

      // 次回復習日 = 今日（実際の復習日）+ 間隔日数
      const nextDate = new Date(today);
      nextDate.setDate(nextDate.getDate() + intervalDays);

      await updateBatch(batchId as string, {
        phrases: nextPhrases,
        stage: nextStage,
        totalPhrases: nextPhrases.length,
        targetCount: nextConfig?.to || 6,
        status: 'reviewing',
        nextReviewDate: nextDate.toISOString().split('T')[0],
        lastReviewDate: todayStr,
        intervalDays,
        reviewHistory: [...(batch.reviewHistory || []), {
          date: today.toISOString(),
          stage: batch.stage,
          selected: selectedArr.length,
          actualReviewDate: todayStr,
        }],
      });
    } else {
      await updateBatch(batchId as string, {
        status: 'completed',
        lastReviewDate: todayStr,
        reviewHistory: [...(batch.reviewHistory || []), {
          date: today.toISOString(),
          stage: batch.stage,
          selected: selectedArr.length,
          actualReviewDate: todayStr,
        }],
      });
    }

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

  if (phase === 'quiz') {
    const p = phrases[currentIdx];
    if (!p) return <div>Error: No phrase</div>;
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => router.push('/')} className="text-blue-600 font-semibold text-sm">← 戻る</button>
          <span className="text-sm font-bold text-gray-500">問題 {currentIdx + 1}/{phrases.length}</span>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
          <p className="text-xs text-gray-400 mb-2">🥉 {config.from}→{config.to}</p>
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

  if (phase === 'results') {
    const correctCount = quizResults.filter(r => r.correct).length;
    const wrongCount = quizResults.length - correctCount;
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-center mb-6">📊 結果</h2>
        <div className="flex gap-4 justify-center mb-6">
          <div className="bg-green-50 rounded-xl p-4 text-center flex-1">
            <p className="text-3xl font-bold text-green-600">{correctCount}</p>
            <p className="text-sm text-green-700">正解</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4 text-center flex-1">
            <p className="text-3xl font-bold text-red-600">{wrongCount}</p>
            <p className="text-sm text-red-700">不正解</p>
          </div>
        </div>
        <div className="space-y-2 mb-6">
          {quizResults.map((r, i) => (
            <div key={i} className={`p-3 rounded-lg border ${r.correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <span className="mr-2">{r.correct ? '✅' : '❌'}</span>
              <span className="font-semibold text-sm">{r.phrase.japanese}</span>
              <p className="text-sm text-blue-700 ml-6">{r.phrase.english}</p>
            </div>
          ))}
        </div>
        <button onClick={goToSelect} className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold text-lg">
          次に残す {config.to}個を選択 →
        </button>
      </div>
    );
  }

  // Select phase
  const selCount = selectedIndices.size;
  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h2 className="text-xl font-bold mb-2">次に残すフレーズを選択</h2>
      <p className="text-sm text-gray-500 mb-4">
        目標: {config.to}個 | 現在: {selCount}個選択中
        {selCount > config.to && <span className="text-purple-600 font-bold"> ({selCount - config.to}個がブロンズプールへ)</span>}
      </p>
      <div className="space-y-2 mb-6">
        {quizResults.map((r, i) => {
          const isSelected = selectedIndices.has(i);
          const selectedArray = Array.from(selectedIndices);
          const isOverflow = isSelected && selectedArray.indexOf(i) >= config.to;
          return (
            <div key={i} onClick={() => toggleSelect(i)}
              className={`p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                !isSelected ? 'border-gray-200 bg-white' :
                !r.correct ? 'border-red-400 bg-red-50' :
                isOverflow ? 'border-purple-400 bg-purple-50' :
                'border-blue-400 bg-blue-50'
              }`}>
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'}`}>
                  {isSelected && '✓'}
                </span>
                <div className="flex-1">
                  <span className="font-semibold text-sm">{r.phrase.japanese}</span>
                  <p className="text-sm text-blue-700">{r.phrase.english}</p>
                </div>
                {!r.correct && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">不正解</span>}
                {isOverflow && <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">→ブロンズ</span>}
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={handleConfirmSelection} disabled={selCount < config.to}
        className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold text-lg disabled:opacity-50">
        確定 ({selCount}個選択)
      </button>
    </div>
  );
}
