import { NextRequest, NextResponse } from "next/server";

type Coordinates = { latitude: number; longitude: number };
type LunchRequestBody = {
  query?: string;
  coordinates?: Coordinates | null;
  mood?: string;
  availableMinutes?: number;
  recentMeal?: string;
  preferences?: string[];
};

type OSMElement = {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  cuisineKey: string;
  amenity: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  walkingMinutes: number;
  openingHours: string | null;
  moodScore: number;
  preferenceScore: number;
  noveltyScore: number;
  recentPenalty: number;
};

const APP_USER_AGENT = "YUYEONG-Lunch-Agent/1.0 (https://yuyeong-agent.jisoo584983761.chatgpt.site)";
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
  coffee_shop: "카페 식사",
  international: "세계 음식",
  regional: "지역 음식",
  fast_food: "간편식",
  restaurant: "일반 음식점",
  food_court: "푸드코트",
};

const moodCuisine: Record<string, string[]> = {
  "든든하게": ["korean", "barbecue", "chicken", "burger", "noodle", "chinese"],
  "가볍게": ["salad", "sandwich", "sushi", "vietnamese", "noodle", "japanese"],
  "빠르게": ["fast_food", "burger", "sandwich", "noodle", "ramen"],
  "새롭게": ["thai", "indian", "mexican", "vietnamese", "international", "regional"],
  "아무거나": [],
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 18000) {
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
  return (
    Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude) &&
    coordinates.latitude >= -90 &&
    coordinates.latitude <= 90 &&
    coordinates.longitude >= -180 &&
    coordinates.longitude <= 180
  );
}

async function geocode(query: string) {
  const key = query.trim().toLocaleLowerCase("ko-KR");
  const cached = geocodeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
    countrycodes: "kr",
    addressdetails: "1",
  });
  const rateLimitedRequest = nominatimQueue.then(async () => {
    const waitFor = Math.max(0, 1100 - (Date.now() - lastNominatimRequestAt));
    if (waitFor > 0) await new Promise((resolve) => setTimeout(resolve, waitFor));
    lastNominatimRequestAt = Date.now();
  });
  nominatimQueue = rateLimitedRequest.catch(() => undefined);
  await rateLimitedRequest;
  const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      "User-Agent": APP_USER_AGENT,
      "Accept-Language": "ko,en;q=0.7",
    },
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

async function getWeather(coordinates: Coordinates) {
  const params = new URLSearchParams({
    latitude: coordinates.latitude.toString(),
    longitude: coordinates.longitude.toString(),
    current: "temperature_2m,apparent_temperature,precipitation,weather_code",
    timezone: "Asia/Seoul",
  });
  const response = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, {}, 10000);
  if (!response.ok) throw new Error("날씨 도구가 잠시 응답하지 않아요.");

  const data = (await response.json()) as {
    current?: {
      temperature_2m?: number;
      apparent_temperature?: number;
      precipitation?: number;
      weather_code?: number;
    };
  };
  const current = data.current ?? {};
  const code = Number(current.weather_code ?? -1);
  const precipitation = Number(current.precipitation ?? 0);
  const rainy = precipitation > 0.1 || (code >= 51 && code <= 99);
  const hot = Number(current.apparent_temperature ?? current.temperature_2m ?? 0) >= 28;
  const cold = Number(current.apparent_temperature ?? current.temperature_2m ?? 0) <= 7;

  return {
    temperature: Math.round(Number(current.temperature_2m ?? 0)),
    apparentTemperature: Math.round(Number(current.apparent_temperature ?? current.temperature_2m ?? 0)),
    precipitation,
    code,
    description: weatherDescription(code),
    rainy,
    advice: rainy ? "비를 피해 가까운 곳에 조금 더 무게를 뒀어요" : hot ? "더위를 고려해 이동이 짧은 곳을 우선했어요" : cold ? "추위를 고려해 가까운 따뜻한 메뉴를 살폈어요" : "걷기 좋은 날씨라 선택 범위를 조금 넓혔어요",
  };
}

function radiusFor(minutes: number) {
  if (minutes <= 30) return 600;
  if (minutes <= 60) return 1100;
  return 1700;
}

async function getRestaurants(coordinates: Coordinates, availableMinutes: number) {
  const radius = radiusFor(availableMinutes);
  const lat = coordinates.latitude.toFixed(6);
  const lon = coordinates.longitude.toFixed(6);
  const query = `[out:json][timeout:18];(
    node(around:${radius},${lat},${lon})["amenity"~"^(restaurant|fast_food|food_court)$"]["name"];
    way(around:${radius},${lat},${lon})["amenity"~"^(restaurant|fast_food|food_court)$"]["name"];
    relation(around:${radius},${lat},${lon})["amenity"~"^(restaurant|fast_food|food_court)$"]["name"];
  );out center tags;`;
  const response = await fetchWithTimeout("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": APP_USER_AGENT,
    },
    body: new URLSearchParams({ data: query }),
  }, 22000);

  if (!response.ok) throw new Error("주변 식당 검색 도구가 잠시 응답하지 않아요.");
  const data = (await response.json()) as { elements?: OSMElement[] };
  return { elements: data.elements ?? [], radius };
}

