<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { tasks } from "../task-tracker/stores";
  import { settings } from "../ui/stores";
  import { fetchWeekWeather, type DayWeather } from "../services/weatherService";
  import { getDateUID } from "obsidian-daily-notes-interface";
  import moment from "moment";

  let now = new Date();
  let timer: ReturnType<typeof setInterval>;
  let completedToday = 0;
  let totalToday = 0;
  let inProgressCount = 0;
  let weather: DayWeather | null = null;
  let unsubTasks: (() => void) | null = null;

  $: dateStr = now.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  $: timeStr = now.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  function updateStats() {
    const todayUID = getDateUID(moment(), "day");
    const all = get(tasks);
    const todayTasks = all.filter((t) => t.dateUID === todayUID);
    totalToday = todayTasks.length;
    completedToday = todayTasks.filter((t) => t.status === "done").length;
    inProgressCount = all.filter((t) => t.status === "progress").length;
  }

  async function loadWeather() {
    const s = $settings;
    if (!s.weatherEnabled) return;
    try {
      const lat = s.weatherLatitude ?? 55.75;
      const lon = s.weatherLongitude ?? 37.62;
      const today = new Date().toISOString().slice(0, 10);
      const days = await fetchWeekWeather(lat, lon, today, today);
      weather = days.length > 0 ? days[0] : null;
    } catch {
      weather = null;
    }
  }

  onMount(() => {
    timer = setInterval(() => {
      now = new Date();
    }, 10000);
    unsubTasks = tasks.subscribe(() => updateStats());
    updateStats();
    loadWeather();
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
    unsubTasks?.();
  });
</script>

<div class="dtw-bar">
  <span class="dtw-item">
    <span class="dtw-icon">📅</span>
    <span>{dateStr}</span>
  </span>
  <span class="dtw-sep"></span>
  <span class="dtw-item">
    <span class="dtw-icon">🕐</span>
    <span>{timeStr}</span>
  </span>
  {#if weather}
    <span class="dtw-sep"></span>
    <span class="dtw-item">
      <span class="dtw-icon">{weather.icon}</span>
      <span>{weather.tempMin}..{weather.tempMax}° {weather.label}</span>
    </span>
  {/if}
  {#if totalToday > 0}
    <span class="dtw-sep"></span>
    <span class="dtw-item">
      <span class="dtw-icon">✅</span>
      <span>Задачи: {completedToday} / {totalToday}</span>
    </span>
  {/if}
  {#if inProgressCount > 0}
    <span class="dtw-sep"></span>
    <span class="dtw-item">
      <span class="dtw-icon">▶️</span>
      <span>В работе: {inProgressCount}</span>
    </span>
  {/if}
</div>

<style>
  .dtw-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 6px 16px;
    width: 100%;
    box-sizing: border-box;
    font-size: 13px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
  }

  .dtw-item {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
    height: 100%;
    flex-shrink: 0;
  }

  .dtw-icon {
    font-size: 13px;
    flex-shrink: 0;
  }

  .dtw-sep {
    width: 1px;
    height: 16px;
    background: var(--background-modifier-border);
    flex-shrink: 0;
  }

  @media (max-width: 600px) {
    .dtw-bar {
      font-size: 11px;
      padding: 0 6px;
    }
    .dtw-item {
      padding: 0 6px;
    }
  }
</style>
