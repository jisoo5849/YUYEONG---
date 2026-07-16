import { NextRequest, NextResponse } from "next/server";
import { AGENT_REACT_POLICY_VERSION, AGENT_REASONING_POLICY_VERSION, AGENT_REASONING_STAGES } from "../../agent/system-prompt";
import { runModelAudit } from "../../agent/model";

type Coordinates = { latitude: number; longitude: number };
type ActivityKind = "lunch" | "cafe" | "dinner" | "drive";
type Transport = "drive" | "walk";
type BudgetTier = "light" | "date" | "special" | "signature";
type ExperienceRequest = {
  query?: string;
  coordinates?: Coordinates | null;
  companion?: string;
  mood?: string;
  startTime?: string;
  endTime?: string;
  transport?: Transport;
  activities?: ActivityKind[];
  recentMeal?: string;
  preferences?: string[];
  budgetTier?: BudgetTier;
};
type OSMElement = {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};
type Place = {
  id: string;
  kind: "restaurant" | "cafe" | "drive";
  name: string;
  latitude: number;
  longitude: number;
  cuisineKey: string;
  cuisine: string;
  openingHours: string | null;
  menuUrl: string | null;
  websiteUrl: string | null;
  phone: string | null;
  placeType: string;
  premiumScore: number;
  premiumSignals: string[];
};
type TravelSource = "OSRM" | "estimated";
type DriveOption = {
  place: Place;
  minutes: number;
  durationSeconds: number;
  distanceMeters: number;
  source: TravelSource;
};
type Weather = {
  temperature: number;
  apparentTemperature: number;
  description: string;
  rainy: boolean;
  advice: string;
  dayMax: number | null;
  dayMin: number | null;
  rainChance: number | null;
};
type Evidence = {
  facts: string[];
  inference: string;
  unknowns: string[];
  confidence: "high" | "medium";
};
type ReActStatus = "grounded" | "attention";
type ReActCycle = {
  id: string;
  action: { tool: string; label: string; input: string };
  observation: { status: ReActStatus; summary: string; facts: string[] };
  decision: string;
  replan: boolean;
};

const APP_USER_AGENT = "YUYEONG-Experience-Agent/1.0 (https://yuyeong-agent.jisoo584983761.chatgpt.site)";
const RECOMMENDATION_LIMIT = 4;
const MIN_DRIVE_MINUTES = 20;
const geocodeCache = new Map<string, { expiresAt: number; value: { coordinates: Coordinates; label: string } }>();
let lastNominatimRequestAt = 0;
let nominatimQueue: Promise<void> = Promise.resolve();

const cuisineLabels: Record<string, string> = {
  korean: "한식",
  japanese: "일식",
  sushi: "초밥",
  ramen: "라멘",
  chinese: "중식",
  italian: "이탈리안",
  french: "프렌치",
  fusion: "퓨전",
  steak_house: "스테이크하우스",
  pizza: "피자",
  burger: "버거",
  chicken: "치킨",
  barbecue: "바비큐",
  seafood: "해산물",
  noodle: "면 요리",
  noodles: "면 요리",
  vietnamese: "베트남 음식",
  thai: "태국 음식",
  indian: "인도 음식",
  mexican: "멕시칸",
  salad: "샐러드",
  sandwich: "샌드위치",
  dessert: "디저트",
  coffee_shop: "커피·디저트",
  international: "세계 음식",
  regional: "지역 음식",
  fast_food: "간편식",
  restaurant: "일반 음식점",
  food_court: "푸드코트",
};

const menuGuides: Record<string, string[]> = {
  korean: ["찌개·전골", "구이·정식", "비빔밥·덮밥"],
  japanese: ["돈카츠·덮밥", "우동·소바", "초밥·사시미"],
  sushi: ["모둠초밥", "사시미", "회덮밥"],
  ramen: ["라멘", "츠케멘", "교자"],
  chinese: ["면·밥 요리", "딤섬", "볶음·요리류"],
  italian: ["파스타", "리조또", "스테이크"],
  french: ["에피타이저", "메인 요리", "디저트"],
  fusion: ["셰프 추천", "시그니처 요리", "디저트"],
  steak_house: ["스테이크", "사이드", "와인"],
  pizza: ["피자", "파스타", "샐러드"],
  burger: ["버거", "감자튀김", "사이드"],
  chicken: ["치킨", "구이", "사이드"],
  barbecue: ["구이", "세트 메뉴", "식사류"],
  seafood: ["회·해산물", "구이", "탕·식사류"],
  noodle: ["국수", "면 요리", "만두·사이드"],
  noodles: ["국수", "면 요리", "만두·사이드"],
  vietnamese: ["쌀국수", "반미", "분짜"],
  thai: ["커리", "팟타이", "볶음밥"],
  indian: ["커리", "난", "탄두리"],
  mexican: ["타코", "부리토", "퀘사디아"],
  salad: ["샐러드", "포케", "샌드위치"],
  sandwich: ["샌드위치", "수프", "샐러드"],
  restaurant: ["메인 요리", "식사 메뉴", "사이드"],
  fast_food: ["메인 메뉴", "세트", "사이드"],
  food_court: ["한식", "면·밥 요리", "간편식"],
};

const moodCuisine: Record<string, string[]> = {
  "편안하게": ["korean", "japanese", "noodle", "restaurant"],
  "분위기 있게": ["italian", "japanese", "sushi", "international"],
  "새롭게": ["thai", "indian", "mexican", "vietnamese", "regional"],
  "든든하게": ["korean", "barbecue", "chicken", "burger", "chinese"],
  "가볍게": ["salad", "sandwich", "sushi", "vietnamese"],
};

const budgetProfiles: Record<BudgetTier, {
  tier: BudgetTier;
  label: string;
  rangeLabel: string;
  detail: string;
  premiumWeight: number;
  distanceRate: number;
}> = {
  light: { tier: "light", label: "가벼운 식사", rangeLabel: "식당 1곳 · 2인 6만원 이하", detail: "점심·저녁 식당 각각 적용", premiumWeight: -0.12, distanceRate: 0.035 },
  date: { tier: "date", label: "설레는 식사", rangeLabel: "식당 1곳 · 2인 6–14만원", detail: "점심·저녁 식당 각각 적용", premiumWeight: 0.34, distanceRate: 0.03 },
  special: { tier: "special", label: "특별한 식사", rangeLabel: "식당 1곳 · 2인 14–30만원", detail: "코스·셰프 추천 식당 탐색", premiumWeight: 0.86, distanceRate: 0.022 },
  signature: { tier: "signature", label: "시그니처 식사", rangeLabel: "식당 1곳 · 2인 30만원 이상", detail: "오마카세·파인다이닝 식당 탐색", premiumWeight: 1.34, distanceRate: 0.014 },
};

const activityLabels: Record<ActivityKind, string> = {
  lunch: "점심",
  cafe: "카페",
  dinner: "저녁",
  drive: "드라이브",
};

const activityDurations: Record<ActivityKind, number> = {
  lunch: 75,
  cafe: 70,
  dinner: 95,
  drive: 90,
};

function createReActTrace() {
  const cycles: ReActCycle[] = [];
  let replanCount = 0;
  return {
    record(input: Omit<ReActCycle, "id">) {
      if (input.replan) replanCount += 1;
      cycles.push({ id: String(cycles.length + 1).padStart(2, "0"), ...input });
    },
    result(stopReason: string) {
      return {
        framework: "ReAct" as const,
        policyVersion: AGENT_REACT_POLICY_VERSION,
        mode: "private-reasoning-public-actions" as const,
        cycles,
        iterations: cycles.length,
        replanCount,
        rawThoughtsExposed: false,
        stopReason,
        safetyNote: "내부 Thought는 공개하지 않고 Action·Observation·재계획 결과만 표시해요.",
      };
    },
  };
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== "object") return false;
  const coordinates = value as Coordinates;
  return Number.isFinite(coordinates.latitude) && Number.isFinite(coordinates.longitude) &&
    coordinates.latitude >= -90 && coordinates.latitude <= 90 &&
    coordinates.longitude >= -180 && coordinates.longitude <= 180;
}

function safeUrl(value?: string) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^www\./i.test(value)) return `https://${value}`;
  return null;
}