function distanceBetween(a: Coordinates, b: Coordinates) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadius = 6371000;
  const latDelta = toRadians(b.latitude - a.latitude);
  const lonDelta = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const haversine =
    Math.sin(latDelta / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function cuisineFrom(tags: Record<string, string>) {
  const amenity = tags.amenity ?? "restaurant";
  const cuisineKey = (tags.cuisine ?? amenity).split(/[;,]/)[0].trim().toLowerCase().replaceAll("-", "_");
  return {
    cuisineKey,
    cuisine: cuisineLabels[cuisineKey] ?? cuisineKey.replaceAll("_", " ") ?? cuisineLabels[amenity],
  };
}

function createRestaurant(
  element: OSMElement,
  origin: Coordinates,
  mood: string,
  recentMeal: string,
  preferences: string[],
) {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  const tags = element.tags;
  if (!tags?.name || latitude === undefined || longitude === undefined) return null;

  const { cuisineKey, cuisine } = cuisineFrom(tags);
  const distanceMeters = Math.round(distanceBetween(origin, { latitude, longitude }));
  const matchingCuisines = moodCuisine[mood] ?? [];
  const moodScore = matchingCuisines.length === 0 ? 10 : matchingCuisines.includes(cuisineKey) ? 28 : 4;
  const preferenceScore = preferences.some((preference) => preference === cuisineKey || preference === cuisine) ? 12 : 0;
  const recentText = recentMeal.trim().toLocaleLowerCase("ko-KR");
  const recentPenalty = recentText && `${tags.name} ${cuisine}`.toLocaleLowerCase("ko-KR").includes(recentText) ? 32 : 0;
  const familiarKeys = ["korean", "japanese", "chinese", "restaurant", "fast_food"];
  const noveltyScore = familiarKeys.includes(cuisineKey) ? 6 : 24;

  return {
    id: `${element.type}-${element.id}`,
    name: tags.name,
    cuisine,
    cuisineKey,
    amenity: tags.amenity ?? "restaurant",
    latitude,
    longitude,
    distanceMeters,
    walkingMinutes: Math.max(1, Math.round(distanceMeters / 75)),
    openingHours: tags.opening_hours ?? null,
    moodScore,
    preferenceScore,
    noveltyScore,
    recentPenalty,
  } satisfies Restaurant;
}

function selectRecommendations(restaurants: Restaurant[], mood: string, weather: Awaited<ReturnType<typeof getWeather>> | null) {
  const weatherDistanceWeight = weather?.rainy ? 0.095 : 0.06;
  const score = (restaurant: Restaurant) =>
    100 - restaurant.distanceMeters * weatherDistanceWeight + restaurant.moodScore + restaurant.preferenceScore - restaurant.recentPenalty;
  const selected: Array<Restaurant & { role: string; reason: string }> = [];

  function choose(candidates: Restaurant[], role: string, reason: (restaurant: Restaurant) => string) {
    const candidate = candidates.find((restaurant) => !selected.some((item) => item.id === restaurant.id));
    if (candidate) selected.push({ ...candidate, role, reason: reason(candidate) });
  }

  const comfort = [...restaurants].sort((a, b) => a.distanceMeters + a.recentPenalty * 15 - (b.distanceMeters + b.recentPenalty * 15));
  choose(comfort, "가장 편안한 선택", (restaurant) =>
    `${restaurant.walkingMinutes}분 거리라 이동 부담이 적어요. ${weather?.advice ?? "현재 위치에서 가까운 순서로 살폈어요."}`,
  );

  const moodFit = [...restaurants].sort((a, b) => score(b) - score(a));
  choose(moodFit, "오늘의 기분", (restaurant) =>
    `${mood} 먹고 싶은 마음과 ${restaurant.cuisine} 선택이 잘 맞고, 도보 ${restaurant.walkingMinutes}분이면 닿아요.`,
  );

  const usedCuisine = new Set(selected.map((item) => item.cuisineKey));
  const discovery = [...restaurants].sort((a, b) =>
    b.noveltyScore + b.preferenceScore - b.distanceMeters * 0.025 - (a.noveltyScore + a.preferenceScore - a.distanceMeters * 0.025),
  );
  choose(
    discovery.filter((restaurant) => !usedCuisine.has(restaurant.cuisineKey)),
    "새로운 선택",
    (restaurant) => `다른 두 선택과 결이 다른 ${restaurant.cuisine}이에요. 익숙함 사이에 작은 새로움을 남겼어요.`,
  );

  if (selected.length < 4) {
    choose(moodFit, "또 하나의 가능성", (restaurant) =>
      `조건 안에서 균형이 좋은 ${restaurant.cuisine} 선택이에요. 걸어서 약 ${restaurant.walkingMinutes}분 걸려요.`,
    );
  }

  return selected.slice(0, 4).map((restaurant) => ({
    id: restaurant.id,
    role: restaurant.role,
    name: restaurant.name,
    cuisine: restaurant.cuisine,
    distanceMeters: restaurant.distanceMeters,
    walkingMinutes: restaurant.walkingMinutes,
    reason: restaurant.reason,
    openingHours: restaurant.openingHours,
    mapUrl: `https://www.openstreetmap.org/?mlat=${restaurant.latitude}&mlon=${restaurant.longitude}#map=18/${restaurant.latitude}/${restaurant.longitude}`,
  }));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LunchRequestBody;
    const query = typeof body.query === "string" ? body.query.trim().slice(0, 100) : "";
    const coordinatesInput = isCoordinates(body.coordinates) ? body.coordinates : null;
    const mood = typeof body.mood === "string" && moodCuisine[body.mood] ? body.mood : "아무거나";
    const availableMinutes = [30, 60, 90].includes(Number(body.availableMinutes)) ? Number(body.availableMinutes) : 60;
    const recentMeal = typeof body.recentMeal === "string" ? body.recentMeal.slice(0, 40) : "";
    const preferences = Array.isArray(body.preferences)
      ? body.preferences.filter((item): item is string => typeof item === "string").slice(0, 8)
      : [];

    if (!coordinatesInput && query.length < 2) return jsonError("동네나 지하철역처럼 현재 지역을 조금 더 구체적으로 알려주세요.");

    const geocoded = coordinatesInput ? null : await geocode(query);
    if (!coordinatesInput && !geocoded) return jsonError("그 지역을 찾지 못했어요. ‘성수역, 서울’처럼 역이나 건물 이름을 포함해 입력해주세요.", 404);

    const coordinates = coordinatesInput ?? geocoded!.coordinates;
    const locationLabel = coordinatesInput ? (query || "현재 위치") : geocoded!.label;
    const [weatherResult, restaurantsResult] = await Promise.allSettled([
      getWeather(coordinates),
      getRestaurants(coordinates, availableMinutes),
    ]);

    if (restaurantsResult.status === "rejected") throw restaurantsResult.reason;
    const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
    const seen = new Set<string>();
    const restaurants = restaurantsResult.value.elements
      .map((element) => createRestaurant(element, coordinates, mood, recentMeal, preferences))
      .filter((restaurant): restaurant is Restaurant => restaurant !== null)
      .filter((restaurant) => {
        const key = `${restaurant.name}-${restaurant.latitude.toFixed(4)}-${restaurant.longitude.toFixed(4)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    if (restaurants.length < 4) {
      return jsonError("이 반경에서는 식당 후보 4곳을 찾지 못했어요. 지역을 조금 넓히거나 식사 시간을 늘려보세요.", 404);
    }

    const recommendations = selectRecommendations(restaurants, mood, weather);
    return NextResponse.json({
      location: { label: locationLabel, ...coordinates },
      weather,
      context: { mood, availableMinutes, recentMeal: recentMeal || null, preferenceCount: preferences.length },
      tools: [
        { name: "Location", label: "위치 해석", detail: `${locationLabel}의 좌표를 확인했어요.` },
        {
          name: "Weather",
          label: "날씨 확인",
          detail: weather ? `${weather.temperature}° · ${weather.description}. ${weather.advice}` : "날씨 도구 없이 거리와 취향을 중심으로 판단했어요.",
        },
        {
          name: "Places",
          label: "주변 탐색",
          detail: `반경 ${restaurantsResult.value.radius.toLocaleString("ko-KR")}m에서 식당 ${restaurants.length}곳을 비교했어요.`,
        },
        {
          name: "Memory",
          label: "취향 반영",
          detail: preferences.length > 0 ? `기억한 취향 ${preferences.length}개와 최근 메뉴를 함께 반영했어요.` : "최근 메뉴를 피하고 서로 다른 세 가지 결을 남겼어요.",
        },
      ],
      recommendations,
      meta: {
        generatedAt: new Date().toISOString(),
        placeSource: "OpenStreetMap contributors",
        weatherSource: "Open-Meteo",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "점심을 찾는 중 예상하지 못한 문제가 생겼어요.";
    return jsonError(message, 503);
  }
}
