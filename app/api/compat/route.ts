import { GoogleGenerativeAI } from "@google/genai";
import { type NextRequest } from 'next/server';

// Firebase Firestore 관련 환경 변수 (사용하지 않으므로 주석 처리 또는 제거 가능)
// const FIREBASE_COLLECTION_PATH = process.env.FIREBASE_COLLECTION_PATH || "chats";

// API 키 설정: 두 환경 변수 중 하나만 설정해도 사용 가능합니다.
const API_KEY = (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "").trim();

// 모델 설정: 환경 변수가 없으면 기본값(gemini-1.5-flash) 사용
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

if (!API_KEY) {
    console.error("[SOULVERSE] Configuration Error: API Key is missing.");
}

// 지수 백오프 함수
const exponentialBackoff = async (func: () => Promise<Response>, maxRetries = 5, delay = 1000): Promise<Response> => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await func();
            if (response.status !== 429 && response.status < 500) {
                return response;
            }
        } catch (error) {
            // 네트워크 오류 등 fetch 자체의 오류 처리
            if (i === maxRetries - 1) throw error;
        }

        if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
    }
    throw new Error("Maximum retries reached for API call.");
};


export async function POST(req: NextRequest) {
    if (!API_KEY) {
        return new Response(JSON.stringify({ error: "API Key is not configured." }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const { messages, systemInstruction } = await req.json();

        // 1. GoogleGenerativeAI 클라이언트 초기화
        const ai = new GoogleGenerativeAI(API_KEY);

        // 2. 대화 기록 준비
        const contents = messages.map((msg: any) => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
        }));

        // 3. generationConfig 설정 (responseMimeType 및 responseSchema 제거)
        // 일반 텍스트 생성에는 이 필드가 필요 없으므로 제거하여 400 에러를 방지합니다.
        const generationConfig: any = {
            temperature: 0.7,
            maxOutputTokens: 2048,
        };
        
        // 시스템 지침이 있다면 추가
        if (systemInstruction) {
             generationConfig.systemInstruction = systemInstruction;
        }


        // 4. API 호출 함수 정의
        const apiCall = async () => {
            const response = await ai.models.generateContent({
                model: GEMINI_MODEL,
                contents: contents,
                config: generationConfig,
            });

            // 5. 응답 처리 및 스트림 생성 (Next.js Edge Runtime에 맞게 수정)
            if (response && response.text) {
                return new Response(response.text, {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain' },
                });
            } else {
                 throw new Error("Gemini API returned no text.");
            }
        };

        // 6. 지수 백오프를 사용하여 API 호출 실행
        return await exponentialBackoff(apiCall);

    } catch (error) {
        let errorMessage = "알 수 없는 오류가 발생했습니다.";
        let statusCode = 500;

        if (error instanceof Error) {
            errorMessage = error.message;
            if (errorMessage.includes("API Key")) {
                statusCode = 401; // API 키 인증 오류로 간주
            } else if (errorMessage.includes("400")) {
                statusCode = 400; // 요청 형식 오류로 간주
            }
        }
        
        // Vercel 로그에 자세한 에러 기록
        console.error(`[SOULVERSE] API ERROR: Gemini API 호출 실패 (HTTP ${statusCode}):`, errorMessage);

        return new Response(JSON.stringify({ error: `Gemini API 호출 실패: ${errorMessage}` }), {
            status: statusCode,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}