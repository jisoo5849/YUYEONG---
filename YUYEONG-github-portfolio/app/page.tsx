import { ExperienceAgent } from "./ExperienceAgent";

const featureCards = [
  {
    number: "01",
    title: "식사와 메뉴",
    description: "점심과 저녁의 음식 결을 다르게 고르고, 등록 메뉴와 실제 메뉴 탐색 경로까지 연결해요.",
  },
  {
    number: "02",
    title: "하나의 자연스러운 동선",
    description: "식사에서 카페, 산책과 드라이브까지 이동 시간과 영업시간을 고려해 연결해요.",
  },
  {
    number: "03",
    title: "변화에 맞춘 재설계",
    description: "예정보다 늦어져도 괜찮아요. 남은 시간과 마음을 기준으로 하루를 다시 이어가요.",
  },
  {
    number: "04",
    title: "함께 쌓는 취향",
    description: "조용한 자리, 선호하는 메뉴, 둘만의 장소처럼 말로 설명하기 어려운 취향을 기억해요.",
  },
  {
    number: "05",
    title: "선택의 이유",
    description: "왜 이곳이고 왜 이 순서인지 알려줘요. 추천을 믿고 고칠 수 있도록 판단을 투명하게 보여줘요.",
  },
  {
    number: "06",
    title: "하루의 잔상",
    description: "잠들기 전 짧은 대화로 좋았던 순간을 남기고, 다음 하루를 위한 취향으로 연결해요.",
  },
];

const agentSteps = [
  { index: "01", title: "이해하고", text: "시간, 동행, 기분과 말하지 않은 우선순위를 읽어요." },
  { index: "02", title: "확인하고", text: "지도, 날씨, 영업시간과 이동 정보를 도구로 확인해요." },
  { index: "03", title: "엮어내고", text: "각 장소가 아닌 하루의 흐름을 하나의 경험으로 만들어요." },
  { index: "04", title: "다시 유영해요", text: "상황이 바뀌면 남은 하루에 맞춰 자연스럽게 재설계해요." },
];