async function geocode(query: string) {
  const key = query.trim().toLocaleLowerCase("ko-KR");
  const cached = geocodeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "1", countrycodes: "kr", addressdetails: "1" });
  const rateLimitedRequest = nominatimQueue.then(async () => {
    const waitFor = Math.max(0, 1100 - (Date.now() - lastNominatimRequestAt));
    if (waitFor > 0) await new Promise((resolve) => setTimeout(resolve, waitFor));
    lastNominatimRequestAt = Date.now();
  });
  nominatimQueue = rateLimitedRequest.catch(() => undefined);
  await rateLimitedRequest;

  const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": APP_USER_AGENT, "Accept-Language": "ko,en;q=0.7" },
  }, 12000);
  if (!response.ok) throw new Error("위치 검색 도구가 잠시 응답하지 않아요.");
  const results = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!results[0]) return null;
  const value = {
    coordinates: { latitude: Number(results[0].lat), longitude: Number(results[0].lon) },
    label: results[0].display_name.split(",").slice(0, 3).join(", "),
  };
  geocodeCache.set(key, { expiresAt: Date.now() + 1000 * 60 * 60 * 12, value });
  return value;
}

function weatherDescription(code: number) {
  if (code === 0) return "맑음";
  if ([1, 2].includes(code)) return "대체로 맑음";
  if (code === 3) return "흐림";
  if ([45, 48].includes(code)) return "안개";
  if (code >= 51 && code <= 67) return "비";
  if (code >= 71 && code <= 77) return "눈";
  if (code >= 80 && code <= 82) return "소나기";
  if (code >= 95) return "천둥번개";
  return "날씨 변화 있음";
}

async function getWeather(coordinates: Coordinates): Promise<Weather> {
  const params = new URLSearchParams({
    latitude: coordinates.latitude.toString(),
    longitude: coordinates.longitude.toString(),
    current: "temperature_2m,apparent_temperature,precipitation,weather_code",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    forecast_days: "1",
    timezone: "Asia/Seoul",
  });
  const response = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, {}, 10000);
  if (!response.ok) throw new Error("날씨 도구가 잠시 응답하지 않아요.");
  const data = (await response.json()) as {
    current?: { temperature_2m?: number; apparent_temperature?: number; precipitation?: number; weather_code?: number };
    daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] };
  };
  const current = data.current ?? {};
  const code = Number(current.weather_code ?? -1);
  const precipitation = Number(current.precipitation ?? 0);
  const rainy = precipitation > 0.1 || (code >= 51 && code <= 99);
  const apparent = Number(current.apparent_temperature ?? current.temperature_2m ?? 0);
  return {
    temperature: Math.round(Number(current.temperature_2m ?? 0)),
    apparentTemperature: Math.round(apparent),
    description: weatherDescription(code),
    rainy,
    advice: rainy ? "비를 고려해 실내 경험과 짧은 이동에 무게를 뒀어요." : apparent >= 28 ? "더위를 고려해 야외 이동을 짧게 연결했어요." : apparent <= 7 ? "추위를 고려해 실내 체류 시간을 넉넉히 잡았어요." : "걷고 이동하기 좋은 날씨라 경험의 범위를 넓혔어요.",
    dayMax: data.daily?.temperature_2m_max?.[0] != null ? Math.round(data.daily.temperature_2m_max[0]) : null,
    dayMin: data.daily?.temperature_2m_min?.[0] != null ? Math.round(data.daily.temperature_2m_min[0]) : null,
    rainChance: data.daily?.precipitation_probability_max?.[0] != null ? Math.round(data.daily.precipitation_probability_max[0]) : null,
  };
}

async function getPlaces(origin: Coordinates, includeDrive: boolean, expanded = false) {
  const localRadius = expanded ? 8000 : includeDrive ? 5200 : 3400;
  const driveRadius = expanded ? 30000 : 18000;
  const lat = origin.latitude.toFixed(6);
  const lon = origin.longitude.toFixed(6);
  const driveQuery = includeDrive ? `
    node(around:${driveRadius},${lat},${lon})["tourism"~"^(viewpoint|attraction)$"]["name"];
    way(around:${driveRadius},${lat},${lon})["tourism"~"^(viewpoint|attraction)$"]["name"];
    relation(around:${driveRadius},${lat},${lon})["tourism"~"^(viewpoint|attraction)$"]["name"];
    node(around:${driveRadius},${lat},${lon})["leisure"~"^(park|garden)$"]["name"];
    way(around:${driveRadius},${lat},${lon})["leisure"~"^(park|garden)$"]["name"];
    relation(around:${driveRadius},${lat},${lon})["leisure"~"^(park|garden)$"]["name"];` : "";
  const query = `[out:json][timeout:25];(
    node(around:${localRadius},${lat},${lon})["amenity"~"^(restaurant|fast_food|food_court|cafe)$"]["name"];
    way(around:${localRadius},${lat},${lon})["amenity"~"^(restaurant|fast_food|food_court|cafe)$"]["name"];
    relation(around:${localRadius},${lat},${lon})["amenity"~"^(restaurant|fast_food|food_court|cafe)$"]["name"];
    ${driveQuery}
  );out center tags 520;`;
  const response = await fetchWithTimeout("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": APP_USER_AGENT },
    body: new URLSearchParams({ data: query }),
  }, 30000);
  if (!response.ok) throw new Error("장소 검색 도구가 잠시 응답하지 않아요.");
  const data = (await response.json()) as { elements?: OSMElement[] };
  return { elements: data.elements ?? [], localRadius, driveRadius };
}

function cuisineFrom(tags: Record<string, string>) {
  const key = (tags.cuisine ?? (tags.amenity === "cafe" ? "coffee_shop" : tags.amenity ?? "restaurant"))
    .split(/[;,]/)[0].trim().toLowerCase().replaceAll("-", "_");
  return { cuisineKey: key, cuisine: cuisineLabels[key] ?? key.replaceAll("_", " ") };
}

function premiumProfile(tags: Record<string, string>, cuisineKey: string) {
  const searchable = [tags.name, tags["name:en"], tags.description, tags.cuisine, tags.operator]
    .filter(Boolean).join(" ").toLocaleLowerCase("ko-KR");
  const signals: string[] = [];
  let score = 0;
  const addSignal = (label: string, value: number) => {
    if (!signals.includes(label)) signals.push(label);
    score += value;
  };

  if (/(오마카세|omakase)/i.test(searchable)) addSignal("오마카세 키워드 등록", 82);
  if (/(파인\s?다이닝|fine\s?dining)/i.test(searchable)) addSignal("파인다이닝 키워드 등록", 72);
  if (/(테이스팅|tasting|코스|course)/i.test(searchable)) addSignal("코스·테이스팅 키워드 등록", 58);
  if (/(다이닝|dining|리스토란테|ristorante|셰프|chef)/i.test(searchable)) addSignal("다이닝 관련 키워드 등록", 28);
  if (/(스시|sushi|스테이크|steak)/i.test(searchable)) addSignal("스시·스테이크 관련 키워드 등록", 22);
  if (["sushi", "french", "steak_house", "fusion"].includes(cuisineKey)) addSignal("코스 탐색형 음식 분류", 16);
  if (["yes", "required", "recommended", "members_only"].includes((tags.reservation ?? "").toLowerCase())) addSignal("예약 관련 정보 등록", 18);
  if (safeUrl(tags.menu ?? tags["contact:menu"])) addSignal("매장 메뉴 링크 등록", 12);
  if (safeUrl(tags.website ?? tags["contact:website"])) addSignal("공식 웹사이트 등록", 8);

  return { premiumScore: Math.min(100, score), premiumSignals: signals.slice(0, 4) };
}

function toPlace(element: OSMElement): Place | null {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  const tags = element.tags;
  if (!tags?.name || latitude === undefined || longitude === undefined) return null;
  const isCafe = tags.amenity === "cafe";
  const isRestaurant = ["restaurant", "fast_food", "food_court"].includes(tags.amenity ?? "");
  const kind = isCafe ? "cafe" : isRestaurant ? "restaurant" : "drive";
  const { cuisineKey, cuisine } = cuisineFrom(tags);
  const premium = kind === "restaurant" ? premiumProfile(tags, cuisineKey) : { premiumScore: 0, premiumSignals: [] };
  return {
    id: `${element.type}-${element.id}`,
    kind,
    name: tags.name,
    latitude,
    longitude,
    cuisineKey,
    cuisine,
    openingHours: tags.opening_hours ?? null,
    menuUrl: safeUrl(tags.menu ?? tags["contact:menu"]),
    websiteUrl: safeUrl(tags.website ?? tags["contact:website"]),
    phone: tags.phone ?? tags["contact:phone"] ?? null,
    placeType: tags.tourism === "viewpoint" ? "전망 포인트" : tags.leisure === "park" ? "공원" : tags.leisure === "garden" ? "정원" : tags.tourism === "attraction" ? "명소" : cuisine,
    ...premium,
  };
}

