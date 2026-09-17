'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
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
  const [phrases, setPhrases] = useState<CollectPhrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  // Save back to localStorage whenever phrases change
  useEffect(() => {
    if (phrases.length > 0) {
      localStorage.setItem('golden-note-collect', JSON.stringify(phrases));
    }
  }, [phrases]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // When selecting a phrase, start chat
  useEffect(() => {
    if (phrases.length === 0) return;
    const p = phrases[selectedIdx];
    if (!p) return;
    const initialMsg: { role: string; content: string }[] = [];
    if (p.japanese && !p.english) {
      initialMsg.push({
        role: 'assistant',
        content: `「${p.japanese}」の英訳を考えましょう。${p.situation ? `\n📍 状況: ${p.situation}` : ''}\n\nあなたのスタイル（I主語・カジュアル・句動詞）に合わせて提案します。少々お待ちください...`,
      });
      setChatMessages(initialMsg);
      autoTranslate(p);
    } else if (p.english && !p.japanese) {
      initialMsg.push({
        role: 'assistant',
        content: `「${p.english}」の日本語訳を考えましょう。少々お待ちください...`,
      });
      setChatMessages(initialMsg);
      autoTranslateReverse(p);
    } else if (p.japanese && p.english) {
      initialMsg.push({
        role: 'assistant',
        content: `「${p.japanese}」\n現在の英訳: ${p.english}\n\nこの翻訳を調整しますか？クイックボタンを使うか、自由にリクエストしてください。`,
      });
      setChatMessages(initialMsg);
    } else {
      setChatMessages([{ role: 'assistant', content: 'フレーズを入力してから翻訳を始めましょう。' }]);
    }
  }, [selectedIdx]);

  const autoTranslate = async (p: CollectPhrase) => {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ japanese: p.japanese, situation: p.situation }),
      });
      const data = await res.json();
      if (data.english) {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `提案:\n\n**${data.english}**\n\nこれでよければ ✅採用 を押してください。調整したい場合はクイックボタンか自由入力でリクエストしてください。`,
        }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: '翻訳エラーが発生しました。もう一度試してください。' }]);
    }
  };

  const autoTranslateReverse = async (p: CollectPhrase) => {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ english: p.english }),
      });
      const data = await res.json();
      if (data.japanese) {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `提案:\n\n**${data.japanese}**\n\nこれでよければ ✅採用 を押してください。`,
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
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
          phrase: p.japanese || p.english,
          situation: p.situation,
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
      const candidate = match[1].trim().replace(/^["']|["']$/g, '');
      if (candidate.length > 5 && /[a-zA-Z]/.test(candidate)) {
        candidates.push(candidate);
      }
    }

    // Extract bold candidates: **some text**
    const boldRegex = /\*\*(.+?)\*\*/g;
    while ((match = boldRegex.exec(content)) !== null) {
      const candidate = match[1].trim().replace(/^["']|["']$/g, '');
      if (candidate.length > 5 && /[a-zA-Z]/.test(candidate) && !candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }

    // Remove ** markers from display text
    cleanText = content.replace(/\*\*(.+?)\*\*/g, '$1');

    return { text: cleanText, candidates };
  };

  const handleAdoptCandidate = (candidate: string) => {
    const updated = [...phrases];
    const p = updated[selectedIdx];
    if (p.japanese && !p.english) {
      updated[selectedIdx] = { ...p, english: candidate };
    } else if (!p.japanese && p.english) {
      updated[selectedIdx] = { ...p, japanese: candidate };
    } else {
      updated[selectedIdx] = { ...p, english: candidate };
    }
    setPhrases(updated);
    setChatMessages(prev => [...prev, { role: 'assistant', content: `✅ 「${candidate}」を採用しました！` }]);
  };

  const handleAdopt = () => {
    // Find the last English text in assistant messages
    const assistantMsgs = chatMessages.filter(m => m.role === 'assistant');
    if (assistantMsgs.length === 0) return;
    
    const lastMsg = assistantMsgs[assistantMsgs.length - 1].content;
    const { candidates } = parseCandidates(lastMsg);
    
    let adopted = '';
    if (candidates.length > 0) {
      adopted = candidates[0];
    } else {
      // Fallback: extract from bold or use first line
      const boldMatch = lastMsg.match(/\*\*(.+?)\*\*/);
      const numberedMatch = lastMsg.match(/\d+[\.\)]\s*(.+)/);
      if (boldMatch) adopted = boldMatch[1];
      else if (numberedMatch) adopted = numberedMatch[1];
      else adopted = lastMsg.substring(0, 200);
    }

    if (!adopted) return;
    handleAdoptCandidate(adopted.replace(/^["']|["']$/g, ''));
  };

  const handleDeletePhrase = (idx: number) => {
    if (!confirm('このフレーズを削除しますか？')) return;
    const updated = phrases.filter((_, i) => i !== idx);
    setPhrases(updated);
    localStorage.setItem('golden-note-collect', JSON.stringify(updated));
    if (selectedIdx >= updated.length) {
      setSelectedIdx(Math.max(0, updated.length - 1));
    }
  };

  // Render message with clickable candidates
  const renderMessage = (content: string) => {
    const { text, candidates } = parseCandidates(content);

    // Split text into lines for rendering
    const lines = text.split('\n');

    return (
      <div>
        {lines.map((line, i) => {
          // Check if this line is a numbered candidate
          const numMatch = line.match(/^\d+[\.\)]\s*(.+)$/);
          if (numMatch) {
            const candidateText = numMatch[1].trim().replace(/^["']|["']$/g, '');
            if (candidateText.length > 5 && /[a-zA-Z]/.test(candidateText)) {
              return (
                <div key={i} className="my-1">
                  <button
                    onClick={() => handleAdoptCandidate(candidateText)}
                    className="text-left w-full px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors text-sm"
                  >
                    <span className="text-purple-600 font-semibold">{line.match(/^\d+[\.\)]/)?.[0]} </span>
                    <span className="text-gray-800">{candidateText}</span>
                    <span className="ml-2 text-xs text-purple-400">← タップで採用</span>
                  </button>
                </div>
              );
            }
          }

          // Check for bold text that's a candidate
          if (line.includes('**') || line.includes('__')) {
            // Already cleaned, check if the cleaned version has a candidate
          }

          return <p key={i} className={`${line === '' ? 'h-2' : ''}`}>{line}</p>;
        })}

        {/* Show standalone candidate buttons for bold-extracted ones not in numbered list */}
        {candidates.filter(c => !text.includes(`1.`) && !text.includes(`1)`)).length > 0 && 
         !text.match(/^\d+[\.\)]/m) && candidates.length > 0 && (
          <div className="mt-2 space-y-1">
            {candidates.map((c, i) => (
              <button
                key={i}
                onClick={() => handleAdoptCandidate(c)}
                className="block w-full text-left px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors text-sm"
              >
                💡 <span className="text-gray-800">{c}</span>
                <span className="ml-2 text-xs text-purple-400">← タップで採用</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>;

  if (phrases.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <div className="text-6xl mb-4">📝</div>
        <p className="text-gray-500 mb-4">リストがありません。先にホーム画面でフレーズを集めてください。</p>
        <button onClick={() => router.push('/')} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold">🏠 ホームに戻る</button>
      </div>
    );
  }

  const currentPhrase = phrases[selectedIdx];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <button onClick={() => router.push('/')} className="text-blue-600 font-semibold text-sm">← ホームに戻る</button>
        <span className="text-sm text-gray-500">
          {phrases.filter(p => p.english).length} / {phrases.length} 翻訳完了
        </span>
      </div>

      <div className="flex h-[calc(100vh-50px)]">
        {/* Left: Phrase list */}
        <div className="w-72 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
          {phrases.map((p, i) => (
            <div key={i}
              onClick={() => setSelectedIdx(i)}
              className={`p-3 border-b border-gray-100 cursor-pointer transition-colors relative group
                ${i === selectedIdx ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'hover:bg-gray-50 border-l-4 border-l-transparent'}`}
            >
              <div className="font-semibold text-sm truncate">{p.japanese || p.english || '（空）'}</div>
              <div className="text-xs text-gray-500 truncate">{p.english || '未翻訳'}</div>
              {p.english && <span className="text-xs text-green-600">✅ 完了</span>}
              {/* Delete button */}
              <button
                onClick={(e) => { e.stopPropagation(); handleDeletePhrase(i); }}
                className="absolute right-2 top-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >🗑️</button>
            </div>
          ))}
        </div>

        {/* Right: Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-3">
            <div className="font-bold text-sm">🤖 AI翻訳アシスタント — あなたのスタイルに最適化</div>
            <div className="text-xs text-purple-200 truncate">{currentPhrase?.japanese || currentPhrase?.english}</div>
          </div>

          {/* Chat body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${m.role === 'user' ? 'bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2' : ''}`}>
                  {m.role === 'assistant' ? (
                    <div>
                      <div className="text-xs text-purple-600 font-bold mb-1">🤖 AI翻訳アシスタント</div>
                      <div className="bg-purple-50 border border-purple-200 rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed">
                        {renderMessage(m.content)}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-xs text-blue-200 font-bold mb-1">👤 あなた</div>
                      <div className="text-sm">{m.content}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3 text-sm text-gray-500">
                  考え中...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick buttons */}
          <div className="px-4 py-2 border-t border-gray-200 bg-white">
            <div className="flex gap-2 flex-wrap mb-2">
              {['I主語にして', 'カジュアルに', '句動詞で', '短く', '別の言い方', 'フォーマルに', '文法を説明して'].map(btn => (
                <button key={btn} onClick={() => handleQuickButton(btn)}
                  className="px-3 py-1.5 border border-purple-300 rounded-full text-xs font-semibold text-purple-600 hover:bg-purple-50 transition-colors">
                  {btn}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleChat(chatInput)}
                placeholder="要望を入力..."
                className="flex-1 p-2.5 border border-gray-300 rounded-lg text-sm"
                style={{ fontSize: '16px' }}
              />
              <button onClick={() => handleChat(chatInput)} disabled={chatLoading}
                className="bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50">送信</button>
              <button onClick={handleAdopt}
                className="bg-green-600 text-white px-4 py-2.5 rounded-lg font-bold text-sm">✅ 採用</button>
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