export default function Home() {
  return (
    <main>
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="site-header">
        <a className="brand" href="#top" aria-label="YUYEONG 홈">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>YUYEONG</span>
        </a>
        <nav aria-label="주요 메뉴">
          <a href="#experience">경험</a>
          <a href="#agent">Agent</a>
          <a href="#case-study">Case study</a>
        </nav>
        <a className="header-cta" href="#demo">오늘을 유영하기 <span aria-hidden="true">↗</span></a>
      </header>

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> A PERSONAL EXPERIENCE AGENT</p>
          <h1>오늘을 계획하지 말고,<br /><em>유영하세요.</em></h1>
          <p className="hero-description">
            YUYEONG은 장소를 나열하지 않습니다. 당신의 시간, 마음, 날씨와 함께할 사람을 이해하고
            오늘의 경험 전체를 하나의 자연스러운 흐름으로 설계합니다.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#demo">오늘을 설계하기 <span aria-hidden="true">→</span></a>
            <a className="text-link" href="#agent">왜 Agent일까요? <span aria-hidden="true">↘</span></a>
          </div>
          <div className="hero-footnote">
            <span className="live-dot" />
            <span>계획이 달라져도 괜찮은 하루를 위해</span>
          </div>
        </div>

        <div className="hero-orbit" aria-label="YUYEONG의 경험 설계 요소">
          <div className="orbit-ring orbit-ring-large" />
          <div className="orbit-ring orbit-ring-small" />
          <div className="orbit-card orbit-weather">
            <span>오늘의 공기</span>
            <strong>23°</strong>
            <small>비가 그친 뒤, 선선함</small>
          </div>
          <div className="orbit-card orbit-mood">
            <span>MOOD</span>
            <strong>잔잔하게</strong>
            <small>대화가 흐르는 저녁</small>
          </div>
          <div className="orbit-card orbit-route">
            <span>TONIGHT</span>
            <strong>식사 <b>→</b> 커피 <b>→</b> 야경</strong>
            <small>이동 37분 · 여유 2시간</small>
          </div>
          <div className="orbit-center">
            <div className="current-lines"><i /><i /><i /></div>
            <span>FLOW</span>
            <strong>당신의 오늘</strong>
          </div>
          <span className="orbit-label orbit-label-one">CONTEXT</span>
          <span className="orbit-label orbit-label-two">MEMORY</span>
          <span className="orbit-label orbit-label-three">TOOLS</span>
        </div>
      </section>

      <section className="demo-section" id="demo">
        <div className="shell">
          <div className="section-heading split-heading">
            <div>
              <p className="eyebrow"><span /> FULL DAY EXPERIENCE AGENT · MVP 02</p>
              <h2>하고 싶은 순간을,<br />하나의 하루로.</h2>
            </div>
            <p>점심과 카페, 저녁과 드라이브까지.<br />실제 장소와 이동시간을 확인해 하루 전체를 연결합니다.</p>
          </div>
          <ExperienceAgent />
        </div>
      </section>

      <section className="philosophy-section shell" id="experience">
        <div className="section-heading centered-heading">
          <p className="eyebrow"><span /> BEYOND RECOMMENDATION</p>
          <h2>장소가 아니라,<br /><em>오늘의 경험 전체</em>를 설계합니다.</h2>
          <p>좋은 하루는 좋은 장소 하나로 완성되지 않으니까요.</p>
        </div>

        <div className="flow-comparison">
          <div className="comparison-side old-way">
            <span className="comparison-label">기존 장소 추천</span>
            <div className="scattered-card one">맛집 목록 <b>24</b></div>
            <div className="scattered-card two">카페 목록 <b>18</b></div>
            <div className="scattered-card three">후기와 별점 <b>4.7</b></div>
            <p>선택과 연결은<br />다시 사용자의 몫</p>
          </div>
          <div className="comparison-divider"><span>→</span></div>
          <div className="comparison-side new-way">
            <span className="comparison-label">YUYEONG EXPERIENCE</span>
            <div className="flow-path" aria-hidden="true" />
            <div className="flow-node node-one"><i /> <span>18:10</span><strong>저녁</strong></div>
            <div className="flow-node node-two"><i /> <span>19:35</span><strong>커피</strong></div>
            <div className="flow-node node-three"><i /> <span>20:50</span><strong>야경</strong></div>
            <p>취향과 상황을 반영한<br />하나의 자연스러운 흐름</p>
          </div>
        </div>
      </section>

      <section className="agent-section" id="agent">
        <div className="shell">
          <div className="section-heading split-heading light-heading">
            <div>
              <p className="eyebrow"><span /> WHY AN AGENT?</p>
              <h2>그래서,<br />Agent여야 합니다.</h2>
            </div>
            <p>YUYEONG은 답변을 생성하고 멈추지 않습니다.<br />목표를 이해하고, 도구를 사용하고, 결과를 검토하며 다시 행동합니다.</p>
          </div>

          <div className="agent-loop">
            {agentSteps.map((step, index) => (
              <article key={step.index}>
                <span>{step.index}</span>
                <div className="step-symbol" aria-hidden="true">
                  {index === 0 && <><i /><i /><i /></>}
                  {index === 1 && <><b /><i /></>}
                  {index === 2 && <><i /><b /><i /></>}
                  {index === 3 && <><b /><b /></>}
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>

          <div className="agent-principle">
            <p>Observe</p><span>→</span><p>Reason</p><span>→</span><p>Use tools</p><span>→</span><p>Act</p><span>→</span><p>Remember</p>
            <i aria-hidden="true" />
          </div>
        </div>
      </section>

      <section className="features-section shell">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow"><span /> CORE EXPERIENCES</p>
            <h2>하루의 모든 순간을<br />부드럽게 잇는 기능</h2>
          </div>
          <p>통제하지 않고, 재촉하지 않고.<br />당신이 더 좋은 선택을 발견하도록 곁에서 돕습니다.</p>
        </div>
        <div className="feature-grid">
          {featureCards.map((feature) => (
            <article key={feature.number}>
              <span>{feature.number}</span>
              <div className="feature-icon" aria-hidden="true"><i /><i /></div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="case-study-section" id="case-study">
        <div className="shell case-study-grid">
          <div className="case-copy">
            <p className="eyebrow"><span /> PORTFOLIO CASE STUDY</p>
            <h2>아이디어를 넘어,<br /><em>Agent의 이유</em>를 증명하는 프로젝트.</h2>
            <p className="case-intro">
              YUYEONG은 LLM을 붙인 추천 앱이 아닙니다. 사용자의 모호한 바람을 실행 가능한 계획으로 바꾸고,
              여러 도구와 기억을 조율하며, 현실의 변화에 대응하는 Agent 시스템을 보여줍니다.
            </p>
            <div className="case-values">
              <div><strong>01</strong><span>Context reasoning</span><p>자연어에서 숨은 조건과 우선순위 추출</p></div>
              <div><strong>02</strong><span>Tool orchestration</span><p>지도·날씨·검색·캘린더 도구의 목적 있는 조합</p></div>
              <div><strong>03</strong><span>Adaptive planning</span><p>실패와 변경을 반영하는 동적 재계획</p></div>
              <div><strong>04</strong><span>Long-term memory</span><p>피드백을 설명 가능한 취향으로 축적</p></div>
            </div>
          </div>

          <div className="architecture-card">
            <div className="architecture-top">
              <span>AGENT ARCHITECTURE</span>
              <i>LIVE MODEL</i>
            </div>
            <div className="architecture-user">
              <small>USER INTENT</small>
              <strong>“오늘을 분위기 있게 보내고 싶어”</strong>
            </div>
            <div className="architecture-line"><i /></div>
            <div className="brain-card">
              <span>YUYEONG ORCHESTRATOR</span>
              <div className="brain-row"><p>Context</p><p>Plan</p><p>Reflect</p></div>
            </div>
            <div className="architecture-branches"><i /><i /><i /><i /></div>
            <div className="tool-row">
              <div><span>⌖</span><strong>Maps</strong><small>거리·동선</small></div>
              <div><span>☼</span><strong>Weather</strong><small>날씨·공기</small></div>
              <div><span>◷</span><strong>Places</strong><small>영업·예약</small></div>
              <div><span>◇</span><strong>Memory</strong><small>취향·피드백</small></div>
            </div>
            <div className="architecture-output">
              <span>ADAPTIVE EXPERIENCE PLAN</span>
              <strong>설계 → 실행 → 변화 감지 → 재설계</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="roadmap-section shell">
        <div className="roadmap-copy">
          <p className="eyebrow"><span /> GROW WITH THE DAY</p>
          <h2>작은 선택에서 시작해,<br />하루 전체로.</h2>
          <p>점심 세 가지에서 시작한 MVP가 이제 카페, 저녁과 드라이브를 실제 동선으로 연결합니다. 다음에는 함께 쓰는 취향과 실시간 재계획으로 확장합니다.</p>
        </div>
        <ol className="roadmap">
          <li className="completed"><span>01</span><div><small>COMPLETE</small><strong>오늘의 점심</strong><p>조건을 이해하고 세 가지 선택과 이유 제안</p></div></li>
          <li className="completed"><span>02</span><div><small>COMPLETE</small><strong>식사·카페와 메뉴</strong><p>장소의 메뉴와 서로 다른 경험을 연결</p></div></li>
          <li className="active"><span>03</span><div><small>NOW · MVP 02</small><strong>하루의 경험 Agent</strong><p>실제 장소와 도로 이동시간으로 하루 전체 설계</p></div></li>
          <li><span>04</span><div><small>NEXT</small><strong>함께 만드는 취향</strong><p>공동 취향과 일정 변화에 실시간 재계획</p></div></li>
        </ol>
      </section>

      <section className="closing-section">
        <div className="closing-current current-one" aria-hidden="true" />
        <div className="closing-current current-two" aria-hidden="true" />
        <div className="closing-content">
          <p className="eyebrow"><span /> YUYEONG</p>
          <h2>당신의 오늘이<br />조금 더 당신답게 흐르도록.</h2>
          <a className="primary-button light-button" href="#demo">오늘을 유영하기 <span aria-hidden="true">↗</span></a>
        </div>
      </section>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#top"><span className="brand-mark"><i /><i /></span><span>YUYEONG</span></a>
        <p>오늘이라는 시간을 유영하다.</p>
        <span>© 2026 YUYEONG · An experience agent</span>
      </footer>
    </main>
  );
}