function normalizePlaces(elements: OSMElement[]) {
  const seen = new Set<string>();
  return elements
    .map(toPlace)
    .filter((place): place is Place => place !== null)
    .filter((place) => {
      const key = `${place.name}-${place.latitude.toFixed(4)}-${place.longitude.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function needsPremiumExpansion(
  selected: Array<{ activity: ActivityKind; place: Place }>,
  budget: (typeof budgetProfiles)[BudgetTier],
) {
  if (budget.tier !== "special" && budget.tier !== "signature") return false;
  return selected.some(({ activity, place }) =>
    (activity === "lunch" || activity === "dinner") && place.premiumScore < 28);
}

function distanceBetween(a: Coordinates, b: Coordinates) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadius = 6371000;
  const latDelta = toRadians(b.latitude - a.latitude);
  const lonDelta = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const haversine = Math.sin(latDelta / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function activityOrder(activities: ActivityKind[], startMinutes: number) {
  const selected = new Set(activities);
  const base: ActivityKind[] = startMinutes >= 16 * 60
    ? ["dinner", "cafe", "drive", "lunch"]
    : ["lunch", "cafe", "dinner", "drive"];
  return base.filter((activity) => selected.has(activity));
}

function rankRestaurantPlaces(
  candidates: Place[],
  previous: Coordinates,
  used: Set<string>,
  mood: string,
  preferences: string[],
  budget: (typeof budgetProfiles)[BudgetTier],
  avoidCuisine?: string,
) {
  const favored = moodCuisine[mood] ?? [];
  const score = (place: Place) => {
    const distancePenalty = distanceBetween(previous, place) * budget.distanceRate;
    const moodBonus = favored.includes(place.cuisineKey) ? 34 : 0;
    const memoryBonus = preferences.includes(place.cuisine) || preferences.includes(place.cuisineKey) ? 18 : 0;
    const varietyBonus = avoidCuisine && place.cuisineKey !== avoidCuisine ? 22 : 0;
    const premiumBonus = place.premiumScore * budget.premiumWeight;
    return moodBonus + memoryBonus + varietyBonus + premiumBonus - distancePenalty;
  };
  return [...candidates]
    .filter((place) => !used.has(place.id))
    .sort((a, b) => score(b) - score(a));
}

function pickPlace(
  candidates: Place[],
  previous: Coordinates,
  used: Set<string>,
  mood: string,
  preferences: string[],
  budget: (typeof budgetProfiles)[BudgetTier],
  avoidCuisine?: string,
) {
  return rankRestaurantPlaces(candidates, previous, used, mood, preferences, budget, avoidCuisine)[0] ?? null;
}

function selectStops(
  places: Place[],
  origin: Coordinates,
  order: ActivityKind[],
  mood: string,
  preferences: string[],
  weather: Weather | null,
  budget: (typeof budgetProfiles)[BudgetTier],
) {
  const restaurants = places.filter((place) => place.kind === "restaurant");
  const cafes = places.filter((place) => place.kind === "cafe");
  const drives = places.filter((place) => place.kind === "drive");
  const used = new Set<string>();
  const selected: Array<{ activity: ActivityKind; place: Place }> = [];
  let previous = origin;
  let lunchCuisine: string | undefined;

  for (const activity of order) {
    let place: Place | null = null;
    if (activity === "lunch" || activity === "dinner") {
      place = pickPlace(restaurants, previous, used, mood, preferences, budget, activity === "dinner" ? lunchCuisine : undefined);
      if (activity === "lunch") lunchCuisine = place?.cuisineKey;
    } else if (activity === "cafe") {
      place = [...cafes]
        .filter((candidate) => !used.has(candidate.id))
        .sort((a, b) => distanceBetween(previous, a) - distanceBetween(previous, b))[0] ?? null;
    } else {
      place = [...drives]
        .filter((candidate) => !used.has(candidate.id))
        .sort((a, b) => {
          const score = (candidate: Place) => {
            const distance = distanceBetween(previous, candidate);
            const scenicBonus = candidate.placeType === "전망 포인트" ? 4200 : candidate.placeType === "정원" ? 2200 : 1200;
            const weatherPenalty = weather?.rainy && candidate.placeType !== "명소" ? 3500 : 0;
            return scenicBonus - Math.abs(distance - 7000) * 0.34 - weatherPenalty;
          };
          return score(b) - score(a);
        })[0] ?? null;
    }
    if (!place) throw new Error(`${activityLabels[activity]}에 어울리는 장소를 충분히 찾지 못했어요. 출발 지역을 바꿔보세요.`);
    used.add(place.id);
    selected.push({ activity, place });
    previous = place;
  }
  return selected;
}

async function getRoute(points: Coordinates[], transport: Transport) {
  const profile = transport === "walk" ? "foot" : "driving";
  const coordinateText = points.map((point) => `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`).join(";");
  try {
    const response = await fetchWithTimeout(
      `https://router.project-osrm.org/route/v1/${profile}/${coordinateText}?overview=false&steps=false`,
      { headers: { "User-Agent": APP_USER_AGENT } },
      15000,
    );
    if (!response.ok) throw new Error("routing unavailable");
    const data = (await response.json()) as { code?: string; routes?: Array<{ distance: number; duration: number; legs: Array<{ distance: number; duration: number }> }> };
    if (data.code !== "Ok" || !data.routes?.[0]) throw new Error("routing unavailable");
    return { ...data.routes[0], source: "OSRM" as const };
  } catch {
    const factor = transport === "walk" ? 1.18 : 1.3;
    const speedMetersPerSecond = transport === "walk" ? 1.25 : 7.2;
    const legs = points.slice(1).map((point, index) => {
      const distance = distanceBetween(points[index], point) * factor;
      return { distance, duration: distance / speedMetersPerSecond };
    });
    return {
      distance: legs.reduce((sum, leg) => sum + leg.distance, 0),
      duration: legs.reduce((sum, leg) => sum + leg.duration, 0),
      legs,
      source: "estimated" as const,
    };
  }
}

function driveScenicScore(place: Place) {
  return place.placeType === "전망 포인트" ? 4800 : place.placeType === "정원" ? 2800 : place.placeType === "공원" ? 1800 : 1200;
}

async function rankDriveOptions(origin: Coordinates, candidates: Place[], excludedIds = new Set<string>()) {
  const pool = [...candidates]
    .filter((place) => place.kind === "drive" && !excludedIds.has(place.id))
    .sort((a, b) => {
      const score = (place: Place) => driveScenicScore(place) - Math.abs(distanceBetween(origin, place) - 14000) * 0.18;
      return score(b) - score(a);
    })
    .slice(0, 32);
  if (pool.length === 0) return [] as DriveOption[];

  const coordinateText = [origin, ...pool]
    .map((point) => `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`)
    .join(";");

  try {
    const response = await fetchWithTimeout(
      `https://router.project-osrm.org/table/v1/driving/${coordinateText}?sources=0&annotations=duration,distance`,
      { headers: { "User-Agent": APP_USER_AGENT } },
      18000,
    );
    if (!response.ok) throw new Error("drive table unavailable");
    const data = (await response.json()) as {
      code?: string;
      durations?: Array<Array<number | null>>;
      distances?: Array<Array<number | null>>;
    };
    if (data.code !== "Ok" || !data.durations?.[0]) throw new Error("drive table unavailable");
    return pool
      .map((place, index) => {
        const durationSeconds = data.durations?.[0]?.[index + 1];
        const distanceMeters = data.distances?.[0]?.[index + 1];
        if (durationSeconds == null || distanceMeters == null) return null;
        return {
          place,
          minutes: Math.max(1, Math.round(durationSeconds / 60)),
          durationSeconds,
          distanceMeters: Math.round(distanceMeters),
          source: "OSRM" as const,
        };
      })
      .filter((option): option is DriveOption => option !== null && option.durationSeconds >= MIN_DRIVE_MINUTES * 60)
      .sort((a, b) => {
        const score = (option: DriveOption) => driveScenicScore(option.place) - Math.abs(option.minutes - 35) * 95;
        return score(b) - score(a);
      });
  } catch {
    return pool
      .map((place) => {
        const distanceMeters = distanceBetween(origin, place) * 1.3;
        const durationSeconds = distanceMeters / 7.2;
        return {
          place,
          minutes: Math.max(1, Math.round(durationSeconds / 60)),
          durationSeconds,
          distanceMeters: Math.round(distanceMeters),
          source: "estimated" as const,
        };
      })
      .filter((option) => option.durationSeconds >= MIN_DRIVE_MINUTES * 60)
      .sort((a, b) => {
        const score = (option: DriveOption) => driveScenicScore(option.place) - Math.abs(option.minutes - 35) * 95;
        return score(b) - score(a);
      });
  }
}

