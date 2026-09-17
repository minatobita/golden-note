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
    if (updated.length === 0) {
      router.push('/');
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>;

  if (phrases.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <div className="text-6xl mb-4">📝</div>
        <p className="text-gray-500 mb-6">リストがありません。先にホーム画面でフレーズを集めてください。</p>
        <button onClick={() => router.push('/')} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">
          🏠 ホームに戻る
        </button>
      </div>
    );
  }

  const selectedPhrase = phrases[selectedIdx];
  const translatedCount = phrases.filter(p => p.japanese && p.english).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <button onClick={() => router.push('/')} className="text-blue-600 font-semibold text-sm">← ホームに戻る</button>
        <h1 className="font-bold text-sm">🤖 AI翻訳ワークショップ</h1>
        <span className="text-xs text-gray-500">{translatedCount}/{phrases.length} 完了</span>
      </div>

      <div className="flex h-[calc(100vh-52px)]">
        {/* Left panel - phrase list */}
        <div className="w-72 bg-white border-r overflow-y-auto flex-shrink-0">
          {phrases.map((p, i) => (
            <div
              key={i}
              onClick={() => setSelectedIdx(i)}
              className={`relative p-3 border-b cursor-pointer transition-colors group ${
                i === selectedIdx ? 'bg-purple-50 border-l-4 border-l-purple-500' : 'hover:bg-gray-50 border-l-4 border-l-transparent'
              }`}
            >
              <div className="pr-6">
                <p className="font-semibold text-sm truncate">{p.japanese || p.english || '（空）'}</p>
                <p className="text-xs text-gray-500 truncate">{p.english || '未翻訳'}</p>
                {p.japanese && p.english ? (
                  <span className="text-xs text-green-600 font-bold">✅ 完了</span>
                ) : (
                  <span className="text-xs text-orange-500">⏳ 未翻訳</span>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeletePhrase(i); }}
                className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>

        {/* Right panel - chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4">
            <h2 className="font-bold text-sm">🤖 AI翻訳アシスタント — あなたのスタイルに最適化</h2>
            <p className="text-xs text-purple-200 mt-1">{selectedPhrase?.japanese || selectedPhrase?.english}</p>
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.map((msg, i) => {
              const isUser = msg.role === 'user';
              const { text, candidates } = isUser ? { text: msg.content, candidates: [] } : parseCandidates(msg.content);

              return (
                <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${isUser ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200'} rounded-xl p-3 shadow-sm`}>
                    {!isUser && <p className="text-xs text-purple-600 font-bold mb-1">🤖 AI翻訳アシスタント</p>}
                    {isUser && <p className="text-xs text-blue-200 font-bold mb-1">👤 あなた</p>}
                    <div className="text-sm whitespace-pre-wrap">
                      {isUser ? msg.content : (
                        <>
                          {/* Render text, replacing numbered lines and bold with buttons */}
                          {text.split('\n').map((line, li) => {
                            // Check if this line is a numbered candidate
                            const numMatch = line.match(/^\d+[\.\)]\s*(.+)$/);
                            if (numMatch) {
                              const candidateText = numMatch[1].trim().replace(/^["']|["']$/g, '');
                              if (candidateText.length > 5 && /[a-zA-Z]/.test(candidateText)) {
                                return (
                                  <button
                                    key={li}
                                    onClick={() => handleAdoptCandidate(candidateText)}
                                    className="block w-full text-left my-1 p-2 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors text-purple-800 font-medium text-sm"
                                  >
                                    {line}
                                  </button>
                                );
                              }
                            }
                            return <p key={li}>{line}</p>;
                          })}
                          {/* Show bold candidates as buttons if no numbered ones */}
                          {candidates.length > 0 && !text.match(/^\d+[\.\)]/m) && candidates.map((c, ci) => (
                            <button
                              key={ci}
                              onClick={() => handleAdoptCandidate(c)}
                              className="block w-full text-left my-1 p-2 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors text-purple-800 font-medium text-sm"
                            >
                              💡 {c}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                  <p className="text-sm text-gray-400">🤖 考え中...</p>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick buttons + input */}
          <div className="border-t bg-white p-3">
            <div className="flex flex-wrap gap-2 mb-3">
              {['I主語にして', 'カジュアルに', '句動詞で', '短く', '別の言い方を3つ提案して', 'フォーマルに', '文法を説明して'].map(btn => (
                <button
                  key={btn}
                  onClick={() => handleQuickButton(btn)}
                  className="px-3 py-1.5 border-2 border-purple-400 text-purple-600 rounded-full text-xs font-bold hover:bg-purple-50 transition-colors"
                >
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
                className="flex-1 p-3 border border-gray-300 rounded-lg text-sm"
                style={{ fontSize: '16px' }}
              />
              <button onClick={() => handleChat(chatInput)} disabled={chatLoading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm disabled:opacity-50">
                送信
              </button>
              <button onClick={handleAdopt}
                className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm">
                ✅ 採用
              </button>
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
