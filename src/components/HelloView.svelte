<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import moment from "moment";
  import { settings } from "../ui/stores";

  export let onOpenTasks: (() => void) | undefined = undefined;
  export let onOpenAnalytics: (() => void) | undefined = undefined;
  export let onOpenFinance: (() => void) | undefined = undefined;
  export let onOpenSchedule: (() => void) | undefined = undefined;

  const RU_MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const RU_DAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

  let now = moment();
  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    timer = setInterval(() => { now = moment(); }, 60000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

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
</script>

<div class="hello">
  <!-- Hero -->
  <div class="hello-hero">
    <h1 class="hello-title">{greeting} <span class="hello-emoji">{greetingEmoji}</span></h1>
    <p class="hello-date">{dateDisplay}</p>
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
    max-width: 600px;
    margin: 0 auto;
    padding: 40px 32px 48px;
    color: var(--text-normal, #e8ecf0);
    font-family: inherit;
    box-sizing: border-box;
  }

  .hello * { box-sizing: border-box; }

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

  /* ═══ CARD ═══════════════════════════════ */
  .hello-card {
    background: var(--background-secondary, #171a21);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 14px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    height: 320px;
  }

  .hello-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    flex-shrink: 0;
  }

  .hello-card-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted, #6b7280);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .hello-card-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(124, 92, 252, 0.15);
    color: var(--interactive-accent, #7C5CFC);
  }

  .hello-card-body { flex: 1; overflow: hidden; min-height: 0; }

  .hello-card-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 10px;
    margin-top: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    color: var(--text-muted, #6b7280);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .hello-card-btn:hover {
    background: rgba(124, 92, 252, 0.08);
    border-color: rgba(124, 92, 252, 0.3);
    color: var(--interactive-accent, #7C5CFC);
  }

  /* ═══ HABITS ═════════════════════════════ */
  .hello-habit-list { display: flex; flex-direction: column; gap: 4px; }

  .hello-habit {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
    width: 100%;
    text-align: left;
    color: var(--text-normal, #e8ecf0);
    font-family: inherit;
    font-size: 13px;
  }

  .hello-habit:hover { background: rgba(255, 255, 255, 0.03); border-color: rgba(255, 255, 255, 0.06); }
  .hello-habit.done { opacity: 0.5; }
  .hello-habit.partial { opacity: 0.7; }

  .hello-habit-check {
    width: 20px;
    height: 20px;
    border-radius: 5px;
    border: 2px solid rgba(255, 255, 255, 0.12);
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.2s ease;
    color: transparent;
  }

  .hello-habit-check.checked {
    background: var(--hc, #3DD68C);
    border-color: var(--hc, #3DD68C);
    color: #fff;
    box-shadow: 0 0 8px color-mix(in srgb, var(--hc, #3DD68C) 30%, transparent);
  }

  .hello-habit-check.half { border-color: var(--hc, #F5A623); color: var(--hc, #F5A623); }

  .hello-check-svg { width: 11px; height: 11px; }

  .hello-habit-icon { font-size: 15px; flex-shrink: 0; line-height: 1; }

  .hello-habit-name {
    flex: 1;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .hello-habit-name.strike { text-decoration: line-through; color: var(--text-muted, #6b7280); }

  .hello-habit-cnt {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-muted, #6b7280);
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 7px;
    border-radius: 6px;
    flex-shrink: 0;
  }

  /* ═══ SHARED ═════════════════════════════ */
  .hello-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 13px;
    color: var(--text-muted, #6b7280);
  }

  /* ═══ TABLET ═════════════════════════════ */
  @media (max-width: 768px) {
    .hello { padding: 28px 20px 36px; }
    .hello-title { font-size: 28px; }
    .hello-emoji { font-size: 26px; }
    .hello-date { font-size: 13px; }
    .hello-nav { gap: 8px; margin-bottom: 20px; }
    .hello-nav-btn { padding: 9px 16px; font-size: 12px; }
    .hello-nav-icon { font-size: 14px; }
    .hello-card { height: 300px; padding: 16px; }
  }

  /* ═══ MOBILE ═════════════════════════════ */
  @media (max-width: 540px) {
    .hello { padding: 20px 14px 28px; }
    .hello-hero { margin-bottom: 20px; }
    .hello-title { font-size: 24px; }
    .hello-emoji { font-size: 22px; }
    .hello-date { font-size: 12px; }
    .hello-nav { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
    .hello-nav-btn { justify-content: center; padding: 12px 10px; font-size: 12px; }
    .hello-nav-icon { font-size: 16px; }
    .hello-card { height: 260px; padding: 14px; }
    .hello-card-head { margin-bottom: 10px; }
    .hello-habit { padding: 8px 10px; gap: 8px; }
    .hello-habit-icon { font-size: 14px; }
    .hello-habit-name { font-size: 12px; }
  }

  /* ═══ VERY SMALL ═════════════════════════ */
  @media (max-width: 380px) {
    .hello-title { font-size: 20px; }
    .hello-nav { grid-template-columns: 1fr; }
  }

  /* ═══ WIDE ════════════════════════════════ */
  @media (min-width: 1200px) {
    .hello { padding: 48px 40px 56px; }
    .hello-title { font-size: 42px; }
    .hello-emoji { font-size: 38px; }
    .hello-date { font-size: 15px; }
    .hello-nav { gap: 12px; }
    .hello-nav-btn { padding: 12px 24px; font-size: 14px; }
    .hello-nav-icon { font-size: 18px; }
    .hello-card { height: 340px; padding: 24px; }
  }
</style>
