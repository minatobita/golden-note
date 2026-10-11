import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'sk-your-openai-api-key') {
      return NextResponse.json({ error: 'OpenAI APIキーが設定されていません。.env.localを確認してください。' }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey });
    const { japanese, english, situation, preferences, styleAnalysis } = await req.json();

    if (!japanese && !english) {
      return NextResponse.json({ error: '翻訳するテキストがありません。' }, { status: 400 });
    }

    const isJpToEn = !!japanese && !english;
    const text = isJpToEn ? japanese : english;
    const sitContext = situation ? `\n状況: ${situation}` : '';

    let systemPrompt = '';

    if (isJpToEn) {
      systemPrompt = `あなたは日本語→英語の翻訳アシスタントです。

必ず3つの異なる翻訳候補を提案してください。
フォーマット：
1. 候補1
2. 候補2
3. 候補3

候補だけを返してください。説明は不要です。`;
    } else {
      systemPrompt = `あなたは英語→日本語の翻訳アシスタントです。

重要なルール：
1. カタカナ語は絶対に使わないでください。必ず和語・漢語で訳してください。
   - trade-off → 二律背反、取捨選択（×トレードオフ）
   - segment → 区分、分割（×セグメント）
   - leverage → 活用する、てこ入れ（×レバレッジ）
2. 単語や短いフレーズの場合は、動詞の核心・名詞の核心だけを訳してください。文脈を勝手に補わないでください。
   - segmentation → 分離、区分（×市場の区分け）
   - drive down → 引き下げる、減少させる（×価格を減少させる）
3. 文章の場合は、自然な日本語にしてください。

必ず3つの異なる翻訳候補を提案してください。
フォーマット：
1. 候補1
2. 候補2
3. 候補3

候補だけを返してください。説明は不要です。`;
    }

    // Data-driven style (reference)
    if (styleAnalysis) {
      systemPrompt += `\n\n【ユーザーの過去の翻訳から検出された傾向（参考）】\n${styleAnalysis}`;
    }

    // User preferences (highest priority)
    if (preferences) {
      systemPrompt += `\n\n【ユーザーの明示的な要望（最優先）】\n${preferences}\n上記に反する翻訳は絶対にしないでください。`;
    }

    const userPrompt = isJpToEn
      ? `以下を英語に翻訳してください。3つの候補を出してください。${sitContext}\n\n「${text}」`
      : `以下を日本語に翻訳してください。カタカナ語は使わず、和語・漢語で訳してください。3つの候補を出してください。${sitContext}\n\n「${text}」`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
    });

    const result = response.choices[0]?.message?.content?.trim() || '';
    if (!result || result.toLowerCase() === 'empty') {
      return NextResponse.json({ error: '翻訳結果が空でした。' }, { status: 500 });
    }

    const candidates: string[] = [];
    const lines = result.split('\n');
    for (const line of lines) {
      const match = line.match(/^\d+[\.\)]\s*(.+)/);
      if (match) {
        const cleaned = match[1].trim().replace(/^["'「」『』]+|["'「」『』]+$/g, '');
        if (cleaned.length > 0) candidates.push(cleaned);
      }
    }

    if (candidates.length === 0) {
      const cleaned = result.replace(/^["'「」『』]+|["'「」『』]+$/g, '');
      candidates.push(cleaned);
    }

    return NextResponse.json({
      candidates,
      ...(isJpToEn ? { english: candidates[0] } : { japanese: candidates[0] }),
    });
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('insufficient_quota') || msg.includes('429')) {
      return NextResponse.json({ error: 'OpenAI APIの利用上限に達しています。' }, { status: 429 });
    }
    return NextResponse.json({ error: `翻訳エラー: ${msg}` }, { status: 500 });
  }
}
