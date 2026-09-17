import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'sk-your-openai-api-key') {
      return NextResponse.json({ error: 'OpenAI APIキーが設定されていません。' }, { status: 500 });
    }
    const openai = new OpenAI({ apiKey });
    const { messages, phrase, situation, direction } = await req.json();

    const directionNote = direction === 'en2jp'
      ? `\n\n現在のタスク: 英語→日本語の翻訳です。
- カタカナ語は絶対に使わないでください。和語・漢語で訳してください。
- 単語や短いフレーズの場合は、核心の意味だけを返してください。文脈を勝手に補わないでください。
  例: segmentation → 分離、区分（×市場の区分け）
  例: drive down → 引き下げる（×価格を引き下げる）
  例: trade-off → 二律背反、取捨選択（×トレードオフ）`
      : `\n\n現在のタスク: 日本語→英語の翻訳です。`;

    const systemPrompt = `あなたは英語学習のパートナーです。翻訳の提案、文法の説明、ニュアンスの違い、使い方の相談など、何でも柔軟に対応してください。

ユーザー（日本人MBA学生）の英語スタイル：
- I主語を強く好む（受動態でもI主語にする）
  例: 「マイケルからプレゼントをもらった」→ "I was given a present from Michael"（×Michael gave me）
- カジュアルな口語体を好む
  例: "pretty", "way too", "super", "gonna", "wanna" を積極使用
- 句動詞を好む
  例: "get across"（伝わる）, "cut out"（やめる）, "run into"（偶然会う）, "settle in"（慣れる）
- 感情を強調する副詞を多用
  例: "so", "really", "pretty", "super"
- 短い相槌表現を重視
  例: "Fair enough", "No way!", "What a relief!"

対話のルール：
1. 候補を提案するときは、必ず番号付きリスト（1. 2. 3.）で表示してください
2. JSON形式では絶対に返さないでください
3. 説明は自然な日本語で書いてください
4. ユーザーの質問には何でも答えてください（文法、ニュアンス、使い分け、例文など）
5. ユーザーが「もっとカジュアルに」「I主語で」などリクエストしたら、柔軟に対応してください
6. 1つの提案だけの場合も番号なしでOKですが、太字（**提案文**）で囲んでください
${directionNote}
${phrase ? `\n対象フレーズ: 「${phrase}」` : ''}
${situation ? `状況: ${situation}` : ''}`;

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
