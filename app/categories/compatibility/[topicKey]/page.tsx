'use client';

import React, { useMemo, useState } from 'react';

interface AnalysisPageProps {
  params: { topicKey: string };
}

type Facets = {
  "정서": number;
  "소통": number;
  "현실": number;
  "성장": number;
  "지속": number;
};

type ApiResponse = {
  score?: number;
  summary?: string;
  oneliner?: string;
  insights?: string[];
  facets?: Facets;
  explanation?: { [key in keyof Facets]?: string } | null;
  error?: string;
  detail?: string;
};

const API_URL = '/api/compat';

function clampScore(v: number | undefined, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeFacets(facets: Facets | undefined): Facets {
  const base = { "정서": 80, "소통": 80, "현실": 70, "성장": 90, "지속": 80 };
  if (!facets) return base;
  return {
    "정서": clampScore(facets["정서"], 0, 100, base["정서"]),
    "소통": clampScore(facets["소통"], 0, 100, base["소통"]),
    "현실": clampScore(facets["현실"], 0, 100, base["현실"]),
    "성장": clampScore(facets["성장"], 0, 100, base["성장"]),
    "지속": clampScore(facets["지속"], 0, 100, base["지속"]),
  };
}

const topicTitleMap: Record<string, string> = {
  compatibility_basic: '기본 궁합 리포트',
  red_line: '레드 라인 궁합 분석',
  lucky_color: '행운 컬러 & 무드',
};

// 선택 리스트
const MBTI_LIST = [
  "ISTJ","ISFJ","INFJ","INTJ",
  "ISTP","ISFP","INFP","INTP",
  "ESTP","ESFP","ENFP","ENTP",
  "ESTJ","ESFJ","ENFJ","ENTJ"
];
const BLOOD_LIST = ["A", "B", "O", "AB"];
const HOUR_LIST = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MIN_LIST  = ["00","05","10","15","20","25","30","35","40","45","50","55"];

export default function AnalysisPage({ params }: AnalysisPageProps) {
  const { topicKey } = params;

  // 남
  const [manBirth, setManBirth] = useState('');
  const [manHour, setManHour]   = useState('');
  const [manMin, setManMin]     = useState('');
  const [manMbti, setManMbti]   = useState('');
  const [manBlood, setManBlood] = useState('');

  // 여
  const [womanBirth, setWomanBirth] = useState('');
  const [womanHour, setWomanHour]   = useState('');
  const [womanMin, setWomanMin]     = useState('');
  const [womanMbti, setWomanMbti]   = useState('');
  const [womanBlood, setWomanBlood] = useState('');

  // 상태
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState<ApiResponse | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const title = useMemo(() => topicTitleMap[topicKey] ?? '궁합 분석', [topicKey]);

  // 시간 문자열 조합 (선택 안 했으면 undefined)
  const manTime   = manHour && manMin ? `${manHour}:${manMin}`     : undefined;
  const womanTime = womanHour && womanMin ? `${womanHour}:${womanMin}` : undefined;

  const canSubmit = useMemo(() =>
    !!(manBirth && womanBirth && manMbti && womanMbti), [
      manBirth, womanBirth, manMbti, womanMbti
    ]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const payload = {
        topic: topicKey,
        man_birth: manBirth,
        woman_birth: womanBirth,
        man_mbti: manMbti,
        woman_mbti: womanMbti,
        man_blood: manBlood || undefined,
        woman_blood: womanBlood || undefined,
        man_time: manTime,
        woman_time: womanTime,
      };

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`API ${res.status} 오류`);
      const json = (await res.json()) as ApiResponse;
      if ((json as any).error) throw new Error(json.detail || 'AI 분석 중 오류 발생');

      setData({
        ...json,
        score : clampScore(json.score, 30, 98, 80),
        facets: normalizeFacets(json.facets),
      });
    } catch (err: any) {
      setError(err.message || '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-txt p-4">
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        <header className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">SOULVERSE · COMPAT</p>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-sm text-muted">사주팔자 · MBTI · 혈액형을 선택해 궁합을 분석합니다.</p>
        </header>

        {/* 입력 폼 */}
        <section className="bg-card border border-borderc rounded-2xl p-6 shadow-deep">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">

              {/* 남자 */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold">남자</h2>

                <label className="block text-xs text-muted">생년월일</label>
                <input
                  type="date"
                  value={manBirth}
                  onChange={e=>setManBirth(e.target.value)}
                  className="w-full bg-bg border border-borderc rounded-md px-3 py-2 text-sm"
                />

                <label className="block text-xs text-muted">태어난 시간 (선택)</label>
                <div className="grid grid-cols-2 gap-2">
                  <select value={manHour} onChange={e=>setManHour(e.target.value)}
                          className="w-full bg-bg border border-borderc rounded-md px-3 py-2 text-sm">
                    <option value="">시 선택</option>
                    {HOUR_LIST.map(h => <option key={h} value={h}>{h}시</option>)}
                  </select>
                  <select value={manMin} onChange={e=>setManMin(e.target.value)}
                          className="w-full bg-bg border border-borderc rounded-md px-3 py-2 text-sm">
                    <option value="">분 선택</option>
                    {MIN_LIST.map(m => <option key={m} value={m}>{m}분</option>)}
                  </select>
                </div>

                <label className="block text-xs text-muted">MBTI</label>
                <select value={manMbti} onChange={e=>setManMbti(e.target.value)}
                        className="w-full bg-bg border border-borderc rounded-md px-3 py-2 text-sm">
                  <option value="">선택</option>
                  {MBTI_LIST.map(m=> <option key={m} value={m}>{m}</option>)}
                </select>

                <label className="block text-xs text-muted">혈액형 (선택)</label>
                <select value={manBlood} onChange={e=>setManBlood(e.target.value)}
                        className="w-full bg-bg border border-borderc rounded-md px-3 py-2 text-sm">
                  <option value="">선택</option>
                  {BLOOD_LIST.map(b=> <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              {/* 여자 */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold">여자</h2>

                <label className="block text-xs text-muted">생년월일</label>
                <input
                  type="date"
                  value={womanBirth}
                  onChange={e=>setWomanBirth(e.target.value)}
                  className="w-full bg-bg border border-borderc rounded-md px-3 py-2 text-sm"
                />

                <label className="block text-xs text-muted">태어난 시간 (선택)</label>
                <div className="grid grid-cols-2 gap-2">
                  <select value={womanHour} onChange={e=>setWomanHour(e.target.value)}
                          className="w-full bg-bg border border-borderc rounded-md px-3 py-2 text-sm">
                    <option value="">시 선택</option>
                    {HOUR_LIST.map(h => <option key={h} value={h}>{h}시</option>)}
                  </select>
                  <select value={womanMin} onChange={e=>setWomanMin(e.target.value)}
                          className="w-full bg-bg border border-borderc rounded-md px-3 py-2 text-sm">
                    <option value="">분 선택</option>
                    {MIN_LIST.map(m => <option key={m} value={m}>{m}분</option>)}
                  </select>
                </div>

                <label className="block text-xs text-muted">MBTI</label>
                <select value={womanMbti} onChange={e=>setWomanMbti(e.target.value)}
                        className="w-full bg-bg border border-borderc rounded-md px-3 py-2 text-sm">
                  <option value="">선택</option>
                  {MBTI_LIST.map(m=> <option key={m} value={m}>{m}</option>)}
                </select>

                <label className="block text-xs text-muted">혈액형 (선택)</label>
                <select value={womanBlood} onChange={e=>setWomanBlood(e.target.value)}
                        className="w-full bg-bg border border-borderc rounded-md px-3 py-2 text-sm">
                  <option value="">선택</option>
                  {BLOOD_LIST.map(b=> <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="w-full mt-2 bg-accent text-bg font-semibold rounded-xl px-4 py-3 hover:bg-neon transition-all disabled:opacity-50 relative"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  {/* 스피너 */}
                  <div className="w-4 h-4 border-2 border-bg border-t-transparent rounded-full animate-spin"></div>
                  <span>AI 분석 중...</span>
                </div>
              ) : (
                'AI 궁합 리포트 받기'
              )}
            </button>
          </form>
        </section>

        {/* 결과 */}
        {data && !error && (
          <section className="bg-card border border-borderc rounded-2xl p-6 shadow-deep space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 flex items-center justify-center border-2 border-accent rounded-full bg-bg shadow-[0_0_25px_rgba(125,211,252,0.4)] animate-pulse">
                <span className="text-2xl font-bold">{clampScore(data.score, 30, 98, 80)}</span>
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold mb-1">{data.oneliner ?? '함께 성장할 관계입니다.'}</h2>
                <p className="text-sm text-muted">{data.summary ?? '두 사람의 기질과 현실을 고려해 관계를 조화롭게 만드세요.'}</p>
              </div>
            </div>

            <div className="h-px bg-borderc/50 my-6" />

            <h3 className="text-xl font-bold text-center">5가지 관계 분석 요소</h3>
            <p className="text-sm text-muted text-center">정서, 소통, 현실, 성장, 지속성 점수입니다.</p>

            {data.facets && (
              <div className="space-y-4">
                {Object.entries(data.facets).map(([key, value]) => (
                  <div key={key} className="p-3 bg-bg/50 border border-borderc/50 rounded-lg space-y-1 transition-all hover:bg-bg/70">
                    <div className="flex justify-between text-sm">
                      <span>{key}</span>
                      <span className="font-semibold text-accent">{value}</span>
                    </div>
                    <div className="h-2 w-full bg-borderc/60 rounded-full overflow-hidden">
                      <div className="h-full bg-accent transition-all duration-700" style={{ width: `${value}%` }} />
                    </div>
                    {data.explanation?.[key as keyof Facets] && (
                      <p className="text-xs text-muted pt-1">{data.explanation?.[key as keyof Facets] ?? ''}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {data.insights && data.insights.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-center">💡 관계 인사이트</h3>
                <ul className="space-y-2 p-4 bg-bg/50 border border-borderc/50 rounded-lg text-sm">
                  {data.insights.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-accent">⚡</span> {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
