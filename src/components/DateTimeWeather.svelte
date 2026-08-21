<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { t } from "../i18n";
  import { tasks } from "../task-tracker/stores";
  import { habits, habitLogs, toggleHabitCompletion } from "../habit-tracker/stores";
  import { settings } from "../ui/stores";
  import { financeData } from "../finance/storage";
  import { getMonthGoals } from "../finance/storage";
  import { fetchWeekWeather, type DayWeather, getWeatherAttribution } from "../services/weatherService";
  import { getDateUID } from "obsidian-daily-notes-interface";
  import moment from "moment";

  let now = new Date();
  let timer: ReturnType<typeof setInterval>;
  let weatherTimer: ReturnType<typeof setInterval> | null = null;
  let completedToday = 0;
  let totalToday = 0;
  let inProgressCount = 0;
  let weather: DayWeather | null = null;
  let unsubTasks: (() => void) | null = null;
  let unsubFinance: (() => void) | null = null;
  let unsubHabits: (() => void) | null = null;
  let monthGoals: { name: string; icon: string; remaining: number; done: boolean }[] = [];

  let todayTaskList: { title: string; status: string }[] = [];
  let inProgressTaskList: { title: string; status: string }[] = [];

  let todayHabitList: { id: string; title: string; icon: string; color: string; completed: boolean; partial: boolean; count: number; targetCount: number }[] = [];
  let habitDoneCount = 0;
  let habitTotalCount = 0;

  let activeTooltip: HTMLDivElement | null = null;

  function switchToTasks() {
    // Tasks are already in the main view
  }

  function showTooltip(target: EventTarget | null, title: string, rows: { status: string; name: string }[]) {
    removeTooltip();
    const el = target as HTMLElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const tooltip = document.createElement("div");
    tooltip.className = "dtw-tooltip";

    const titleDiv = document.createElement("div");
    titleDiv.className = "dtw-tooltip-title";
    titleDiv.textContent = title;
    tooltip.appendChild(titleDiv);

    for (const r of rows) {
      const statusClass = r.status === "done" ? " done" : r.status === "progress" ? " progress" : "";
      const nameClass = r.status === "done" ? " done-name" : "";
      const icon = r.status === "done" ? "✓" : r.status === "progress" ? "▶" : "○";
      const rowDiv = document.createElement("div");
      rowDiv.className = `dtw-tooltip-row${statusClass}`;
      const statusSpan = document.createElement("span");
      statusSpan.className = `dtw-tooltip-status${statusClass}`;
      statusSpan.textContent = icon;
      rowDiv.appendChild(statusSpan);
      const nameSpan = document.createElement("span");
      nameSpan.className = `dtw-tooltip-name${nameClass}`;
      nameSpan.textContent = r.name;
      rowDiv.appendChild(nameSpan);
      tooltip.appendChild(rowDiv);
    }

    document.body.appendChild(tooltip);
    const tooltipWidth = tooltip.offsetWidth || 260;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${rect.bottom + 4}px`;

    requestAnimationFrame(() => {
      const cr = tooltip.getBoundingClientRect();
      if (cr.bottom > window.innerHeight) {
        tooltip.style.top = `${rect.top - cr.height - 4}px`;
      }
    });

    activeTooltip = tooltip;
  }

  function removeTooltip() {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  }

  function showHabitTooltip(target: Element) {
    removeTooltip();
    const rect = target.getBoundingClientRect();
    const tooltip = document.createElement("div");
    tooltip.className = "dtw-tooltip dtw-habit-tooltip";

    const titleDiv = document.createElement("div");
    titleDiv.className = "dtw-tooltip-title";
    titleDiv.textContent = $t("dtw.habitsToday");
    tooltip.appendChild(titleDiv);

    for (const h of todayHabitList) {
      const statusClass = h.completed ? " done" : h.partial ? " progress" : "";
      const nameClass = h.completed ? " done-name" : "";
      const icon = h.completed ? "✓" : h.partial ? "◆" : "○";
      const rowDiv = document.createElement("div");
      rowDiv.className = "dtw-tooltip-row dtw-habit-row";
      rowDiv.setAttribute("data-habit-id", h.id);
      rowDiv.setAttribute("data-target", String(h.targetCount));
      const statusSpan = document.createElement("span");
      statusSpan.className = `dtw-tooltip-status${statusClass}`;
      statusSpan.textContent = icon;
      rowDiv.appendChild(statusSpan);
      const habitIconSpan = document.createElement("span");
      habitIconSpan.className = "dtw-habit-item-icon";
      habitIconSpan.textContent = h.icon;
      rowDiv.appendChild(habitIconSpan);
      const nameSpan = document.createElement("span");
      nameSpan.className = `dtw-tooltip-name${nameClass}`;
      nameSpan.textContent = h.title;
      rowDiv.appendChild(nameSpan);
      tooltip.appendChild(rowDiv);
    }

    // Add click handlers
    tooltip.querySelectorAll(".dtw-habit-row").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-habit-id") || "";
        const target = parseInt(row.getAttribute("data-target") || "1", 10);
        handleToggleHabitInTooltip(id, target);
      });
    });

    document.body.appendChild(tooltip);
    const tooltipWidth = tooltip.offsetWidth || 260;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${rect.bottom + 4}px`;

    requestAnimationFrame(() => {
      const cr = tooltip.getBoundingClientRect();
      if (cr.bottom > window.innerHeight) {
        tooltip.style.top = `${rect.top - cr.height - 4}px`;
      }
    });

    activeTooltip = tooltip;
  }

  $: numberLocale = $t("locale.numberLocale");
  $: dateStr = now.toLocaleDateString(numberLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  $: timeStr = now.toLocaleTimeString(numberLocale, {
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
    todayTaskList = todayTasks.map((t) => ({ title: t.title, status: t.status }));
    inProgressTaskList = all
      .filter((t) => t.status === "progress")
      .map((t) => ({ title: t.title, status: t.status }));
  }

  function updateMonthGoal() {
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const goals = getMonthGoals(monthKey);
    monthGoals = goals.map((g) => {
      const remaining = (g.targetAmount || 0) - (g.currentAmount || 0);
      return {
        name: g.name || $t("dtw.defaultGoal"),
        icon: g.icon || "🎯",
        remaining,
        done: remaining <= 0,
      };
    });
  }

  function updateHabits() {
    const dateStr = moment().format("YYYY-MM-DD");
    const allHabits = get(habits);
    const allLogs = get(habitLogs);

    const activeHabits = allHabits.filter((h) => {
      if (h.archived) return false;
      const m = moment(dateStr, "YYYY-MM-DD");
      if (h.frequency === "weekly" && h.customDays && h.customDays.length > 0) {
        return h.customDays.includes(m.day());
      }
      if (h.frequency === "monthly") {
        return m.date() === (h.monthlyDay || 1);
      }
      return true;
    });

    todayHabitList = activeHabits.map((h) => {
      const log = allLogs.find((l) => l.habitId === h.id && l.date === dateStr);
      const count = log?.count || 0;
      const completed = log?.completed || false;
      const partial = count > 0 && !completed;
      return {
        id: h.id,
        title: h.title,
        icon: h.icon,
        color: h.color,
        completed,
        partial,
        count,
        targetCount: h.targetCount || 1,
      };
    });

    habitDoneCount = todayHabitList.filter((h) => h.completed).length;
    habitTotalCount = todayHabitList.length;
  }

  function handleToggleHabitInTooltip(habitId: string, targetCount: number) {
    const dateStr = moment().format("YYYY-MM-DD");
    toggleHabitCompletion(habitId, dateStr, targetCount);
    updateHabits();
    // Re-render tooltip
    if (activeTooltip) {
      const target = document.querySelector(".dtw-habits-trigger");
      if (target) {
        showHabitTooltip(target as HTMLElement);
      }
    }
  }

  async function loadWeather() {
    const s = $settings;
    if (!s.weatherEnabled) return;
    try {
      const lat = s.weatherLatitude ?? 55.75;
      const lon = s.weatherLongitude ?? 37.62;
      const today = new Date().toISOString().slice(0, 10);
      const days = await fetchWeekWeather(lat, lon, today, today, s.weatherProvider as any, s.weatherApiKey);
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
    unsubFinance = financeData.subscribe(() => updateMonthGoal());
    unsubHabits = habits.subscribe(() => updateHabits());
    updateStats();
    updateMonthGoal();
    updateHabits();
    loadWeather();
    // Refresh weather every 30 minutes
    weatherTimer = setInterval(() => { loadWeather(); }, 30 * 60_000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
    if (weatherTimer) clearInterval(weatherTimer);
    unsubTasks?.();
    unsubFinance?.();
    unsubHabits?.();
    removeTooltip();
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
    <span class="dtw-item" title={getWeatherAttribution($settings.weatherProvider)}>
      <span class="dtw-icon">{weather.icon}</span>
      <span>{weather.tempMin}..{weather.tempMax}° {weather.label}</span>
    </span>
  {/if}
  {#if totalToday > 0}
    <span class="dtw-sep"></span>
    <span
      class="dtw-item dtw-hoverable"
      on:click={() => switchToTasks()}
      on:mouseenter={(e) => {
        if (todayTaskList.length > 0)
          showTooltip(e.currentTarget, $t("dtw.tasksToday"), todayTaskList.map(t => ({ status: t.status, name: t.title })));
      }}
      on:mouseleave={removeTooltip}
    >
      <span class="dtw-icon">✅</span>
      <span>{$t("dtw.tasksLabel")}: {completedToday} / {totalToday}</span>
    </span>
  {/if}
  {#if inProgressCount > 0}
    <span class="dtw-sep"></span>
    <span
      class="dtw-item dtw-hoverable"
      on:click={() => switchToTasks()}
      on:mouseenter={(e) => {
        if (inProgressTaskList.length > 0)
          showTooltip(e.currentTarget, $t("dtw.inProgress"), inProgressTaskList.map(t => ({ status: t.status, name: t.title })));
      }}
      on:mouseleave={removeTooltip}
    >
      <span class="dtw-icon">▶️</span>
      <span>{$t("dtw.inProgress")}: {inProgressCount}</span>
    </span>
  {/if}
  {#if habitTotalCount > 0}
    <span class="dtw-sep"></span>
    <span
      class="dtw-item dtw-hoverable dtw-habits-trigger"
      on:click={() => { const el = document.querySelector('.dtw-habits-trigger'); if (el) showHabitTooltip(el); }}
      on:mouseenter={(e) => {
        if (todayHabitList.length > 0)
          showTooltip(e.currentTarget, $t("dtw.habits"), todayHabitList.map(h => ({ status: h.completed ? "done" : h.partial ? "progress" : "todo", name: `${h.icon} ${h.title}` })));
      }}
      on:mouseleave={removeTooltip}
    >
      <span class="dtw-icon">🔄</span>
      <span>{$t("dtw.habits")}: {habitDoneCount} / {habitTotalCount}</span>
    </span>
  {/if}
  {#if monthGoals.length > 0}
    <span class="dtw-sep"></span>
    <span
      class="dtw-item dtw-hoverable"
      on:click={() => switchToTasks()}
      on:mouseenter={(e) => {
        if (monthGoals.length > 1)
          showTooltip(e.currentTarget, $t("dtw.monthGoals"), monthGoals.map(g => ({ status: g.done ? "done" : "progress", name: `${g.icon} ${g.name}: ${g.done ? "✓" : g.remaining.toLocaleString($t("locale.numberLocale")) + " " + $t("locale.currencySymbol")}` })));
      }}
      on:mouseleave={removeTooltip}
    >
      <span class="dtw-icon">{monthGoals[0].icon}</span>
      {#if monthGoals.length === 1}
        <span>{monthGoals[0].name}: {monthGoals[0].done ? "✓" : monthGoals[0].remaining.toLocaleString($t("locale.numberLocale")) + " " + $t("locale.currencySymbol")}</span>
      {:else}
        <span>{$t("dtw.goalsLabel")}: {monthGoals.filter(g => g.done).length}/{monthGoals.length}</span>
      {/if}
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

  .dtw-hoverable {
    position: relative;
    cursor: default;
    border-radius: 6px;
    transition: background 0.15s ease;
  }

  .dtw-hoverable:hover {
    background: var(--background-modifier-hover);
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

  .dtw-habit-tooltip .dtw-habit-row {
    cursor: pointer;
    transition: background 0.15s ease;
    border-radius: 4px;
    padding: 4px 6px;
    margin: 0 -6px;
  }

  .dtw-habit-tooltip .dtw-habit-row:hover {
    background: var(--background-modifier-hover);
  }

  .dtw-habit-tooltip .dtw-habit-item-icon {
    font-size: 12px;
    flex-shrink: 0;
  }

  .dtw-sync {
    display: inline-flex;
    align-items: center;
    padding: 0 4px;
    color: var(--text-muted);
    transition: color 0.2s;
  }
</style>
