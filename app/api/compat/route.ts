// app/api/compat/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const MODEL   = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash';
const BASE    = process.env.GEMINI_BASE  || 'https://generativelanguage.googleapis.com';

type Body = {
  topic: 'compatibility_basic'|'red_line'|'lucky_color'|string;
  man_birth: string;    // YYYY-MM-DD
  woman_birth: string;  // YYYY-MM-DD
  man_mbti: string;
  woman_mbti: string;
  man_blood?: 'A'|'B'|'O'|'AB';
  woman_blood?: 'A'|'B'|'O'|'AB';
  man_time?: string;    // HH:MM
  woman_time?: string;  // HH:MM
};

const JSON_SPEC = `
반드시 아래 JSON만 반환(설명문/코드펜스 금지):

{
 "score": <30~98 정수>,
 "facets": { "정서":0~100, "소통":0~100, "현실":0~100, "성장":0~100, "지속":0~100 },
 "summary": "2~3문장",
 "insights": ["불릿1","불릿2","불릿3"],
 "oneliner": "짧은 한 문장",
 "explanation": { "정서":"한 문장", "소통":"한 문장", "현실":"한 문장", "성장":"한 문장", "지속":"한 문장" }
}
`;

const SYSTEM = `
너는 사주(연·월·일·시는 기질·리듬 수준), MBTI(의사소통/갈등복구/의사결정 중심), 혈액형(문화권 일반론 한정)을
편향 없이 종합 분석하는 코치다. 운명론 금지, 조절 가능한 행동전략 중심. 한국어, 짧고 단정한 코칭 톤.
시간/혈액형 미입력 시 일반론으로 합리적 보정. 과한 상투어/미신 금지. 실전 조언에 초점.
${JSON_SPEC}
`;

function sanitizeJson(text: string) {
  // 코드펜스 제거 및 끝부분 정리
  let t = text.trim();
  if (t.startsWith('```')) t = t.replace(/^```[a-z]*\n?/i, '');
  if (t.endsWith('```')) t = t.replace(/```$/, '');
  // 마지막 괄호 정합성 간단 보정
  const lastObj = t.lastIndexOf('}');
  if (lastObj !== -1) t = t.slice(0, lastObj + 1);
  return t;
}

async function callGemini(payload: any, signal: AbortSignal) {
  const url = `${BASE}/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: SYSTEM }] },
        { role: 'user', parts: [{ text: payload }] }
      ],
      generationConfig: {
        temperature: 0.6,
        topK: 40,
        topP: 0.9,
        maxOutputTokens: 800,
        responseMimeType: 'application/json'
      }
    })
  });
  if (!res.ok) {
    const msg = await res.text().catch(()=>'');
    throw new Error(`Gemini ${res.status}: ${msg}`);
  }
  const json = await res.json();
  // v1beta 응답 파싱
  const text =
    json?.candidates?.[0]?.content?.parts?.[0]?.text ??
    json?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data ??
    '';
  return String(text || '');
}

function normalizeOutput(parsed: any) {
  const num = (v: any, d: number, min=0, max=100) => {
    const n = Number(v);
    if (Number.isNaN(n)) return d;
    return Math.max(min, Math.min(max, Math.round(n)));
  };

  const score = num(parsed?.score, 80, 30, 98);
  const facets = parsed?.facets || {};
  const normFacets = {
    "정서":   num(facets["정서"], 80),
    "소통":   num(facets["소통"], 80),
    "현실":   num(facets["현실"], 70),
    "성장":   num(facets["성장"], 90),
    "지속":   num(facets["지속"], 80),
  };

  const explanation = parsed?.explanation || {};
  return {
    score,
    facets: normFacets,
    summary: String(parsed?.summary || '').slice(0, 400),
    insights: Array.isArray(parsed?.insights) ? parsed.insights.slice(0,3).map(String) : [],
    oneliner: String(parsed?.oneliner || '').slice(0, 80),
    explanation: {
      "정서": String(explanation["정서"] || ''),
      "소통": String(explanation["소통"] || ''),
      "현실": String(explanation["현실"] || ''),
      "성장": String(explanation["성장"] || ''),
      "지속": String(explanation["지속"] || ''),
    }
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!API_KEY) {
      return NextResponse.json({ error: true, detail: 'API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    const body = await req.json() as Body;
    const topic = (body.topic || 'compatibility_basic') as Body['topic'];

    if (!body.man_birth || !body.woman_birth || !body.man_mbti || !body.woman_mbti) {
      return NextResponse.json({ error: true, detail: '필수 입력(생년월일/MBTI)이 누락되었습니다.' }, { status: 400 });
    }

    // 사용자 요청 페이로드(프롬프트)
    const userPayload = `
[토픽] ${topic}
[남] 생년월일=${body.man_birth}, 시간=${body.man_time || '미상'}, MBTI=${body.man_mbti}, 혈액형=${body.man_blood || '미상'}
[여] 생년월일=${body.woman_birth}, 시간=${body.woman_time || '미상'}, MBTI=${body.woman_mbti}, 혈액형=${body.woman_blood || '미상'}

요구사항:
- 관계의 강/약점과 개선전략을 실전적으로.
- 점수는 일관성 있게. facets와 summary/insights/설명이 자연스럽게 이어지도록.
- 한국어, 짧고 단정한 코칭 톤.
${JSON_SPEC}
예시:
{
 "score": 82,
 "facets": { "정서":78, "소통":85, "현실":72, "성장":88, "지속":80 },
 "summary": "요약 2~3문장.",
 "insights": ["실전조언1","실전조언2","실전조언3"],
 "oneliner": "짧은 한 문장",
 "explanation": { "정서":"...", "소통":"...", "현실":"...", "성장":"...", "지속":"..." }
}
`;

    // 타임아웃 + 1회 재시도
    const controller = new AbortController();
    const to = setTimeout(()=>controller.abort(), 20000);
    let text = '';
    try {
      text = await callGemini(userPayload, controller.signal);
    } catch (e1) {
      // 재시도 (새 controller)
      const controller2 = new AbortController();
      const to2 = setTimeout(()=>controller2.abort(), 20000);
      try {
        text = await callGemini(userPayload, controller2.signal);
      } finally {
        clearTimeout(to2);
      }
    } finally {
      clearTimeout(to);
    }

    const raw = sanitizeJson(text);
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 마지막 방어: 중괄호 블록만 추출 후 재시도
      const m = raw.match(/\{[\s\S]*\}$/);
      if (!m) throw new Error('JSON 파싱 실패');
      parsed = JSON.parse(m[0]);
    }

    return NextResponse.json(normalizeOutput(parsed));
  } catch (err: any) {
    return NextResponse.json({ error: true, detail: err?.message || '서버 오류' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true });
}
