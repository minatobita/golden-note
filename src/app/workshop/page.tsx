'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthChange } from '@/lib/auth';
import { saveCollecting, clearCollecting } from '@/lib/db';
import Navbar from '@/components/Navbar';

interface CollectPhrase {
  id?: string;
  japanese: string;
  english: string;
  situation: string;
  isAI?: boolean;
}

function WorkshopContent() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [phrases, setPhrases] = useState<CollectPhrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load user
  useEffect(() => {
    const unsub = onAuthChange((u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('golden-note-collect');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPhrases(parsed);
          setLoading(false);
          return;
        }
      } catch {}
    }
    setLoading(false);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Determine translation direction for a phrase
  const getDirection = (p: CollectPhrase): 'jp2en' | 'en2jp' | 'both' | 'empty' => {
    if (p.japanese && !p.english) return 'jp2en';
    if (!p.japanese && p.english) return 'en2jp';
    if (p.japanese && p.english) return 'both';
    return 'empty';
  };

  // Save to both localStorage and Firestore
  const saveAll = async (updatedPhrases: CollectPhrase[]) => {
    localStorage.setItem('golden-note-collect', JSON.stringify(updatedPhrases));
    if (user) {
      if (updatedPhrases.length > 0) {
        await saveCollecting(user.uid, updatedPhrases).catch(console.error);
      } else {
        await clearCollecting(user.uid).catch(console.error);
      }
    }
  };

  // When selecting a phrase, start chat
  useEffect(() => {
    if (phrases.length === 0) return;
    const p = phrases[selectedIdx];
    if (!p) return;
    const direction = getDirection(p);

    if (direction === 'jp2en') {
      setChatMessages([{
        role: 'assistant',
        content: `「${p.japanese}」の英訳を考えましょう。${p.situation ? `\n📍 状況: ${p.situation}` : ''}\n\nあなたのスタイル（I主語・カジュアル・句動詞）に合わせて提案します。少々お待ちください...`,
      }]);
      autoTranslateJpToEn(p);
    } else if (direction === 'en2jp') {
      setChatMessages([{
        role: 'assistant',
        content: `「${p.english}」の日本語訳を考えましょう。少々お待ちください...`,
      }]);
      autoTranslateEnToJp(p);
    } else if (direction === 'both') {
      setChatMessages([{
        role: 'assistant',
        content: `「${p.japanese}」\n現在の英訳: ${p.english}\n\nこの翻訳を調整しますか？クイックボタンを使うか、自由にリクエストしてください。`,
      }]);
    } else {
      setChatMessages([{ role: 'assistant', content: 'フレーズを入力してから翻訳を始めましょう。' }]);
    }
  }, [selectedIdx]);

  const autoTranslateJpToEn = async (p: CollectPhrase) => {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ japanese: p.japanese, situation: p.situation }),
      });
      const data = await res.json();
      if (data.candidates && data.candidates.length > 0) {
        const candidateList = data.candidates.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n');
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `提案:\n\n${candidateList}\n\n気に入ったものをクリックしてください。調整したい場合はクイックボタンか自由入力でリクエストしてください。`,
        }]);
      } else if (data.english) {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `提案:\n\n1. ${data.english}\n\nクリックして採用するか、調整をリクエストしてください。`,
        }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: '翻訳エラーが発生しました。もう一度試してください。' }]);
    }
  };

  const autoTranslateEnToJp = async (p: CollectPhrase) => {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ english: p.english }),
      });
      const data = await res.json();
      if (data.candidates && data.candidates.length > 0) {
        const candidateList = data.candidates.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n');
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `提案:\n\n${candidateList}\n\n気に入ったものをクリックしてください。`,
        }]);
      } else if (data.japanese) {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `提案:\n\n1. ${data.japanese}\n\nクリックして採用してください。`,
        }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: '翻訳エラーが発生しました。' }]);
    }
  };

  const handleChat = async (message: string) => {
    if (!message.trim() || chatLoading) return;
    const p = phrases[selectedIdx];
    if (!p) return;

    const userMsg = { role: 'user' as const, content: message };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);

    try {
      const direction = getDirection(p);
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.slice(-20).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
          phrase: p.japanese || p.english,
          situation: p.situation,
          direction: direction === 'en2jp' ? 'en2jp' : 'jp2en',
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else if (data.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `エラー: ${data.error}` }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: '通信エラーが発生しました。' }]);
    }
    setChatLoading(false);
  };

  const handleQuickButton = (action: string) => {
    handleChat(action);
  };

  // Parse candidates from message content
  const parseCandidates = (content: string): { text: string; candidates: string[] } => {
    const candidates: string[] = [];
    let cleanText = content;

    // Extract numbered candidates: "1. some text" or "1) some text"
    const numberedRegex = /^\d+[\.\)]\s*(.+)$/gm;
    let match;
    while ((match = numberedRegex.exec(content)) !== null) {
      const candidate = match[1].trim().replace(/^["'「」『』]+|["'「」『』]+$/g, '');
      if (candidate.length > 2) {
        candidates.push(candidate);
      }
    }

    // Extract bold candidates: **some text**
    const boldRegex = /\*\*(.+?)\*\*/g;
    while ((match = boldRegex.exec(content)) !== null) {
      const candidate = match[1].trim().replace(/^["'「」『』]+|["'「」『』]+$/g, '');
      if (candidate.length > 2 && !candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }

    // Remove ** markers from display text
    cleanText = content.replace(/\*\*(.+?)\*\*/g, '$1');

    return { text: cleanText, candidates };
  };

  const handleAdoptCandidate = async (candidate: string) => {
    const updated = [...phrases];
    const p = updated[selectedIdx];
    const direction = getDirection(p);

    if (direction === 'en2jp') {
      updated[selectedIdx] = { ...p, japanese: candidate };
    } else {
      updated[selectedIdx] = { ...p, english: candidate };
    }

    setPhrases(updated);
    await saveAll(updated);

    setChatMessages(prev => [...prev, {
      role: 'assistant',
      content: `✅ 「${candidate}」を採用しました！${direction === 'en2jp' ? '（日本語訳）' : '（英訳）'}`,
    }]);
  };

  // Adopt current best translation
  const handleAdopt = async () => {
    const lastAssistant = [...chatMessages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return;
    const { candidates } = parseCandidates(lastAssistant.content);
    if (candidates.length > 0) {
      await handleAdoptCandidate(candidates[0]);
    }
  };

  // Delete a phrase
  const handleDeletePhrase = async (idx: number) => {
    if (!confirm('このフレーズを削除しますか？')) return;
    const updated = phrases.filter((_, i) => i !== idx);
    setPhrases(updated);
    await saveAll(updated);
    if (selectedIdx >= updated.length) setSelectedIdx(Math.max(0, updated.length - 1));
  };

  // Go home - save first
  const handleGoHome = async () => {
    await saveAll(phrases);
    router.push('/');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>;

  if (phrases.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-500 px-4">
        <div className="text-6xl mb-4">📝</div>
        <p className="text-lg mb-4">リストがありません。先にホーム画面でフレーズを集めてください。</p>
        <button onClick={() => router.push('/')} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold">🏠 ホームに戻る</button>
      </div>
    );
  }

  const currentPhrase = phrases[selectedIdx];
  const currentDirection = currentPhrase ? getDirection(currentPhrase) : 'empty';

  const quickButtonsJpToEn = ['I主語にして', 'カジュアルに', '句動詞で', '短く', '別の言い方を3つ提案して', 'フォーマルに', '文法を説明して'];
  const quickButtonsEnToJp = ['もっと自然な日本語に', 'カタカナ語を使わないで', '別の言い方を3つ提案して', '核心の意味だけ教えて', '文法を説明して'];
  const quickButtons = currentDirection === 'en2jp' ? quickButtonsEnToJp : quickButtonsJpToEn;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-3">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <button onClick={handleGoHome} className="text-white hover:text-purple-200 font-bold text-sm">← ホームに戻る</button>
          <h1 className="font-bold text-sm">🤖 AI翻訳アシスタント — あなたのスタイルに最適化</h1>
          <div className="text-xs">{phrases.filter(p => p.japanese && p.english).length}/{phrases.length} 完了</div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto flex gap-3 p-3" style={{ height: 'calc(100vh - 60px)' }}>
        {/* Left panel - phrase list */}
        <div className="w-72 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto">
          {phrases.map((p, i) => {
            const dir = getDirection(p);
            const isDone = !!p.japanese && !!p.english;
            return (
              <div key={i}
                onClick={() => setSelectedIdx(i)}
                className={`p-3 border-b border-gray-100 cursor-pointer transition-all relative group
                  ${selectedIdx === i ? 'bg-purple-50 border-l-4 border-l-purple-500' : 'hover:bg-gray-50 border-l-4 border-l-transparent'}`}>
                <div className="text-sm font-semibold truncate">{p.japanese || p.english || '(空)'}</div>
                <div className="text-xs text-gray-500 truncate">{p.english || p.japanese || ''}</div>
                <div className="flex gap-1 mt-1">
                  {isDone && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">✅ 完了</span>}
                  {dir === 'jp2en' && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">日→英</span>}
                  {dir === 'en2jp' && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">英→日</span>}
                </div>
                {/* Delete button on hover */}
                <button onClick={(e) => { e.stopPropagation(); handleDeletePhrase(i); }}
                  className="absolute top-2 right-2 hidden group-hover:block text-gray-400 hover:text-red-500 text-lg">🗑️</button>
              </div>
            );
          })}
        </div>

        {/* Right panel - chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white p-3 rounded-t-xl">
            <div className="font-bold text-sm truncate">
              {currentPhrase?.japanese || currentPhrase?.english || 'フレーズを選択'}
              {currentDirection === 'jp2en' && ' → 英訳'}
              {currentDirection === 'en2jp' && ' → 日本語訳'}
            </div>
            {currentPhrase?.situation && <div className="text-xs opacity-80">📍 {currentPhrase.situation}</div>}
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto bg-white border-x border-gray-200 p-4 space-y-4">
            {chatMessages.map((msg, i) => {
              const isUser = msg.role === 'user';
              const { text, candidates } = parseCandidates(msg.content);

              return (
                <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] ${isUser ? 'order-2' : ''}`}>
                    <div className="text-xs font-bold mb-1" style={{ color: isUser ? '#2563eb' : '#7c3aed' }}>
                      {isUser ? '🙋 あなた' : '🤖 AI翻訳アシスタント'}
                    </div>
                    <div className={`rounded-xl p-3 text-sm leading-relaxed ${isUser ? 'bg-blue-600 text-white' : 'bg-purple-50 border border-purple-200'}`}>
                      {/* Render text without candidate lines */}
                      <div className="whitespace-pre-wrap">
                        {candidates.length > 0
                          ? text.split('\n').filter(line => !line.match(/^\d+[\.\)]\s/)).join('\n').trim()
                          : text
                        }
                      </div>
                      {/* Render clickable candidate buttons */}
                      {!isUser && candidates.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {candidates.map((c, ci) => (
                            <button key={ci} onClick={() => handleAdoptCandidate(c)}
                              className="w-full text-left p-2.5 bg-white border-2 border-purple-300 rounded-lg text-sm font-medium text-purple-800 hover:bg-purple-100 hover:border-purple-500 transition-all cursor-pointer">
                              💡 {c}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-sm text-purple-600">考え中...</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick buttons */}
          <div className="bg-white border-x border-gray-200 px-4 py-2">
            <div className="flex flex-wrap gap-1.5">
              {quickButtons.map(btn => (
                <button key={btn} onClick={() => handleQuickButton(btn)}
                  className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-medium text-purple-700 hover:bg-purple-50 transition-colors">
                  {btn}
                </button>
              ))}
            </div>
          </div>

          {/* Input + buttons */}
          <div className="bg-white border border-gray-200 rounded-b-xl p-3 flex gap-2">
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChat(chatInput); } }}
              placeholder="要望を入力..."
              className="flex-1 p-2.5 border border-gray-300 rounded-lg text-sm" style={{ fontSize: '16px' }} />
            <button onClick={() => handleChat(chatInput)} disabled={chatLoading || !chatInput.trim()}
              className="bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50">送信</button>
            <button onClick={handleAdopt}
              className="bg-green-600 text-white px-4 py-2.5 rounded-lg font-bold text-sm">✅ 採用</button>
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
