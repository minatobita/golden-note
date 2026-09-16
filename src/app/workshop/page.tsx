'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getBatch, updateBatch } from '@/lib/db';

interface ChatMsg { role: 'user' | 'ai'; text: string; candidates?: string[] }

function WorkshopContent() {
  const router = useRouter();
  const params = useSearchParams();
  const batchId = params.get('batchId');
  const { user } = useAuth();
  const [batch, setBatch] = useState<any>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  useEffect(() => {
    if (!batchId) { setLoading(false); return; }
    (async () => {
      const b = await getBatch(batchId);
      if (b) setBatch(b);
      setLoading(false);
    })();
  }, [batchId]);

  useEffect(() => {
    if (!batch || !batch.phrases || !batch.phrases[activeIdx]) return;
    const p = batch.phrases[activeIdx];
    const sitText = p.situation ? `\n📍 状況: ${p.situation}` : '';
    if (!p.english) {
      // Auto translate
      setChat([{ role: 'ai', text: `「${p.japanese}」を翻訳中...${sitText}` }]);
      fetch('/api/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ japanese: p.japanese, situation: p.situation }),
      }).then(r => r.json()).then(data => {
        if (data.english) {
          const updated = { ...batch };
          updated.phrases[activeIdx].english = data.english;
          setBatch({ ...updated });
          setChat([{
            role: 'ai',
            text: `「${p.japanese}」${sitText}\n\n現在の英訳:\n${data.english}\n\n修正が必要ならリクエストしてください。`
          }]);
        } else {
          setChat([{ role: 'ai', text: data.error || '翻訳に失敗しました' }]);
        }
      }).catch(() => setChat([{ role: 'ai', text: '翻訳エラーが発生しました' }]));
    } else {
      setChat([{
        role: 'ai',
        text: `「${p.japanese}」${sitText}\n\n現在の英訳:\n${p.english}\n\n修正が必要ならリクエストしてください。`
      }]);
    }
  }, [activeIdx, batch?.phrases?.length]);

  const handleSend = async (msg: string) => {
    if (!msg.trim() || !batch) return;
    const p = batch.phrases[activeIdx];
    const newChat: ChatMsg[] = [...chat, { role: 'user', text: msg }];
    setChat(newChat);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg, japanese: p.japanese, english: p.english, situation: p.situation,
          history: newChat.map(c => ({ role: c.role === 'ai' ? 'assistant' : 'user', content: c.text })),
        }),
      });
      const data = await res.json();
      if (data.candidates) {
        newChat.push({ role: 'ai', text: data.reply || '候補を提案します：', candidates: data.candidates });
      } else {
        newChat.push({ role: 'ai', text: data.reply || data.error || 'エラーが発生しました' });
      }
      setChat([...newChat]);
    } catch { newChat.push({ role: 'ai', text: 'エラーが発生しました' }); setChat([...newChat]); }
    setSending(false);
  };

  const handleAdopt = (text?: string) => {
    if (!batch) return;
    const updated = { ...batch };
    const english = text || updated.phrases[activeIdx].english;
    updated.phrases[activeIdx].english = english;
    setBatch({ ...updated });
    updateBatch(batchId!, { phrases: updated.phrases });
    setChat([...chat, { role: 'ai', text: `✅ 採用しました: "${english}"` }]);
  };

  const handleDeletePhrase = (idx: number) => {
    if (!batch || !window.confirm('このフレーズを削除しますか？')) return;
    const updated = { ...batch };
    updated.phrases.splice(idx, 1);
    updated.totalPhrases = updated.phrases.length;
    setBatch({ ...updated });
    updateBatch(batchId!, { phrases: updated.phrases, totalPhrases: updated.phrases.length });
    if (activeIdx >= updated.phrases.length) setActiveIdx(Math.max(0, updated.phrases.length - 1));
  };

  const handleFinish = async () => {
    if (!batch || !batchId) return;
    const allDone = batch.phrases.every((p: any) => p.japanese && p.english);
    await updateBatch(batchId, { phrases: batch.phrases, status: allDone ? 'studying' : 'translating' });
    if (allDone) {
      router.push(`/study/${batchId}`);
    } else {
      router.push('/');
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>;
  if (!batch || !batch.phrases || batch.phrases.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-6xl mb-4">📝</p>
        <p className="text-gray-500 mb-4">リストがありません。先にホーム画面でフレーズを集めてください。</p>
        <button onClick={() => router.push('/')} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold">🏠 ホームに戻る</button>
      </div>
    );
  }

  const p = batch.phrases[activeIdx] || { japanese: '', english: '' };
  const completedCount = batch.phrases.filter((x: any) => x.japanese && x.english).length;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-3 flex justify-between items-center">
        <button onClick={() => router.push('/')} className="text-blue-600 font-semibold text-sm">← ホームに戻る</button>
        <span className="text-sm font-bold text-gray-600">翻訳 {completedCount}/{batch.phrases.length}</span>
        <button onClick={handleFinish} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold">
          {completedCount === batch.phrases.length ? '📖 学習へ' : '✅ 完了'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - phrase list */}
        <div className="w-64 border-r border-gray-200 bg-white overflow-y-auto flex-shrink-0">
          {batch.phrases.map((phrase: any, i: number) => (
            <div key={i} onClick={() => setActiveIdx(i)}
              className={`p-3 border-b border-gray-100 cursor-pointer transition-colors border-l-4 group ${i === activeIdx ? 'bg-blue-50 border-l-blue-600' : 'border-l-transparent hover:bg-gray-50'}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{phrase.japanese || '（日本語なし）'}</p>
                  <p className="text-xs text-gray-500 truncate">{phrase.english || '未翻訳'}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDeletePhrase(i); }}
                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-1">🗑️</button>
              </div>
              {phrase.japanese && phrase.english && <span className="text-xs text-green-600">✅ 完了</span>}
            </div>
          ))}
        </div>

        {/* Right panel - chat */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-3 font-bold text-sm">
            🤖 AI翻訳アシスタント — あなたのスタイルに最適化
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
            {chat.map((msg, i) => (
              <div key={i}>
                <p className="text-xs font-bold text-purple-600 mb-1">{msg.role === 'ai' ? '🤖 AI翻訳アシスタント' : '👤 あなた'}</p>
                <div className={`rounded-lg p-3 text-sm whitespace-pre-wrap ${msg.role === 'ai' ? 'bg-purple-50 border border-purple-200' : 'bg-gray-100'}`}>
                  {msg.text}
                  {msg.candidates && (
                    <div className="mt-2 space-y-1">
                      {msg.candidates.map((c, j) => (
                        <button key={j} onClick={() => handleAdopt(c)}
                          className="block w-full text-left p-2 rounded-lg border border-purple-300 bg-white hover:bg-purple-50 text-sm font-semibold text-purple-700">
                          {j + 1}. {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {/* Quick buttons */}
          <div className="bg-white border-t border-gray-200 px-3 pt-2">
            <div className="flex gap-1 flex-wrap mb-2">
              {['I主語にして', 'カジュアルに', '句動詞で', '短く', '別の言い方', 'フォーマルに', '文法を説明して'].map(btn => (
                <button key={btn} onClick={() => handleSend(btn)}
                  className="px-3 py-1 border-2 border-purple-500 rounded-full text-xs font-bold text-purple-600 bg-white hover:bg-purple-50">{btn}</button>
              ))}
            </div>
          </div>
          {/* Input */}
          <div className="bg-white border-t border-gray-200 p-3 flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend(input)}
              placeholder="要望を入力..." className="flex-1 p-2 border border-gray-300 rounded-lg text-sm" style={{ fontSize: '16px' }} />
            <button onClick={() => handleSend(input)} disabled={sending}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50">
              {sending ? '...' : '送信'}
            </button>
            <button onClick={() => handleAdopt()} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold">✅ 採用</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkshopPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>}>
      <WorkshopContent />
    </Suspense>
  );
}
