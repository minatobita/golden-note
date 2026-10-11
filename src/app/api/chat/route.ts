import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'sk-your-openai-api-key') {
      return NextResponse.json({ error: 'OpenAI APIキーが設定されていません。' }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey });
    const { messages, phrase, situation, direction, preferences, styleAnalysis } = await req.json();

    let systemPrompt = '';

    if (direction === 'en2jp') {
      systemPrompt = `あなたは英語→日本語の翻訳アシスタントです。

【最重要ルール】
- あなたの出力は全て日本語の訳語・訳文でなければなりません
- 英語の別表現は絶対に提案しないでください
- カタカナ語は使わないでください（trade-off→二律背反、leverage→活用する）
- 単語・短いフレーズの場合は核心の意味だけを返してください
  例: segmentation→区分、drive down→引き下げる
- 勝手に文脈を補わないでください（×「市場の区分け」→○「区分」）

【候補の提示方法】
- 番号付きリストで3つの候補を提示してください
- 説明は日本語で書いてください
- JSON形式では絶対に返さないでください`;
    } else {
      systemPrompt = `あなたは日本語→英語の翻訳アシスタントです。

【候補の提示方法】
- 番号付きリストで3つの候補を提示してください
- 説明は日本語で書いてください
- JSON形式では絶対に返さないでください

【柔軟な対応】
- 文法の質問にも丁寧に答えてください
- ニュアンスの違いの説明も歓迎です
- ユーザーのリクエストには柔軟に対応してください`;
    }

    // Data-driven style analysis (reference only, not hardcoded)
    if (styleAnalysis) {
      systemPrompt += `\n\n【ユーザーの過去の翻訳データから検出されたスタイル傾向（参考情報）】\n${styleAnalysis}\nこれはデータから自動検出された傾向です。ユーザーの明示的な要望がある場合はそちらを優先してください。`;
    }

    // User preferences (highest priority - overrides everything)
    if (preferences) {
      systemPrompt += `\n\n【ユーザーの明示的な要望（最優先で厳密に従ってください）】\n${preferences}\n上記の要望に反する翻訳は絶対にしないでください。例えば「reallyを使わないで」と書いてあれば、reallyは絶対に使わないでください。`;
    }

    if (phrase) systemPrompt += `\n\n【対象フレーズ】「${phrase}」`;
    if (situation) systemPrompt += `\n【状況】${situation}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...(messages || []).slice(-20),
      ],
      temperature: 0.8,
    });

    const content = response.choices[0]?.message?.content || '';
    return NextResponse.json({ reply: content });
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('insufficient_quota') || msg.includes('429')) {
      return NextResponse.json({ error: 'OpenAI APIの利用上限に達しています。' }, { status: 429 });
    }
    return NextResponse.json({ error: `チャットエラー: ${msg}` }, { status: 500 });
  }
}
