<script lang="ts">
  import type { IHabit } from "../habit-tracker/types";
  import { getHabitStats } from "../habit-tracker/stores";
  import type { HabitStats } from "../habit-tracker/stores";
  import { habitLogs } from "../habit-tracker/stores";
  import moment from "moment";
  import { t } from "../i18n";

  export let habit: IHabit;

  let stats: HabitStats;
  let trendDelta = 0;
  let trendText = "";

  $: {
    $habitLogs;
    stats = getHabitStats(habit.id);

    // Real trend: completions this week vs last week for this habit
    const now = moment().startOf("day");
    const thisWeekStart = now.clone().startOf("week");
    const lastWeekStart = thisWeekStart.clone().subtract(1, "week");
    const lastWeekEnd = thisWeekStart.clone().subtract(1, "day");

    let thisWeekCount = 0;
    let lastWeekCount = 0;
    for (const log of $habitLogs) {
      if (log.habitId !== habit.id || !log.completed) continue;
      const logDate = moment(log.date, "YYYY-MM-DD");
      if (logDate.isSameOrAfter(thisWeekStart) && logDate.isSameOrBefore(now)) {
        thisWeekCount++;
      } else if (logDate.isSameOrAfter(lastWeekStart) && logDate.isSameOrBefore(lastWeekEnd)) {
        lastWeekCount++;
      }
    }

    trendDelta = thisWeekCount - lastWeekCount;
    if (trendDelta > 0) {
      trendText = `↑ +${trendDelta}`;
    } else if (trendDelta < 0) {
      trendText = `↓ ${trendDelta}`;
    } else if (thisWeekCount > 0) {
      trendText = `→ ${thisWeekCount}`;
    } else {
      trendText = "—";
    }
  }

  function translateFrequency(freq: string): string {
    switch (freq) {
      case "daily": return $t("components.habitFreqDaily");
      case "weekly": return $t("components.habitFreqWeekly");
      case "custom": return $t("components.habitFreqScheduled");
      default: return freq;
    }
  }
</script>

<div class="habit-card" style="--habit-color: {habit.color}">
  <div class="habit-card-header">
    <span class="habit-card-icon">{habit.icon}</span>
    <span class="habit-card-title">{habit.title}</span>
    <span class="habit-card-badge">
      <span class="habit-card-trend trend-{trendDelta > 0 ? 'up' : trendDelta < 0 ? 'down' : 'neutral'}">{trendText}</span>
      <span class="habit-card-freq">{translateFrequency(habit.frequency)}</span>
    </span>
  </div>

  <div class="habit-card-stats">
    <div class="habit-stat">
      <span class="habit-stat-value">{stats.currentStreak}</span>
      <span class="habit-stat-label">{$t("components.streak")}</span>
      <span class="habit-stat-sub">{$t("components.streakDays")}</span>
    </div>
    <div class="habit-stat">
      <span class="habit-stat-value">{stats.longestStreak}</span>
      <span class="habit-stat-label">{$t("components.maxStreak")}</span>
      <span class="habit-stat-sub">{$t("components.streakDays")}</span>
    </div>
    <div class="habit-stat">
      <span class="habit-stat-value">{stats.totalCompletions}</span>
      <span class="habit-stat-label">{$t("components.totalCompletions")}</span>
      <span class="habit-stat-sub">{$t("components.completions")}</span>
    </div>
    <div class="habit-stat">
      <span class="habit-stat-value stat-accent">{stats.completionRate}%</span>
      <span class="habit-stat-label">{$t("components.percent")}</span>
    </div>
  </div>

  {#if stats.lastCompleted}
    <div class="habit-card-last">
      {$t("components.lastHabit", { date: stats.lastCompleted })}
    </div>
  {/if}
</div>

<style>
  .habit-card {
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius);
    padding: 14px;
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    box-shadow: var(--mcp-shadow);
    transition: all 0.25s ease;
  }

  .habit-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--mcp-shadow-glow);
    border-color: var(--habit-color, var(--mcp-accent));
  }

  .habit-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .habit-card-icon {
    font-size: 20px;
  }

  .habit-card-title {
    font-weight: 600;
    font-size: 13px;
    flex: 1;
    color: var(--mcp-text);
  }

  .habit-card-badge {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .habit-card-trend {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
  }

  .habit-card-trend.trend-up {
    color: var(--mcp-success);
    background: var(--mcp-success-dim);
  }

  .habit-card-trend.trend-down {
    color: var(--mcp-danger, rgba(220, 100, 100, 0.9));
    background: var(--mcp-danger-dim, rgba(220, 100, 100, 0.1));
  }

  .habit-card-trend.trend-neutral {
    color: var(--mcp-text-muted);
    background: var(--mcp-glass-highlight);
  }

  .habit-card-freq {
    font-size: 10px;
    color: var(--mcp-text-muted);
  }

  .habit-card-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    text-align: center;
    margin-bottom: 10px;
  }

  .habit-stat {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .habit-stat-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--habit-color, var(--mcp-accent));
    letter-spacing: -0.02em;
  }

  .habit-stat-value.stat-accent {
    color: var(--habit-color, var(--mcp-accent));
  }

  .habit-stat-label {
    font-size: 9px;
    color: var(--mcp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 500;
  }

  .habit-stat-sub {
    font-size: 9px;
    color: var(--mcp-text-faint);
    font-weight: 400;
  }

  .habit-card-last {
    font-size: 11px;
    color: var(--mcp-text-muted);
    text-align: right;
    padding-top: 4px;
    border-top: 1px solid var(--mcp-glass-border);
  }

  @media (max-width: 480px) {
    .habit-card-stats {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
