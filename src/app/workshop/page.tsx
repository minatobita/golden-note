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
      content: `✅ 採用しました！${direction === 'en2jp' ? `日本語訳: ${candidate}` : `英訳: ${candidate}`}`,
    }]);
  };

  const handleAdoptLatest = async () => {
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

    if (updated.length === 0) {
      setChatMessages([{ role: 'assistant', content: 'すべてのフレーズが削除されました。ホームに戻ってフレーズを追加してください。' }]);
    } else if (selectedIdx >= updated.length) {
      setSelectedIdx(updated.length - 1);
    }
  };

  const handleGoHome = async () => {
    // Save current state to Firestore before leaving
    await saveAll(phrases);
    router.push('/');
  };

  const currentPhrase = phrases[selectedIdx];
  const direction = currentPhrase ? getDirection(currentPhrase) : 'empty';

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>;

  if (phrases.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-6xl mb-4">📝</div>
        <p className="text-gray-500 mb-4 text-center">リストがありません。先にホーム画面でフレーズを集めてください。</p>
        <button onClick={() => router.push('/')} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold">🏠 ホームに戻る</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-3">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <button onClick={handleGoHome} className="text-white hover:text-purple-200 text-sm font-bold">← ホームに戻る</button>
          <h1 className="text-sm font-bold">🤖 AI翻訳アシスタント — あなたのスタイルに最適化</h1>
          <span className="text-xs">{phrases.filter(p => p.japanese && p.english).length}/{phrases.length} 完了</span>
        </div>
        {currentPhrase && (
          <p className="text-center text-xs text-purple-200 mt-1">
            {currentPhrase.japanese || currentPhrase.english}
            {direction === 'jp2en' && ' → 英訳'}
            {direction === 'en2jp' && ' → 日本語訳'}
          </p>
        )}
      </div>

      <div className="flex max-w-6xl mx-auto" style={{ height: 'calc(100vh - 80px)' }}>
        {/* Left: Phrase list */}
        <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
          {phrases.map((p, i) => {
            const d = getDirection(p);
            const isDone = p.japanese && p.english;
            return (
              <div key={i} onClick={() => setSelectedIdx(i)}
                className={`p-3 border-b border-gray-100 cursor-pointer transition-colors relative group
                  ${i === selectedIdx ? 'bg-purple-100 border-l-4 border-l-purple-600' : 'hover:bg-gray-50 border-l-4 border-l-transparent'}`}>
                <div className="text-sm font-semibold truncate">{p.japanese || p.english || '(空)'}</div>
                <div className="text-xs text-gray-500 truncate">{p.english || p.japanese || ''}</div>
                <div className="flex items-center gap-1 mt-1">
                  {isDone && <span className="text-xs bg-green-100 text-green-700 px-1 rounded">✅ 完了</span>}
                  {d === 'jp2en' && <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded">日→英</span>}
                  {d === 'en2jp' && <span className="text-xs bg-orange-100 text-orange-700 px-1 rounded">英→日</span>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDeletePhrase(i); }}
                  className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-sm">🗑️</button>
              </div>
            );
          })}
        </div>

        {/* Right: Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.map((m, i) => {
              const isUser = m.role === 'user';
              const { text, candidates } = parseCandidates(m.content);

              return (
                <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-lg ${isUser ? '' : ''}`}>
                    <div className="text-xs font-bold mb-1" style={{ color: isUser ? '#3B82F6' : '#7C3AED' }}>
                      {isUser ? '👤 あなた' : '🤖 AI翻訳アシスタント'}
                    </div>
                    <div className={`rounded-xl p-3 text-sm leading-relaxed ${isUser ? 'bg-blue-600 text-white' : 'bg-purple-50 border border-purple-200'}`}>
                      {/* Render text without numbered lines that are candidates */}
                      {text.split('\n').map((line, j) => {
                        const isCandidate = /^\d+[\.\)]\s/.test(line);
                        if (isCandidate) return null;
                        return <p key={j} className={j > 0 ? 'mt-1' : ''}>{line}</p>;
                      })}

                      {/* Render candidates as clickable buttons */}
                      {!isUser && candidates.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {candidates.map((c, j) => (
                            <button key={j} onClick={() => handleAdoptCandidate(c)}
                              className="block w-full text-left p-3 bg-white border-2 border-purple-300 rounded-lg hover:bg-purple-100 hover:border-purple-500 transition-colors text-sm font-medium text-purple-800">
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
          <div className="px-4 pt-2">
            <div className="flex gap-2 flex-wrap">
              {direction === 'en2jp' ? (
                <>
                  <button onClick={() => handleQuickButton('もっと自然な日本語にして')} className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-semibold text-purple-700 hover:bg-purple-50">自然な日本語に</button>
                  <button onClick={() => handleQuickButton('もっと簡潔に')} className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-semibold text-purple-700 hover:bg-purple-50">簡潔に</button>
                  <button onClick={() => handleQuickButton('別の日本語訳を3つ提案して')} className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-semibold text-purple-700 hover:bg-purple-50">別の言い方を3つ提案して</button>
                  <button onClick={() => handleQuickButton('この英語のニュアンスを教えて')} className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-semibold text-purple-700 hover:bg-purple-50">ニュアンスを教えて</button>
                  <button onClick={() => handleQuickButton('文法を説明して')} className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-semibold text-purple-700 hover:bg-purple-50">文法を説明して</button>
                </>
              ) : (
                <>
                  <button onClick={() => handleQuickButton('I主語にして')} className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-semibold text-purple-700 hover:bg-purple-50">I主語にして</button>
                  <button onClick={() => handleQuickButton('カジュアルに')} className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-semibold text-purple-700 hover:bg-purple-50">カジュアルに</button>
                  <button onClick={() => handleQuickButton('句動詞で')} className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-semibold text-purple-700 hover:bg-purple-50">句動詞で</button>
                  <button onClick={() => handleQuickButton('短く')} className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-semibold text-purple-700 hover:bg-purple-50">短く</button>
                  <button onClick={() => handleQuickButton('別の言い方を3つ提案して')} className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-semibold text-purple-700 hover:bg-purple-50">別の言い方を3つ提案して</button>
                  <button onClick={() => handleQuickButton('フォーマルに')} className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-semibold text-purple-700 hover:bg-purple-50">フォーマルに</button>
                  <button onClick={() => handleQuickButton('文法を説明して')} className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-semibold text-purple-700 hover:bg-purple-50">文法を説明して</button>
                </>
              )}
            </div>
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-200 bg-white">
            <div className="flex gap-2">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChat(chatInput); } }}
                placeholder="要望を入力..."
                className="flex-1 p-3 border border-gray-300 rounded-lg text-sm" style={{ fontSize: '16px' }} />
              <button onClick={() => handleChat(chatInput)} disabled={chatLoading || !chatInput.trim()}
                className="bg-blue-600 text-white px-4 py-3 rounded-lg font-bold text-sm disabled:opacity-50">送信</button>
              <button onClick={handleAdoptLatest}
                className="bg-green-600 text-white px-4 py-3 rounded-lg font-bold text-sm">✅ 採用</button>
            </div>
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
