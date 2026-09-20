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

  // Mobile: show/hide phrase list
  const [showPhraseList, setShowPhraseList] = useState(true);

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
    setChatMessages(prev => [...prev, { role: 'assistant', content: `✅ 「${candidate}」を採用しました！` }]);
  };

  const handleAdopt = async () => {
    const p = phrases[selectedIdx];
    const direction = getDirection(p);
    const lastAssistant = [...chatMessages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return;

    const { candidates } = parseCandidates(lastAssistant.content);
    if (candidates.length > 0) {
      await handleAdoptCandidate(candidates[0]);
    }
  };

  const handleDeletePhrase = async (idx: number) => {
    if (!confirm('このフレーズを削除しますか？')) return;
    const updated = phrases.filter((_, i) => i !== idx);
    setPhrases(updated);
    await saveAll(updated);
    if (selectedIdx >= updated.length) setSelectedIdx(Math.max(0, updated.length - 1));
  };

  const handleGoHome = async () => {
    await saveAll(phrases);
    router.push('/');
  };

  // Mobile: select phrase and hide list
  const handleSelectPhrase = (idx: number) => {
    setSelectedIdx(idx);
    setShowPhraseList(false); // Hide list on mobile
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>;

  if (phrases.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-6xl mb-4">📄</p>
        <p className="text-gray-500 mb-4">リストがありません。先にホーム画面でフレーズを集めてください。</p>
        <button onClick={() => router.push('/')} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold">🏠 ホームに戻る</button>
      </div>
    );
  }

  const currentDirection = phrases[selectedIdx] ? getDirection(phrases[selectedIdx]) : 'empty';
  const quickButtons = currentDirection === 'en2jp'
    ? ['もっと自然な日本語に', 'カタカナを使わないで', '別の言い方を3つ提案して', '短く', '文法を説明して']
    : ['I主語にして', 'カジュアルに', '句動詞で', '短く', '別の言い方を3つ提案して', 'フォーマルに', '文法を説明して'];

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 flex items-center justify-between flex-shrink-0">
        <button onClick={handleGoHome} className="text-sm font-bold hover:underline">← ホームに戻る</button>
        <span className="text-sm font-bold">🤖 AI翻訳アシスタント — あなたのスタイルに最適化</span>
        {/* Mobile: toggle phrase list */}
        <button
          onClick={() => setShowPhraseList(!showPhraseList)}
          className="md:hidden text-sm font-bold bg-white/20 px-2 py-1 rounded"
        >
          {showPhraseList ? '💬 チャット' : '📋 一覧'}
        </button>
        <span className="hidden md:inline text-xs opacity-80">{phrases.filter(p => p.japanese && p.english).length}/{phrases.length} 完了</span>
      </div>

      {/* Current phrase on mobile */}
      {!showPhraseList && phrases[selectedIdx] && (
        <div className="md:hidden bg-purple-50 px-4 py-2 text-sm border-b border-purple-200 flex-shrink-0">
          <span className="font-bold">{phrases[selectedIdx].japanese || phrases[selectedIdx].english}</span>
          {currentDirection === 'jp2en' && <span className="text-purple-500 ml-2">日→英</span>}
          {currentDirection === 'en2jp' && <span className="text-purple-500 ml-2">英→日</span>}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Phrase list */}
        <div className={`${showPhraseList ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-72 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto`}>
          {phrases.map((p, i) => {
            const dir = getDirection(p);
            const isDone = dir === 'both';
            return (
              <div
                key={i}
                className={`p-3 border-b border-gray-100 cursor-pointer transition-colors border-l-4 group ${
                  selectedIdx === i ? 'bg-blue-50 border-l-blue-600' : 'border-l-transparent hover:bg-gray-50'
                } ${isDone ? 'opacity-70' : ''}`}
                onClick={() => handleSelectPhrase(i)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{p.japanese || p.english || '（空）'}</p>
                    <p className="text-xs text-gray-500 truncate">{p.english || p.japanese || ''}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeletePhrase(i); }}
                    className="text-gray-300 hover:text-red-500 text-sm ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >🗑️</button>
                </div>
                <div className="mt-1">
                  {isDone && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">✅ 完了</span>}
                  {dir === 'jp2en' && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">日→英</span>}
                  {dir === 'en2jp' && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">英→日</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Chat */}
        <div className={`${showPhraseList ? 'hidden' : 'flex'} md:flex flex-col flex-1 min-w-0`}>
          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.map((msg, i) => {
              const isUser = msg.role === 'user';
              const { text, candidates } = isUser ? { text: msg.content, candidates: [] } : parseCandidates(msg.content);

              return (
                <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] ${isUser ? 'bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-3' : ''}`}>
                    {!isUser && (
                      <div>
                        <p className="text-xs font-bold text-purple-600 mb-1">🤖 AI翻訳アシスタント</p>
                        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
                          {/* Render text without candidate lines */}
                          {text.split('\n').map((line, li) => {
                            const isCandidateLine = /^\d+[\.\)]\s/.test(line);
                            if (isCandidateLine) return null;
                            return <p key={li} className="text-sm leading-relaxed">{line}</p>;
                          })}
                          {/* Render candidates as buttons */}
                          {candidates.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {candidates.map((c, ci) => (
                                <button
                                  key={ci}
                                  onClick={() => handleAdoptCandidate(c)}
                                  className="w-full text-left px-4 py-3 bg-white border-2 border-purple-300 rounded-lg text-sm font-medium text-purple-800 hover:bg-purple-100 hover:border-purple-500 transition-colors"
                                >
                                  💡 {c}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {isUser && (
                      <div>
                        <p className="text-xs font-bold mb-1 opacity-80">🧑 あなた</p>
                        <p className="text-sm">{msg.content}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
                  <p className="text-sm text-purple-600 animate-pulse">考え中...</p>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick buttons */}
          <div className="px-3 py-2 border-t border-gray-100 flex gap-2 flex-wrap bg-white flex-shrink-0">
            {quickButtons.map((btn, i) => (
              <button
                key={i}
                onClick={() => handleQuickButton(btn)}
                className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-semibold text-purple-700 hover:bg-purple-50 transition-colors whitespace-nowrap"
              >
                {btn}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-gray-200 flex gap-2 bg-white flex-shrink-0">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleChat(chatInput)}
              placeholder="要望を入力..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm"
              style={{ fontSize: '16px' }}
            />
            <button onClick={() => handleChat(chatInput)} disabled={chatLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm disabled:opacity-50">送信</button>
            <button onClick={handleAdopt}
              className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm">✅ 採用</button>
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
