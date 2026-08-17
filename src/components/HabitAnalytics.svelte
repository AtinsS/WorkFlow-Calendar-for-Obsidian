<script lang="ts">
  import { get } from "svelte/store";
  import {
    habits,
    habitLogs,
    getWeeklyStats,
    getHabitStats,
    getDayOfWeekProductivity,
  } from "../habit-tracker/stores";
  import HabitCard from "./HabitCard.svelte";
  import BarChart from "./BarChart.svelte";
  import DonutChart from "./DonutChart.svelte";
  import ProjectAnalytics from "./ProjectAnalytics.svelte";
  import {
    timeLogs,
    tasks,
    projects,
    calculateTaskEarnings,
  } from "../task-tracker/stores";
  import { formatDuration } from "../task-tracker/TimerManager";
  import {
    getEarningsForMonth,
    getEarningsForYear,
    getMonthlyEarningsForYear,
    getExpectedEarningsForMonth,
  } from "../task-tracker/stores";
  import { app } from "../stores/appStore";
  import {
    financialAnalyticsData,
    getTotalManualIncome,
    getManualIncomeForMonth,
  } from "../finance/financialAnalyticsStorage";
  import { VIEW_TYPE_FINANCIAL_ANALYTICS } from "../constants";
  import { t, tArray, locale } from "../i18n";
  import { derived as derivedStore } from "svelte/store";

  const numberLocale = derivedStore(locale, ($locale) => $locale === "ru" ? "ru-RU" : "en-US");

  let weeklyStats = getWeeklyStats(12);

  // Period selector for "Время и проекты"
  const now = new Date();
  let periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toISOString().split("T")[0];
  let periodEnd = now.toISOString().split("T")[0];

  $: {
    $habitLogs; // re-compute when logs change
    weeklyStats = getWeeklyStats(12);
  }

  $: activeHabits = $habits.filter((h) => !h.archived);

  // Day-of-week productivity stats
  $: {
    $habitLogs;
    dayOfWeekStats = getDayOfWeekProductivity();
    maxProductivity = Math.max(...dayOfWeekStats.map((d) => d.productivityRate), 1);
  }
  let dayOfWeekStats: { dayIndex: number; dayName: string; completions: number; totalDays: number; productivityRate: number }[] = [];
  let maxProductivity = 1;

  // Calculate weekly earnings
  $: weeklyEarnings = weeklyStats.map((week) => {
    const weekStart = week.weekStart;
    const weekMoment = window.moment(weekStart, "YYYY-MM-DD");
    const weekEnd = weekMoment.clone().endOf("week");
    let earnings = 0;
    const allTasksList = get(tasks);
    for (const task of allTasksList) {
      if (!task.isWorkTask || !task.rate || task.status !== "done") continue;
      const match = task.dateUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
      if (!match) continue;
      const taskDate = window.moment(match[1], "YYYY-MM-DD");
      if (
        taskDate.isSameOrAfter(weekStart) &&
        taskDate.isSameOrBefore(weekEnd)
      ) {
        earnings += calculateTaskEarnings(task);
      }
    }
    return earnings;
  });

  // Aggregate stats for "all" view
  $: aggregateStats = {
    totalHabits: activeHabits.length,
    totalCompletions: activeHabits.reduce(
      (sum, h) => sum + getHabitStats(h.id).totalCompletions,
      0,
    ),
    bestStreak: Math.max(
      ...activeHabits.map((h) => getHabitStats(h.id).currentStreak),
      0,
    ),
  };

  // Time logs stats — filtered by period
  $: filteredTimeLogs = $timeLogs.filter((log) => {
    if (!periodStart || !periodEnd) return true;
    return log.date >= periodStart && log.date <= periodEnd;
  });
  $: totalTimeMs = filteredTimeLogs.reduce((sum, log) => sum + log.duration, 0);
  $: uniqueDays = new Set(filteredTimeLogs.map((log) => log.date)).size;
  $: avgPerDay = uniqueDays > 0 ? totalTimeMs / uniqueDays : 0;

  // Weekly deltas for trend indicators
  $: weeklyDelta = (() => {
    if (weeklyStats.length < 2) return { completions: 0, earnings: 0 };
    const thisWeek = weeklyStats[weeklyStats.length - 1];
    const lastWeek = weeklyStats[weeklyStats.length - 2];
    const thisEarnings = weeklyEarnings[weeklyEarnings.length - 1] || 0;
    const lastEarnings = weeklyEarnings[weeklyEarnings.length - 2] || 0;
    return {
      completions: thisWeek.total - lastWeek.total,
      earnings: thisEarnings - lastEarnings,
    };
  })();

  // Donut chart data — time by project for done tasks (filtered by period)
  $: donutSegments = (() => {
    const allDoneTasks = get(tasks).filter((t) => t.status === "done");
    const allProjects = get(projects);
    const projectMap = new Map<string, { ms: number; color: string; name: string }>();
    const noKey = "__none__";

    for (const log of filteredTimeLogs) {
      const task = allDoneTasks.find((t) => t.id === log.taskId);
      const pKey = task?.projectId || noKey;
      if (!projectMap.has(pKey)) {
        const proj = task?.projectId ? allProjects.find((p) => p.id === task.projectId) : null;
        projectMap.set(pKey, {
          ms: 0,
          color: proj?.color || "#647177",
          name: proj?.name || $t("projectAnalytics.noProject"),
        });
      }
      projectMap.get(pKey).ms += log.duration;
    }

    return Array.from(projectMap.values())
      .filter((s) => s.ms > 0)
      .sort((a, b) => b.ms - a.ms)
      .map((s) => ({ label: s.name, value: s.ms, color: s.color }));
  })();

  // Earnings stats
  $: {
    $tasks; // re-compute when tasks change
    $financialAnalyticsData; // re-compute when manual income changes
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const taskMonthly = getEarningsForMonth(currentYear, currentMonth);
    const taskYearly = getEarningsForYear(currentYear);
    const manualIncomeMonth = getManualIncomeForMonth(currentYear, currentMonth);
    const manualIncomeYear = getTotalManualIncome();
    monthlyEarnings = taskMonthly + manualIncomeMonth;
    yearlyEarnings = taskYearly + manualIncomeYear;
    expectedMonthlyEarnings = getExpectedEarningsForMonth(currentYear, currentMonth);
    monthlyChart = getMonthlyEarningsForYear(currentYear).map((m) => ({
      month: m.month,
      amount: m.amount + getManualIncomeForMonth(currentYear, m.month),
    }));
    maxMonthly = Math.max(...monthlyChart.map((m) => m.amount), 1);

    // Real deltas: previous month vs current
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevMonthManualIncome = getManualIncomeForMonth(prevMonthYear, prevMonth);
    const prevMonthEarnings = getEarningsForMonth(prevMonthYear, prevMonth) + prevMonthManualIncome;
    monthlyDelta = monthlyEarnings - prevMonthEarnings;

    // Real deltas: previous year vs current
    const prevYearEarnings = getEarningsForYear(currentYear - 1) + manualIncomeYear;
    yearlyDelta = yearlyEarnings - prevYearEarnings;
  }
  let monthlyEarnings = 0;
  let expectedMonthlyEarnings = 0;
  let yearlyEarnings = 0;
  let monthlyChart: { month: number; amount: number }[] = [];
  let maxMonthly = 1;
  let monthlyDelta = 0;
  let yearlyDelta = 0;

  $: monthNames = $tArray("common.months.short");

  async function openFinancialAnalytics(): Promise<void> {
    const appInstance = get(app);
    if (!appInstance) return;

    const existing = appInstance.workspace.getLeavesOfType(
      VIEW_TYPE_FINANCIAL_ANALYTICS,
    );
    if (existing.length) {
      appInstance.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = appInstance.workspace.getLeaf("tab");
    if (leaf) {
      await leaf.setViewState({
        type: VIEW_TYPE_FINANCIAL_ANALYTICS,
        active: true,
      });
      appInstance.workspace.revealLeaf(leaf);
    }
  }
</script>

<div class="habit-analytics">
  <div class="habit-analytics-header">
    <h1>{$t("habitAnalytics.title")}</h1>
  </div>

  <!-- Summary Cards -->
  {#if activeHabits.length > 0}
    <h2>{$t("habitAnalytics.habits")}</h2>
    <div class="habit-analytics-summary">
      <div class="summary-card">
        <span class="summary-value">{aggregateStats.totalHabits}</span>
        <span class="summary-label">{$t("habitAnalytics.active")}</span>
        {#if weeklyDelta.completions > 0}
          <span class="summary-trend trend-up"
            >↑ +{weeklyDelta.completions} {$t("dailyOverview.perWeek")}</span
          >
        {/if}
      </div>
      <div class="summary-card">
        <span class="summary-value">{aggregateStats.totalCompletions}</span>
        <span class="summary-label">{$t("habitAnalytics.completed")}</span>
        {#if weeklyDelta.completions > 0}
          <span class="summary-trend trend-up"
            >↑ +{weeklyDelta.completions} {$t("dailyOverview.perWeek")}</span
          >
        {/if}
      </div>
      <div class="summary-card">
        <span class="summary-value">{aggregateStats.bestStreak}</span>
        <span class="summary-label">{$t("habitAnalytics.bestStreak")}</span>
        <span class="summary-trend trend-neutral">{$t("habitAnalytics.daysStreak")}</span>
      </div>
    </div>

    <!-- Per-habit cards -->
    <div class="habit-analytics-section">
      <h3>{$t("habitAnalytics.habitDetails")}</h3>
      <div class="habit-cards-grid">
        {#each activeHabits as habit (habit.id)}
          <HabitCard {habit} />
        {/each}
      </div>
    </div>

    <!-- Day of week productivity -->
    <div class="habit-analytics-section">
      <h3>{$t("habitAnalytics.weekdayProductivity")}</h3>
      <div class="day-chart">
        {#each dayOfWeekStats as day}
          <div class="day-bar-wrapper">
            <div class="day-bar-info">
              <span class="day-bar-rate">{day.productivityRate}%</span>
            </div>
            <div
              class="day-bar"
              class:productive={day.productivityRate >= 50}
              class:neutral={day.productivityRate >= 20 && day.productivityRate < 50}
              class:lazy={day.productivityRate < 20}
              style="height: {day.productivityRate > 0 ? Math.max((day.productivityRate / maxProductivity) * 100, 6) : 0}%"
              title="{day.dayName}: {day.completions} {$t("components.completions")} {day.totalDays} {$t("components.streakDays")}, {day.productivityRate}%"
            ></div>
            <span class="day-bar-label">{day.dayName}</span>
            <span class="day-bar-count">{day.completions}</span>
          </div>
        {/each}
      </div>
      <div class="day-legend">
        <span class="legend-item"><span class="legend-dot productive"></span> {$t("habitAnalytics.legendProductive")}</span>
        <span class="legend-item"><span class="legend-dot neutral"></span> {$t("habitAnalytics.legendMedium")}</span>
        <span class="legend-item"><span class="legend-dot lazy"></span> {$t("habitAnalytics.legendProcrastination")}</span>
      </div>
    </div>
  {/if}

  <!-- Time & Projects — unified section -->
  <div class="habit-analytics-section">
    <div class="section-header-row">
      <h3>{$t("habitAnalytics.timeAndProjects")}</h3>
      <div class="period-selector">
        <input type="date" bind:value={periodStart} class="period-input" />
        <span class="period-separator">—</span>
        <input type="date" bind:value={periodEnd} class="period-input" />
      </div>
    </div>
    {#if filteredTimeLogs.length === 0}
      <div class="time-logs-empty">{$t("habitAnalytics.noTimeLogs")}</div>
    {:else}
      <!-- Stats cards -->
      <div class="time-logs-stats">
        <div class="time-stat">
          <span class="time-stat-value">{formatDuration(totalTimeMs)}</span>
          <span class="time-stat-label">{$t("habitAnalytics.totalTime")}</span>
        </div>
        <div class="time-stat">
          <span class="time-stat-value">{uniqueDays}</span>
          <span class="time-stat-label">{$t("habitAnalytics.workDays")}</span>
        </div>
        <div class="time-stat">
          <span class="time-stat-value">{formatDuration(avgPerDay)}</span>
          <span class="time-stat-label">{$t("habitAnalytics.avgPerDay")}</span>
        </div>
      </div>

      <!-- Area chart -->
      <div class="time-logs-chart">
        <BarChart logs={filteredTimeLogs} mode="area" />
      </div>

      <!-- Two columns: Donut + Project table -->
      <div class="time-project-bottom">
        <div class="time-project-donut">
          <h4>{$t("habitAnalytics.timeDistribution")}</h4>
          <DonutChart
            segments={donutSegments}
            centerValue={formatDuration(totalTimeMs)}
            centerLabel="100%"
          />
        </div>
        <div class="time-project-table">
          <h4>{$t("habitAnalytics.projects")}</h4>
          <ProjectAnalytics tasks={get(tasks).filter((t) => t.status === "done" && (() => {
            const match = t.dateUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
            return match && match[1] >= periodStart && match[1] <= periodEnd;
          })())} />
        </div>
      </div>
    {/if}
  </div>

  <!-- Earnings Section -->
  <div class="habit-analytics-section">
    <div class="earnings-header">
      <h3>{$t("habitAnalytics.earnings")}</h3>
      <button class="earnings-detail-btn" on:click={openFinancialAnalytics}>
        {$t("financeAnalytics.details")}
      </button>
    </div>
    <div class="earnings-summary">
      <div class="earnings-card earnings-card-main">
        <span class="earnings-value"
          >{monthlyEarnings.toLocaleString($numberLocale)} ₽</span
        >
        <span class="earnings-label">{$t("habitAnalytics.monthFact")}</span>
        {#if monthlyDelta !== 0}
          <span class="earnings-delta {monthlyDelta > 0 ? 'delta-up' : 'delta-down'}"
            >{monthlyDelta > 0 ? '+' : ''}{$t("finance.deltaFromLastMonth", { amount: monthlyDelta.toLocaleString($numberLocale), currency: "₽" })}</span
          >
        {/if}
      </div>
      <div class="earnings-card earnings-card-expected">
        <span class="earnings-value earnings-value-expected"
          >{expectedMonthlyEarnings.toLocaleString($numberLocale)} ₽</span
        >
        <span class="earnings-label">{$t("habitAnalytics.monthPlan")}</span>
        {#if expectedMonthlyEarnings > 0}
          {@const progress = Math.round((monthlyEarnings / expectedMonthlyEarnings) * 100)}
          <div class="earnings-progress-bar">
            <div
              class="earnings-progress-fill"
              style="width: {Math.min(progress, 100)}%"
              class:over={progress >= 100}
            ></div>
          </div>
          <span class="earnings-progress-text" class:done={progress >= 100}>
            {progress}% {$t("habitAnalytics.completedLabel")}
          </span>
        {/if}
      </div>
      <div class="earnings-card">
        <span class="earnings-value"
          >{yearlyEarnings.toLocaleString($numberLocale)} ₽</span
        >
        <span class="earnings-label">{$t("habitAnalytics.yearTotal")}</span>
        {#if yearlyDelta !== 0}
          <span class="earnings-delta {yearlyDelta > 0 ? 'delta-up' : 'delta-down'}"
            >{yearlyDelta > 0 ? '+' : ''}{yearlyDelta.toLocaleString($numberLocale)} ₽ {$t("habitAnalytics.vsLastYear")}</span
          >
        {/if}
      </div>
    </div>
    {#if monthlyChart.some((m) => m.amount > 0)}
      <div class="earnings-chart">
        {#each monthlyChart as monthData}
          <div class="earnings-bar-wrapper">
            <div class="earnings-bar-info">
              {#if monthData.amount > 0}
                <span class="earnings-bar-amount">
                  {monthData.amount.toLocaleString($numberLocale)} ₽
                </span>
              {/if}
            </div>
            <div
              class="earnings-bar"
              style="height: {monthData.amount > 0
                ? Math.max((monthData.amount / maxMonthly) * 100, 4)
                : 0}%;"
              title="{monthNames[
                monthData.month - 1
              ]}: {monthData.amount.toLocaleString($numberLocale)} ₽"
            ></div>
            <span class="earnings-bar-label">
              {monthNames[monthData.month - 1]}
            </span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="earnings-empty">{$t("habitAnalytics.noEarnings")}</div>
    {/if}
  </div>
</div>

<style>
  .habit-analytics {
    padding: 20px 16px;
    height: 100%;
    overflow-y: auto;
    background: transparent;
    max-width: 1200px;
    margin: 0 auto;
  }

  .habit-analytics-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 10px;
  }

  .habit-analytics-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .habit-analytics-select {
    border-radius: var(--mcp-radius-sm);
    border: 1px solid var(--mcp-glass-border);
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    color: var(--text-normal);
    font-size: 13px;
    transition: all 0.2s ease;
  }

  .habit-analytics-select:focus {
    border-color: var(--mcp-accent);
    outline: none;
    box-shadow: 0 0 0 3px var(--mcp-accent-dim);
  }

  .habit-analytics-empty {
    text-align: center;
    padding: 40px 16px;
    color: var(--text-muted);
    font-size: 14px;
  }

  /* Summary Cards */
  .habit-analytics-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-bottom: 24px;
  }

  .summary-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 18px 14px;
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius);
    box-shadow: var(--mcp-shadow);
    transition: all 0.25s ease;
  }

  .summary-card:hover {
    transform: translateY(-3px);
    box-shadow: var(--mcp-shadow-glow);
    border-color: var(--mcp-accent);
  }

  .summary-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--text-accent);
    letter-spacing: -0.02em;
  }

  .summary-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-top: 6px;
    font-weight: 500;
  }

  .summary-trend {
    font-size: 11px;
    font-weight: 600;
    margin-top: 6px;
  }

  .trend-up {
    color: var(--mcp-success, rgba(34, 197, 94, 0.9));
  }

  .trend-neutral {
    color: var(--text-muted);
    font-weight: 400;
    font-size: 10px;
  }

  /* Sections */
  .habit-analytics-section {
    margin-bottom: 24px;
    padding: 18px;
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius);
    box-shadow: var(--mcp-shadow);
  }

  .habit-analytics-section:last-child {
    margin-bottom: 0;
  }

  .habit-analytics-section h3 {
    font-size: 13px;
    font-weight: 600;
    margin: 0 0 14px 0;
    color: var(--text-normal);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.8;
  }

  /* Weekly Bar Chart */
  .weekly-chart {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 130px;
    padding: 12px 8px 0;
    border-radius: var(--mcp-radius-sm);
    background: var(--mcp-glass-highlight);
  }

  .weekly-bar-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
  }

  .weekly-bar-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 4px;
    min-height: 20px;
  }

  .weekly-bar-percent {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-accent);
    white-space: nowrap;
  }

  .weekly-bar-earnings {
    font-size: 9px;
    font-weight: 500;
    color: var(--mcp-success, rgba(34, 197, 94, 0.9));
    white-space: nowrap;
  }

  .weekly-bar {
    width: 100%;
    max-width: 36px;
    background: linear-gradient(
      180deg,
      var(--interactive-accent),
      color-mix(in srgb, var(--interactive-accent) 70%, transparent)
    );
    border-radius: 4px 4px 0 0;
    min-height: 0;
    transition:
      height 0.3s ease,
      opacity 0.2s ease;
  }

  .weekly-bar:hover {
    opacity: 0.85;
  }

  .weekly-bar-label {
    font-size: 9px;
    color: var(--text-muted);
    margin-top: 6px;
    white-space: nowrap;
    font-weight: 500;
  }

  /* Habit Cards Grid */
  .habit-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
  }

  .section-subtitle {
    font-size: 12px;
    color: var(--text-muted);
    margin: -8px 0 16px;
    font-weight: 400;
  }

  /* Day of week chart */
  .day-chart {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    height: 160px;
    padding: 16px 8px 0;
    border-radius: var(--mcp-radius-sm);
    background: var(--mcp-glass-highlight);
  }

  .day-bar-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
  }

  .day-bar-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 4px;
    min-height: 20px;
  }

  .day-bar-rate {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-accent);
    white-space: nowrap;
  }

  .day-bar {
    width: 100%;
    max-width: 40px;
    border-radius: 4px 4px 0 0;
    min-height: 0;
    transition: height 0.3s ease, opacity 0.2s ease;
  }

  .day-bar.productive {
    background: linear-gradient(180deg, var(--mcp-success, rgba(34, 197, 94, 0.9)), color-mix(in srgb, var(--mcp-success, rgba(34, 197, 94, 0.5)) 60%, transparent));
  }

  .day-bar.neutral {
    background: linear-gradient(180deg, var(--mcp-warning, rgba(220, 190, 130, 0.9)), color-mix(in srgb, var(--mcp-warning, rgba(220, 190, 130, 0.5)) 60%, transparent));
  }

  .day-bar.lazy {
    background: linear-gradient(180deg, var(--mcp-danger, rgba(220, 150, 150, 0.9)), color-mix(in srgb, var(--mcp-danger, rgba(220, 150, 150, 0.5)) 60%, transparent));
  }

  .day-bar:hover {
    opacity: 0.85;
  }

  .day-bar-label {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 6px;
    white-space: nowrap;
    font-weight: 600;
  }

  .day-bar-count {
    font-size: 9px;
    color: var(--text-muted);
    margin-top: 2px;
    font-weight: 400;
  }

  .day-legend {
    display: flex;
    justify-content: center;
    gap: 16px;
    margin-top: 12px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .legend-dot.productive {
    background: var(--mcp-success, rgba(34, 197, 94, 0.9));
  }

  .legend-dot.neutral {
    background: var(--mcp-warning, rgba(220, 190, 130, 0.9));
  }

  .legend-dot.lazy {
    background: var(--mcp-danger, rgba(220, 150, 150, 0.9));
  }

  /* Time Logs */
  .time-logs-empty {
    text-align: center;
    padding: 24px;
    color: var(--text-muted);
    font-size: 13px;
  }

  .time-logs-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }

  .section-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 10px;
  }

  .section-header-row h3 {
    margin: 0;
  }

  .period-selector {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .period-input {
    padding: 6px 10px;
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
    background: var(--mcp-glass-bg);
    color: var(--mcp-text);
    font-size: 12px;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .period-input:focus {
    border-color: var(--mcp-accent);
    outline: none;
    box-shadow: 0 0 0 3px var(--mcp-accent-dim);
  }

  .period-separator {
    color: var(--mcp-text-muted);
    font-size: 12px;
  }

  .time-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 14px 12px;
    background: var(--mcp-glass-highlight);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
    transition: all 0.2s ease;
  }

  .time-stat:hover {
    border-color: var(--mcp-accent);
    transform: translateY(-2px);
  }

  .time-stat-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-accent);
    letter-spacing: -0.02em;
  }

  .time-stat-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 6px;
    font-weight: 500;
  }

  .time-stat-delta {
    font-size: 10px;
    font-weight: 600;
    margin-top: 4px;
  }

  .delta-up {
    color: var(--mcp-success, rgba(34, 197, 94, 0.9));
  }

  .delta-down {
    color: var(--mcp-danger, rgba(220, 150, 150, 0.8));
  }

  .time-logs-chart {
    margin-top: 14px;
    padding: 12px;
    background: var(--mcp-glass-highlight);
    border-radius: var(--mcp-radius-sm);
  }

  .time-project-bottom {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 16px;
  }

  .time-project-donut,
  .time-project-table {
    padding: 16px;
    background: var(--mcp-glass-highlight);
    border-radius: var(--mcp-radius-sm);
  }

  .time-project-bottom h4 {
    margin: 0 0 14px;
    font-size: 12px;
    font-weight: 600;
    color: var(--mcp-text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.85;
  }

  @media (max-width: 768px) {
    .time-project-bottom {
      grid-template-columns: 1fr;
    }
  }

  /* Earnings */
  .earnings-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-bottom: 18px;
  }

  .earnings-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 18px 14px;
    background: var(--mcp-glass-highlight);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
    transition: all 0.2s ease;
  }

  .earnings-card:hover {
    border-color: var(--mcp-success, rgba(34, 197, 94, 0.5));
    transform: translateY(-2px);
  }

  .earnings-card-expected {
    border-color: var(--mcp-accent-dim);
  }

  .earnings-card-expected:hover {
    border-color: var(--mcp-accent);
  }

  .earnings-value {
    font-size: 22px;
    font-weight: 700;
    color: var(--mcp-success, rgba(34, 197, 94, 0.9));
    letter-spacing: -0.02em;
  }

  .earnings-value-expected {
    color: var(--mcp-accent);
  }

  .earnings-progress-bar {
    width: 100%;
    height: 6px;
    background: var(--mcp-surface);
    border-radius: 3px;
    margin-top: 8px;
    overflow: hidden;
  }

  .earnings-progress-fill {
    height: 100%;
    background: var(--mcp-accent);
    border-radius: 3px;
    transition: width 0.5s ease;
  }

  .earnings-progress-fill.over {
    background: var(--mcp-success, rgba(34, 197, 94, 0.9));
  }

  .earnings-progress-text {
    font-size: 11px;
    font-weight: 600;
    color: var(--mcp-text-muted);
    margin-top: 4px;
  }

  .earnings-progress-text.done {
    color: var(--mcp-success, rgba(34, 197, 94, 0.9));
  }

  .earnings-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-top: 6px;
    font-weight: 500;
  }

  .earnings-delta {
    font-size: 10px;
    font-weight: 600;
    margin-top: 4px;
  }

  .earnings-delta.delta-up {
    color: var(--mcp-success, rgba(34, 197, 94, 0.9));
  }

  .earnings-delta.delta-down {
    color: var(--mcp-danger, rgba(220, 100, 100, 0.9));
  }

  .earnings-chart {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 110px;
    padding: 12px 8px 0;
    border-radius: var(--mcp-radius-sm);
    background: var(--mcp-glass-highlight);
  }

  .earnings-bar-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
  }

  .earnings-bar-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 4px;
    min-height: 16px;
  }

  .earnings-bar-amount {
    font-size: 12px;
    font-weight: 600;
    color: var(--mcp-success, rgba(34, 197, 94, 0.9));
    white-space: nowrap;
  }

  .earnings-bar {
    width: 100%;
    max-width: 36px;
    background: linear-gradient(
      180deg,
      var(--mcp-success, rgba(34, 197, 94, 0.8)),
      color-mix(
        in srgb,
        var(--mcp-success, rgba(34, 197, 94, 0.5)) 60%,
        transparent
      )
    );
    border-radius: 4px 4px 0 0;
    min-height: 0;
    transition:
      height 0.3s ease,
      opacity 0.2s ease;
  }

  .earnings-bar:hover {
    opacity: 0.85;
  }

  .earnings-bar-label {
    font-size: 9px;
    color: var(--text-muted);
    margin-top: 6px;
    white-space: nowrap;
    font-weight: 500;
  }

  .earnings-empty {
    text-align: center;
    padding: 24px;
    color: var(--text-muted);
    font-size: 13px;
  }

  .earnings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .earnings-header h3 {
    margin: 0;
  }

  .earnings-detail-btn {
    padding: 8px 16px;
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    color: var(--text-accent);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .earnings-detail-btn:hover {
    background: var(--mcp-accent);
    color: var(--text-on-accent, #fff);
    border-color: var(--mcp-accent);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px var(--mcp-accent-dim);
  }

  @media (max-width: 768px) {
    .habit-analytics-summary {
      grid-template-columns: 1fr;
    }

    .habit-cards-grid {
      grid-template-columns: 1fr;
    }

    .weekly-chart {
      height: 90px;
    }

    .time-logs-stats {
      grid-template-columns: 1fr;
    }

    .earnings-summary {
      grid-template-columns: 1fr;
    }

    .earnings-chart {
      height: 90px;
    }
  }

  @media (max-width: 480px) {
    .habit-analytics {
      padding: 14px 12px;
    }

    .habit-analytics-header {
      flex-direction: column;
      align-items: stretch;
    }

    .summary-value {
      font-size: 24px;
    }

    .earnings-value {
      font-size: 18px;
    }
  }
</style>
