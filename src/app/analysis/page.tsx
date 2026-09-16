'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { getPhrases } from '@/lib/db';
import Navbar from '@/components/Navbar';

export default function AnalysisPage() {
  const { user } = useAuth();
  const [phrases, setPhrases] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => { setPhrases(await getPhrases(user.uid)); })();
  }, [user]);

  const translated = phrases.filter(p => p.english && p.japanese);
  const untranslated = phrases.filter(p => !p.english);
  const iSubjectCount = translated.filter(p => /^I\s/i.test(p.english?.trim() || '')).length;
  const casualWords = ['pretty', 'super', 'really', 'gonna', 'wanna', 'kinda', 'gotta'];
  const casualCount = translated.filter(p => casualWords.some(w => (p.english || '').toLowerCase().includes(w))).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
      <h1 className="text-2xl font-bold mb-4">📊 スタイル分析</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-bold mb-3">📈 あなたのデータ</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{phrases.length}</p>
            <p className="text-xs text-gray-500">総フレーズ</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{translated.length}</p>
            <p className="text-xs text-gray-500">翻訳済み</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-orange-600">{untranslated.length}</p>
            <p className="text-xs text-gray-500">未翻訳</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-bold mb-3">🎯 好みのスタイル</h2>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm">I主語率</span>
            <span className="font-bold text-blue-600">{translated.length > 0 ? Math.round((iSubjectCount / translated.length) * 100) : 0}%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">カジュアル表現率</span>
            <span className="font-bold text-purple-600">{translated.length > 0 ? Math.round((casualCount / translated.length) * 100) : 0}%</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-bold mb-3">🔴 苦手パターン（未翻訳から検出）</h2>
        <div className="space-y-2 text-sm">
          {[
            '「〜しておく」系の事前行動表現',
            '曖昧な記憶・うろ覚え表現（どうだったかな等）',
            '面倒・だるさの感情表現',
            '受身的状況の描写（パソコンの不調で等）',
            '日本語特有の婉曲表現（迷惑かけないように等）',
          ].map((p, i) => (
            <div key={i} className="p-2 bg-red-50 rounded-lg text-red-700">• {p}</div>
          ))}
        </div>
      </div>

      <Navbar />
    </div>
  );
}
