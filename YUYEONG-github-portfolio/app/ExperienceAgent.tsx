"use client";

import { FormEvent, useEffect, useState, type CSSProperties } from "react";

type Coordinates = { latitude: number; longitude: number };
type ActivityKind = "lunch" | "cafe" | "dinner" | "drive";
type BudgetTier = "light" | "date" | "special" | "signature";
type MenuData = {
  cuisine: string;
  registeredMenuUrl: string | null;
  officialWebsiteUrl: string | null;
  phone: string | null;
  guide: string[];
  explorationTerms: string[];
  budgetLabel: string;
  guideLabel: string;
  note: string;
  naverSearchUrl: string;
  googleSearchUrl: string;
};
type ReasoningAudit = {
  policyVersion: string;
  mode: "private-structured-reasoning";
  stages: Array<{
    id: string;
    key: string;
    name: string;
    status: "passed" | "attention";
    summary: string;
  }>;
  confidence: { score: number; label: string; factors: string[] };
  factsUsed: string[];
  uncertainties: string[];
  safetyNote: string;
};
type ReActRun = {
  framework: "ReAct";
  policyVersion: string;
  mode: "private-reasoning-public-actions";
  cycles: Array<{
    id: string;
    action: { tool: string; label: string; input: string };
    observation: { status: "grounded" | "attention"; summary: string; facts: string[] };
    decision: string;
    replan: boolean;
  }>;
  iterations: number;
  replanCount: number;
  rawThoughtsExposed: false;
  stopReason: string;
  safetyNote: string;
};
type ExperienceStop = {
  id: string;
  activity: ActivityKind;
  activityLabel: string;
  arrivalTime: string;
  leaveTime: string;
  durationMinutes: number;
  travel: { minutes: number; distanceMeters: number; from: string };
  pauseBefore: string | null;
  place: {
    name: string;
    latitude: number;
    longitude: number;
    type: string;
    cuisine: string;
    openingHours: string | null;
    websiteUrl: string | null;
    mapUrl: string;
  };
  reason: string;
  evidence: {
    facts: string[];
    inference: string;
    unknowns: string[];
    confidence: "high" | "medium";
  };
  diningFit: {
    budgetTier: BudgetTier;
    budgetLabel: string;
    rangeLabel: string;
    level: string;
    premiumScore: number;
    signals: string[];
    summary: string;
    priceVerified: false;
    verificationNote: string;
  } | null;
  menu: MenuData | null;
};
type RecommendationItem = {
  id: string;
  kind: "restaurant" | "cafe" | "drive";
  name: string;
  type: string;
  cuisine: string;
  distanceMeters: number;
  selected: boolean;
  reason: string;
  mapUrl: string;
  websiteUrl: string | null;
  menuUrl: string | null;
  travel: { minutes: number; distanceMeters: number; source: "OSRM" | "estimated" } | null;
};
type ExperienceResult = {
  location: { label: string; latitude: number; longitude: number };
  context: {
    companion: string;
    mood: string;
    startTime: string;
    endTime: string;
    transport: "drive" | "walk";
    requestedActivities: ActivityKind[];
    budget: {
      tier: BudgetTier;
      label: string;
      rangeLabel: string;
      detail: string;
    };
  };
  weather: {
    temperature: number;
    apparentTemperature: number;
    description: string;
    advice: string;
    dayMax: number | null;
    dayMin: number | null;
    rainChance: number | null;
  } | null;
  summary: {
    title: string;
    stopCount: number;
    totalDistanceMeters: number;
    totalTravelMinutes: number;
    plannedEndTime: string;
    overrunMinutes: number;
    routeSource: "OSRM" | "estimated";
  };
  tools: Array<{ name: string; label: string; detail: string }>;
  reasoning: ReasoningAudit;
  react: ReActRun;
  model: {
    id: string;
    name: string;
    purpose: string;
    status: "active" | "fallback";
    used: boolean;
    summary: string;
    note: string;
  };
  recommendations: {
    limitPerCategory: 4;
    minimumDriveMinutes: 20;
    restaurants: RecommendationItem[];
    cafes: RecommendationItem[];
    drives: RecommendationItem[];
  };
  stops: ExperienceStop[];
  routeUrl: string;
  meta: { generatedAt: string; placeSource: string; weatherSource: string; routeSource: string };
};
type TasteMemory = { name: string; cuisine: string; savedAt: string };