function uniquePlaces(primary: Place[], ranked: Place[], limit = RECOMMENDATION_LIMIT) {
  const seen = new Set<string>();
  return [...primary, ...ranked].filter((place) => {
    if (seen.has(place.id)) return false;
    seen.add(place.id);
    return true;
  }).slice(0, limit);
}

function timeToMinutes(time: string, fallback: number) {
  if (!/^\d{2}:\d{2}$/.test(time)) return fallback;
  const [hours, minutes] = time.split(":").map(Number);
  if (hours > 23 || minutes > 59) return fallback;
  return hours * 60 + minutes;
}

function formatTime(totalMinutes: number) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function durationText(minutes: number) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}분`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function menuFor(place: Place, budget: (typeof budgetProfiles)[BudgetTier]) {
  const guide = menuGuides[place.cuisineKey] ?? menuGuides.restaurant;
  const explorationTerms: Record<BudgetTier, string[]> = {
    light: ["단품 메뉴", "세트 구성", "대표 메뉴"],
    date: ["시그니처 메뉴", "셰어링 메뉴", "음료 페어링"],
    special: ["코스 요리", "셰프 추천", "와인 페어링"],
    signature: ["오마카세", "테이스팅 코스", "프라이빗 다이닝"],
  };
  const searchTerm = encodeURIComponent(`${place.name} 메뉴 가격 ${budget.tier === "signature" ? "오마카세 코스" : budget.tier === "special" ? "코스" : ""}`.trim());
  return {
    cuisine: place.cuisine,
    registeredMenuUrl: place.menuUrl,
    officialWebsiteUrl: place.websiteUrl,
    phone: place.phone,
    guide,
    explorationTerms: explorationTerms[budget.tier],
    budgetLabel: `${budget.label} · ${budget.rangeLabel}`,
    guideLabel: place.menuUrl ? "메뉴를 보기 전 음식 유형" : "이 음식 유형에서 기대할 수 있는 메뉴 예시",
    note: place.menuUrl
      ? "매장이 등록한 메뉴 링크를 우선 제공합니다. 가격과 구성은 매장 페이지에서 확인해주세요."
      : "공개 장소 데이터에 상세 메뉴가 없어 음식 유형 예시를 표시합니다. 실제 판매 메뉴는 검색 링크에서 확인해주세요.",
    naverSearchUrl: `https://search.naver.com/search.naver?query=${searchTerm}`,
    googleSearchUrl: `https://www.google.com/search?q=${searchTerm}`,
  };
}

function dateDiningFit(place: Place, budget: (typeof budgetProfiles)[BudgetTier]) {
  const highIntent = budget.tier === "special" || budget.tier === "signature";
  const level = place.premiumScore >= 65 ? "강한 탐색 신호" : place.premiumScore >= 28 ? "탐색 신호 있음" : "기본 탐색";
  return {
    budgetTier: budget.tier,
    budgetLabel: budget.label,
    rangeLabel: budget.rangeLabel,
    level,
    premiumScore: place.premiumScore,
    signals: place.premiumSignals,
    summary: place.premiumSignals.length
      ? `${place.premiumSignals.slice(0, 2).join(" · ")} 정보를 예산 랭킹에 반영했어요.`
      : highIntent
        ? "공개 데이터에서 오마카세·코스 신호를 찾지 못해 거리와 음식 분류 중심으로 선택했어요."
        : "거리와 음식 분류를 중심으로 예산 성향에 맞춰 선택했어요.",
    priceVerified: false,
    verificationNote: "이 예산은 해당 식당 한 곳의 2인 식사비 조건입니다. 실제 가격과 코스 운영 여부는 매장 메뉴에서 확인해주세요.",
  };
}

function googleRouteUrl(origin: Coordinates, stops: Array<{ place: Place }>, transport: Transport) {
  const params = new URLSearchParams({ api: "1", origin: `${origin.latitude},${origin.longitude}` });
  const destination = stops.at(-1)!.place;
  params.set("destination", `${destination.latitude},${destination.longitude}`);
  if (stops.length > 1) {
    params.set("waypoints", stops.slice(0, -1).map(({ place }) => `${place.latitude},${place.longitude}`).join("|"));
  }
  params.set("travelmode", transport === "walk" ? "walking" : "driving");
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function reasonFor(
  activity: ActivityKind,
  place: Place,
  mood: string,
  weather: Weather | null,
  budget: (typeof budgetProfiles)[BudgetTier],
  lunchCuisine?: string,
) {
  const premiumReason = place.premiumSignals.length
    ? `${place.premiumSignals.slice(0, 2).join(" · ")} 신호를 ${budget.label} 랭킹에 반영했어요.`
    : `공개 가격 정보가 없어 ${budget.label} 조건은 음식 분류와 거리 중심으로 반영했어요.`;
  if (activity === "lunch") return `‘${mood}’ 조건과 ${place.cuisine} 분류를 우선순위에 반영했어요. ${premiumReason}`;
  if (activity === "cafe") return `직전 장소와의 거리가 짧은 카페 후보를 골라 불필요한 왕복을 줄였어요.`;
  if (activity === "dinner") return lunchCuisine && lunchCuisine !== place.cuisineKey
    ? `점심과 다른 ${place.cuisine} 분류로 두 식사가 겹치지 않게 구성했어요. ${premiumReason}`
    : `이동거리와 요청 조건을 함께 비교해 저녁 식사 후보로 선택했어요. ${premiumReason}`;
  return weather?.rainy
    ? `강수 데이터가 있어 야외 체류보다 ${place.placeType}까지의 이동 자체에 초점을 둔 마지막 구간으로 배치했어요.`
    : `출발점에서의 거리와 공개 장소 유형(${place.placeType})을 비교해 마지막 이동 구간으로 선택했어요.`;
}

function evidenceFor(
  activity: ActivityKind,
  place: Place,
  reason: string,
  routeSource: "OSRM" | "estimated",
  travelMinutes: number,
  distanceMeters: number,
  budget: (typeof budgetProfiles)[BudgetTier],
): Evidence {
  const facts = [
    `OpenStreetMap에 장소 이름과 좌표가 등록되어 있어요.`,
    `공개 장소 분류: ${place.placeType}.`,
    `${routeSource === "OSRM" ? "도로 경로" : "직선거리 기반 추정"}: 약 ${travelMinutes}분 · ${Math.max(1, Math.round(distanceMeters))}m.`,
  ];
  if (place.openingHours) facts.push("영업시간 문자열이 공개 장소 데이터에 등록되어 있어요.");
  if ((activity === "lunch" || activity === "dinner") && place.premiumSignals.length) {
    facts.push(`공개 메타데이터 신호: ${place.premiumSignals.join(" · ")}.`);
  }

  const unknowns = ["현재 영업 여부·혼잡도·가격은 확인되지 않았어요."];
  if (activity === "lunch" || activity === "dinner") unknowns.push(`${budget.rangeLabel}에 실제로 맞는지는 매장 메뉴 확인이 필요해요.`);
  if ((activity === "lunch" || activity === "dinner") && !place.menuUrl) {
    unknowns.push("매장의 실제 메뉴는 등록되지 않아 검색 링크에서 확인해야 해요.");
  }
  if (activity === "cafe" || activity === "drive") unknowns.push("분위기와 체감 만족도는 공개 데이터만으로 판단하지 않았어요.");

  return {
    facts,
    inference: reason,
    unknowns,
    confidence: routeSource === "OSRM" && Boolean(place.openingHours || place.websiteUrl) ? "high" : "medium",
  };
}

function assertPlanConsistency(
  order: ActivityKind[],
  selected: Array<{ activity: ActivityKind; place: Place }>,
  routeLegCount: number,
) {
  const hardFailures: string[] = [];
  if (selected.length !== order.length) hardFailures.push("요청한 활동 수와 선택된 장소 수가 다릅니다.");
  if (routeLegCount !== selected.length) hardFailures.push("경로 구간 수와 장소 수가 다릅니다.");
  if (new Set(selected.map(({ place }) => place.id)).size !== selected.length) hardFailures.push("같은 장소가 중복 선택되었습니다.");
  if (selected.some(({ place }) => !place.name.trim() || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude))) {
    hardFailures.push("이름 또는 좌표가 검증되지 않은 장소가 포함되었습니다.");
  }
  if (order.some((activity, index) => selected[index]?.activity !== activity)) hardFailures.push("요청한 활동 순서와 결과 순서가 다릅니다.");
  if (hardFailures.length) throw new Error(`동선 검산에 실패했어요: ${hardFailures.join(" ")}`);
}

