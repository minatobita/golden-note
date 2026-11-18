'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthChange } from '@/lib/auth';
import { getSettings, saveSettings } from '@/lib/db';
import Navbar from '@/components/Navbar';

const DEFAULT_INTERVALS: any = {
  bronze_25_18: 1, bronze_18_13: 4, bronze_13_9: 14, bronze_9_6: 28,
  silver_25_18: 1, silver_18_13: 4, silver_13_9: 14, silver_9_6: 28,
  golden_25_18: 1, golden_18_13: 4, golden_13_9: 14, golden_9_6: 28,
};

const PRESETS: any = {
  ebbinghaus: { label: '忘却曲線ベース', intervals: { ...DEFAULT_INTERVALS } },
  original: {
    label: 'オリジナルGNM（2週間統一）',
    intervals: {
      bronze_25_18: 14, bronze_18_13: 14, bronze_13_9: 14, bronze_9_6: 14,
      silver_25_18: 14, silver_18_13: 14, silver_13_9: 14, silver_9_6: 14,
      golden_25_18: 14, golden_18_13: 14, golden_13_9: 14, golden_9_6: 14,
    },
  },
  highpace: {
    label: 'ハイペース',
    intervals: {
      bronze_25_18: 1, bronze_18_13: 2, bronze_13_9: 7, bronze_9_6: 14,
      silver_25_18: 1, silver_18_13: 2, silver_13_9: 7, silver_9_6: 14,
      golden_25_18: 1, golden_18_13: 2, golden_13_9: 7, golden_9_6: 14,
    },
  },
};

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [settings, setSettings] = useState<any>({ intervals: { ...DEFAULT_INTERVALS } });
  const [toast, setToast] = useState('');

  useEffect(() => {
    const unsub = onAuthChange(async (u: any) => {
      if (!u) { router.push('/login'); return; }
      setUser(u);
      const s = await getSettings(u.uid);
      setSettings({ ...s, intervals: { ...DEFAULT_INTERVALS, ...(s?.intervals || {}) } });
    });
    return () => unsub();
  }, []);

  const applyPreset = (key: string) => {
    const preset = PRESETS[key];
    if (preset) setSettings({ ...settings, intervals: { ...preset.intervals } });
  };

  const stages = [
    { section: '🥉 ブロンズ', prefix: 'bronze' },
    { section: '🥈 シルバー', prefix: 'silver' },
    { section: '🥇 ゴールデン', prefix: 'golden' },
  ].map(s => ({
    section: s.section,
    items: ['25_18', '18_13', '13_9', '9_6'].map(k => ({ key: `${s.prefix}_${k}`, label: k.replace('_', '→') })),
  }));

  const handleSave = async () => {
    if (!user) return;
    await saveSettings(user.uid, settings);
    setToast('✅ 設定を保存しました');
    setTimeout(() => setToast(''), 3000);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-xl text-sm font-semibold z-50">{toast}</div>}
      <h1 className="text-2xl font-bold mb-4">⚙️ 設定</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-bold mb-3">📋 プリセット</h2>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(PRESETS).map(([key, preset]: [string, any]) => (
            <button key={key} onClick={() => applyPreset(key)}
              className="px-3 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm hover:bg-blue-50">
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-bold mb-3">📅 復習間隔（日数）</h2>
        {stages.map(section => (
          <div key={section.section} className="mb-4">
            <h3 className="font-semibold text-sm text-gray-600 mb-2">{section.section}</h3>
            <div className="grid grid-cols-2 gap-2">
              {section.items.map(item => (
                <div key={item.key} className="flex items-center gap-2">
                  <label className="text-sm font-medium w-16">{item.label}</label>
                  <input type="number" min={1} max={365}
                    value={settings.intervals?.[item.key] ?? 1}
                    onChange={e => setSettings({
                      ...settings,
                      intervals: { ...settings.intervals, [item.key]: parseInt(e.target.value) || 1 }
                    })}
                    className="w-20 p-2 border border-gray-300 rounded-lg text-center text-sm"
                    style={{ fontSize: '16px' }}
                  />
                  <span className="text-xs text-gray-400">日後</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-bold mb-3">🔒 長期記憶チェック</h2>
        <p className="text-sm text-gray-600">
          日数の条件はありません。長期記憶フォルダーの<b>覚えた日が古い順</b>に、毎回の復習クイズへ3問ずつ混ざります。
        </p>
        <p className="text-xs text-gray-400 mt-2">
          正解 → フォルダーに残り、覚えた日が今日に更新（列の最後へ）／ 不正解 → ホームの収集リストへ移動
        </p>
      </div>

      <button onClick={handleSave} className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold text-lg">
        💾 設定を保存
      </button>

      <Navbar />
    </div>
  );
}
