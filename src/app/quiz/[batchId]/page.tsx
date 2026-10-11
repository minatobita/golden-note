'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getBatch, updateBatch, getSettings, saveMemorized, getCollecting, saveCollecting, getSilverPool, saveSilverPool, getGoldenPool, saveGoldenPool, getMemorizedForLongTermCheck } from '@/lib/db';
import { STAGE_CONFIG, getNextPool, getNoteLevelEmoji } from '@/lib/types';

function getLocalDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

interface QuizItem {
  phrase: any;
  isLongTerm: boolean;
  memorizedId?: string;
}

export default function QuizPage() {
  const router = useRouter();
  const { batchId } = useParams();
  const [batch, setBatch] = useState<any>(null);
  const [phase, setPhase] = useState<'quiz' | 'select' | 'drill' | 'done'>('quiz');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [allQuizItems, setAllQuizItems] = useState<QuizItem[]>([]);
  const [quizResults, setQuizResults] = useState<{ phrase: any; correct: boolean; isLongTerm: boolean }[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [drillPhrases, setDrillPhrases] = useState<any[]>([]);
  const [drillIdx, setDrillIdx] = useState(0);
  const [drillShowAnswer, setDrillShowAnswer] = useState(false);
  const [drillWrong, setDrillWrong] = useState<any[]>([]);
  const [drillRound, setDrillRound] = useState(1);

  useEffect(() => {
    (async () => {
      const b = await getBatch(batchId as string);
      if (!b) return;
      setBatch(b);

      // Load long-term memory phrases (90 days+, max 3)
      let ltPhrases: any[] = [];
      try {
        ltPhrases = await getMemorizedForLongTermCheck((b as any).userId);
      } catch (e) { console.error(e); }

      // Mix batch phrases + long-term phrases, then shuffle
      const batchItems: QuizItem[] = (b.phrases || []).map((p: any) => ({ phrase: p, isLongTerm: false }));
      const ltItems: QuizItem[] = ltPhrases.map((p: any) => ({
        phrase: { japanese: p.japanese, english: p.english, situation: p.situation || '' },
        isLongTerm: true,
        memorizedId: p.id,
      }));
      const combined = [...batchItems, ...ltItems];
      // Shuffle
      for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]];
      }
      setAllQuizItems(combined);
    })();
  }, [batchId]);

  const config = STAGE_CONFIG[batch?.stage] || { from: 25, to: 18, next: null };
  const noteLevel = batch?.noteLevel || 'bronze';

  const speak = (text: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
  };

  const shuffleArray = (arr: any[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // --- Quiz Phase ---
  const handleAnswer = (correct: boolean) => {
    const item = allQuizItems[currentIdx];
    const newResults = [...quizResults, { phrase: item.phrase, correct, isLongTerm: item.isLongTerm }];
    setQuizResults(newResults);
    if (currentIdx < allQuizItems.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setShowAnswer(false);
    } else {
      // Quiz finished - go directly to select (skip results)
      // Pre-select incorrect batch items
      const batchResults = newResults.filter(r => !r.isLongTerm);
      const preSelected = new Set<number>();
      batchResults.forEach((r, i) => { if (!r.correct) preSelected.add(i); });
      setSelectedIndices(preSelected);
      setPhase('select');

      // Handle long-term failures - add to collecting
      handleLongTermFailures(newResults);
    }
  };

  const handleLongTermFailures = async (results: { phrase: any; correct: boolean; isLongTerm: boolean }[]) => {
    if (!batch) return;
    const ltFailed = results.filter(r => r.isLongTerm && !r.correct);
    if (ltFailed.length === 0) return;
    try {
      const existing = await getCollecting(batch.userId);
      const newPhrases = ltFailed.map(r => ({
        japanese: r.phrase.japanese,
        english: r.phrase.english,
        situation: r.phrase.situation || '',
        source: 'long-term-failed',
      }));
      await saveCollecting(batch.userId, [...(existing || []), ...newPhrases]);
    } catch (e) { console.error(e); }
  };

  const toggleSelect = (idx: number) => {
    const newSet = new Set(selectedIndices);
    if (newSet.has(idx)) newSet.delete(idx); else newSet.add(idx);
    setSelectedIndices(newSet);
  };

  // --- Start drill after selection ---
  const startDrill = () => {
    const batchResults = quizResults.filter(r => !r.isLongTerm);
    const selectedArr = Array.from(selectedIndices);
    const target = config.to;
    const selectedPhrases = selectedArr.map(i => batchResults[i].phrase);
    const drillList = selectedPhrases.slice(0, target);
    setDrillPhrases(shuffleArray(drillList));
    setDrillIdx(0);
    setDrillShowAnswer(false);
    setDrillWrong([]);
    setDrillRound(1);
    setPhase('drill');
  };

  // --- Drill: repeat until all correct ---
  const handleDrillAnswer = (correct: boolean) => {
    const newWrong = correct ? [...drillWrong] : [...drillWrong, drillPhrases[drillIdx]];
    if (drillIdx < drillPhrases.length - 1) {
      setDrillWrong(newWrong);
      setDrillIdx(drillIdx + 1);
      setDrillShowAnswer(false);
    } else {
      // Round finished
      if (newWrong.length === 0) {
        // All correct! Save and finish
        doSave();
      } else {
        // Retry wrong ones
        setDrillPhrases(shuffleArray(newWrong));
        setDrillIdx(0);
        setDrillShowAnswer(false);
        setDrillWrong([]);
        setDrillRound(drillRound + 1);
      }
    }
  };

  // --- Save results ---
  const doSave = async () => {
    if (!batch) return;
    const batchResults = quizResults.filter(r => !r.isLongTerm);
    const target = config.to;
    const selectedArr = Array.from(selectedIndices);
    const selectedPhrases = selectedArr.map(i => batchResults[i].phrase);
    const nextPhrases = selectedPhrases.slice(0, target);
    const overflowPhrases = selectedArr.length > target
      ? selectedArr.slice(target).map(i => batchResults[i].phrase)
      : [];

    // Memorized = batch items NOT selected (remembered!)
    const allBatchIndices = new Set(batchResults.map((_, i) => i));
    const selectedSet = new Set(selectedArr);
    const memorizedPhrases = Array.from(allBatchIndices)
      .filter(i => !selectedSet.has(i))
      .map(i => batchResults[i].phrase);

    const settings = await getSettings(batch.userId);
    const nextStage = config.next;
    const today = getLocalDateStr();

    // Save memorized phrases
    if (memorizedPhrases.length > 0) {
      await saveMemorized(batch.userId, memorizedPhrases, batch.stage, noteLevel);
    }

    // Save overflow to collecting
    if (overflowPhrases.length > 0) {
      const existing = await getCollecting(batch.userId);
      const merged = [...existing, ...overflowPhrases.map((p: any) => ({
        japanese: p.japanese || '', english: p.english || '', situation: p.situation || '',
      }))];
      await saveCollecting(batch.userId, merged);
    }

    if (nextStage) {
      const intervalDays = settings.intervals?.[nextStage] || 7;
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + intervalDays);
      const nextDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth()+1).padStart(2,'0')}-${String(nextDate.getDate()).padStart(2,'0')}`;

      await updateBatch(batchId as string, {
        phrases: nextPhrases,
        stage: nextStage,
        totalPhrases: nextPhrases.length,
        targetCount: STAGE_CONFIG[nextStage]?.to || 6,
        status: 'reviewing',
        nextReviewDate: nextDateStr,
        lastReviewDate: today,
        intervalDays,
        reviewHistory: [...(batch.reviewHistory || []), {
          date: new Date().toISOString(), stage: batch.stage,
          selected: selectedArr.length, memorized: memorizedPhrases.length,
          overflow: overflowPhrases.length, actualReviewDate: today,
        }],
      });
    } else {
      // Final stage (9→6): remaining go to next pool
      const pool = getNextPool(noteLevel);
      if (pool === 'silver') {
        const existing = await getSilverPool(batch.userId);
        const updated = [...existing, ...nextPhrases];
        await saveSilverPool(batch.userId, updated);
        if (updated.length >= 25) {
          const silverBatch = updated.slice(0, 25);
          const remainder = updated.slice(25);
          const { createBatch } = await import('@/lib/db');
          await createBatch(batch.userId, silverBatch, 'silver');
          await saveSilverPool(batch.userId, remainder);
        }
      } else if (pool === 'golden') {
        const existing = await getGoldenPool(batch.userId);
        const updated = [...existing, ...nextPhrases];
        await saveGoldenPool(batch.userId, updated);
        if (updated.length >= 25) {
          const goldenBatch = updated.slice(0, 25);
          const remainder = updated.slice(25);
          const { createBatch } = await import('@/lib/db');
          await createBatch(batch.userId, goldenBatch, 'golden');
          await saveGoldenPool(batch.userId, remainder);
        }
      } else {
        // Golden final → back to collecting
        const existing = await getCollecting(batch.userId);
        const merged = [...existing, ...nextPhrases.map((p: any) => ({
          japanese: p.japanese || '', english: p.english || '', situation: p.situation || '',
        }))];
        await saveCollecting(batch.userId, merged);
      }

      await updateBatch(batchId as string, {
        status: 'completed',
        lastReviewDate: today,
        reviewHistory: [...(batch.reviewHistory || []), {
          date: new Date().toISOString(), stage: batch.stage,
          selected: selectedArr.length, memorized: memorizedPhrases.length,
          actualReviewDate: today,
        }],
      });
    }

    setPhase('done');
  };

  if (!batch || allQuizItems.length === 0) return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>;

  // === QUIZ PHASE (batch + long-term mixed) ===
  if (phase === 'quiz') {
    const item = allQuizItems[currentIdx];
    if (!item) return <div>Error: No phrase</div>;
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => router.push('/')} className="text-blue-600 font-semibold text-sm">← 中断して戻る</button>
          <span className="text-sm font-bold text-gray-500">問題 {currentIdx + 1}/{allQuizItems.length}</span>
        </div>
        <div className={`bg-white rounded-2xl shadow-lg p-6 text-center ${item.isLongTerm ? 'border-2 border-amber-300' : ''}`}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <p className="text-xs text-gray-400">{getNoteLevelEmoji(noteLevel)} {config.from}→{config.to}</p>
            {item.isLongTerm && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">🔒 長期記憶チェック</span>}
          </div>
          <p className="text-2xl font-bold mb-6">{item.phrase.japanese}</p>
          {showAnswer ? (
            <>
              <p className="text-xl text-blue-700 mb-4">{item.phrase.english}</p>
              <button onClick={() => speak(item.phrase.english)} className="text-3xl mb-6">🔊</button>
              <div className="flex gap-4">
                <button onClick={() => handleAnswer(true)} className="flex-1 bg-green-500 text-white p-4 rounded-xl font-bold text-lg">✅ 正解</button>
                <button onClick={() => handleAnswer(false)} className="flex-1 bg-red-500 text-white p-4 rounded-xl font-bold text-lg">❌ 不正解</button>
              </div>
              {item.isLongTerm && <p className="text-xs text-red-400 mt-2">不正解 → 収集リストに戻ります</p>}
            </>
          ) : (
            <button onClick={() => setShowAnswer(true)} className="w-full bg-gray-800 text-white p-4 rounded-xl font-bold text-lg">答えを見る</button>
          )}
        </div>
      </div>
    );
  }

  // === SELECT PHASE (skip results, go directly here) ===
  if (phase === 'select') {
    const batchResults = quizResults.filter(r => !r.isLongTerm);
    const ltResults = quizResults.filter(r => r.isLongTerm);
    const selCount = selectedIndices.size;
    const nextPool = getNextPool(noteLevel);
    const poolLabel = nextPool === 'silver' ? 'シルバー' : nextPool === 'golden' ? 'ゴールデン' : '収集リスト';
    const isLastStage = !config.next;

    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => router.push('/')} className="text-blue-600 font-semibold text-sm">← 中断して戻る</button>
        </div>
        <h2 className="text-xl font-bold mb-2">次に残すフレーズを選択</h2>
        <p className="text-sm text-gray-500 mb-1">
          目標: {config.to}個 | 現在: {selCount}個選択中
        </p>
        {selCount > config.to && (
          <p className="text-sm text-purple-600 font-bold mb-1">({selCount - config.to}個が収集リストへ)</p>
        )}
        {isLastStage && (
          <p className="text-sm text-amber-600 mb-1">🏅 最終ステージ: 残す{config.to}個は {poolLabel} へ昇格</p>
        )}
        <p className="text-xs text-gray-400 mb-4">
          選ばなかったフレーズ({batchResults.length - selCount}個) → 🔒 長期記憶チェックへ
        </p>

        {/* Long-term results summary */}
        {ltResults.length > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm font-bold text-amber-700 mb-1">🔒 長期記憶チェック結果</p>
            {ltResults.map((r, i) => (
              <div key={i} className="text-sm flex items-center gap-2">
                <span>{r.correct ? '✅' : '❌'}</span>
                <span>{r.phrase.japanese}</span>
                {!r.correct && <span className="text-xs text-red-500">→ 収集リストへ</span>}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 mb-6">
          {batchResults.map((r, i) => {
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
                  {r.correct ? (
                    <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">正解</span>
                  ) : (
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">不正解</span>
                  )}
                  {isOverflow && <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">→収集</span>}
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={startDrill} disabled={selCount < config.to}
          className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold text-lg disabled:opacity-50">
          確定して暗記テスト開始 ({selCount}個選択)
        </button>
      </div>
    );
  }

  // === DRILL PHASE (all correct to finish) ===
  if (phase === 'drill') {
    const p = drillPhrases[drillIdx];
    if (!p) return null;
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => router.push('/')} className="text-blue-600 font-semibold text-sm">← 中断して戻る</button>
          <span className="text-sm font-bold text-gray-500">暗記テスト R{drillRound} - {drillIdx + 1}/{drillPhrases.length}</span>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
          <p className="text-xs text-orange-500 mb-2">🧠 全問正解まで繰り返し</p>
          <p className="text-2xl font-bold mb-6">{p.japanese}</p>
          {drillShowAnswer ? (
            <>
              <p className="text-xl text-blue-700 mb-4">{p.english}</p>
              <button onClick={() => speak(p.english)} className="text-3xl mb-6">🔊</button>
              <div className="flex gap-4">
                <button onClick={() => { setDrillShowAnswer(false); handleDrillAnswer(true); }} className="flex-1 bg-green-500 text-white p-4 rounded-xl font-bold text-lg">✅ 正解</button>
                <button onClick={() => { setDrillShowAnswer(false); handleDrillAnswer(false); }} className="flex-1 bg-red-500 text-white p-4 rounded-xl font-bold text-lg">❌ 不正解</button>
              </div>
            </>
          ) : (
            <button onClick={() => setDrillShowAnswer(true)} className="w-full bg-gray-800 text-white p-4 rounded-xl font-bold text-lg">答えを見る</button>
          )}
        </div>
        {drillRound > 1 && (
          <p className="text-center text-sm text-orange-600 mt-4 font-semibold">
            ラウンド {drillRound}: 前回間違えた {drillPhrases.length}問を再テスト中
          </p>
        )}
      </div>
    );
  }

  // === DONE PHASE ===
  if (phase === 'done') {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 text-center">
        <p className="text-6xl mb-4">🎉</p>
        <h2 className="text-2xl font-bold mb-4">復習完了！</h2>
        <button onClick={() => router.push('/')} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold text-lg">ホームに戻る</button>
      </div>
    );
  }

  return null;
}
