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
    setChatMessages(prev => [...prev, { role: 'assistant', content: `✅ 「${candidate}」を採用しました！` }]);
  };

  const handleAdopt = async () => {
    const assistantMsgs = chatMessages.filter(m => m.role === 'assistant');
    if (assistantMsgs.length === 0) return;
    
    const lastMsg = assistantMsgs[assistantMsgs.length - 1].content;
    const { candidates } = parseCandidates(lastMsg);
    
    let adopted = '';
    if (candidates.length > 0) {
      adopted = candidates[0];
    } else {
      const boldMatch = lastMsg.match(/\*\*(.+?)\*\*/);
      const numberedMatch = lastMsg.match(/\d+[\.\)]\s*(.+)/);
      if (boldMatch) adopted = boldMatch[1];
      else if (numberedMatch) adopted = numberedMatch[1];
      else adopted = lastMsg.split('\n').filter(l => l.trim()).pop() || '';
    }

    if (!adopted || adopted.includes('採用しました') || adopted.includes('エラー')) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: '採用する候補が見つかりません。候補をクリックするか、新しい翻訳をリクエストしてください。' }]);
      return;
    }

    adopted = adopted.replace(/^["'「」『』]+|["'「」『』]+$/g, '').trim();
    await handleAdoptCandidate(adopted);
  };

  const handleDeletePhrase = async (idx: number) => {
    if (!confirm('このフレーズを削除しますか？')) return;
    const updated = phrases.filter((_, i) => i !== idx);
    setPhrases(updated);
    await saveAll(updated);
    if (selectedIdx >= updated.length) {
      setSelectedIdx(Math.max(0, updated.length - 1));
    }
  };

  const handleGoHome = async () => {
    await saveAll(phrases);
    router.push('/');
  };

  // Render message with clickable candidates
  const renderMessage = (content: string, role: string) => {
    if (role !== 'assistant') {
      return <p className="whitespace-pre-wrap">{content}</p>;
    }

    const { text, candidates } = parseCandidates(content);

    // Split text into lines for rendering
    const lines = text.split('\n');
    const renderedLines: JSX.Element[] = [];
    const candidateLines = new Set<number>();

    // Find which lines are candidate lines
    lines.forEach((line, i) => {
      if (/^\d+[\.\)]\s*.+/.test(line)) {
        candidateLines.add(i);
      }
    });

    let candidateIdx = 0;
    lines.forEach((line, i) => {
      if (candidateLines.has(i) && candidateIdx < candidates.length) {
        const candidate = candidates[candidateIdx];
        renderedLines.push(
          <button
            key={i}
            onClick={() => handleAdoptCandidate(candidate)}
            className="block w-full text-left my-2 p-3 bg-purple-50 hover:bg-purple-100 border-2 border-purple-300 hover:border-purple-500 rounded-xl transition-all cursor-pointer group"
          >
            <span className="text-purple-700 font-semibold">{candidateIdx + 1}. </span>
            <span className="text-gray-900 font-medium">{candidate}</span>
            <span className="text-purple-500 text-xs ml-2 opacity-0 group-hover:opacity-100 transition-opacity">← クリックで採用</span>
          </button>
        );
        candidateIdx++;
      } else if (line.trim()) {
        renderedLines.push(<p key={i} className="whitespace-pre-wrap my-1">{line}</p>);
      } else {
        renderedLines.push(<br key={i} />);
      }
    });

    return <div>{renderedLines}</div>;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  if (phrases.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-6xl mb-4">📝</div>
        <p className="text-gray-500 text-lg mb-4">リストがありません。先にホーム画面でフレーズを集めてください。</p>
        <button onClick={() => router.push('/')} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">🏠 ホームに戻る</button>
      </div>
    );
  }

  const currentPhrase = phrases[selectedIdx];
  const direction = currentPhrase ? getDirection(currentPhrase) : 'empty';
  const quickButtons = direction === 'en2jp'
    ? ['もっと自然な日本語に', 'カタカナを使わないで', '漢語で', '別の言い方を3つ', '文法を説明して']
    : ['I主語にして', 'カジュアルに', '句動詞で', '短く', '別の言い方を3つ', 'フォーマルに', '文法を説明して'];

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-3 flex justify-between items-center">
        <button onClick={handleGoHome} className="text-white hover:text-purple-200 font-semibold text-sm">← ホームに戻る</button>
        <div className="text-sm font-bold">🤖 AI翻訳アシスタント — あなたのスタイルに最適化</div>
        <div className="text-xs">{phrases.filter(p => p.japanese && p.english).length}/{phrases.length} 完了</div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Phrase list */}
        <div className="w-72 border-r border-gray-200 overflow-y-auto bg-white flex-shrink-0">
          {phrases.map((p, i) => {
            const dir = getDirection(p);
            const isDone = dir === 'both';
            return (
              <div
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={`p-3 border-b border-gray-100 cursor-pointer transition-all relative group ${
                  i === selectedIdx ? 'bg-purple-50 border-l-4 border-l-purple-500' : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                } ${isDone ? 'opacity-70' : ''}`}
              >
                <div className="text-sm font-semibold truncate">{p.japanese || p.english || '(空)'}</div>
                <div className="text-xs text-gray-500 truncate">{p.english || p.japanese || ''}</div>
                <div className="flex items-center gap-1 mt-1">
                  {isDone ? (
                    <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">✅ 完了</span>
                  ) : dir === 'jp2en' ? (
                    <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">日→英</span>
                  ) : dir === 'en2jp' ? (
                    <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">英→日</span>
                  ) : null}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeletePhrase(i); }}
                  className="absolute right-2 top-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >🗑️</button>
              </div>
            );
          })}
        </div>

        {/* Right: Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white p-3">
            <div className="font-bold text-sm truncate">
              {currentPhrase?.japanese || currentPhrase?.english || 'フレーズを選択'}
              {currentPhrase?.situation && <span className="text-purple-200 text-xs ml-2">📍 {currentPhrase.situation}</span>}
            </div>
          </div>

          {/* Chat body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? '' : ''}`}>
                  <div className={`text-xs font-bold mb-1 ${msg.role === 'user' ? 'text-blue-600 text-right' : 'text-purple-600'}`}>
                    {msg.role === 'user' ? '🧑 あなた' : '🤖 AI翻訳アシスタント'}
                  </div>
                  <div className={`rounded-xl p-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-purple-200'
                  }`}>
                    {renderMessage(msg.content, msg.role)}
                  </div>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-purple-200 rounded-xl p-3 text-sm text-gray-400">考え中...</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick buttons */}
          <div className="bg-white border-t border-gray-200 px-3 pt-2">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {quickButtons.map(btn => (
                <button key={btn} onClick={() => handleQuickButton(btn)}
                  className="px-3 py-1.5 text-xs border-2 border-purple-300 text-purple-600 rounded-full hover:bg-purple-50 font-semibold transition-colors">
                  {btn}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="bg-white border-t border-gray-200 p-3 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChat(chatInput); } }}
              placeholder="要望を入力..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
