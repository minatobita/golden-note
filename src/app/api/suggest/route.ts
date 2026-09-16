import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'sk-your-openai-api-key') {
      return NextResponse.json({ error: 'OpenAI APIキーが設定されていません。' }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey });
    const { count, existingPhrases, weakPatterns } = await req.json();

    const existing = (existingPhrases || []).map((p: any) => p.japanese).join('\n');
    const weak = (weakPatterns || []).join(', ');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `MBAの学生生活や授業で使う英語フレーズを提案してください。日本語と英語のペアで返してください。

ユーザーの好み：I主語、カジュアル口語体、句動詞多用。
苦手パターン: ${weak || '特になし'}

重要：既存のフレーズと重複しないこと。
回答はJSON配列で：[{"japanese": "日本語", "english": "英語"}, ...]` },
        { role: 'user', content: `${count}個のフレーズを提案してください。\n\n既存フレーズ（重複禁止）:\n${existing}` }
      ],
      temperature: 0.9,
    });

    const content = response.choices[0]?.message?.content?.trim() || '[]';
    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ phrases: [] });
    }
    let phrases = JSON.parse(jsonMatch[0]);
    // Filter out empty or invalid
    phrases = phrases.filter((p: any) => p.japanese && p.japanese !== 'empty' && p.english && p.english !== 'empty');
    
    return NextResponse.json({ phrases });
  } catch (err: any) {
    return NextResponse.json({ error: `提案エラー: ${err?.message || ''}` }, { status: 500 });
  }
}
