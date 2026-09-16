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

    const isJpToEn = !!japanese && !english;
    const text = isJpToEn ? japanese : english;
    const direction = isJpToEn ? '日本語→英語' : '英語→日本語';
    const sitContext = situation ? `\n📍 状況: ${situation}` : '';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `あなたは英語翻訳アシスタントです。ユーザーの好み：I主語、カジュアル口語体、句動詞多用、感情強調副詞(pretty, super, really)。自然で実用的な翻訳を提供してください。` },
        { role: 'user', content: `${direction}に翻訳してください。${sitContext}\n\n「${text}」\n\n翻訳のみを回答してください。` }
      ],
      temperature: 0.7,
    });

    const result = response.choices[0]?.message?.content?.trim() || '';
    if (!result || result.toLowerCase() === 'empty') {
      return NextResponse.json({ error: '翻訳結果が空でした。' }, { status: 500 });
    }

    return NextResponse.json(isJpToEn ? { english: result } : { japanese: result });
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('insufficient_quota') || msg.includes('429')) {
      return NextResponse.json({ error: 'OpenAI APIの利用上限に達しています。クレジットを追加してください。' }, { status: 429 });
    }
    return NextResponse.json({ error: `翻訳エラー: ${msg}` }, { status: 500 });
  }
}