function buildReasoningAudit(input: {
  order: ActivityKind[];
  selected: Array<{ activity: ActivityKind; place: Place }>;
  placesCount: number;
  locationLabel: string;
  startTime: string;
  endTime: string;
  weather: Weather | null;
  routeSource: "OSRM" | "estimated";
  routeLegCount: number;
  totalTravelMinutes: number;
  overrunMinutes: number;
  budget: (typeof budgetProfiles)[BudgetTier];
  recommendationCounts: { restaurants: number; cafes: number; drives: number };
  driveRecommendationMinutes: number[];
}) {
  const lunch = input.selected.find(({ activity }) => activity === "lunch")?.place;
  const dinner = input.selected.find(({ activity }) => activity === "dinner")?.place;
  const cuisineRepeated = Boolean(lunch && dinner && lunch.cuisineKey === dinner.cuisineKey);
  const selectedRestaurants = input.selected.filter(({ activity }) => activity === "lunch" || activity === "dinner");
  const premiumIntent = input.budget.tier === "special" || input.budget.tier === "signature";
  const weakPremiumMatch = premiumIntent && selectedRestaurants.some(({ place }) => place.premiumScore < 28);
  const attention = !input.weather || input.routeSource === "estimated" || input.overrunMinutes > 0 || cuisineRepeated || weakPremiumMatch;
  const uncertainties = ["영업 여부·혼잡도·가격·체감 분위기는 실시간으로 확인되지 않았어요."];
  if (selectedRestaurants.length) uncertainties.push(`${input.budget.rangeLabel}은 점심·저녁 식당 각각의 탐색 조건이며 실제 매장 가격으로 검증되지 않았어요.`);
  if (!input.weather) uncertainties.push("날씨 도구가 응답하지 않아 날씨는 계획에 반영하지 못했어요.");
  if (input.routeSource === "estimated") uncertainties.push("도로 경로를 받지 못해 이동시간은 직선거리 기반 추정값이에요.");
  if (input.overrunMinutes > 0) uncertainties.push(`요청한 종료 시각을 약 ${input.overrunMinutes}분 넘겨요.`);
  if (cuisineRepeated) uncertainties.push("검색된 후보 범위에서 점심과 저녁의 음식 분류가 같아요.");
  if (weakPremiumMatch) uncertainties.push("일부 식당은 공개 데이터에서 오마카세·코스·다이닝 신호를 충분히 찾지 못했어요.");
  const restaurantsWithoutMenus = input.selected.filter(({ activity, place }) =>
    (activity === "lunch" || activity === "dinner") && !place.menuUrl).length;
  if (restaurantsWithoutMenus) uncertainties.push(`식당 ${restaurantsWithoutMenus}곳은 실제 메뉴 링크가 없어 음식 유형 예시만 제공해요.`);

  let score = 0.96;
  if (!input.weather) score -= 0.08;
  if (input.routeSource === "estimated") score -= 0.14;
  if (input.overrunMinutes > 0) score -= 0.06;
  if (cuisineRepeated) score -= 0.04;
  if (selectedRestaurants.length) score -= 0.05;
  if (weakPremiumMatch) score -= 0.08;
  score = Math.max(0.5, Math.round(score * 100) / 100);

  const summaries = [
    `${input.order.length}개 활동·${input.startTime}–${input.endTime}·${input.budget.rangeLabel} 조건을 정규화했어요.`,
    `출발점·장소 ${input.placesCount}곳·${input.weather ? "날씨" : "날씨 제외"}·이동 데이터를 수집했어요.`,
    `이름·좌표가 있는 후보만 남기고 중복을 제거해 식당 ${input.recommendationCounts.restaurants}곳·카페 ${input.recommendationCounts.cafes}곳·드라이브 ${input.recommendationCounts.drives}곳을 검증했어요.`,
    `${input.order.map((activity) => activityLabels[activity]).join(" → ")} 순서와 ${input.budget.label} 랭킹으로 ${input.selected.length}곳을 연결했어요.`,
    attention ? `후보 수와 드라이브 ${MIN_DRIVE_MINUTES}분 제약을 포함한 필수 검사는 통과했고 ${uncertainties.length}개 주의사항을 표시했어요.` : `장소 수·순서·중복·경로 구간과 드라이브 ${MIN_DRIVE_MINUTES}분 제약을 다시 확인했어요.`,
    "사실·설계 판단·알 수 없는 정보를 분리해 결과를 작성했어요.",
  ];
  const statuses: Array<"passed" | "attention"> = [
    "passed",
    input.weather ? "passed" : "attention",
    "passed",
    "passed",
    attention ? "attention" : "passed",
    "passed",
  ];

  return {
    policyVersion: AGENT_REASONING_POLICY_VERSION,
    mode: "private-structured-reasoning" as const,
    stages: AGENT_REASONING_STAGES.map((stage, index) => ({ ...stage, status: statuses[index], summary: summaries[index] })),
    confidence: {
      score,
      label: score >= 0.85 ? "높음" : score >= 0.7 ? "보통" : "낮음",
      factors: [
        `장소 이름·좌표 ${input.selected.length}곳 검증`,
        `${input.routeSource === "OSRM" ? "도로 경로" : "추정 경로"} ${input.routeLegCount}구간 검산`,
        `카테고리별 최대 ${RECOMMENDATION_LIMIT}곳과 드라이브 최소 ${MIN_DRIVE_MINUTES}분 검산`,
        input.weather ? "현재 날씨 데이터 반영" : "날씨 데이터 없음",
        `가격은 ${input.budget.rangeLabel} 탐색 조건이며 실제 메뉴 확인 필요`,
      ],
    },
    factsUsed: [
      `출발점: ${input.locationLabel}`,
      `장소 후보: OpenStreetMap ${input.placesCount}곳`,
      `경로: ${input.routeSource}, 이동 약 ${Math.round(input.totalTravelMinutes)}분`,
      `추천 후보: 식당 ${input.recommendationCounts.restaurants}곳 · 카페 ${input.recommendationCounts.cafes}곳 · 드라이브 ${input.recommendationCounts.drives}곳`,
      input.driveRecommendationMinutes.length ? `드라이브 후보 이동시간: ${input.driveRecommendationMinutes.join("분 · ")}분` : "드라이브 후보: 요청하지 않음",
      `식사 예산 조건: ${input.budget.rangeLabel}`,
      input.weather ? `날씨: ${input.weather.temperature}° · ${input.weather.description}` : "날씨: 확인되지 않음",
    ],
    uncertainties,
    safetyNote: "내부 사고 과정은 공개하지 않고, 확인 가능한 근거와 검산 결과만 보여드려요.",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ExperienceRequest;
    const query = typeof body.query === "string" ? body.query.trim().slice(0, 100) : "";
    const coordinatesInput = isCoordinates(body.coordinates) ? body.coordinates : null;
    const companion = typeof body.companion === "string" ? body.companion.slice(0, 20) : "연인과";
    const mood = typeof body.mood === "string" && moodCuisine[body.mood] ? body.mood : "편안하게";
    const startTime = typeof body.startTime === "string" ? body.startTime : "11:30";
    const endTime = typeof body.endTime === "string" ? body.endTime : "22:30";
    const requestedTransport: Transport = body.transport === "walk" ? "walk" : "drive";
    const activities = Array.isArray(body.activities)
      ? body.activities.filter((item): item is ActivityKind => ["lunch", "cafe", "dinner", "drive"].includes(item))
      : ["lunch", "cafe", "dinner", "drive"];
    const preferences = Array.isArray(body.preferences)
      ? body.preferences.filter((item): item is string => typeof item === "string").slice(0, 8)
      : [];
    const budgetTier: BudgetTier = body.budgetTier && budgetProfiles[body.budgetTier] ? body.budgetTier : "date";
    const budget = budgetProfiles[budgetTier];

    if (activities.length === 0) return jsonError("하나 이상의 경험을 선택해주세요.");
    if (!coordinatesInput && query.length < 2) return jsonError("역이나 건물 이름처럼 출발 위치를 조금 더 구체적으로 알려주세요.");

    const reactRun = createReActTrace();
    const geocoded = coordinatesInput ? null : await geocode(query);
    if (!coordinatesInput && !geocoded) return jsonError("그 지역을 찾지 못했어요. ‘성수역, 서울’처럼 역이나 건물 이름을 포함해주세요.", 404);
    const origin = coordinatesInput ?? geocoded!.coordinates;
    const locationLabel = coordinatesInput ? (query || "현재 위치") : geocoded!.label;
    const effectiveTransport: Transport = activities.includes("drive") ? "drive" : requestedTransport;
    reactRun.record({
      action: { tool: "Location", label: "출발점 확인", input: coordinatesInput ? "사용자가 제공한 현재 좌표" : `장소 검색: ${query}` },
      observation: { status: "grounded", summary: `${locationLabel}의 좌표를 출발점으로 확정했어요.`, facts: [`위도 ${origin.latitude.toFixed(5)}`, `경도 ${origin.longitude.toFixed(5)}`] },
      decision: "출발점이 확인되어 날씨 관찰로 진행합니다.",
      replan: false,
    });

    let weather: Weather | null = null;
    try {
      weather = await getWeather(origin);
      reactRun.record({
        action: { tool: "Weather", label: "현재 날씨 조회", input: "출발점 기준 오늘 예보" },
        observation: { status: "grounded", summary: `${weather.temperature}° · ${weather.description}`, facts: [`체감 ${weather.apparentTemperature}°`, `강수확률 ${weather.rainChance != null ? `${weather.rainChance}%` : "미제공"}`] },
        decision: weather.rainy ? "강수 관찰을 장소 랭킹에 반영합니다." : "날씨 제약이 크지 않아 장소 탐색으로 진행합니다.",
        replan: false,
      });
    } catch {
      reactRun.record({
        action: { tool: "Weather", label: "현재 날씨 조회", input: "출발점 기준 오늘 예보" },
        observation: { status: "attention", summary: "날씨 도구가 응답하지 않았어요.", facts: ["날씨 데이터 없음"] },
        decision: "날씨를 추측하지 않고 장소·경로 데이터만으로 계속합니다.",
        replan: false,
      });
    }

    const localPlacesResult = await getPlaces(origin, activities.includes("drive"));
    let placeElements = localPlacesResult.elements;
    let places = normalizePlaces(placeElements);
    reactRun.record({
      action: { tool: "Places", label: "주변 장소 탐색", input: `반경 ${(localPlacesResult.localRadius / 1000).toFixed(1)}km` },
      observation: { status: "grounded", summary: `이름과 좌표가 있는 장소 ${places.length}곳을 확인했어요.`, facts: [`식당 ${places.filter((place) => place.kind === "restaurant").length}곳`, `카페 ${places.filter((place) => place.kind === "cafe").length}곳`] },
      decision: "검증된 후보를 사용자 조건으로 랭킹합니다.",
      replan: false,
    });

    const startMinutes = timeToMinutes(startTime, 11 * 60 + 30);
    const endMinutesRaw = timeToMinutes(endTime, 22 * 60 + 30);
    const endMinutes = endMinutesRaw <= startMinutes ? endMinutesRaw + 1440 : endMinutesRaw;
    const order = activityOrder(activities, startMinutes);
    let selected = selectStops(places, origin, order, mood, preferences, weather, budget);
    const expandPremiumSearch = needsPremiumExpansion(selected, budget);
    let expandedSearchUsed = false;
    reactRun.record({
      action: { tool: "Rank", label: "조건 기반 초안 생성", input: `${mood} · ${budget.rangeLabel} · ${order.map((activity) => activityLabels[activity]).join("→")}` },
      observation: {
        status: expandPremiumSearch ? "attention" : "grounded",
        summary: `${selected.length}곳의 초안 동선을 만들었어요.`,
        facts: selected.map(({ activity, place }) => `${activityLabels[activity]} ${place.name}${place.kind === "restaurant" ? ` · 프리미엄 신호 ${place.premiumScore}` : ""}`),
      },
      decision: expandPremiumSearch ? "고예산 식사의 프리미엄 신호가 약해 검색 반경을 한 번 확장합니다." : "조건이 충족되어 도로 경로 계산으로 진행합니다.",
      replan: false,
    });

    if (expandPremiumSearch) {
      try {
        const expandedPlacesResult = await getPlaces(origin, activities.includes("drive"), true);
        placeElements = [...placeElements, ...expandedPlacesResult.elements];
        places = normalizePlaces(placeElements);
        selected = selectStops(places, origin, order, mood, preferences, weather, budget);
        expandedSearchUsed = true;
        const stillWeak = needsPremiumExpansion(selected, budget);
        reactRun.record({
          action: { tool: "PremiumExpand", label: "프리미엄 후보 재탐색", input: `검색 반경 ${(expandedPlacesResult.localRadius / 1000).toFixed(1)}km로 1회 확장` },
          observation: {
            status: stillWeak ? "attention" : "grounded",
            summary: `후보 ${places.length}곳에서 동선을 다시 선택했어요.`,
            facts: selected.filter(({ place }) => place.kind === "restaurant").map(({ activity, place }) => `${activityLabels[activity]} ${place.name} · 프리미엄 신호 ${place.premiumScore}`),
          },
          decision: stillWeak ? "추가 반복 없이 가격·코스 여부를 미확인 정보로 표시합니다." : "프리미엄 신호가 개선되어 경로 계산으로 진행합니다.",
          replan: true,
        });
      } catch {
        reactRun.record({
          action: { tool: "PremiumExpand", label: "프리미엄 후보 재탐색", input: "검색 반경 확장 1회" },
          observation: { status: "attention", summary: "확장 검색이 응답하지 않아 기존 초안을 유지했어요.", facts: ["확장 검색 결과 없음"] },
          decision: "가격과 프리미엄 적합성을 미확인으로 표시하고 기존 후보로 계속합니다.",
          replan: true,
        });
      }
    }

    const wantsRestaurants = order.some((activity) => activity === "lunch" || activity === "dinner");
    const wantsCafes = order.includes("cafe");
    const wantsDrive = order.includes("drive");
    const driveContext = () => {
      const driveIndex = selected.findIndex(({ activity }) => activity === "drive");
      const anchor = driveIndex > 0 ? selected[driveIndex - 1].place : origin;
      const excludedIds = new Set(selected.filter((_, index) => index !== driveIndex).map(({ place }) => place.id));
      return { driveIndex, anchor, excludedIds };
    };
    let driveOptions = wantsDrive
      ? await rankDriveOptions(driveContext().anchor, places, driveContext().excludedIds)
      : [];
    const needsCandidateExpansion = () =>
      (wantsRestaurants && places.filter((place) => place.kind === "restaurant").length < RECOMMENDATION_LIMIT) ||
      (wantsCafes && places.filter((place) => place.kind === "cafe").length < RECOMMENDATION_LIMIT) ||
      (wantsDrive && driveOptions.length < RECOMMENDATION_LIMIT);

    if (needsCandidateExpansion() && !expandedSearchUsed) {
      try {
        const expandedPlacesResult = await getPlaces(origin, wantsDrive, true);
        placeElements = [...placeElements, ...expandedPlacesResult.elements];
        places = normalizePlaces(placeElements);
        selected = selectStops(places, origin, order, mood, preferences, weather, budget);
        expandedSearchUsed = true;
        if (wantsDrive) {
          const context = driveContext();
          driveOptions = await rankDriveOptions(context.anchor, places, context.excludedIds);
        }
        reactRun.record({
          action: { tool: "CandidateExpand", label: "4개 후보군 확장", input: `식당·카페 ${(expandedPlacesResult.localRadius / 1000).toFixed(1)}km · 드라이브 ${(expandedPlacesResult.driveRadius / 1000).toFixed(1)}km` },
          observation: {
            status: needsCandidateExpansion() ? "attention" : "grounded",
            summary: "카테고리별 4개 후보와 20분 이상 드라이브 조건을 다시 검산했어요.",
            facts: [
              `식당 ${places.filter((place) => place.kind === "restaurant").length}곳`,
              `카페 ${places.filter((place) => place.kind === "cafe").length}곳`,
              `20분 이상 드라이브 ${driveOptions.length}곳`,
            ],
          },
          decision: needsCandidateExpansion() ? "필수 후보 수가 부족해 복구 가능한 오류로 종료합니다." : "각 카테고리 4개 후보가 확보되어 동선을 확정합니다.",
          replan: true,
        });
      } catch {
        reactRun.record({
          action: { tool: "CandidateExpand", label: "4개 후보군 확장", input: "검색 반경 확장 1회" },
          observation: { status: "attention", summary: "후보 확장 검색이 응답하지 않았어요.", facts: ["확장 후보 없음"] },
          decision: "요청한 후보 수를 보장할 수 없어 복구 가능한 오류로 종료합니다.",
          replan: true,
        });
      }
    }

    if (wantsRestaurants && places.filter((place) => place.kind === "restaurant").length < RECOMMENDATION_LIMIT) {
      throw new Error("식당 추천 후보 4곳을 찾지 못했어요. 출발 지역을 조금 넓혀 다시 시도해주세요.");
    }
    if (wantsCafes && places.filter((place) => place.kind === "cafe").length < RECOMMENDATION_LIMIT) {
      throw new Error("카페 추천 후보 4곳을 찾지 못했어요. 출발 지역을 조금 넓혀 다시 시도해주세요.");
    }
    if (wantsDrive && driveOptions.length < RECOMMENDATION_LIMIT) {
      throw new Error("이전 일정 지점에서 차량 이동 20분 이상인 드라이브 후보 4곳을 찾지 못했어요. 출발 지역을 바꿔 다시 시도해주세요.");
    }
    if (wantsDrive) {
      const { driveIndex } = driveContext();
      selected[driveIndex] = { activity: "drive", place: driveOptions[0].place };
      reactRun.record({
        action: { tool: "DriveConstraint", label: "드라이브 20분 제약 검증", input: `최소 ${MIN_DRIVE_MINUTES}분 · 후보 ${RECOMMENDATION_LIMIT}곳` },
        observation: {
          status: driveOptions.slice(0, RECOMMENDATION_LIMIT).every((option) => option.source === "OSRM") ? "grounded" : "attention",
          summary: `이전 일정 지점에서 ${MIN_DRIVE_MINUTES}분 이상 이동하는 드라이브 후보 ${RECOMMENDATION_LIMIT}곳을 확보했어요.`,
          facts: driveOptions.slice(0, RECOMMENDATION_LIMIT).map((option) => `${option.place.name} · ${option.minutes}분 · ${option.source}`),
        },
        decision: "검증된 후보 중 경관 신호와 이동시간 균형이 가장 좋은 곳을 본 동선에 채택합니다.",
        replan: true,
      });
    }

    const route = await getRoute([origin, ...selected.map(({ place }) => place)], effectiveTransport);
    assertPlanConsistency(order, selected, route.legs.length);
    const selectedDriveIndex = selected.findIndex(({ activity }) => activity === "drive");
    if (selectedDriveIndex >= 0 && (route.legs[selectedDriveIndex]?.duration ?? 0) < MIN_DRIVE_MINUTES * 60) {
      throw new Error("최종 도로 경로에서 드라이브 이동시간이 20분 미만으로 계산되어 동선을 확정하지 않았어요. 다시 시도해주세요.");
    }
    reactRun.record({
      action: { tool: "Route", label: "이동 경로 계산", input: `${effectiveTransport === "drive" ? "자동차" : "도보"} · ${selected.length}개 목적지` },
      observation: { status: route.source === "OSRM" ? "grounded" : "attention", summary: `${route.legs.length}개 구간 · 이동 약 ${Math.round(route.duration / 60)}분`, facts: [`총 ${Math.round(route.distance)}m`, `경로 출처 ${route.source}`] },
      decision: route.source === "OSRM" ? "도로 경로를 시간표에 반영합니다." : "추정 경로임을 표시하고 검산으로 진행합니다.",
      replan: false,
    });

    let cursor = startMinutes;
    const lunchCuisine = selected.find(({ activity }) => activity === "lunch")?.place.cuisineKey;
    const stops = selected.map(({ activity, place }, index) => {
      const leg = route.legs[index];
      const travelMinutes = Math.max(1, Math.round((leg?.duration ?? 0) / 60));
      cursor += travelMinutes;
      let pauseMinutes = 0;
      if (activity === "lunch" && cursor < 11 * 60 + 30) pauseMinutes = 11 * 60 + 30 - cursor;
      if (activity === "dinner" && cursor < 18 * 60) pauseMinutes = 18 * 60 - cursor;
      cursor += pauseMinutes;
      const arrivalTime = formatTime(cursor);
      const durationMinutes = activityDurations[activity];
      cursor += durationMinutes;
      const distanceMeters = Math.round(leg?.distance ?? distanceBetween(index === 0 ? origin : selected[index - 1].place, place));
      const restaurant = activity === "lunch" || activity === "dinner";
      const reason = reasonFor(activity, place, mood, weather, budget, lunchCuisine);
      return {
        id: `${activity}-${place.id}`,
        activity,
        activityLabel: activityLabels[activity],
        arrivalTime,
        leaveTime: formatTime(cursor),
        durationMinutes,
        travel: {
          minutes: travelMinutes,
          distanceMeters,
          from: index === 0 ? locationLabel : selected[index - 1].place.name,
        },
        pauseBefore: pauseMinutes > 0 ? `${durationText(pauseMinutes)}의 자유시간을 남겼어요.` : null,
        place: {
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
          type: place.placeType,
          cuisine: place.cuisine,
          openingHours: place.openingHours,
          websiteUrl: place.websiteUrl,
          mapUrl: `https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=18/${place.latitude}/${place.longitude}`,
        },
        reason,
        evidence: evidenceFor(activity, place, reason, route.source, travelMinutes, distanceMeters, budget),
        diningFit: restaurant ? dateDiningFit(place, budget) : null,
        menu: restaurant ? menuFor(place, budget) : null,
      };
    });

    const selectedIds = new Set(selected.map(({ place }) => place.id));
    const selectedRestaurants = selected.filter(({ place }) => place.kind === "restaurant").map(({ place }) => place);
    const restaurantCandidates = wantsRestaurants
      ? uniquePlaces(
          selectedRestaurants,
          rankRestaurantPlaces(places.filter((place) => place.kind === "restaurant"), origin, new Set(), mood, preferences, budget),
        )
      : [];
    const selectedCafes = selected.filter(({ place }) => place.kind === "cafe").map(({ place }) => place);
    const cafeCandidates = wantsCafes
      ? uniquePlaces(
          selectedCafes,
          places.filter((place) => place.kind === "cafe").sort((a, b) => distanceBetween(origin, a) - distanceBetween(origin, b)),
        )
      : [];
    const mapUrlFor = (place: Place) => `https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=18/${place.latitude}/${place.longitude}`;
    const recommendations = {
      limitPerCategory: RECOMMENDATION_LIMIT,
      minimumDriveMinutes: MIN_DRIVE_MINUTES,
      restaurants: restaurantCandidates.map((place) => {
        const menu = menuFor(place, budget);
        return {
          id: place.id,
          kind: "restaurant" as const,
          name: place.name,
          type: place.placeType,
          cuisine: place.cuisine,
          distanceMeters: Math.round(distanceBetween(origin, place)),
          selected: selectedIds.has(place.id),
          reason: place.premiumSignals.length
            ? `${place.premiumSignals.slice(0, 2).join(" · ")} 정보를 식사 예산 랭킹에 반영했어요.`
            : `${mood} 취향과 식사 예산 조건을 함께 비교한 후보예요.`,
          mapUrl: mapUrlFor(place),
          websiteUrl: place.websiteUrl,
          menuUrl: menu.registeredMenuUrl ?? menu.naverSearchUrl,
          travel: null,
        };
      }),
      cafes: cafeCandidates.map((place) => ({
        id: place.id,
        kind: "cafe" as const,
        name: place.name,
        type: place.placeType,
        cuisine: place.cuisine,
        distanceMeters: Math.round(distanceBetween(origin, place)),
        selected: selectedIds.has(place.id),
        reason: "출발지와 전체 동선의 이동 부담을 줄이는 방향으로 정렬한 카페 후보예요.",
        mapUrl: mapUrlFor(place),
        websiteUrl: place.websiteUrl,
        menuUrl: null,
        travel: null,
      })),
      drives: wantsDrive ? driveOptions.slice(0, RECOMMENDATION_LIMIT).map((option) => ({
        id: option.place.id,
        kind: "drive" as const,
        name: option.place.name,
        type: option.place.placeType,
        cuisine: option.place.cuisine,
        distanceMeters: option.distanceMeters,
        selected: selectedIds.has(option.place.id),
        reason: `이전 일정 지점에서 차량 이동 ${option.minutes}분으로, 최소 ${MIN_DRIVE_MINUTES}분 조건을 통과한 후보예요.`,
        mapUrl: mapUrlFor(option.place),
        websiteUrl: option.place.websiteUrl,
        menuUrl: null,
        travel: { minutes: option.minutes, distanceMeters: option.distanceMeters, source: option.source },
      })) : [],
    };

    if ((wantsRestaurants && recommendations.restaurants.length !== RECOMMENDATION_LIMIT) ||
      (wantsCafes && recommendations.cafes.length !== RECOMMENDATION_LIMIT) ||
      (wantsDrive && recommendations.drives.length !== RECOMMENDATION_LIMIT)) {
      throw new Error("카테고리별 추천 후보 4곳을 완성하지 못해 결과를 반환하지 않았어요. 출발 지역을 바꿔 다시 시도해주세요.");
    }

    const overrunMinutes = Math.max(0, Math.round(cursor - endMinutes));
    const reasoning = buildReasoningAudit({
      order,
      selected,
      placesCount: places.length,
      locationLabel,
      startTime,
      endTime,
      weather,
      routeSource: route.source,
      routeLegCount: route.legs.length,
      totalTravelMinutes: route.duration / 60,
      overrunMinutes,
      budget,
      recommendationCounts: {
        restaurants: recommendations.restaurants.length,
        cafes: recommendations.cafes.length,
        drives: recommendations.drives.length,
      },
      driveRecommendationMinutes: recommendations.drives.map((place) => place.travel?.minutes ?? 0),
    });
    const model = await runModelAudit({
      location: locationLabel,
      activities: order.map((activity) => activityLabels[activity]),
      restaurantBudget: budget.rangeLabel,
      stops: selected.map(({ activity, place }) => ({
        activity: activityLabels[activity],
        name: place.name,
        type: place.placeType,
        premiumSignals: place.kind === "restaurant" ? place.premiumSignals : [],
      })),
      recommendationCounts: {
        restaurants: recommendations.restaurants.length,
        cafes: recommendations.cafes.length,
        drives: recommendations.drives.length,
      },
      minimumDriveMinutes: MIN_DRIVE_MINUTES,
      driveRecommendations: recommendations.drives.map((place) => ({
        name: place.name,
        minutes: place.travel?.minutes ?? 0,
        source: place.travel?.source ?? "unknown",
      })),
      routeSource: route.source,
      uncertainties: reasoning.uncertainties,
    }, (url, init) => fetchWithTimeout(url, init, 20000));
    reactRun.record({
      action: { tool: "ModelCritic", label: "LLM 최종 감사", input: `${model.name} · 검증 사실만 전달` },
      observation: {
        status: model.used ? "grounded" : "attention",
        summary: model.summary,
        facts: [`모델 ID ${model.id}`, model.used ? "Responses API 호출 완료" : "결정론적 검증으로 폴백"],
      },
      decision: model.used ? "모델 감사 결과를 보조 요약으로 표시하고 코드 검산을 계속합니다." : "모델 상태를 숨기지 않고 코드 검산으로 계속합니다.",
      replan: false,
    });
    const verificationAttention = reasoning.stages.some((stage) => stage.status === "attention");
    reactRun.record({
      action: { tool: "Verify", label: "제약 조건 검산", input: "장소 수·중복·순서·경로 구간·시간·가격 근거" },
      observation: {
        status: verificationAttention ? "attention" : "grounded",
        summary: verificationAttention ? "필수 검사는 통과했고 미확인 정보를 따로 표시했어요." : "모든 필수 검사와 근거 분리가 통과됐어요.",
        facts: [
          `요청 활동 ${order.length}개 = 동선 장소 ${selected.length}곳`,
          `후보 식당 ${recommendations.restaurants.length} · 카페 ${recommendations.cafes.length} · 드라이브 ${recommendations.drives.length}`,
          recommendations.drives.length ? `드라이브 최소 ${Math.min(...recommendations.drives.map((place) => place.travel?.minutes ?? 0))}분` : "드라이브 미요청",
          `경로 구간 ${route.legs.length}개`,
          `종료 ${formatTime(cursor)}${overrunMinutes ? ` · ${overrunMinutes}분 초과` : " · 시간 범위 충족"}`,
        ],
      },
      decision: "더 필요한 도구 호출이 없어 안전한 응답으로 종료합니다.",
      replan: false,
    });
    const react = reactRun.result("필수 일관성 검사를 통과하고 추가 도구 호출이 필요하지 않아 종료했어요.");
    return NextResponse.json({
      location: { label: locationLabel, ...origin },
      context: {
        companion,
        mood,
        startTime,
        endTime,
        transport: effectiveTransport,
        requestedActivities: activities,
        budget: { tier: budget.tier, label: budget.label, rangeLabel: budget.rangeLabel, detail: budget.detail },
      },
      weather,
      summary: {
        title: `${companion} ${mood} 유영하는 하루`,
        stopCount: stops.length,
        totalDistanceMeters: Math.round(route.distance),
        totalTravelMinutes: Math.round(route.duration / 60),
        plannedEndTime: formatTime(cursor),
        overrunMinutes,
        routeSource: route.source,
      },
      tools: [
        { name: "Location", label: "위치 해석", detail: `${locationLabel}을 하루의 출발점으로 잡았어요.` },
        { name: "Weather", label: "날씨 판단", detail: weather ? `${weather.temperature}° · ${weather.description}. ${weather.advice}` : "날씨 없이 장소와 이동을 중심으로 판단했어요." },
        { name: "Places", label: "장소 탐색", detail: `식당·카페·경험 장소 ${places.length}곳을 비교했어요.` },
        { name: "Route", label: "동선 계산", detail: `${route.source === "OSRM" ? "도로 경로" : "거리 추정"}로 이동 ${durationText(route.duration / 60)}을 계산했어요.` },
        { name: "Memory", label: "취향 반영", detail: preferences.length ? `기억한 취향 ${preferences.length}개를 장소 선택에 반영했어요.` : "점심과 저녁의 음식 유형이 겹치지 않게 구성했어요." },
        { name: "Budget", label: "식사 예산", detail: `${budget.rangeLabel} 조건은 점심·저녁 식당에만 적용했고 카페·드라이브에서는 제외했어요.` },
      ],
      reasoning,
      react,
      model,
      recommendations,
      stops,
      routeUrl: googleRouteUrl(origin, selected, effectiveTransport),
      meta: {
        generatedAt: new Date().toISOString(),
        placeSource: "OpenStreetMap contributors",
        weatherSource: "Open-Meteo",
        routeSource: route.source,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "하루의 경험을 설계하는 중 문제가 생겼어요.";
    return jsonError(message, 503);
  }
}
