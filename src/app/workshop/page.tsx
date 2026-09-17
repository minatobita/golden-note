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

  const autoTranslateEnToJp = async (p: CollectPhrase) => {
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
          messages: newMessages.slice(-20).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
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
      else adopted = lastMsg.substring(0, 200);
    }

    if (!adopted) return;
    await handleAdoptCandidate(adopted.replace(/^["'「」『』]+|["'「」『』]+$/g, ''));
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
    // Save current state to Firestore before going home
    await saveAll(phrases);
    router.push('/');
  };

  // Render message with clickable candidates
  const renderMessage = (content: string, isAssistant: boolean) => {
    if (!isAssistant) return <span>{content}</span>;

    const { text, candidates } = parseCandidates(content);

    // Remove the candidate lines from the display text
    let displayText = text;
    candidates.forEach(c => {
      // Remove numbered lines
      displayText = displayText.replace(new RegExp(`^\\d+[\\.)\\s]*${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gm'), '');
    });

    // Clean up extra blank lines
    displayText = displayText.replace(/\n{3,}/g, '\n\n').trim();

    return (
      <div>
        {displayText && <div className="whitespace-pre-wrap mb-2">{displayText}</div>}
        {candidates.length > 0 && (
          <div className="space-y-2 mt-2">
            {candidates.map((candidate, i) => (
              <button
                key={i}
                onClick={() => handleAdoptCandidate(candidate)}
                className="block w-full text-left px-4 py-3 bg-white border-2 border-purple-300 rounded-xl hover:bg-purple-50 hover:border-purple-500 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-purple-500 font-bold text-sm">💡</span>
                  <span className="text-sm font-medium text-gray-800">{candidate}</span>
                </div>
                <span className="text-xs text-purple-400 ml-6">← クリックで採用</span>
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
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-6xl mb-4">📝</div>
        <p className="text-gray-500 mb-4">リストがありません。先にホーム画面でフレーズを集めてください。</p>
        <button onClick={() => router.push('/')} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">
          🏠 ホームに戻る
        </button>
      </div>
    );
  }

  const currentPhrase = phrases[selectedIdx];
  const direction = currentPhrase ? getDirection(currentPhrase) : 'empty';

  // Quick buttons based on direction
  const quickButtons = direction === 'en2jp'
    ? ['もっと自然な日本語に', 'カタカナを使わないで', '核心の意味だけ', '別の訳し方を3つ提案して', '例文を見せて', '文法を説明して']
    : ['I主語にして', 'カジュアルに', '句動詞で', '短く', '別の言い方を3つ提案して', 'フォーマルに', '文法を説明して'];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-3">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <button onClick={handleGoHome} className="text-white text-sm hover:underline mb-1">← ホームに戻る</button>
            <h1 className="text-sm font-bold">🤖 AI翻訳アシスタント — あなたのスタイルに最適化</h1>
            {currentPhrase && (
              <p className="text-xs text-purple-200 mt-1">
                {currentPhrase.japanese || currentPhrase.english}
                {direction === 'jp2en' && ' → 英訳'}
                {direction === 'en2jp' && ' → 和訳'}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 flex gap-4" style={{ height: 'calc(100vh - 80px)' }}>
        {/* Left panel - phrase list */}
        <div className="w-72 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto shadow-sm">
          {phrases.map((p, i) => {
            const dir = getDirection(p);
            const isDone = dir === 'both';
            return (
              <div
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={`p-3 border-b border-gray-100 cursor-pointer transition-all relative group
                  ${selectedIdx === i ? 'bg-purple-50 border-l-4 border-l-purple-500' : 'hover:bg-gray-50 border-l-4 border-l-transparent'}
                  ${isDone ? 'opacity-70' : ''}`}
              >
                <p className="text-sm font-semibold truncate">{p.japanese || p.english || '（空）'}</p>
                <p className="text-xs text-gray-500 truncate">{p.english || p.japanese || ''}</p>
                <div className="flex gap-1 mt-1">
                  {isDone && <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded">✅ 完了</span>}
                  {dir === 'jp2en' && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">日→英</span>}
                  {dir === 'en2jp' && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">英→日</span>}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeletePhrase(i); }}
                  className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >🗑️</button>
              </div>
            );
          })}
        </div>

        {/* Right panel - chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white p-3 rounded-t-xl font-bold text-sm">
            🤖 AI翻訳アシスタント — あなたのスタイルに最適化
          </div>

          {/* Chat body */}
          <div className="flex-1 bg-white border-l border-r border-gray-200 overflow-y-auto p-4">
            {chatMessages.map((m, i) => (
              <div key={i} className={`mb-4 ${m.role === 'user' ? 'flex justify-end' : ''}`}>
                {m.role === 'assistant' && <div className="text-xs font-bold text-purple-500 mb-1">🤖 AI翻訳アシスタント</div>}
                {m.role === 'user' && <div className="text-xs font-bold text-blue-500 mb-1 text-right">👤 あなた</div>}
                <div className={`rounded-xl p-3 max-w-lg ${m.role === 'assistant' ? 'bg-purple-50 border border-purple-200' : 'bg-blue-600 text-white ml-auto'}`}>
                  {renderMessage(m.content, m.role === 'assistant')}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="mb-4">
                <div className="text-xs font-bold text-purple-500 mb-1">🤖 AI翻訳アシスタント</div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 max-w-lg">考え中...</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick buttons */}
          <div className="bg-white border-l border-r border-gray-200 px-4 py-2">
            <div className="flex gap-2 flex-wrap">
              {quickButtons.map((btn, i) => (
                <button key={i} onClick={() => handleQuickButton(btn)}
                  className="px-3 py-1.5 border-2 border-purple-400 rounded-full text-purple-600 text-xs font-semibold hover:bg-purple-50 transition-colors">
                  {btn}
                </button>
              ))}
            </div>
          </div>

          {/* Chat input */}
          <div className="bg-white border border-gray-200 rounded-b-xl p-3 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleChat(chatInput)}
              placeholder="要望を入力..."
              className="flex-1 p-2 border border-gray-300 rounded-lg text-sm"
              style={{ fontSize: '16px' }}
            />
            <button onClick={() => handleChat(chatInput)} disabled={chatLoading}
              className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50">送信</button>
            <button onClick={handleAdopt}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold">✅ 採用</button>
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
