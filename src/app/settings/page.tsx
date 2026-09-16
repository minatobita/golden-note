'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { getSettings, saveSettings } from '@/lib/db';
import { DEFAULT_SETTINGS } from '@/lib/types';
import Navbar from '@/components/Navbar';

const PRESETS = {
  forgetting: { label: '忘却曲線ベース（推奨）', intervals: { bronze_25_18: 1, bronze_18_13: 4, bronze_13_9: 14, bronze_9_6: 28, silver_25_18: 1, silver_18_13: 4, silver_13_9: 14, silver_9_6: 28, gold_25_18: 1, gold_18_13: 4, gold_13_9: 14, gold_9_6: 28 } },
  original: { label: 'オリジナルGNM（2週間統一）', intervals: { bronze_25_18: 14, bronze_18_13: 14, bronze_13_9: 14, bronze_9_6: 14, silver_25_18: 14, silver_18_13: 14, silver_13_9: 14, silver_9_6: 14, gold_25_18: 14, gold_18_13: 14, gold_13_9: 14, gold_9_6: 14 } },
  fast: { label: 'ハイペース', intervals: { bronze_25_18: 1, bronze_18_13: 2, bronze_13_9: 7, bronze_9_6: 14, silver_25_18: 1, silver_18_13: 2, silver_13_9: 7, silver_9_6: 14, gold_25_18: 1, gold_18_13: 2, gold_13_9: 7, gold_9_6: 14 } },
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => { setSettings(await getSettings(user.uid)); })();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    await saveSettings(user.uid, settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const applyPreset = (key: string) => {
    const preset = PRESETS[key as keyof typeof PRESETS];
    if (preset) setSettings({ ...settings, intervals: { ...preset.intervals } });
  };

  const stages = [
    { key: 'bronze_25_18', label: '🥉 25→18' },
    { key: 'bronze_18_13', label: '🥉 18→13' },
    { key: 'bronze_13_9', label: '🥉 13→9' },
    { key: 'bronze_9_6', label: '🥉 9→6' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
      <h1 className="text-2xl font-bold mb-4">⚙️ 設定</h1>
      {saved && <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 font-bold text-center">✅ 保存しました</div>}

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-bold mb-3">プリセット</h2>
        <div className="space-y-2">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button key={key} onClick={() => applyPreset(key)}
              className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-blue-50 text-sm">{preset.label}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-bold mb-3">復習間隔（日数）</h2>
        <div className="space-y-3">
          {stages.map(s => (
            <div key={s.key} className="flex justify-between items-center">
              <span className="text-sm font-semibold">{s.label}</span>
              <input type="number" min={1} value={settings.intervals?.[s.key] || 1}
                onChange={e => setSettings({ ...settings, intervals: { ...settings.intervals, [s.key]: parseInt(e.target.value) || 1 } })}
                className="w-20 p-2 border border-gray-300 rounded-lg text-center text-sm" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-bold mb-3">長期記憶チェック</h2>
        <div className="flex justify-between items-center">
          <span className="text-sm">卒業後の再確認（日数）</span>
          <input type="number" min={30} value={settings.longTermCheckDays || 90}
            onChange={e => setSettings({ ...settings, longTermCheckDays: parseInt(e.target.value) || 90 })}
            className="w-20 p-2 border border-gray-300 rounded-lg text-center text-sm" />
        </div>
      </div>

      <button onClick={handleSave} className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold text-lg">💾 保存</button>
      <Navbar />
    </div>
  );
}
