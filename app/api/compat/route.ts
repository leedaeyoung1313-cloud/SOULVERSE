import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG = process.env.DEBUG_SOULVERSE === "1";

// 1) 키/모델 읽기 (둘 다 허용)
const API_KEY = (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "").trim();
// 기본 모델은 빠르고 값싼 플래시. 필요시 env로 덮어씌움.
let MODEL = (process.env.GEMINI_MODEL || "gemini-1.5-flash").trim().replace(/^models\//, "");

// v1로 고정 (v1beta와의 모델 호환 이슈 제거)
const GL_BASE = "https://generativelanguage.googleapis.com";
const VALID_MODELS = new Set([
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro",
  "gemini-pro-vision",
]);

// JSON 텍스트에서 코드펜스/여분 제거 → 최종 객체만 추출
function extractJson(text: string): string {
  let t = String(text || "").trim();
  if (t.startsWith("```")) t = t.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
  // 마지막 } 까지 자르기
  const m = t.match(/\{[\s\S]*\}$/);
  if (m) return m[0];
  return t;
}

// 생성 결과를 SOULVERSE 스키마로 정규화 (빈값 방어)
function normalize(out: any) {
  const num = (v: any, d: number, min = 0, max = 100) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : d;
  };
  const f = out?.facets || {};
  const e = out?.explanation || {};
  return {
    score: num(out?.score, 80, 30, 98),
    facets: {
      "정서": num(f["정서"], 80),
      "소통": num(f["소통"], 80),
      "현실": num(f["현실"], 70),
      "성장": num(f["성장"], 90),
      "지속": num(f["지속"], 80),
    },
    summary: String(out?.summary || "두 사람의 리듬을 맞추면 관계가 안정적으로 성장합니다."),
    insights: Array.isArray(out?.insights) ? out.insights.slice(0, 3).map(String)
      : ["대화 속도 맞추기", "현실 계획 합의", "갈등 회복 루틴 만들기"],
    oneliner: String(out?.oneliner || "차이는 대화로 조율된다."),
    explanation: {
      "정서": String(e["정서"] || "감정 리듬을 서로 맞추면 안정감이 커집니다."),
      "소통": String(e["소통"] || "말하기·듣기 규칙을 간단히 합의하세요."),
      "현실": String(e["현실"] || "예산·시간·거리 제약을 수치로 관리하세요."),
      "성장": String(e["성장"] || "목표를 공유하고 월간 체크인을 하세요."),
      "지속": String(e["지속"] || "갈등 후 회복 루틴을 만들어 두세요."),
    },
  };
}

async function callGemini(prompt: string) {
  // 모델 유효성 보장
  const model = MODEL || "gemini-1.5-flash";
  const url = `${GL_BASE}/v1/models/${model}:generateContent?key=${API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.6,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 800,
        // v1에서도 동작하는 케이스가 많지만, 혹시 모르면 주석처리해도 됨
        responseMimeType: "application/json",
      },
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    if (DEBUG) console.error(`[SOULVERSE] Gemini error (HTTP ${res.status}):`, raw);
    throw new Error(`Gemini API 호출 실패 (HTTP ${res.status}): ${raw.substring(0, 200)}...`);
  }

  // GL API 자체 응답(JSON) → candidates 텍스트 추출
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    // 드물게 서버가 텍스트만 돌려줄 수 있음
    return raw;
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return String(text || "{}");
}

// POST — 실제 리포트 생성
export async function POST(req: NextRequest) {
  try {
    // 0) 환경 검사
    if (!API_KEY) {
      return NextResponse.json(
        { error: true, detail: "API 키가 없습니다. GOOGLE_API_KEY 또는 GEMINI_API_KEY 환경 변수를 확인하세요." },
        { status: 403 } // 500 대신 403으로 명확하게 응답
      );
    }
    if (!VALID_MODELS.has(MODEL)) {
      return NextResponse.json(
        // 빌드 오류 해결: Spread Syntax ([...VALID_MODELS]) 대신 Array.from() 사용
        { error: true, detail: `잘못된 모델명: "${MODEL}". 사용 가능: ${Array.from(VALID_MODELS).join(", ")}` },
        { status: 500 }
      );
    }

    // 1) 입력 수신 (빈값도 안전하게 문자열화)
    const body = await req.json();
    const man_birth   = String(body?.man_birth || "");
    const woman_birth = String(body?.woman_birth || "");
    const man_mbti    = String(body?.man_mbti || "").toUpperCase();
    const woman_mbti  = String(body?.woman_mbti || "").toUpperCase();
    const man_blood   = String(body?.man_blood || "미상").toUpperCase();
    const woman_blood = String(body?.woman_blood || "미상").toUpperCase();
    const man_time    = String(body?.man_time || "미상");
    const woman_time  = String(body?.woman_time || "미상");

    // 2) 필수값 최소 검증
    if (!man_birth || !woman_birth || !man_mbti || !woman_mbti) {
      return NextResponse.json(
        { error: true, detail: "필수 입력(생년월일/MBTI)이 누락되었습니다." },
        { status: 400 }
      );
    }

    // 3) 프롬프트 (스키마 강제 + 품질 개선)
    const spec = `반드시 아래 JSON만 반환(설명문/코드펜스 금지):
{
 "score": <30~98 정수>,
 "facets": { "정서":0~100, "소통":0~100, "현실":0~100, "성장":0~100, "지속":0~100 },
 "summary": "2~3문장",
 "insights": ["불릿1","불릿2","불릿3"],
 "oneliner": "짧은 한 문장",
 "explanation": { "정서":"..", "소통":"..", "현실":"..", "성장":"..", "지속":".." }
}`;

    const prompt = `너는 사주(연·월·일·시=기질/리듬), MBTI(의사소통/갈등복구/결정), 혈액형(문화권 일반론)을 편향 없이 종합 분석하는 코치다.
운명론 금지, 실전 행동전략 중심, 한국어 간결 코칭 톤. 점수/요약/인사이트/설명이 서로 논리적으로 일관되게.

[남] 생년월일=${man_birth}, 시간=${man_time}, MBTI=${man_mbti}, 혈액형=${man_blood}
[여] 생년월일=${woman_birth}, 시간=${woman_time}, MBTI=${woman_mbti}, 혈액형=${woman_blood}

${spec}`;

    // 4) 모델 호출
    const modelText = await callGemini(prompt);

    // 5) JSON 추출/보정 → 정규화
    const jsonText = extractJson(modelText);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      if (DEBUG) console.error("[SOULVERSE] JSON parse fail, raw=", modelText);
      parsed = {}; // 빈 객체로 정규화 진행 (절대 500으로 안 넘김)
    }

    return NextResponse.json(normalize(parsed));
  } catch (err: any) {
    if (DEBUG) console.error("[SOULVERSE] API ERROR:", err?.message);
    // 에러를 숨기지 않고 detail에 노출해 원인 파악 가능
    return NextResponse.json({ error: true, detail: err?.message || "서버 오류" }, { status: 500 });
  }
}

// GET — 헬스 체크
export async function GET() {
  return NextResponse.json({ ok: true, model: MODEL, hasKey: Boolean(API_KEY) });
}