import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'sk-your-openai-api-key') {
      return NextResponse.json({ error: 'OpenAI APIキーが設定されていません。.env.localを確認してください。' }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey });
    const { japanese, english, situation } = await req.json();

    if (!japanese && !english) {
      return NextResponse.json({ error: '翻訳するテキストがありません。' }, { status: 400 });
    }

    const isJpToEn = !!japanese && !english;
    const text = isJpToEn ? japanese : english;
    const sitContext = situation ? `\n状況: ${situation}` : '';

    const systemPrompt = isJpToEn
      ? `あなたは英語翻訳アシスタントです。ユーザーの好み：I主語、カジュアル口語体、句動詞多用、感情強調副詞(pretty, super, really)。自然で実用的な英訳を提供してください。翻訳結果のみを返してください。説明は不要です。`
      : `あなたは英語から日本語への翻訳アシスタントです。

重要なルール：
1. カタカナ語は絶対に使わないでください。必ず和語・漢語で訳してください。
   - trade-off → 二律背反、取捨選択（×トレードオフ）
   - segment → 区分、分割（×セグメント）
   - leverage → 活用する、てこ入れ（×レバレッジ）
2. 単語や短いフレーズの場合は、動詞の核心・名詞の核心だけを訳してください。文脈を勝手に補わないでください。
   - segmentation → 分離、区分（×市場の区分け）
   - drive down → 引き下げる、減少させる（×価格を減少させる）
   - monetize → 収益化する（×サービスを収益化する）
3. 文章の場合は、自然でカジュアルな日本語にしてください。
4. 翻訳結果のみを返してください。説明は不要です。`;

    const userPrompt = isJpToEn
      ? `以下を英語に翻訳してください。${sitContext}\n\n「${text}」\n\n翻訳のみを返してください。`
      : `以下を日本語に翻訳してください。カタカナ語は使わず、和語・漢語で訳してください。単語や短いフレーズの場合は核心の意味だけを返してください。${sitContext}\n\n「${text}」\n\n翻訳のみを返してください。`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
    });

    const result = response.choices[0]?.message?.content?.trim() || '';
    if (!result || result.toLowerCase() === 'empty') {
      return NextResponse.json({ error: '翻訳結果が空でした。' }, { status: 500 });
    }

    // Remove surrounding quotes if present
    const cleaned = result.replace(/^["'「」『』]+|["'「」『』]+$/g, '');

    return NextResponse.json(isJpToEn ? { english: cleaned } : { japanese: cleaned });
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('insufficient_quota') || msg.includes('429')) {
      return NextResponse.json({ error: 'OpenAI APIの利用上限に達しています。クレジットを追加してください。' }, { status: 429 });
    }
    return NextResponse.json({ error: `翻訳エラー: ${msg}` }, { status: 500 });
  }
}
