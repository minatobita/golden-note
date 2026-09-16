import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { messages, phrase, situation } = await req.json();

    const systemPrompt = `あなたは英語翻訳アシスタントです。ユーザーの日本語フレーズを自然な英語に翻訳し、議論を通じて最適な表現を見つけます。

ユーザーの好みのスタイル：
- I主語を強く好む（受動態でもI主語）
- カジュアル・口語体（"pretty", "way too", "super", "gonna" を多用）
- 句動詞を積極使用（"get across", "cut out", "run into"）
- 感情を強調する副詞（"so", "really", "pretty", "super"）

ルール：
- 候補を提示する場合は、必ず番号付きリストで表示してください（1. 2. 3. のように）
- JSON形式では絶対に返さないでください
- 自然な日本語で説明してください
- 文法の質問にも丁寧に答えてください
${situation ? `\n状況: ${situation}` : ''}
${phrase ? `\n対象フレーズ: ${phrase}` : ''}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    });

    const content = response.choices[0].message.content || '';

    return NextResponse.json({ reply: content });
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error.message || 'AI Chat error' },
      { status: 500 }
    );
  }
}