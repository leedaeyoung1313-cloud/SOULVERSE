import { GoogleGenAI } from "@google/genai";
import { type NextRequest } from 'next/server';

// Next.js 환경 변수에서 API 키를 가져옵니다.
const API_KEY = process.env.GEMINI_API_KEY;

// 최소 CORS 설정 (효율성을 위해 필요한 헤더만 포함)
const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// OPTIONS 핸들러 (Preflight)
export async function OPTIONS() {
  return new Response(null, { status: 200, headers: HEADERS });
}

export async function POST(request: NextRequest) {
  if (!API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY 환경 변수 누락" }),
      { status: 500, headers: HEADERS }
    );
  }

  try {
    const { messages } = await request.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "유효하지 않은 'messages' 배열" }),
        { status: 400, headers: HEADERS }
      );
    }

    // 최소 수정: 클라이언트 초기화 방식 변경
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    // OAI 메시지를 Gemini API 역할(user/model)로 변환
    const contents = messages.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model', 
      parts: [{ text: msg.content }],
    }));
    
    const model = 'gemini-2.5-flash';

    // 마지막 메시지 전까지를 대화 기록으로 사용
    const history = contents.slice(0, -1);
    const lastMessage = contents[contents.length - 1].parts[0].text;

    const chat = ai.chats.create({ model, history });
    const result = await chat.sendMessage({ message: lastMessage });

    // OAI 호환 응답 구조 생성 (필수 필드만 포함하여 오버헤드 최소화)
    const responseData = {
      id: Date.now().toString(),
      object: 'chat.completion',
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: result.text,
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };

    return new Response(JSON.stringify(responseData), { status: 200, headers: HEADERS });

  } catch (error) {
    console.error('API Error:', error);
    return new Response(
      JSON.stringify({ error: '요청 처리 오류', details: (error as Error).message }),
      { status: 500, headers: HEADERS }
    );
  }
}