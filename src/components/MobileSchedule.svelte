<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import moment from "moment";
  import type { ITask } from "../task-tracker/types";
  import { tasks, projects, updateTaskStatus, removeTask, updateTask, resetTaskTimer } from "../task-tracker/stores";
  import { TaskModal } from "../task-tracker/TaskModal";
  import type CalendarPlugin from "../main";
  import { settings } from "../ui/stores";
  import { fetchWeekWeather, type DayWeather } from "../services/weatherService";
  import { t, tRaw, tArray, locale } from "../i18n";

  export let plugin: CalendarPlugin;
  export let onClose: () => void = () => {};

  // Use Obsidian's global moment to guarantee locale data is loaded
  const m = (typeof window !== "undefined" && window.moment) ? window.moment : moment;

  // Reactive locale updates — depends on $locale and $settings stores
  $: {
    const sow = $settings.startOfWeek || "system";
    let dow: number;
    if (sow === "monday") dow = 1;
    else if (sow === "sunday") dow = 0;
    else dow = $locale === "en" ? 0 : 1;

    const loc = $locale === "en" ? "en" : "ru";
    m.locale(loc);
    m.updateLocale(loc, {
      week: { dow, doy: 4 },
    });
  }

  const DAY_START = 6;
  const DAY_END = 30; // 6 AM next day (24 + 6)
  const HOUR_HEIGHT = 64;

  let currentDate = m();
  let containerEl: HTMLDivElement;
  let scrollEl: HTMLDivElement;
  let contextMenuTask: ITask | null = null;
  let contextMenuEl: HTMLDivElement | null = null;
  let viewMode: "day" | "month" = "day";
  let weatherByDate: Map<string, DayWeather> = new Map();

  $: dateStr = currentDate.format("YYYY-MM-DD");
  $: dayLabel = currentDate.locale(tRaw("locale.momentLocale")).format("dddd, D MMMM");
  $: dayTasks = $tasks.filter((t) => {
    const match = t.dateUID?.match(/^day-(\d{4}-\d{2}-\d{2})/);
    return match && match[1] === dateStr;
  }).sort((a, b) => {
    // Timed tasks first (sorted by time), then untimed tasks
    if (a.scheduledTime && b.scheduledTime) return a.scheduledTime.localeCompare(b.scheduledTime);
    if (a.scheduledTime) return -1;
    if (b.scheduledTime) return 1;
    return (a.title || "").localeCompare(b.title || "");
  });
  $: timedTasks = dayTasks.filter((t) => t.scheduledTime);
  $: untimedTasks = dayTasks.filter((t) => !t.scheduledTime);

  // Compute overlap layout for timed tasks
  $: taskLayoutMap = (() => {
    const map = new Map<string, { col: number; totalCols: number }>();
    if (timedTasks.length === 0) return map;

    // Build intervals: [startMin, endMin] for each task
    const intervals = timedTasks.map((t) => {
      const [h, m] = t.scheduledTime.split(":").map(Number);
      const adjustedH = h < 6 ? h + 24 : h;
      const start = adjustedH * 60 + m;
      const end = start + (t.estimatedTime || 60);
      return { task: t, start, end };
    });

    // Greedy column assignment
    const columns: { end: number }[][] = [];
    for (const iv of intervals) {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        const lastEnd = columns[c][columns[c].length - 1].end;
        if (iv.start >= lastEnd) {
          columns[c].push(iv);
          map.set(iv.task.id, { col: c, totalCols: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push([iv]);
        map.set(iv.task.id, { col: columns.length - 1, totalCols: 0 });
      }
    }

    // Set totalCols for all tasks in overlapping groups
    // Find groups of overlapping tasks and set their totalCols
    for (let i = 0; i < intervals.length; i++) {
      let maxCol = intervals[i].task.id ? (map.get(intervals[i].task.id)?.col ?? 0) : 0;
      let minStart = intervals[i].start;
      let maxEnd = intervals[i].end;
      // Expand to find all overlapping tasks
      for (let j = 0; j < intervals.length; j++) {
        if (i === j) continue;
        if (intervals[j].start < maxEnd && intervals[j].end > minStart) {
          const jCol = map.get(intervals[j].task.id)?.col ?? 0;
          maxCol = Math.max(maxCol, jCol);
          maxEnd = Math.max(maxEnd, intervals[j].end);
          minStart = Math.min(minStart, intervals[j].start);
        }
      }
      // Now set totalCols for all tasks in this overlap group
      const totalCols = maxCol + 1;
      for (let j = 0; j < intervals.length; j++) {
        if (intervals[j].start < maxEnd && intervals[j].end > minStart) {
          const entry = map.get(intervals[j].task.id);
          if (entry) entry.totalCols = Math.max(entry.totalCols, totalCols);
        }
      }
    }

    return map;
  })();

  // Week strip
  $: weekStart = currentDate.clone().startOf("week");
  $: weekDays = Array.from({ length: 7 }, (_, i) => weekStart.clone().add(i, "days"));

  // Load weather for the visible week
  $: if (weekDays.length > 0 && $settings.weatherEnabled) {
    const start = weekDays[0].format("YYYY-MM-DD");
    const end = weekDays[6].format("YYYY-MM-DD");
    const lat = $settings.weatherLatitude ?? 55.75;
    const lon = $settings.weatherLongitude ?? 37.62;
    fetchWeekWeather(lat, lon, start, end, $settings.weatherProvider as any, $settings.weatherApiKey).then((days) => {
      const map = new Map<string, DayWeather>();
      for (const d of days) map.set(d.date, d);
      weatherByDate = map;
    }).catch(() => {});
  }

  function prevDay() {
    currentDate = currentDate.clone().subtract(1, "days");
  }

  function nextDay() {
    currentDate = currentDate.clone().add(1, "days");
  }

  function goToday() {
    currentDate = m();
  }

  function selectDay(day: moment.Moment) {
    currentDate = day.clone();
  }

  // Month view
  $: monthStart = currentDate.clone().startOf("month");
  $: monthEnd = currentDate.clone().endOf("month");
  $: monthLabel = currentDate.locale(tRaw("locale.momentLocale")).format("MMMM YYYY");
  $: calendarDays = (() => {
    const start = monthStart.clone().startOf("week");
    const end = monthEnd.clone().endOf("week");
    const days = [];
    const current = start.clone();
    while (current.isSameOrBefore(end)) {
      days.push(current.clone());
      current.add(1, "days");
    }
    return days;
  })();

  $: tasksByDate = (() => {
    const map: Record<string, ITask[]> = {};
    for (const task of $tasks) {
      const match = task.dateUID?.match(/^day-(\d{4}-\d{2}-\d{2})/);
      if (match) {
        const date = match[1];
        if (!map[date]) map[date] = [];
        map[date].push(task);
      }
    }
    return map;
  })();

  function prevMonth() {
    currentDate = currentDate.clone().subtract(1, "month");
  }

  function nextMonth() {
    currentDate = currentDate.clone().add(1, "month");
  }

  function selectMonthDay(day: moment.Moment) {
    currentDate = day.clone();
    viewMode = "day";
  }

  function getTasksForDay(day: moment.Moment): ITask[] {
    return tasksByDate[day.format("YYYY-MM-DD")] || [];
  }

  function toggleViewMode() {
    viewMode = viewMode === "day" ? "month" : "day";
  }

  function getTaskStyle(task: ITask): string {
    if (!task.scheduledTime) return "";
    const [h, m] = task.scheduledTime.split(":").map(Number);
    // Tasks at 00:00-05:59 appear in the extended zone (after midnight)
    const adjustedH = h < 6 ? h + 24 : h;
    const startMin = (adjustedH - DAY_START) * 60 + m;
    const duration = task.estimatedTime || 60;
    const top = (startMin / 60) * HOUR_HEIGHT;
    const height = Math.max((duration / 60) * HOUR_HEIGHT, 40);

    const project = $projects.find((p) => p.id === task.projectId);
    const color = project?.color || "var(--mcp-accent)";

    const layout = taskLayoutMap.get(task.id);
    if (layout && layout.totalCols > 1) {
      const widthPercent = 100 / layout.totalCols;
      const leftPercent = layout.col * widthPercent;
      return `top: ${top}px; height: ${height}px; background: ${color}; left: calc(4px + ${leftPercent}%); width: calc(${widthPercent}% - 4px);`;
    }

    return `top: ${top}px; height: ${height}px; background: ${color};`;
  }

  function getEndTime(task: ITask): string {
    if (!task.scheduledTime) return "";
    const [h, m] = task.scheduledTime.split(":").map(Number);
    const duration = task.estimatedTime || 60;
    const endMin = h * 60 + m + duration;
    const endH = Math.floor(endMin / 60) % 24;
    const endM = endMin % 60;
    return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  }

  function formatHourLabel(hour: number): string {
    return `${String(hour >= 24 ? hour - 24 : hour).padStart(2, "0")}:00`;
  }

  function openContextMenu(task: ITask, e: MouseEvent) {
    e.stopPropagation();
    closeContextMenu();
    contextMenuTask = task;

    const el = document.createElement("div");
    el.className = "ms-context-overlay";
    el.addEventListener("click", closeContextMenu);

    const menu = document.createElement("div");
    menu.className = "ms-context-menu";

    const priorityIcon = task.priority === "high" ? "!" : task.priority === "medium" ? "~" : "";
    const priorityPrefix = priorityIcon ? `${priorityIcon} ` : "";

    const items = [
      { label: `${priorityPrefix}${tRaw("schedule.edit")}`, action: () => contextEditTask() },
      ...(task.notePath ? [{ label: `${priorityPrefix}${tRaw("schedule.openNote")}`, action: () => contextOpenNote() }] : []),
      { divider: true },
      { label: tRaw("schedule.changeStatus"), disabled: true },
      ...(task.status !== "todo" ? [{ label: tRaw("schedule.statusTodo"), action: () => contextChangeStatus("todo") }] : []),
      ...(task.status !== "progress" ? [{ label: tRaw("schedule.statusToWork"), action: () => contextChangeStatus("progress") }] : []),
      ...(task.status !== "paused" ? [{ label: tRaw("schedule.statusToPause"), action: () => contextChangeStatus("paused") }] : []),
      ...(task.status !== "done" ? [{ label: tRaw("schedule.statusToDone"), action: () => contextChangeStatus("done") }] : []),
      { divider: true },
      { label: tRaw("schedule.deleteEvent"), action: () => contextDeleteTask(), danger: true },
    ];

    for (const item of items) {
      if ("divider" in item && item.divider) {
        const div = document.createElement("div");
        div.className = "ms-context-divider";
        menu.appendChild(div);
      } else if ("disabled" in item && item.disabled) {
        const lbl = document.createElement("div");
        lbl.className = "ms-context-label";
        lbl.textContent = item.label;
        menu.appendChild(lbl);
      } else if ("action" in item) {
        const btn = document.createElement("button");
        btn.className = "ms-context-item" + ("danger" in item && item.danger ? " ms-context-danger" : "");
        btn.textContent = item.label;
        btn.addEventListener("click", (ev) => { ev.stopPropagation(); item.action(); });
        menu.appendChild(btn);
      }
    }

    el.appendChild(menu);
    document.body.appendChild(el);
    contextMenuEl = el;

    // Position: center on screen
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(16, (window.innerWidth - rect.width) / 2)}px`;
      menu.style.top = `${Math.max(16, (window.innerHeight - rect.height) / 2)}px`;
    });
  }

  function closeContextMenu() {
    if (contextMenuEl) { contextMenuEl.remove(); contextMenuEl = null; }
    contextMenuTask = null;
  }

  function contextEditTask() {
    const task = contextMenuTask;
    if (task) {
      new TaskModal(plugin.app, (updates) => updateTask(task.id, updates), task).open();
    }
    closeContextMenu();
  }

  function contextOpenNote() {
    if (contextMenuTask?.notePath) {
      plugin.app.workspace.openLinkText(contextMenuTask.notePath, "", false);
    }
    closeContextMenu();
  }

  function contextChangeStatus(status: "todo" | "progress" | "done" | "paused") {
    if (contextMenuTask) {
      updateTaskStatus(contextMenuTask.id, status);
      if (status === "todo") {
        resetTaskTimer(contextMenuTask.id);
      }
    }
    closeContextMenu();
  }

  function contextDeleteTask() {
    if (contextMenuTask) removeTask(contextMenuTask.id);
    closeContextMenu();
  }

  onDestroy(() => { closeContextMenu(); });

  // Scroll to current time on mount
  onMount(() => {
    if (!scrollEl) return;
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const scrollTo = Math.max(0, ((h - DAY_START) * 60 + m) / 60 * HOUR_HEIGHT - 100);
    scrollEl.scrollTop = scrollTo;
  });
</script>

<div class="mobile-schedule" bind:this={containerEl}>
  <!-- Header -->
  <div class="ms-header">
    <button class="ms-nav-btn" on:click={viewMode === "day" ? prevDay : prevMonth} aria-label={$t("mobileSchedule.back")}>‹</button>
    <button class="ms-title" on:click={viewMode === "day" ? goToday : toggleViewMode}>
      {viewMode === "day" ? dayLabel : monthLabel}
    </button>
    <button class="ms-nav-btn" on:click={viewMode === "day" ? nextDay : nextMonth} aria-label={$t("mobileSchedule.forward")}>›</button>
    <button class="ms-view-toggle" on:click={toggleViewMode} aria-label={$t("mobileSchedule.toggleView")}>
      {viewMode === "day" ? "📅" : "📋"}
    </button>
    <button class="ms-close-btn" on:click={onClose} aria-label={$t("common.close")}>✕</button>
  </div>

  <!-- Week strip (only in day mode) -->
  {#if viewMode === "day"}
    <div class="ms-week-strip">
      {#each weekDays as day (day.format("YYYY-MM-DD"))}
        {@const dayWeather = weatherByDate.get(day.format("YYYY-MM-DD"))}
        <button
          class="ms-week-day"
          class:active={day.format("YYYY-MM-DD") === dateStr}
          class:today={day.format("YYYY-MM-DD") === m().format("YYYY-MM-DD")}
          on:click={() => selectDay(day)}
        >
          <span class="ms-week-day-label">{day.locale(tRaw("locale.momentLocale")).format("dd")}</span>
          <span class="ms-week-day-num">{day.format("D")}</span>
          {#if dayWeather}
            <span class="ms-week-day-weather">{dayWeather.icon}{dayWeather.tempMax}°</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Month view -->
  {#if viewMode === "month"}
    <div class="ms-month-grid">
      <!-- Weekday headers -->
      <div class="ms-month-header">
        {#each $tArray("common.weekdays.short") as dayName, i}
          <div class="ms-month-header-day" class:weekend={i >= 5}>{dayName}</div>
        {/each}
      </div>

      <!-- Day cells -->
      <div class="ms-month-body">
        {#each calendarDays as day (day.format("YYYY-MM-DD"))}
          {@const isCurrentMonth = day.month() === currentDate.month()}
          {@const isToday = day.format("YYYY-MM-DD") === m().format("YYYY-MM-DD")}
          {@const isSelected = day.format("YYYY-MM-DD") === dateStr}
          {@const isWeekend = day.day() === 0 || day.day() === 6}
          {@const dayTasks = getTasksForDay(day)}
          <div
            class="ms-month-day"
            class:other-month={!isCurrentMonth}
            class:today={isToday}
            class:selected={isSelected}
            class:weekend={isWeekend}
            on:click={() => selectMonthDay(day)}
            role="button"
            tabindex="0"
          >
            <span class="ms-month-day-num">{day.format("D")}</span>
            {#if dayTasks.length > 0}
              <div class="ms-month-day-tasks">
                {#each dayTasks.slice(0, 3) as task}
                  {@const project = $projects.find((p) => p.id === task.projectId)}
                  <div
                    class="ms-month-task-chip"
                    class:done={task.status === "done"}
                    style="background: {project?.color || 'var(--mcp-accent)'}"
                  >
                    <span class="ms-month-task-title">{task.title}</span>
                    {#if task.scheduledTime}
                      <span class="ms-month-task-time">{task.scheduledTime}</span>
                    {/if}
                  </div>
                {/each}
                {#if dayTasks.length > 3}
                  <div class="ms-month-task-more">+{dayTasks.length - 3}</div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <!-- Timeline (day view) -->
    <div class="ms-timeline" bind:this={scrollEl}>
    <div class="ms-timeline-inner" style="height: {(DAY_END - DAY_START) * HOUR_HEIGHT}px;">
      <!-- Hour grid with half-hour markers -->
      {#each Array.from({ length: (DAY_END - DAY_START) * 2 }, (_, i) => DAY_START + i * 0.5) as time}
        {@const isHalf = time % 1 !== 0}
        <div
          class="ms-hour-line"
          class:ms-half-hour-line={isHalf}
          style="top: {(time - DAY_START) * HOUR_HEIGHT}px;"
        >
          {#if !isHalf}
            <span class="ms-hour-label">{formatHourLabel(time)}</span>
          {:else}
            <span class="ms-minute-label">:30</span>
          {/if}
        </div>
      {/each}

      <!-- Now indicator -->
      {#if dateStr === m().format("YYYY-MM-DD")}
        {@const now = new Date()}
        {@const nowH = now.getHours()}
        {@const nowMin = ((nowH < 6 ? nowH + 24 : nowH) - DAY_START) * 60 + now.getMinutes()}
        {#if nowMin >= 0 && nowMin <= (DAY_END - DAY_START) * 60}
          <div class="ms-now-line" style="top: {nowMin / 60 * HOUR_HEIGHT}px;"></div>
        {/if}
      {/if}

      <!-- Task blocks (timed) -->
      {#each timedTasks as task (task.id)}
        <div
          class="ms-task-block"
          class:done={task.status === "done"}
          class:paused={task.status === "paused"}
          style={getTaskStyle(task)}
          on:click={(e) => openContextMenu(task, e)}
          role="button"
          tabindex="0"
        >
          <div class="ms-task-header">
            <span class="ms-task-time">
              {task.scheduledTime} – {getEndTime(task)}
            </span>
            {#if task.isWorkTask}
              <span class="ms-task-work-icon">💼</span>
            {/if}
            <span class="ms-task-title">{task.title}</span>
            {#if task.priority === "high"}
              <span class="ms-task-priority ms-priority-high">!</span>
            {:else if task.priority === "medium"}
              <span class="ms-task-priority ms-priority-mid">~</span>
            {/if}
            {#if task.recurrence}
              <span class="ms-task-recurring" title={$t("mobileSchedule.recurring")}>🔄</span>
            {/if}
            {#if task.status === "progress"}
              <span class="ms-task-status ms-status-progress">{$t("schedule.statusInProgress")}</span>
            {:else if task.status === "paused"}
              <span class="ms-task-status ms-status-paused">{$t("schedule.statusPaused")}</span>
            {:else if task.status === "done"}
              <span class="ms-task-status ms-status-done">{$t("schedule.statusDone")}</span>
            {/if}
          </div>
          {#if task.description}
            <div class="ms-task-desc">{task.description}</div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Untimed tasks -->
    {#if untimedTasks.length > 0}
      <div class="ms-untimed-section">
        <div class="ms-untimed-header">
          <span class="ms-untimed-title">{$t("mobileSchedule.untimed")}</span>
        </div>
        <div class="ms-untimed-list">
          {#each untimedTasks as task (task.id)}
            <div
              class="ms-untimed-task"
              class:done={task.status === "done"}
              on:click={(e) => openContextMenu(task, e)}
              role="button"
              tabindex="0"
            >
              <span class="ms-untimed-task-title">{task.title}</span>
              {#if task.priority === "high"}
                <span class="ms-task-priority ms-priority-high">!</span>
              {:else if task.priority === "medium"}
                <span class="ms-task-priority ms-priority-mid">~</span>
              {/if}
              {#if task.recurrence}
                <span class="ms-task-recurring" title={$t("mobileSchedule.recurring")}>🔄</span>
              {/if}
              {#if task.isWorkTask}
                <span class="ms-task-work-icon">💼</span>
              {/if}
              {#if task.status === "progress"}
                <span class="ms-task-status ms-status-progress">{$t("schedule.statusInProgress")}</span>
              {:else if task.status === "paused"}
                <span class="ms-task-status ms-status-paused">{$t("schedule.statusPaused")}</span>
              {:else if task.status === "done"}
                <span class="ms-task-status ms-status-done">{$t("schedule.statusDone")}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
  {/if}
</div>

<style>
  .mobile-schedule {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background-primary, #1a1a2e);
    overflow: hidden;
  }

  /* Header */
  .ms-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 12px 8px;
    flex-shrink: 0;
  }

  .ms-nav-btn {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1px solid var(--mcp-glass-border, rgba(255,255,255,0.06));
    background: var(--mcp-glass-bg, rgba(35,40,55,0.4));
    color: var(--mcp-text, #e8ecf0);
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .ms-nav-btn:hover { background: var(--mcp-accent-dim, rgba(95,153,225,0.12)); }

  .ms-title {
    flex: 1;
    background: none;
    border: none;
    color: var(--mcp-text, #e8ecf0);
    font-size: 15px;
    font-weight: 600;
    text-align: center;
    cursor: pointer;
    padding: 6px 0;
    text-transform: capitalize;
  }

  .ms-close-btn {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1px solid var(--mcp-glass-border, rgba(255,255,255,0.06));
    background: var(--mcp-glass-bg, rgba(35,40,55,0.4));
    color: var(--mcp-text-muted, rgba(200,210,220,0.5));
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .ms-close-btn:hover { background: var(--mcp-accent-dim, rgba(95,153,225,0.12)); }

  /* Week strip */
  .ms-week-strip {
    display: flex;
    gap: 4px;
    padding: 0 12px 10px;
    flex-shrink: 0;
  }

  .ms-week-day {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 2px;
    border-radius: 10px;
    border: none;
    background: transparent;
    cursor: pointer;
    transition: background 0.15s;
  }

  .ms-week-day:hover { background: var(--mcp-accent-dim, rgba(95,153,225,0.08)); }

  .ms-week-day.active {
    background: var(--mcp-accent, rgba(95,153,225,0.48));
  }

  .ms-week-day.active .ms-week-day-label,
  .ms-week-day.active .ms-week-day-num {
    color: #000;
    font-weight: 700;
  }

  .ms-week-day.today .ms-week-day-num {
    color: var(--mcp-accent, rgba(95,153,225,0.9));
  }

  .ms-week-day-label {
    font-size: 10px;
    color: var(--mcp-text-muted, rgba(200,210,220,0.5));
    text-transform: uppercase;
    font-weight: 500;
  }

  .ms-week-day-num {
    font-size: 13px;
    font-weight: 600;
    color: var(--mcp-text, #e8ecf0);
  }

  .ms-week-day-weather {
    font-size: 9px;
    color: var(--mcp-text-muted, rgba(200, 210, 220, 0.6));
    white-space: nowrap;
    line-height: 1;
    margin-top: 1px;
  }

  .ms-week-day.active .ms-week-day-weather {
    color: rgba(0, 0, 0, 0.7);
  }

  /* Timeline */
  .ms-timeline {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    padding: 0 0 80px;
  }

  .ms-timeline-inner {
    position: relative;
    margin-left: 52px;
    margin-right: 8px;
  }

  .ms-hour-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--mcp-glass-border, rgba(255,255,255,0.04));
  }

  .ms-hour-label {
    position: absolute;
    left: -52px;
    top: -8px;
    width: 44px;
    text-align: right;
    font-size: 11px;
    font-weight: 500;
    color: var(--mcp-text-faint, rgba(200,210,220,0.25));
  }

  .ms-half-hour-line {
    background: rgba(255, 255, 255, 0.02);
  }

  .ms-minute-label {
    position: absolute;
    left: -52px;
    top: -7px;
    width: 44px;
    text-align: right;
    font-size: 9px;
    font-weight: 400;
    color: var(--mcp-text-faint, rgba(200,210,220,0.12));
  }

  /* Now indicator */
  .ms-now-line {
    position: absolute;
    left: -6px;
    right: 0;
    height: 2px;
    background: var(--mcp-accent, rgba(95,153,225,0.8));
    border-radius: 1px;
    z-index: 5;
  }

  .ms-now-line::before {
    content: "";
    position: absolute;
    left: 0;
    top: -4px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--mcp-accent, rgba(95,153,225,0.8));
  }

  /* Task block */
  .ms-task-block {
    position: absolute;
    left: 4px;
    right: 0;
    border-radius: 10px;
    padding: 8px 12px;
    cursor: pointer;
    overflow: hidden;
    z-index: 2;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    border-left: 3px solid rgba(255,255,255,0.2);
  }

  .ms-task-block:hover {
    transform: scale(1.01);
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    z-index: 3;
  }

  .ms-task-block:active {
    transform: scale(0.98);
  }

  .ms-task-block.done {
    opacity: 0.5;
  }

  .ms-task-block.paused {
    opacity: 0.7;
  }

  .ms-task-header {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .ms-task-time {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255,255,255,0.85);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .ms-task-work-icon {
    font-size: 12px;
    flex-shrink: 0;
  }

  .ms-task-recurring {
    font-size: 11px;
    flex-shrink: 0;
    opacity: 0.6;
  }

  .ms-task-priority {
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }
  .ms-task-priority.ms-priority-high {
    background: rgba(244, 67, 54, 0.25);
    color: #f44336;
  }
  .ms-task-priority.ms-priority-mid {
    background: rgba(255, 152, 0, 0.25);
    color: #ff9800;
  }

  .ms-task-title {
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .ms-task-desc {
    font-size: 11px;
    color: rgba(255,255,255,0.7);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ms-task-status {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 4px;
    font-weight: 500;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .ms-status-progress {
    background: rgba(214, 178, 108, 0.25);
    color: rgba(225, 195, 130, 0.9);
  }

  .ms-status-paused {
    background: rgba(180, 150, 100, 0.25);
    color: rgba(200, 170, 110, 0.9);
  }

  .ms-status-done {
    background: rgba(110, 190, 160, 0.2);
    color: rgba(140, 205, 175, 0.85);
  }

  /* Context menu */
  :global(.ms-context-overlay) {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: rgba(0,0,0,0.4);
    backdrop-filter: blur(4px);
  }

  :global(.ms-context-menu) {
    position: fixed;
    z-index: 9999;
    min-width: 200px;
    background: var(--background-primary, #1e1e2e);
    border: 1px solid var(--background-modifier-border, rgba(255,255,255,0.08));
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    padding: 6px;
    font-family: var(--font-interface);
    font-size: 13px;
  }

  :global(.ms-context-item) {
    display: block;
    width: 100%;
    padding: 10px 14px;
    border: none;
    background: transparent;
    color: var(--text-normal, #e8ecf0);
    text-align: left;
    cursor: pointer;
    border-radius: 8px;
    transition: background 0.12s;
    font-family: var(--font-interface);
    font-size: 13px;
    min-height: 40px;
  }

  :global(.ms-context-item:hover) {
    background: var(--background-modifier-hover, rgba(255,255,255,0.06));
  }

  :global(.ms-context-divider) {
    height: 1px;
    background: var(--background-modifier-border, rgba(255,255,255,0.06));
    margin: 4px 10px;
  }

  :global(.ms-context-label) {
    padding: 6px 14px 2px;
    font-size: 11px;
    color: var(--text-faint, rgba(200,210,220,0.4));
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  :global(.ms-context-danger) {
    color: var(--text-error, #ef4444);
  }

  :global(.ms-context-danger:hover) {
    background: rgba(239,68,68,0.12);
  }

  /* View toggle button */
  .ms-view-toggle {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1px solid var(--mcp-glass-border, rgba(255,255,255,0.06));
    background: var(--mcp-glass-bg, rgba(35,40,55,0.4));
    color: var(--mcp-text, #e8ecf0);
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .ms-view-toggle:hover {
    background: var(--mcp-accent-dim, rgba(95,153,225,0.12));
  }

  /* Month grid */
  .ms-month-grid {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0 4px 8px;
    overflow: hidden;
  }

  .ms-month-header {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    margin-bottom: 4px;
  }

  .ms-month-header-day {
    text-align: center;
    font-size: 12px;
    font-weight: 600;
    color: var(--mcp-text-faint, rgba(200,210,220,0.5));
    padding: 8px 0;
  }

  .ms-month-header-day.weekend {
    color: #ef4444;
  }

  .ms-month-body {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    grid-auto-rows: 1fr;
    flex: 1;
    gap: 1px;
    background: var(--mcp-glass-border, rgba(255,255,255,0.04));
  }

  .ms-month-day {
    display: flex;
    flex-direction: column;
    background: var(--background-primary, #1a1a2e);
    cursor: pointer;
    transition: background 0.15s;
    padding: 4px 2px;
    min-height: 80px;
    overflow: hidden;
  }

  .ms-month-day:hover {
    background: var(--mcp-accent-dim, rgba(95,153,225,0.08));
  }

  .ms-month-day.other-month {
    opacity: 0.35;
  }

  .ms-month-day.today {
    background: rgba(59, 130, 246, 0.08);
  }

  .ms-month-day.selected {
    background: rgba(59, 130, 246, 0.12);
  }

  .ms-month-day-num {
    font-size: 14px;
    font-weight: 500;
    color: var(--mcp-text, #e8ecf0);
    line-height: 1;
    margin-bottom: 4px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ms-month-day.today .ms-month-day-num {
    background: #3b82f6;
    color: #fff;
    font-weight: 700;
  }

  .ms-month-day.selected .ms-month-day-num {
    background: rgba(59, 130, 246, 0.2);
    color: #3b82f6;
    font-weight: 600;
  }

  .ms-month-day.weekend .ms-month-day-num {
    color: #ef4444;
  }

  .ms-month-day.today.weekend .ms-month-day-num {
    background: #3b82f6;
    color: #fff;
  }

  .ms-month-day-tasks {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    overflow: hidden;
  }

  .ms-month-task-chip {
    display: flex;
    flex-direction: column;
    padding: 3px 5px;
    border-radius: 4px;
    font-size: 10px;
    line-height: 1.2;
    overflow: hidden;
    min-width: 0;
    opacity: 0.85;
  }

  .ms-month-task-chip.done {
    opacity: 0.4;
    text-decoration: line-through;
  }

  .ms-month-task-chip.done .ms-month-task-title {
    text-decoration: line-through;
  }

  .ms-month-task-time {
    font-weight: 600;
    color: rgba(255,255,255,0.9);
    font-size: 9px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .ms-month-task-title {
    color: rgba(255,255,255,0.95);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    font-weight: 500;
  }

  .ms-month-task-more {
    font-size: 9px;
    color: var(--mcp-text-faint, rgba(200,210,220,0.5));
    padding: 1px 4px;
  }

  /* Untimed tasks section */
  .ms-untimed-section {
    border-top: 1px solid var(--mcp-glass-border, rgba(255,255,255,0.06));
    padding: 8px 12px;
    flex-shrink: 0;
    max-height: 200px;
    overflow-y: auto;
  }

  .ms-untimed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .ms-untimed-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--mcp-text-faint, rgba(200,210,220,0.5));
    text-transform: uppercase;
  }

  .ms-untimed-add {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: 1px solid var(--mcp-glass-border, rgba(255,255,255,0.06));
    background: transparent;
    color: var(--mcp-text-faint, rgba(200,210,220,0.5));
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .ms-untimed-add:hover {
    background: var(--mcp-accent-dim, rgba(95,153,225,0.12));
    color: var(--mcp-text, #e8ecf0);
  }

  .ms-untimed-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ms-untimed-task {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--mcp-glass-bg, rgba(35,40,55,0.4));
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .ms-untimed-task:hover {
    background: var(--mcp-accent-dim, rgba(95,153,225,0.12));
  }

  .ms-untimed-task.done {
    opacity: 0.5;
  }

  .ms-untimed-task.done .ms-untimed-task-title {
    text-decoration: line-through;
  }

  .ms-untimed-task-title {
    font-size: 14px;
    color: var(--mcp-text, #e8ecf0);
    flex: 1;
  }
</style>