const companionChoices = ["혼자", "연인과", "친구와"];
const moodChoices = ["편안하게", "분위기 있게", "새롭게", "든든하게", "가볍게"];
const budgetChoices: Array<{ tier: BudgetTier; label: string; range: string; detail: string; mark: string }> = [
  { tier: "light", label: "가벼운 식사", range: "6만원 이하", detail: "식당 한 곳의 편안한 한 끼", mark: "LIGHT" },
  { tier: "date", label: "설레는 식사", range: "6–14만원", detail: "식당 분위기와 메뉴의 균형", mark: "DATE" },
  { tier: "special", label: "특별한 식사", range: "14–30만원", detail: "코스·셰프 추천 식당 탐색", mark: "SPECIAL" },
  { tier: "signature", label: "시그니처 식사", range: "30만원 이상", detail: "오마카세·파인다이닝 식당", mark: "SIGNATURE" },
];
const activityChoices: Array<{ value: ActivityKind; label: string; symbol: string; detail: string }> = [
  { value: "lunch", label: "점심", symbol: "12", detail: "하루의 시작" },
  { value: "cafe", label: "카페", symbol: "○", detail: "잠시 머무름" },
  { value: "dinner", label: "저녁", symbol: "18", detail: "하루의 맛" },
  { value: "drive", label: "드라이브", symbol: "→", detail: "길 위의 마무리" },
];
const loadingSteps = [
  "하루의 시작점을 이해하고 있어요",
  "오늘의 날씨와 장소를 확인하고 있어요",
  "서로 다른 경험을 고르고 있어요",
  "장소 사이의 실제 이동시간을 계산하고 있어요",
  "하루가 자연스럽게 흐르도록 시간을 다듬고 있어요",
];
const recommendationGroupMeta: Array<{
  key: "restaurants" | "cafes" | "drives";
  index: string;
  title: string;
  detail: string;
}> = [
  { key: "restaurants", index: "01", title: "식당 4곳", detail: "식사 예산과 취향으로 랭킹" },
  { key: "cafes", index: "02", title: "카페 4곳", detail: "예산과 무관하게 동선으로 랭킹" },
  { key: "drives", index: "03", title: "드라이브 4곳", detail: "이전 일정 지점에서 차량 20분 이상" },
];
const settingsKey = "yuyeong-experience-settings";
const tasteMemoryKey = "yuyeong-taste-memory";

