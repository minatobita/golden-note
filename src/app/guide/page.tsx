'use client';
import Navbar from '@/components/Navbar';

export default function GuidePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
      <h1 className="text-2xl font-bold mb-4">📖 使い方ガイド</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="text-lg font-bold mb-3">🏠 学習フロー</h2>
        <div className="space-y-3 text-sm">
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="font-bold">Step 1: フレーズ収集</p>
            <p className="text-gray-600">日常で言えなかったフレーズ、便利な英語表現をメモ。25個を目指します。</p>
            <p className="text-xs text-blue-600 mt-1">💡 途中で閉じてもノートページから再開できます</p>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg">
            <p className="font-bold">Step 2: AI翻訳ワークショップ</p>
            <p className="text-gray-600">チャット形式でAIと対話しながら翻訳を磨きます。I主語、カジュアル表現、句動詞など、あなたの好みに合わせて調整。</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <p className="font-bold">Step 3: 学習</p>
            <p className="text-gray-600">日英ペアを1つずつ確認→テスト→全問正解まで繰り返し。</p>
          </div>
          <div className="p-3 bg-amber-50 rounded-lg">
            <p className="font-bold">Step 4: 間隔復習</p>
            <p className="text-gray-600">忘却曲線に基づいた間隔で復習テスト。25→18→13→9→6と段階的に絞り込みます。</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="text-lg font-bold mb-3">✨ AIで25個にする</h2>
        <p className="text-sm text-gray-600 mb-2">フレーズが25個に満たない場合、AIが自動で補完します。</p>
        <div className="text-sm space-y-1">
          <p>🥇 <strong>最優先</strong>: あなたの未翻訳リスト（実際に言えなかったフレーズ）</p>
          <p>🥈 <strong>次</strong>: 苦手領域に関連するMBAフレーズ</p>
          <p>🥉 <strong>最後</strong>: MBA学生生活で頻出の一般フレーズ</p>
        </div>
        <p className="text-xs text-gray-400 mt-2">補完後「未翻訳○個、MBA頻出○個」と内訳が表示されます。</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="text-lg font-bold mb-3">📊 データ分析機能</h2>
        <p className="text-sm text-gray-600 mb-2">あなたの全フレーズデータを分析し、学習に活かします。</p>
        <div className="text-sm space-y-2">
          <div className="p-2 bg-blue-50 rounded-lg">
            <p className="font-bold">🎯 スタイル分析</p>
            <p className="text-gray-600">I主語率、カジュアル表現頻度、句動詞使用率を自動計算。AI翻訳に反映されます。</p>
          </div>
          <div className="p-2 bg-red-50 rounded-lg">
            <p className="font-bold">🔴 苦手パターン検出</p>
            <p className="text-gray-600">翻訳済み＋未翻訳の両方から10パターンを検出。AI提案フレーズの選定に反映されます。</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="text-lg font-bold mb-3">🔬 科学的根拠</h2>
        <div className="space-y-3 text-sm">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-bold">📉 エビングハウスの忘却曲線</p>
            <p className="text-gray-600">学習後24時間で約70%を忘れる。初回復習を早く行うほど記憶の定着率が上がります。</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-bold">🔄 間隔反復法（Spaced Repetition）</p>
            <p className="text-gray-600">復習の間隔を段階的に広げることで、最小の努力で長期記憶を形成。1日→4日→14日→28日。</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-bold">🧠 能動的想起（Active Recall）</p>
            <p className="text-gray-600">答えを見る前に自分で思い出す。パッシブな復習の200〜400%の効果があります。</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-bold">📍 文脈依存記憶</p>
            <p className="text-gray-600">自分が実際に言いたかった場面と紐づけて覚えるため、状況の記録が重要です。</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-bold">💪 望ましい困難（Desirable Difficulty）</p>
            <p className="text-gray-600">少し難しいテストほど記憶が強化される。25→18の絞り込みがこれに該当します。</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-bold">✍️ 自己生成効果（Generation Effect）</p>
            <p className="text-gray-600">自分で翻訳を作り直す作業が、与えられた翻訳を覚えるよりも記憶定着に優れています。</p>
          </div>
        </div>
      </div>

      <Navbar />
    </div>
  );
}
