import { requestUrl } from "obsidian";

// WMO Weather interpretation codes → emoji + description
const WMO_CODES: Record<number, { icon: string; label: string }> = {
  0:  { icon: "☀️",  label: "Ясно" },
  1:  { icon: "🌤️", label: "Малооблачно" },
  2:  { icon: "⛅",  label: "Облачно" },
  3:  { icon: "☁️",  label: "Пасмурно" },
  45: { icon: "🌫️", label: "Туман" },
  48: { icon: "🌫️", label: "Иней" },
  51: { icon: "🌦️", label: "Лёгкая морось" },
  53: { icon: "🌦️", label: "Морось" },
  55: { icon: "🌧️", label: "Сильная морось" },
  56: { icon: "🌧️", label: "Ледяная морось" },
  57: { icon: "🌧️", label: "Сильная ледяная морось" },
  61: { icon: "🌧️", label: "Небольшой дождь" },
  63: { icon: "🌧️", label: "Дождь" },
  65: { icon: "🌧️", label: "Сильный дождь" },
  66: { icon: "🌧️", label: "Ледяной дождь" },
  67: { icon: "🌧️", label: "Сильный ледяной дождь" },
  71: { icon: "🌨️", label: "Небольшой снег" },
  73: { icon: "🌨️", label: "Снег" },
  75: { icon: "❄️", label: "Сильный снег" },
  77: { icon: "❄️", label: "Снежные зёрна" },
  80: { icon: "🌦️", label: "Небольшой ливень" },
  81: { icon: "🌧️", label: "Ливень" },
  82: { icon: "⛈️", label: "Сильный ливень" },
  85: { icon: "🌨️", label: "Небольшой снежный ливень" },
  86: { icon: "🌨️", label: "Снежный ливень" },
  95: { icon: "⛈️", label: "Гроза" },
  96: { icon: "⛈️", label: "Гроза с градом" },
  99: { icon: "⛈️", label: "Сильная гроза с градом" },
};

export interface DayWeather {
  date: string; // YYYY-MM-DD
  tempMax: number;
  tempMin: number;
  weatherCode: number;
  icon: string;
  label: string;
}

interface WeatherCache {
  key: string;
  data: DayWeather[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let cache: WeatherCache | null = null;

function getCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)}_${lon.toFixed(2)}`;
}

function getCached(lat: number, lon: number, startDate: string, endDate: string): DayWeather[] | null {
  if (!cache) return null;
  if (cache.key !== getCacheKey(lat, lon)) return null;
  if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) return null;
  // Check if cached data covers the requested date range
  const filtered = cache.data.filter((d) => d.date >= startDate && d.date <= endDate);
  if (filtered.length === 0) return null;
  // Check if we have data for every day in the range
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dayCount = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (filtered.length < dayCount) return null;
  return filtered;
}

export async function fetchWeekWeather(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string
): Promise<DayWeather[]> {
  const cached = getCached(lat, lon, startDate, endDate);
  if (cached) {
    return cached;
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&start_date=${startDate}&end_date=${endDate}&timezone=auto`;

  try {
    const response = await requestUrl({ url, method: "GET" });
    const json = response.json;

    if (!json?.daily?.time) return [];

    const days: DayWeather[] = json.daily.time.map((date: string, i: number) => {
      const code = json.daily.weather_code[i];
      const info = WMO_CODES[code] || { icon: "🌡️", label: "Неизвестно" };
      return {
        date,
        tempMax: Math.round(json.daily.temperature_2m_max[i]),
        tempMin: Math.round(json.daily.temperature_2m_min[i]),
        weatherCode: code,
        icon: info.icon,
        label: info.label,
      };
    });

    // Update cache
    cache = {
      key: getCacheKey(lat, lon),
      data: days,
      fetchedAt: Date.now(),
    };

    return days;
  } catch (e) {
    console.error("[WeatherService] fetch error:", e);
    return [];
  }
}

export function getWMOInfo(code: number): { icon: string; label: string } {
  return WMO_CODES[code] || { icon: "🌡️", label: "Неизвестно" };
}