function distanceText(meters: number) {
  if (meters < 1000) return `${meters.toLocaleString("ko-KR")}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function durationText(minutes: number) {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

export function ExperienceAgent() {
  const [location, setLocation] = useState("성수역, 서울");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [companion, setCompanion] = useState("연인과");
  const [mood, setMood] = useState("분위기 있게");
  const [budgetTier, setBudgetTier] = useState<BudgetTier>("date");
  const [startTime, setStartTime] = useState("11:30");
  const [endTime, setEndTime] = useState("22:30");
  const [transport, setTransport] = useState<"drive" | "walk">("drive");
  const [activities, setActivities] = useState<ActivityKind[]>(["lunch", "cafe", "dinner", "drive"]);
  const [memory, setMemory] = useState<TasteMemory[]>([]);
  const [result, setResult] = useState<ExperienceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    try {
      const settings = JSON.parse(localStorage.getItem(settingsKey) ?? "null") as {
        location?: string;
        companion?: string;
        mood?: string;
        startTime?: string;
        endTime?: string;
        transport?: "drive" | "walk";
        activities?: ActivityKind[];
        budgetTier?: BudgetTier;
      } | null;
      if (settings?.location) setLocation(settings.location);
      if (settings?.companion && companionChoices.includes(settings.companion)) setCompanion(settings.companion);
      if (settings?.mood && moodChoices.includes(settings.mood)) setMood(settings.mood);
      if (settings?.startTime) setStartTime(settings.startTime);
      if (settings?.endTime) setEndTime(settings.endTime);
      if (settings?.transport) setTransport(settings.transport);
      if (settings?.activities?.length) setActivities(settings.activities);
      if (settings?.budgetTier && budgetChoices.some((choice) => choice.tier === settings.budgetTier)) setBudgetTier(settings.budgetTier);
      const savedMemory = JSON.parse(localStorage.getItem(tasteMemoryKey) ?? "[]") as TasteMemory[];
      if (Array.isArray(savedMemory)) setMemory(savedMemory.slice(0, 8));
    } catch {
      localStorage.removeItem(settingsKey);
    }
  }, []);

  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      return;
    }
    const interval = window.setInterval(() => {
      setLoadingStep((step) => Math.min(step + 1, loadingSteps.length - 1));
    }, 1900);
    return () => window.clearInterval(interval);
  }, [loading]);

  function toggleActivity(activity: ActivityKind) {
    setActivities((current) => current.includes(activity)
      ? current.filter((item) => item !== activity)
      : [...current, activity]);
    if (activity === "drive" && !activities.includes("drive")) setTransport("drive");
  }

  function useCurrentLocation() {
    setError(null);
    setFeedback(null);
    if (!navigator.geolocation) {
      setError("이 브라우저에서는 현재 위치를 사용할 수 없어요. 출발지를 직접 입력해주세요.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocation("현재 위치");
        setLocating(false);
        setFeedback("현재 위치를 하루의 시작점으로 담았어요.");
      },
      () => {
        setLocating(false);
        setError("위치 권한을 받지 못했어요. ‘성수역, 서울’처럼 직접 입력해주세요.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  async function designExperience(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activities.length === 0) {
      setError("점심, 카페, 저녁 또는 드라이브 중 하나 이상을 선택해주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    setFeedback(null);
    setOpenMenuId(null);

    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 45000);
      const response = await fetch("/api/experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: location,
          coordinates,
          companion,
          mood,
          startTime,
          endTime,
          transport,
          activities,
          budgetTier,
          preferences: memory.map((item) => item.cuisine),
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      const data = (await response.json()) as ExperienceResult & { error?: string };
      if (!response.ok) throw new Error(data.error || "하루의 경험을 완성하지 못했어요.");
      setResult(data);
      localStorage.setItem(settingsKey, JSON.stringify({ location, companion, mood, startTime, endTime, transport, activities, budgetTier }));
    } catch (requestError) {
      const message = requestError instanceof DOMException && requestError.name === "AbortError"
        ? "경험을 설계하는 데 예상보다 오래 걸리고 있어요. 잠시 뒤 다시 시도해주세요."
        : requestError instanceof Error
          ? requestError.message
          : "하루의 경험을 설계하는 중 문제가 생겼어요.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function rememberCourse() {
    if (!result) return;
    const foodStops = result.stops.filter((stop) => stop.menu);
    const nextMemory = [
      ...foodStops.map((stop) => ({ name: stop.place.name, cuisine: stop.place.cuisine, savedAt: new Date().toISOString() })),
      ...memory.filter((item) => !foodStops.some((stop) => stop.place.name === item.name)),
    ].slice(0, 8);
    localStorage.setItem(tasteMemoryKey, JSON.stringify(nextMemory));
    setMemory(nextMemory);
    setFeedback("오늘의 음식과 경험을 다음 유영을 위한 취향으로 기억했어요.");
  }

  return (
    <div className="experience-agent-console">
      <form className="experience-request" onSubmit={designExperience}>
        <div className="panel-topline">
          <span>오늘의 경험 조건</span>
          <span className="demo-badge"><i /> FULL DAY LIVE</span>
        </div>

        <div className="experience-field">
          <label htmlFor="experience-location">어디에서 시작하나요?</label>
          <div className="location-input">
            <span aria-hidden="true">⌖</span>
            <input
              id="experience-location"
              value={location}
              onChange={(event) => {
                setLocation(event.target.value);
                setCoordinates(null);
              }}
              placeholder="역, 동네 또는 건물 이름"
              maxLength={100}
            />
            <button type="button" onClick={useCurrentLocation} disabled={locating}>{locating ? "찾는 중" : "현재 위치"}</button>
          </div>
        </div>

        <div className="experience-time-grid">
          <label>
            <span>시작 시간</span>
            <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </label>
          <i aria-hidden="true">→</i>
          <label>
            <span>마무리 시간</span>
            <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </label>
        </div>

        <fieldset className="experience-field">
          <legend>누구와 함께하나요?</legend>
          <div className="lunch-choice-row">
            {companionChoices.map((item) => (
              <button type="button" key={item} className={companion === item ? "lunch-choice active" : "lunch-choice"} aria-pressed={companion === item} onClick={() => setCompanion(item)}>{item}</button>
            ))}
          </div>
        </fieldset>

        <fieldset className="experience-field">
          <legend>어떤 결의 하루인가요?</legend>
          <div className="experience-mood-row">
            {moodChoices.map((item) => (
              <button type="button" key={item} className={mood === item ? "lunch-choice active" : "lunch-choice"} aria-pressed={mood === item} onClick={() => setMood(item)}>{item}</button>
            ))}
          </div>
        </fieldset>

        <fieldset className="experience-field budget-field">
          <legend>점심·저녁 식당 한 곳의 2인 식사비는?</legend>
          <p className="budget-caption">점심과 저녁 식당에 각각 적용해요. 카페·드라이브·주차·총 데이트 비용에는 영향을 주지 않습니다.</p>
          <div className="budget-grid">
            {budgetChoices.map((choice) => {
              const active = budgetTier === choice.tier;
              return (
                <button type="button" key={choice.tier} className={active ? "budget-choice active" : "budget-choice"} aria-pressed={active} onClick={() => setBudgetTier(choice.tier)}>
                  <span>{choice.mark}</span>
                  <strong>{choice.label}</strong>
                  <b>식당 1곳 · 2인 {choice.range}</b>
                  <small>{choice.detail}</small>
                  <i>{active ? "✓" : ""}</i>
                </button>
              );
            })}
          </div>
          <small className="budget-truth-note"><i>i</i> 점심과 저녁을 모두 선택하면 각 식당에 같은 예산을 따로 적용합니다. 실제 가격은 메뉴 링크에서 확인해요.</small>
        </fieldset>

        <fieldset className="experience-field">
          <legend>오늘 넣고 싶은 경험</legend>
          <div className="activity-grid">
            {activityChoices.map((item) => {
              const active = activities.includes(item.value);
              return (
                <button type="button" key={item.value} className={active ? "activity-choice active" : "activity-choice"} aria-pressed={active} onClick={() => toggleActivity(item.value)}>
                  <i>{item.symbol}</i><span><strong>{item.label}</strong><small>{item.detail}</small></span><b>{active ? "✓" : "+"}</b>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="experience-field">
          <legend>주로 어떻게 이동하나요?</legend>
          <div className="transport-row">
            <button type="button" className={transport === "drive" ? "transport-choice active" : "transport-choice"} onClick={() => setTransport("drive")} aria-pressed={transport === "drive"}><span>DRIVE</span>자동차</button>
            <button type="button" className={transport === "walk" ? "transport-choice active" : "transport-choice"} onClick={() => setTransport("walk")} aria-pressed={transport === "walk"} disabled={activities.includes("drive")}><span>WALK</span>도보 중심</button>
          </div>
          {activities.includes("drive") && <small className="transport-note">드라이브가 포함되어 자동차 동선으로 계산해요.</small>}
        </fieldset>

        <button className="design-button experience-submit" type="submit" disabled={loading || !location.trim() || activities.length === 0}>
          {loading ? <><span className="button-loader" /> 하루를 엮고 있어요</> : <>오늘의 경험 전체 설계하기 <span aria-hidden="true">↗</span></>}
        </button>
        <p className="lunch-data-note"><i /> 실제 장소·날씨·도로 경로 데이터를 사용합니다.</p>
      </form>

      <section className="experience-results" aria-live="polite" aria-busy={loading}>
        {loading ? (
          <div className="agent-loading full-day-loading">
            <div className="loading-orbit" aria-hidden="true"><i /><i /><b /></div>
            <span>YUYEONG IS ORCHESTRATING</span>
            <h3>{loadingSteps[loadingStep]}</h3>
            <div className="loading-progress">{loadingSteps.map((_, index) => <i key={index} className={index <= loadingStep ? "active" : ""} />)}</div>
            <p>장소 하나가 아니라, 시작부터 마지막까지 이어지는 경험을 만들고 있어요.</p>
          </div>
        ) : error ? (
          <div className="agent-empty error-state full-day-empty">
            <span aria-hidden="true">!</span>
            <p>잠시 흐름을 놓쳤어요</p>
            <h3>{error}</h3>
            <small>출발지를 더 구체적으로 쓰거나 경험을 줄여 다시 시도해주세요.</small>
          </div>
        ) : result ? (
          <div className="experience-result-content">
            <div className="experience-result-header">
              <div>
                <span className="plan-kicker">YUYEONG&apos;S DAY FLOW</span>
                <h3>{result.summary.title}</h3>
                <p>{result.location.label.split(",").slice(0, 2).join(", ")} · {result.context.startTime}—{result.summary.plannedEndTime}</p>
              </div>
              <div className="day-weather">
                <strong>{result.weather ? `${result.weather.temperature}°` : "—"}</strong>
                <span>{result.weather?.description ?? "날씨 확인 안 됨"}</span>
                {result.weather?.rainChance != null && <small>비 {result.weather.rainChance}%</small>}
              </div>
            </div>

            <div className="day-summary-strip">
              <div><span>EXPERIENCES</span><strong>{result.summary.stopCount}개의 순간</strong></div>
              <i />
              <div><span>ROUTE</span><strong>{distanceText(result.summary.totalDistanceMeters)}</strong></div>
              <i />
              <div><span>ON THE MOVE</span><strong>{durationText(result.summary.totalTravelMinutes)}</strong></div>
              <i />
              <div><span>TRANSPORT</span><strong>{result.context.transport === "drive" ? "자동차" : "도보"}</strong></div>
            </div>

            <div className={`budget-result-ribbon tier-${result.context.budget.tier}`}>
              <div><span>RESTAURANT BUDGET ONLY</span><strong>{result.context.budget.label}</strong></div>
              <b>{result.context.budget.rangeLabel}</b>
              <p>점심·저녁 식당 각각 적용 · 카페·드라이브 제외</p>
            </div>

            <div className={`model-status-card ${result.model.status}`}>
              <div><span>LLM MODEL</span><strong>{result.model.name}</strong><small>{result.model.id}</small></div>
              <b>{result.model.used ? "API ACTIVE" : "TARGET CONFIGURED"}</b>
              <div><p>{result.model.summary}</p><small>{result.model.note}</small></div>
            </div>

            <section className="react-panel" aria-label="ReAct Agent 실행 로그">
              <div className="react-panel-head">
                <div>
                  <span>REASON + ACT · POLICY {result.react.policyVersion}</span>
                  <h4>ReAct 실행 루프</h4>
                  <p>{result.react.safetyNote}</p>
                </div>
                <div className="react-run-stats">
                  <span><b>{result.react.iterations}</b> ACTIONS</span>
                  <span><b>{result.react.replanCount}</b> REPLAN</span>
                </div>
              </div>

              <div className="react-cycle-list">
                {result.react.cycles.map((cycle) => (
                  <article key={cycle.id} className={`${cycle.observation.status}${cycle.replan ? " replanned" : ""}`}>
                    <div className="react-cycle-title"><i>{cycle.id}</i><strong>{cycle.action.label}</strong>{cycle.replan && <b>REPLAN</b>}</div>
                    <div className="react-action-row"><span>ACT</span><p><b>{cycle.action.tool}</b>{cycle.action.input}</p></div>
                    <div className="react-observe-row"><span>OBS</span><p>{cycle.observation.summary}</p></div>
                    <div className="react-facts">{cycle.observation.facts.map((fact) => <i key={fact}>{fact}</i>)}</div>
                    <p className="react-decision"><span>→</span>{cycle.decision}</p>
                  </article>
                ))}
              </div>

              <div className="react-stop"><span>STOP</span><p>{result.react.stopReason}</p><i>RAW THOUGHTS {result.react.rawThoughtsExposed ? "ON" : "OFF"}</i></div>
            </section>

            <section className="reasoning-audit" aria-label="Agent 6단계 사고 검증">
              <div className="reasoning-audit-head">
                <div>
                  <span>REASONING AUDIT · POLICY {result.reasoning.policyVersion}</span>
                  <h4>6단계 사고 검증</h4>
                  <p>{result.reasoning.safetyNote}</p>
                </div>
                <div className="confidence-ring" style={{ "--confidence": `${result.reasoning.confidence.score * 100}%` } as CSSProperties}>
                  <strong>{Math.round(result.reasoning.confidence.score * 100)}</strong>
                  <span>신뢰도 {result.reasoning.confidence.label}</span>
                </div>
              </div>

              <div className="reasoning-stages">
                {result.reasoning.stages.map((stage) => (
                  <article key={stage.id} className={stage.status === "passed" ? "passed" : "attention"}>
                    <div><i>{stage.id}</i><span>{stage.status === "passed" ? "검증됨" : "주의"}</span></div>
                    <h5>{stage.name}</h5>
                    <p>{stage.summary}</p>
                  </article>
                ))}
              </div>

              <div className="reasoning-ledger">
                <div>
                  <span>확인한 사실</span>
                  {result.reasoning.factsUsed.map((fact) => <p key={fact}><i>✓</i>{fact}</p>)}
                </div>
                <div>
                  <span>아직 알 수 없는 것</span>
                  {result.reasoning.uncertainties.map((item) => <p key={item}><i>?</i>{item}</p>)}
                </div>
              </div>

              <details className="tool-details audit-tools">
                <summary>근거를 가져온 도구 확인하기 <span>＋</span></summary>
                <div className="experience-tool-trace">
                  {result.tools.map((tool) => <div key={tool.name}><span><i>✓</i>{tool.label}</span><p>{tool.detail}</p></div>)}
                </div>
              </details>
            </section>

            {result.summary.overrunMinutes > 0 && (
              <div className="schedule-warning"><span>!</span>요청한 마무리 시간보다 {durationText(result.summary.overrunMinutes)} 길어요. 장소에서 머무는 시간을 줄이면 맞출 수 있어요.</div>
            )}

            <section className="recommendation-deck" aria-label="카테고리별 추천 후보">
              <div className="recommendation-deck-head">
                <div>
                  <span>CANDIDATE SET · 4 PER CATEGORY</span>
                  <h4>한 가지 동선을 만들기 전,<br />각각 네 곳을 비교했어요.</h4>
                </div>
                <p>식당과 카페, 드라이브 후보를 각각 4곳씩 보여드립니다. <b>동선 채택</b> 표시는 최종 하루 계획에 반영된 장소예요.</p>
              </div>
              <div className="recommendation-groups">
                {recommendationGroupMeta.map((group) => {
                  const items = result.recommendations[group.key];
                  if (items.length === 0) return null;
                  return (
                    <div className={`recommendation-group group-${group.key}`} key={group.key}>
                      <div className="recommendation-group-head">
                        <i>{group.index}</i>
                        <div><strong>{group.title}</strong><span>{group.detail}</span></div>
                        <b>{items.length}/4</b>
                      </div>
                      <div className="candidate-list">
                        {items.map((item, index) => (
                          <article className={item.selected ? "selected" : ""} key={`${group.key}-${item.id}`}>
                            <div className="candidate-rank"><i>{String(index + 1).padStart(2, "0")}</i>{item.selected && <b>동선 채택</b>}</div>
                            <h5>{item.name}</h5>
                            <div className="candidate-facts">
                              <span>{item.type}</span>
                              {item.travel
                                ? <span className="drive-minimum">차량 {item.travel.minutes}분 · {distanceText(item.travel.distanceMeters)}</span>
                                : <span>출발지 직선 {distanceText(item.distanceMeters)}</span>}
                            </div>
                            <p>{item.reason}</p>
                            {item.travel && (
                              <small className={item.travel.source === "OSRM" ? "route-grounded" : "route-estimated"}>
                                {item.travel.source === "OSRM" ? "도로 경로 확인" : "이동시간 추정"} · 최소 {result.recommendations.minimumDriveMinutes}분 통과
                              </small>
                            )}
                            <div className="candidate-actions">
                              {item.menuUrl && <a href={item.menuUrl} target="_blank" rel="noreferrer">메뉴 보기</a>}
                              <a href={item.mapUrl} target="_blank" rel="noreferrer">지도 보기</a>
                              {item.websiteUrl && <a href={item.websiteUrl} target="_blank" rel="noreferrer">공식 사이트</a>}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="day-timeline">
              {result.stops.map((stop, index) => {
                const menuOpen = openMenuId === stop.id;
                return (
                  <div className="day-stop-wrap" key={stop.id}>
                    <div className="travel-connector">
                      <span>{index === 0 ? "START" : result.stops[index - 1].place.name}</span>
                      <i><b /></i>
                      <strong>{result.context.transport === "drive" ? "차량" : "도보"} {stop.travel.minutes}분 · {distanceText(stop.travel.distanceMeters)}</strong>
                    </div>
                    {stop.pauseBefore && <p className="pause-note"><span>여백</span>{stop.pauseBefore}</p>}
                    <article className={`day-stop tone-${stop.activity}`}>
                      <div className="day-stop-time"><strong>{stop.arrivalTime}</strong><span>{stop.leaveTime}까지</span></div>
                      <div className="day-stop-marker" aria-hidden="true"><i>{String(index + 1).padStart(2, "0")}</i><b /></div>
                      <div className="day-stop-main">
                        <span className="activity-label">{stop.activityLabel}</span>
                        <h4>{stop.place.name}</h4>
                        <div className="stop-facts">
                          <i>{stop.place.type}</i>
                          <i>{durationText(stop.durationMinutes)}</i>
                          {stop.place.openingHours && <i>영업시간 등록됨</i>}
                          {stop.diningFit && <i>{stop.diningFit.rangeLabel}</i>}
                        </div>
                        <p>{stop.reason}</p>
                        {stop.diningFit && (
                          <div className={`date-dining-fit tier-${stop.diningFit.budgetTier}`}>
                            <div><span>DATE DINING MATCH</span><b>{stop.diningFit.level}</b></div>
                            <p>{stop.diningFit.summary}</p>
                            {stop.diningFit.signals.length > 0 && <div>{stop.diningFit.signals.map((signal) => <i key={signal}>{signal}</i>)}</div>}
                            <small><i>!</i>{stop.diningFit.verificationNote}</small>
                          </div>
                        )}
                        <details className="stop-evidence">
                          <summary>선택 근거 검증 <span>{stop.evidence.confidence === "high" ? "높은 근거" : "보통 근거"}</span></summary>
                          <div className="stop-evidence-grid">
                            <div><b>FACT</b>{stop.evidence.facts.map((fact) => <p key={fact}>{fact}</p>)}</div>
                            <div><b>INFERENCE</b><p>{stop.evidence.inference}</p></div>
                            <div><b>UNKNOWN</b>{stop.evidence.unknowns.map((unknown) => <p key={unknown}>{unknown}</p>)}</div>
                          </div>
                        </details>
                        <div className="stop-actions">
                          {stop.menu && <button type="button" className={menuOpen ? "active" : ""} onClick={() => setOpenMenuId(menuOpen ? null : stop.id)}>메뉴 보기 <span>{menuOpen ? "−" : "+"}</span></button>}
                          <a href={stop.place.mapUrl} target="_blank" rel="noreferrer">장소 지도 ↗</a>
                          {stop.place.websiteUrl && <a href={stop.place.websiteUrl} target="_blank" rel="noreferrer">공식 사이트 ↗</a>}
                        </div>
                      </div>
                    </article>

                    {stop.menu && menuOpen && (
                      <div className="menu-drawer">
                        <div className="menu-drawer-head">
                          <div><span>MENU · {stop.menu.cuisine}</span><h5>{stop.place.name} 메뉴 살펴보기</h5></div>
                          <button type="button" onClick={() => setOpenMenuId(null)} aria-label="메뉴 닫기">×</button>
                        </div>
                        <div className="menu-guide">
                          <span>{stop.menu.guideLabel}</span>
                          <div>{stop.menu.guide.map((item, menuIndex) => <article key={item}><i>0{menuIndex + 1}</i><strong>{item}</strong><small>메뉴 유형</small></article>)}</div>
                        </div>
                        <div className="premium-menu-search">
                          <span>{stop.menu.budgetLabel}에서 확인할 탐색 메뉴</span>
                          <div>{stop.menu.explorationTerms.map((item) => <i key={item}>{item}</i>)}</div>
                          <small>탐색 키워드이며 이 매장의 실제 판매 메뉴를 뜻하지 않아요.</small>
                        </div>
                        <p className="menu-note"><i>i</i>{stop.menu.note}</p>
                        <div className="menu-links">
                          {stop.menu.registeredMenuUrl && <a className="registered-menu" href={stop.menu.registeredMenuUrl} target="_blank" rel="noreferrer">매장 등록 메뉴 열기 ↗</a>}
                          {stop.menu.officialWebsiteUrl && <a href={stop.menu.officialWebsiteUrl} target="_blank" rel="noreferrer">공식 사이트에서 확인 ↗</a>}
                          <a href={stop.menu.naverSearchUrl} target="_blank" rel="noreferrer">네이버에서 실제 메뉴 찾기 ↗</a>
                          <a href={stop.menu.googleSearchUrl} target="_blank" rel="noreferrer">Google에서 실제 메뉴 찾기 ↗</a>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="route-finish">
              <div><span>COMPLETE ROUTE</span><h4>{result.context.startTime}부터 {result.summary.plannedEndTime}까지, 하나의 동선으로 준비됐어요.</h4><p>각 장소는 입력한 순서대로 지도에 연결됩니다.</p></div>
              <a href={result.routeUrl} target="_blank" rel="noreferrer">전체 동선 지도에서 열기 <span>↗</span></a>
            </div>

            <div className="experience-result-actions">
              <button type="button" onClick={rememberCourse}>이 경험과 취향 기억하기</button>
              <span>장소 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · 날씨 <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · 경로 OSRM</span>
            </div>
          </div>
        ) : (
          <div className="agent-empty full-day-empty">
            <div className="day-empty-orbit" aria-hidden="true"><i /><i /><b /><b /></div>
            <span>YOUR WHOLE DAY, IN ONE FLOW</span>
            <h3>하고 싶은 순간들을 고르면,<br />하루의 동선으로 연결할게요.</h3>
            <p>점심부터 카페, 저녁과 드라이브까지.<br />날씨와 이동시간을 확인해 경험 전체를 설계합니다.</p>
            <div className="empty-day-flow"><i>점심</i><b>→</b><i>카페</i><b>→</b><i>저녁</i><b>→</b><i>드라이브</i></div>
          </div>
        )}
        {feedback && <p className="experience-feedback"><span>✓</span>{feedback}</p>}
      </section>
    </div>
  );
}
