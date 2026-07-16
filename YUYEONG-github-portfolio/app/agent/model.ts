export const AGENT_MODEL_ID = "gpt-5.6-sol";
export const AGENT_MODEL_NAME = "GPT-5.6 Sol";
export const AGENT_MODEL_PURPOSE = "ReAct 결과의 최종 제약·근거 요약";

type ModelAuditInput = {
  location: string;
  activities: string[];
  restaurantBudget: string;
  stops: Array<{ activity: string; name: string; type: string; premiumSignals: string[] }>;
  recommendationCounts: { restaurants: number; cafes: number; drives: number };
  minimumDriveMinutes: number;
  driveRecommendations: Array<{ name: string; minutes: number; source: string }>;
  routeSource: string;
  uncertainties: string[];
};

function extractResponseText(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const response = data as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (typeof response.output_text === "string") return response.output_text.trim();
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text!.trim())
    .filter(Boolean)
    .join(" ");
}

export async function runModelAudit(input: ModelAuditInput, fetcher: (url: string, init: RequestInit) => Promise<Response>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      id: AGENT_MODEL_ID,
      name: AGENT_MODEL_NAME,
      purpose: AGENT_MODEL_PURPOSE,
      status: "fallback" as const,
      used: false,
      summary: "모델 대상은 설정됐지만 API 비밀키가 없어 결정론적 ReAct 검증만 실행했어요.",
      note: "OPENAI_API_KEY가 연결되면 GPT-5.6 Sol이 최종 제약·근거 요약을 한 번 수행합니다.",
    };
  }

  try {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AGENT_MODEL_ID,
        reasoning: { effort: "medium" },
        max_output_tokens: 180,
        instructions: "You are the final safety critic for YUYEONG. Use only the supplied JSON facts. Verify that every requested recommendation category has four candidates and every drive recommendation is at least the supplied minimumDriveMinutes. Do not add venue claims, prices, ratings, ambience, menus, or opening status. Do not reveal chain-of-thought. Return one concise Korean sentence that states whether the itinerary constraints are internally consistent and names the most important unknown.",
        input: JSON.stringify(input),
      }),
    });
    if (!response.ok) throw new Error(`OpenAI response ${response.status}`);
    const summary = extractResponseText(await response.json()).slice(0, 360);
    if (!summary) throw new Error("Empty model response");
    return {
      id: AGENT_MODEL_ID,
      name: AGENT_MODEL_NAME,
      purpose: AGENT_MODEL_PURPOSE,
      status: "active" as const,
      used: true,
      summary,
      note: "모델 요약은 장소 선택을 덮어쓰지 않으며, 검증된 도구 데이터와 UNKNOWN 표기를 유지합니다.",
    };
  } catch {
    return {
      id: AGENT_MODEL_ID,
      name: AGENT_MODEL_NAME,
      purpose: AGENT_MODEL_PURPOSE,
      status: "fallback" as const,
      used: false,
      summary: "GPT-5.6 Sol 호출이 완료되지 않아 결정론적 ReAct 검증 결과를 유지했어요.",
      note: "모델 실패를 숨기지 않고 기존 도구 기반 결과로 안전하게 폴백했습니다.",
    };
  }
}
