<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import moment from "moment";
  import { settings } from "../ui/stores";
  import { fetchWeekWeather, type DayWeather } from "../services/weatherService";

  export let onOpenTasks: (() => void) | undefined = undefined;
  export let onOpenAnalytics: (() => void) | undefined = undefined;
  export let onOpenFinance: (() => void) | undefined = undefined;
  export let onOpenSchedule: (() => void) | undefined = undefined;

  const RU_MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const RU_DAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

  let now = moment();
  let timer: ReturnType<typeof setInterval> | null = null;
  let weather: DayWeather | null = null;

  onMount(() => {
    timer = setInterval(() => { now = moment(); }, 60000);
    loadWeather();
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  async function loadWeather() {
    const lat = $settings.weatherLatitude;
    const lon = $settings.weatherLongitude;
    if (lat && lon) {
      try {
        const start = moment().format("YYYY-MM-DD");
        const end = moment().add(1, "day").format("YYYY-MM-DD");
        const data = await fetchWeekWeather(lat, lon, start, end);
        const today = data.find(d => d.date === start);
        if (today) weather = today;
      } catch {}
    }
  }

  $: userName = $settings.userName || "";
  $: showTasksBtn = $settings.helloShowTasksBtn !== false;
  $: showAnalyticsBtn = $settings.helloShowAnalyticsBtn !== false;
  $: showFinanceBtn = $settings.helloShowFinanceBtn !== false;
  $: showScheduleBtn = $settings.helloShowScheduleBtn !== false;
  $: hour = now.hour();
  $: greetingText = hour < 6 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  $: greeting = userName ? `${greetingText}, ${userName}` : greetingText;
  $: greetingEmoji = hour < 6 ? "🌙" : hour < 12 ? "☀️" : hour < 18 ? "🌤" : "🌆";
  $: monthName = RU_MONTHS[now.month()];
  $: year = now.format("YYYY");
  $: dateDisplay = `${now.date()} ${monthName} ${year}, ${RU_DAYS[now.day()]}`;

  // Time-of-day theme
  $: timeTheme = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "day" : "evening";

  // Weather animation class
  $: weatherAnim = (() => {
    if (!weather) return "";
    const code = weather.weatherCode;
    // Clear / mostly clear: 0, 1
    if (code === 0 || code === 1) return "weather-sun";
    // Rain: 51-67, 80-82
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "weather-rain";
    // Cloudy: 2
    if (code === 2) return "weather-clouds";
    // Overcast: 3, fog: 45-48
    if (code === 3 || code === 45 || code === 48) return "weather-gloom";
    // Thunderstorm: 95-99
    if (code >= 95) return "weather-storm";
    return "";
  })();

</script>

<div class="hello hello--{timeTheme}">
  <!-- Weather animation layer -->
  {#if weatherAnim}
    <div class="hello-weather {weatherAnim}">
      {#if weatherAnim === "weather-rain"}
        {#each Array(40) as _, i}
          <div class="raindrop" style="left: {Math.random() * 100}%; animation-delay: {Math.random() * 2}s; animation-duration: {0.5 + Math.random() * 0.5}s"></div>
        {/each}
      {:else if weatherAnim === "weather-clouds"}
        {#each Array(5) as _, i}
          <div class="cloud" style="top: {10 + i * 15}%; animation-delay: {i * 3}s; opacity: {0.15 + Math.random() * 0.2}"></div>
        {/each}
      {:else if weatherAnim === "weather-gloom"}
        <div class="gloom-overlay"></div>
      {:else if weatherAnim === "weather-storm"}
        {#each Array(60) as _, i}
          <div class="raindrop heavy" style="left: {Math.random() * 100}%; animation-delay: {Math.random() * 1.5}s; animation-duration: {0.3 + Math.random() * 0.4}s"></div>
        {/each}
      {:else if weatherAnim === "weather-sun"}
        <div class="sun">
          <div class="sun-core"></div>
          {#each Array(8) as _, i}
            <div class="sun-ray" style="transform: rotate({i * 45}deg)"></div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Hero -->
  <div class="hello-hero">
    <h1 class="hello-title">{greeting} <span class="hello-emoji">{greetingEmoji}</span></h1>
    <p class="hello-date">{dateDisplay}</p>
    {#if weather}
      <p class="hello-weather-label">{weather.icon} {weather.label} {weather.tempMin}…{weather.tempMax}°C</p>
    {/if}
  </div>

  <!-- Nav -->
  <div class="hello-nav">
    {#if showTasksBtn}
      <button class="hello-nav-btn" on:click={onOpenTasks}>
        <span class="hello-nav-icon">✅</span>
        <span>Задачи</span>
      </button>
    {/if}
    {#if showAnalyticsBtn}
      <button class="hello-nav-btn" on:click={onOpenAnalytics}>
        <span class="hello-nav-icon">📊</span>
        <span>Аналитика</span>
      </button>
    {/if}
    {#if showFinanceBtn}
      <button class="hello-nav-btn" on:click={onOpenFinance}>
        <span class="hello-nav-icon">💰</span>
        <span>Финансы</span>
      </button>
    {/if}
    {#if showScheduleBtn}
      <button class="hello-nav-btn" on:click={onOpenSchedule}>
        <span class="hello-nav-icon">📅</span>
        <span>Расписание</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .hello {
    margin: 0 auto;
    color: var(--text-normal, #e8ecf0);
    font-family: inherit;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
    border-radius: 16px;
    transition: background 1s ease;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 4%, black 96%, transparent 100%);
    mask-image: linear-gradient(to bottom, transparent 0%, black 4%, black 96%, transparent 100%);
  }

  .hello * { box-sizing: border-box; }

  /* ═══ TIME-OF-DAY THEMES ═════════════════ */
  .hello--morning {
    background: radial-gradient(ellipse at 30% 20%, rgba(255, 183, 77, 0.07) 0%, transparent 60%),
                radial-gradient(ellipse at 70% 80%, rgba(255, 138, 101, 0.04) 0%, transparent 50%);
  }
  .hello--day {
    background: radial-gradient(ellipse at 50% 30%, rgba(100, 181, 246, 0.06) 0%, transparent 55%),
                radial-gradient(ellipse at 40% 70%, rgba(129, 212, 250, 0.03) 0%, transparent 50%);
  }
  .hello--evening {
    background: radial-gradient(ellipse at 60% 20%, rgba(149, 117, 205, 0.08) 0%, transparent 55%),
                radial-gradient(ellipse at 30% 80%, rgba(100, 80, 160, 0.04) 0%, transparent 50%);
  }
  .hello--night {
    background: radial-gradient(ellipse at 40% 30%, rgba(30, 30, 60, 0.12) 0%, transparent 50%),
                radial-gradient(ellipse at 70% 70%, rgba(15, 15, 40, 0.06) 0%, transparent 45%);
  }

  /* ═══ WEATHER ANIMATIONS ════════════════ */
  .hello-weather {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 0;
  }

  .hello > *:not(.hello-weather) { position: relative; z-index: 1; }

  /* Rain */
  .raindrop {
    position: absolute;
    top: -20px;
    width: 2px;
    height: 18px;
    background: linear-gradient(180deg, transparent, rgba(120, 180, 255, 0.3));
    border-radius: 0 0 2px 2px;
    animation: rain-fall linear infinite;
  }
  .raindrop.heavy {
    width: 2.5px;
    height: 24px;
    background: linear-gradient(180deg, transparent, rgba(120, 180, 255, 0.45));
  }

  @keyframes rain-fall {
    0% { transform: translateY(-20px); opacity: 0; }
    10% { opacity: 1; }
    90% { opacity: 1; }
    100% { transform: translateY(calc(100vh + 20px)); opacity: 0; }
  }

  /* Clouds */
  .cloud {
    position: absolute;
    left: -200px;
    width: 200px;
    height: 60px;
    background: radial-gradient(ellipse at center, rgba(200, 210, 220, 0.25) 0%, transparent 70%);
    border-radius: 50%;
    animation: cloud-drift 30s linear infinite;
  }

  @keyframes cloud-drift {
    0% { transform: translateX(-200px); }
    100% { transform: translateX(calc(100vw + 200px)); }
  }

  /* Gloom */
  .gloom-overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(180deg, rgba(40, 40, 50, 0.1) 0%, rgba(50, 50, 60, 0.06) 100%);
  }

  /* Storm = heavy rain + slight flicker */
  .weather-storm {
    animation: storm-flicker 4s ease-in-out infinite;
  }

  @keyframes storm-flicker {
    0%, 95%, 100% { opacity: 1; }
    96% { opacity: 0.85; }
  }

  /* Sun */
  .sun {
    position: absolute;
    top: -30px;
    right: -30px;
    width: 120px;
    height: 120px;
    animation: sun-pulse 4s ease-in-out infinite;
  }

  .sun-core {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 50px; height: 50px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 214, 0, 0.3) 0%, rgba(255, 183, 77, 0.1) 60%, transparent 100%);
    box-shadow: 0 0 40px rgba(255, 214, 0, 0.15), 0 0 80px rgba(255, 183, 77, 0.08);
  }

  .sun-ray {
    position: absolute;
    top: 50%; left: 50%;
    width: 2px; height: 40px;
    background: linear-gradient(180deg, rgba(255, 214, 0, 0.2), transparent);
    transform-origin: center top;
    border-radius: 1px;
  }

  @keyframes sun-pulse {
    0%, 100% { transform: scale(1); opacity: 0.8; }
    50% { transform: scale(1.05); opacity: 1; }
  }

  /* ═══ HERO ═══════════════════════════════ */
  .hello-hero { text-align: center; margin-bottom: 28px; }

  .hello-title {
    font-size: 36px;
    font-weight: 800;
    margin: 0 0 8px;
    letter-spacing: -0.03em;
  }

  .hello-emoji { font-size: 32px; font-style: normal; vertical-align: middle; }

  .hello-date { margin: 0; font-size: 14px; color: var(--text-muted, #6b7280); font-weight: 500; }

  .hello-weather-label {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--text-muted, #6b7280);
  }

  /* ═══ NAV ════════════════════════════════ */
  .hello-nav { display: flex; justify-content: center; gap: 10px; margin-bottom: 24px; flex-wrap: wrap; }

  .hello-nav-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--background-secondary, #171a21);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    color: var(--text-muted, #888);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    white-space: nowrap;
  }

  .hello-nav-btn:hover {
    border-color: var(--interactive-accent, #7C5CFC);
    color: var(--text-normal, #e8ecf0);
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(124, 92, 252, 0.12);
  }

  .hello-nav-btn:active { transform: translateY(0); box-shadow: none; }

  .hello-nav-icon { font-size: 16px; line-height: 1; }

  /* ═══ RESPONSIVE ═════════════════════════ */
  @media (max-width: 768px) {
    .hello { padding: 28px 20px 36px; }
    .hello-title { font-size: 28px; }
    .hello-emoji { font-size: 26px; }
    .hello-date { font-size: 13px; }
    .hello-nav { gap: 8px; margin-bottom: 20px; }
    .hello-nav-btn { padding: 9px 16px; font-size: 12px; }
    .hello-nav-icon { font-size: 14px; }
  }

  @media (max-width: 540px) {
    .hello { padding: 20px 14px 28px; }
    .hello-hero { margin-bottom: 20px; }
    .hello-title { font-size: 24px; }
    .hello-emoji { font-size: 22px; }
    .hello-date { font-size: 12px; }
    .hello-nav { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
    .hello-nav-btn { justify-content: center; padding: 12px 10px; font-size: 12px; }
    .hello-nav-icon { font-size: 16px; }
  }

  @media (max-width: 380px) {
    .hello-title { font-size: 20px; }
    .hello-nav { grid-template-columns: 1fr; }
  }

  @media (min-width: 1200px) {
    .hello { padding: 48px 40px 56px; }
    .hello-title { font-size: 42px; }
    .hello-emoji { font-size: 38px; }
    .hello-date { font-size: 15px; }
    .hello-nav { gap: 12px; }
    .hello-nav-btn { padding: 12px 24px; font-size: 14px; }
    .hello-nav-icon { font-size: 18px; }
  }
</style>
