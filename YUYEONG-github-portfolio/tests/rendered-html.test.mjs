import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("https://yuyeong.example/", {
      headers: { accept: "text/html", host: "yuyeong.example" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the YUYEONG experience agent", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="ko">/i);
  assert.match(html, /<title>YUYEONG — 오늘의 경험을 설계하는 AI Agent<\/title>/i);
  assert.match(html, /오늘을 계획하지 말고/);
  assert.match(html, /오늘의 경험 전체/);
  assert.match(html, /왜 Agent/i);
  assert.match(html, /PORTFOLIO CASE STUDY/);
  assert.match(html, /FULL DAY EXPERIENCE AGENT/);
  assert.match(html, /FULL DAY LIVE/);
  assert.match(html, /오늘의 경험 전체 설계하기/);
  assert.match(html, /점심부터 카페, 저녁과 드라이브까지/);
  assert.match(html, /https:\/\/yuyeong\.example\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Starter Project/i);
});

test("ships the full-day route, menu, and six-stage reasoning audit", async () => {
  const [page, experienceAgent, experienceRoute, lunchRoute, systemPrompt, modelConfig, layout, css, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ExperienceAgent.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/experience/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/lunch/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/agent/system-prompt.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/agent/model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<ExperienceAgent \/>/);
  assert.match(page, /Tool orchestration/);
  assert.match(page, /Long-term memory/);
  assert.match(experienceAgent, /navigator\.geolocation/);
  assert.match(experienceAgent, /localStorage\.setItem/);
  assert.match(experienceAgent, /menu-drawer/);
  assert.match(experienceAgent, /6단계 사고 검증/);
  assert.match(experienceAgent, /선택 근거 검증/);
  assert.match(experienceAgent, /budgetChoices/);
  assert.match(experienceAgent, /DATE DINING MATCH/);
  assert.match(experienceAgent, /ReAct 실행 루프/);
  assert.match(experienceAgent, /RAW THOUGHTS/);
  assert.match(experienceAgent, /식당 한 곳의 2인 식사비/);
  assert.match(experienceAgent, /카페·드라이브·주차·총 데이트 비용에는 영향을 주지 않습니다/);
  assert.match(experienceAgent, /GPT-5\.6 Sol|result\.model\.name/);
  assert.match(experienceAgent, /CANDIDATE SET · 4 PER CATEGORY/);
  assert.match(experienceAgent, /식당 4곳/);
  assert.match(experienceAgent, /카페 4곳/);
  assert.match(experienceAgent, /드라이브 4곳/);
  assert.match(experienceAgent, /최소 \{result\.recommendations\.minimumDriveMinutes\}분 통과/);
  assert.match(experienceRoute, /nominatim\.openstreetmap\.org/);
  assert.match(experienceRoute, /api\.open-meteo\.com/);
  assert.match(experienceRoute, /overpass-api\.de/);
  assert.match(experienceRoute, /router\.project-osrm\.org/);
  assert.match(experienceRoute, /googleRouteUrl/);
  assert.match(experienceRoute, /menuFor/);
  assert.match(experienceRoute, /assertPlanConsistency/);
  assert.match(experienceRoute, /buildReasoningAudit/);
  assert.match(experienceRoute, /evidenceFor/);
  assert.match(experienceRoute, /budgetProfiles/);
  assert.match(experienceRoute, /premiumProfile/);
  assert.match(experienceRoute, /dateDiningFit/);
  assert.match(experienceRoute, /priceVerified:\s*false/);
  assert.match(experienceRoute, /createReActTrace/);
  assert.match(experienceRoute, /PremiumExpand/);
  assert.match(experienceRoute, /needsPremiumExpansion/);
  assert.match(experienceRoute, /rawThoughtsExposed:\s*false/);
  assert.match(experienceRoute, /runModelAudit/);
  assert.match(experienceRoute, /식당 1곳 · 2인/);
  assert.match(experienceRoute, /RECOMMENDATION_LIMIT = 4/);
  assert.match(experienceRoute, /MIN_DRIVE_MINUTES = 20/);
  assert.match(experienceRoute, /table\/v1\/driving/);
  assert.match(experienceRoute, /durationSeconds >= MIN_DRIVE_MINUTES \* 60/);
  assert.match(experienceRoute, /recommendations\.restaurants\.length !== RECOMMENDATION_LIMIT/);
  assert.match(lunchRoute, /selected\.slice\(0, 4\)/);
  assert.match(systemPrompt, /AGENT_REASONING_STAGES/);
  assert.equal((systemPrompt.match(/key: "/g) ?? []).length, 6);
  assert.match(systemPrompt, /Do not expose raw chain-of-thought/);
  assert.match(systemPrompt, /Unknown is an allowed and preferred answer/);
  assert.match(systemPrompt, /budget is a ranking constraint, not verified venue pricing/);
  assert.match(systemPrompt, /bounded ReAct loop/);
  assert.match(systemPrompt, /Maximum premium-search replans: 1/);
  assert.match(systemPrompt, /Never apply it to cafes, driving, fuel, parking, or total date cost/);
  assert.match(systemPrompt, /exactly four grounded candidates/);
  assert.match(systemPrompt, /at least 20 minutes/);
  assert.match(modelConfig, /gpt-5\.6-sol/);
  assert.match(modelConfig, /api\.openai\.com\/v1\/responses/);
  assert.match(modelConfig, /OPENAI_API_KEY/);
  assert.match(modelConfig, /status: "fallback"/);
  assert.match(css, /Experience console readability pass/);
  assert.match(css, /\.react-panel-head h4 \{ font-size: 22px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.doesNotReject(access(new URL("../public/og.png", import.meta.url)));
});
