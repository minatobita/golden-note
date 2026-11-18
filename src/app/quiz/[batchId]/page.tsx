'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getBatch, updateBatch, getSettings, addToLongTermPool, getCollecting, saveCollecting, getSilverPool, saveSilverPool, getGoldenPool, saveGoldenPool, getLongTermQuestions, applyLongTermResults } from '@/lib/db';
import { STAGE_CONFIG, getNextPool, getNoteLevelEmoji } from '@/lib/types';

const LONG_TERM_COUNT = 3;

function getLocalDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

interface QuizItem {
  phrase: any;
  isLongTerm: boolean;
  ltId?: string;
  memorizedAt?: string;
}

interface QuizResult {
  phrase: any;
  correct: boolean;
  isLongTerm: boolean;
  ltId?: string;
  memorizedAt?: string;
}

interface LtInfo {
  poolSize: number;
  asked: number;
  error?: boolean;
}

export default function QuizPage() {
  const router = useRouter();
  const { batchId } = useParams();
  const [batch, setBatch] = useState<any>(null);
  const [phase, setPhase] = useState<'quiz' | 'select' | 'drill' | 'done'>('quiz');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [allQuizItems, setAllQuizItems] = useState<QuizItem[]>([]);
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [drillPhrases, setDrillPhrases] = useState<any[]>([]);
  const [drillIdx, setDrillIdx] = useState(0);
  const [drillShowAnswer, setDrillShowAnswer] = useState(false);
  const [drillWrong, setDrillWrong] = useState<any[]>([]);
  const [drillRound, setDrillRound] = useState(1);
  const [savingLongTerm, setSavingLongTerm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ltInfo, setLtInfo] = useState<LtInfo | null>(null);

  useEffect(() => {
    (async () => {
      const b: any = await getBatch(batchId as string);
      if (!b) return;
      setBatch(b);

      // 長期記憶フォルダーの先頭（覚えた日が古い順）から3問。日数の条件はなし
      let ltPhrases: any[] = [];
      try {
        const res = await getLongTermQuestions(b.userId, LONG_TERM_COUNT);
        ltPhrases = res.questions;
        setLtInfo({ poolSize: res.poolSize, asked: res.questions.length });
      } catch (e) {
        console.error(e);
        setLtInfo({ poolSize: 0, asked: 0, error: true });
      }

      const batchItems: QuizItem[] = (b.phrases || []).map((p: any) => ({ phrase: p, isLongTerm: false }));
      const ltItems: QuizItem[] = ltPhrases.map((p: any) => ({
        phrase: { japanese: p.japanese, english: p.english, situation: p.situation || '' },
        isLongTerm: true,
        ltId: p.id,
        memorizedAt: p.memorizedAt,
      }));
      // 出題順はシャッフルして混在させる（どれを出すかは古い順で決定済み）
      const combined = [...batchItems, ...ltItems];
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
  const handleAnswer = async (correct: boolean) => {
    if (savingLongTerm) return;
    const item = allQuizItems[currentIdx];
    const newResults: QuizResult[] = [...quizResults, {
      phrase: item.phrase, correct, isLongTerm: item.isLongTerm,
      ltId: item.ltId, memorizedAt: item.memorizedAt,
    }];
    setQuizResults(newResults);

    if (currentIdx < allQuizItems.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setShowAnswer(false);
      return;
    }

    // クイズ終了: 長期記憶の結果を先に保存（途中で中断しても反映される）
    setSavingLongTerm(true);
    try {
      const ltResults = newResults.filter(r => r.isLongTerm && r.ltId);
      if (ltResults.length > 0 && batch) {
        await applyLongTermResults(batch.userId, ltResults.map(r => ({
          id: r.ltId as string,
          correct: r.correct,
        })));
      }
    } catch (e) {
      console.error(e);
      alert('長期記憶チェックの保存に失敗しました。通信状況を確認してください。');
    }
    setSavingLongTerm(false);

    // 結果画面は出さず、直接選択画面へ（不正解は自動選択）
    const batchResults = newResults.filter(r => !r.isLongTerm);
    const preSelected = new Set<number>();
    batchResults.forEach((r, i) => { if (!r.correct) preSelected.add(i); });
    setSelectedIndices(preSelected);
    setPhase('select');
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
      if (newWrong.length === 0) {
        doSave();
      } else {
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
    if (!batch || saving) return;
    setSaving(true);
    const batchResults = quizResults.filter(r => !r.isLongTerm);
    const target = config.to;
    const selectedArr = Array.from(selectedIndices);
    const selectedPhrases = selectedArr.map(i => batchResults[i].phrase);
    const nextPhrases = selectedPhrases.slice(0, target);
    const overflowPhrases = selectedArr.length > target
      ? selectedArr.slice(target).map(i => batchResults[i].phrase)
      : [];

    // 選ばなかった = 覚えた → 長期記憶へ
    const selectedSet = new Set(selectedArr);
    const memorizedPhrases = batchResults
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => !selectedSet.has(i))
      .map(({ r }) => r.phrase);

    const settings = await getSettings(batch.userId);
    const nextStage = config.next;
    const today = getLocalDateStr();

    if (memorizedPhrases.length > 0) {
      await addToLongTermPool(batch.userId, memorizedPhrases, batch.stage, noteLevel);
    }

    if (overflowPhrases.length > 0) {
      const existing = await getCollecting(batch.userId);
      const merged = [...existing, ...overflowPhrases.map((p: any) => ({
        japanese: p.japanese || '', english: p.english || '', situation: p.situation || '',
      }))];
      await saveCollecting(batch.userId, merged);
    }

    const ltResults = quizResults.filter(r => r.isLongTerm);
    const ltSummary = {
      longTermChecked: ltResults.length,
      longTermCorrect: ltResults.filter(r => r.correct).length,
    };

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
          overflow: overflowPhrases.length, actualReviewDate: today, ...ltSummary,
        }],
      });
    } else {
      const pool = getNextPool(noteLevel);
      if (pool === 'silver') {
        const existing = await getSilverPool(batch.userId);
        const updated = [...existing, ...nextPhrases];
        await saveSilverPool(batch.userId, updated);
        if (updated.length >= 25) {
          const { createBatch } = await import('@/lib/db');
          await createBatch(batch.userId, updated.slice(0, 25), 'silver');
          await saveSilverPool(batch.userId, updated.slice(25));
        }
      } else if (pool === 'golden') {
        const existing = await getGoldenPool(batch.userId);
        const updated = [...existing, ...nextPhrases];
        await saveGoldenPool(batch.userId, updated);
        if (updated.length >= 25) {
          const { createBatch } = await import('@/lib/db');
          await createBatch(batch.userId, updated.slice(0, 25), 'golden');
          await saveGoldenPool(batch.userId, updated.slice(25));
        }
      } else {
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
          actualReviewDate: today, ...ltSummary,
        }],
      });
    }

    setSaving(false);
    setPhase('done');
  };

  if (!batch || allQuizItems.length === 0) return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>;

  // === QUIZ PHASE (batch + long-term mixed) ===
  if (phase === 'quiz') {
    if (savingLongTerm) return <div className="min-h-screen flex items-center justify-center">長期記憶の結果を保存中...</div>;
    const item = allQuizItems[currentIdx];
    if (!item) return <div>Error: No phrase</div>;
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => router.push('/')} className="text-blue-600 font-semibold text-sm">← 中断して戻る</button>
          <span className="text-sm font-bold text-gray-500">問題 {currentIdx + 1}/{allQuizItems.length}</span>
        </div>
        {currentIdx === 0 && ltInfo && (
          <div className="mb-4 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 text-center">
            {ltInfo.error
              ? '🔒 長期記憶フォルダーの読み込みに失敗しました（今回は長期記憶チェックなし）'
              : ltInfo.asked > 0
                ? `🔒 長期記憶チェック ${ltInfo.asked}問を含みます（フォルダー ${ltInfo.poolSize}個の古い順）`
                : '🔒 長期記憶フォルダーはまだ空です'}
          </div>
        )}
        <div className={`bg-white rounded-2xl shadow-lg p-6 text-center ${item.isLongTerm ? 'border-2 border-amber-300' : ''}`}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <p className="text-xs text-gray-400">{getNoteLevelEmoji(noteLevel)} {config.from}→{config.to}</p>
            {item.isLongTerm && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">🔒 長期記憶チェック</span>}
          </div>
          {item.isLongTerm && item.memorizedAt && (
            <p className="text-xs text-amber-600 mb-2">覚えた日: {item.memorizedAt.replace(/-/g, '/')}</p>
          )}
          <p className="text-2xl font-bold mb-6">{item.phrase.japanese}</p>
          {showAnswer ? (
            <>
              <p className="text-xl text-blue-700 mb-4">{item.phrase.english}</p>
              <button onClick={() => speak(item.phrase.english)} className="text-3xl mb-6">🔊</button>
              <div className="flex gap-4">
                <button onClick={() => handleAnswer(true)} className="flex-1 bg-green-500 text-white p-4 rounded-xl font-bold text-lg">✅ 正解</button>
                <button onClick={() => handleAnswer(false)} className="flex-1 bg-red-500 text-white p-4 rounded-xl font-bold text-lg">❌ 不正解</button>
              </div>
              {item.isLongTerm && (
                <p className="text-xs text-gray-400 mt-2">正解 → 覚えた日を今日に更新 ／ 不正解 → 収集リストに戻ります</p>
              )}
            </>
          ) : (
            <button onClick={() => setShowAnswer(true)} className="w-full bg-gray-800 text-white p-4 rounded-xl font-bold text-lg">答えを見る</button>
          )}
        </div>
      </div>
    );
  }

  // === SELECT PHASE ===
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
          選ばなかったフレーズ({Math.max(0, batchResults.length - selCount)}個) → 🔒 長期記憶へ
        </p>

        {ltResults.length > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm font-bold text-amber-700 mb-1">🔒 長期記憶チェック結果（保存済み）</p>
            {ltResults.map((r, i) => (
              <div key={i} className="text-sm flex items-center gap-2 py-0.5">
                <span>{r.correct ? '✅' : '❌'}</span>
                <span className="flex-1">{r.phrase.japanese}</span>
                {r.correct
                  ? <span className="text-xs text-green-600">覚えた日を更新</span>
                  : <span className="text-xs text-red-500">→ 収集リストへ</span>}
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

  // === DRILL PHASE ===
  if (phase === 'drill') {
    if (saving) return <div className="min-h-screen flex items-center justify-center">保存中...</div>;
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
    const ltResults = quizResults.filter(r => r.isLongTerm);
    return (
      <div className="max-w-lg mx-auto px-4 py-8 text-center">
        <p className="text-6xl mb-4">🎉</p>
        <h2 className="text-2xl font-bold mb-4">復習完了！</h2>
        {ltResults.length > 0 && (
          <p className="text-sm text-amber-700 mb-4">
            🔒 長期記憶チェック: {ltResults.filter(r => r.correct).length}/{ltResults.length} 正解
          </p>
        )}
        <button onClick={() => router.push('/')} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold text-lg">ホームに戻る</button>
      </div>
    );
  }

  return null;
}
