<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import moment from "moment";
  import { tasks, projects } from "../task-tracker/stores";
  import type { IProject, ITask } from "../task-tracker/types";
  import { getActiveTimer } from "../task-tracker/TimerManager";
  import { t, locale } from "../i18n";

  export let onOpenTasks: (() => void) | undefined = undefined;
  export let onOpenSchedule: (() => void) | undefined = undefined;

  let now = new Date();
  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    timer = setInterval(() => {
      now = new Date();
    }, 30000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  function isDone(task: ITask): boolean {
    return task.completed || task.status === "done";
  }

  function taskDate(value?: string): string {
    return value?.match(/^day-(\d{4}-\d{2}-\d{2})/)?.[1] || "";
  }

  function isTaskOverdue(task: ITask, today: string, time: string): boolean {
    const date = taskDate(task.dateUID);
    if (!date || isDone(task)) return false;
    if (date < today) return true;
    return date === today && task.status === "todo" && !!task.scheduledTime && task.scheduledTime <= time;
  }

  function isDeadlineToday(task: ITask, today: string): boolean {
    return !isDone(task) && taskDate(task.deadline) === today;
  }

  function isDeadlineTomorrow(task: ITask, tomorrow: string): boolean {
    return !isDone(task) && taskDate(task.deadline) === tomorrow;
  }

  function taskSort(a: ITask, b: ITask): number {
    const at = a.scheduledTime || "99:99";
    const bt = b.scheduledTime || "99:99";
    if (at !== bt) return at.localeCompare(bt);
    return a.sortOrder - b.sortOrder;
  }

  function plannedMinutes(task: ITask): number {
    if (task.estimatedTime && task.estimatedTime > 0) return task.estimatedTime;
    if (task.scheduledTime && task.endTime) {
      const [sh, sm] = task.scheduledTime.split(":").map(Number);
      const [eh, em] = task.endTime.split(":").map(Number);
      const diff = (eh * 60 + em) - (sh * 60 + sm);
      return diff > 0 ? diff : 0;
    }
    return 0;
  }

  function actualMinutes(task: ITask): number {
    const activeMs = task.status === "progress" ? getActiveTimer(task.id) || 0 : 0;
    return Math.round(((task.totalWorkTime || 0) + activeMs) / 60000);
  }

  function formatMinutes(minutes: number): string {
    if (minutes <= 0) return "0м";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}м`;
    return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
  }

  function projectFor(task: ITask, map: Map<string, IProject>): IProject | null {
    return task.projectId ? map.get(task.projectId) || null : null;
  }

  function statusLabel(task: ITask): string {
    if (task.status === "progress") return $t("tasks.tabs.progress");
    if (task.status === "paused") return $t("tasks.tabs.paused");
    if (task.status === "done") return $t("tasks.tabs.done");
    return $t("tasks.tabs.todo");
  }

  $: today = moment(now).format("YYYY-MM-DD");
  $: tomorrow = moment(now).add(1, "day").format("YYYY-MM-DD");
  $: nowTime = moment(now).format("HH:mm");
  $: dateTitle = moment(now).locale($locale).format("D MMMM, dddd");
  $: projectMap = new Map($projects.map((project) => [project.id, project]));
  $: activeTasks = $tasks.filter((task) => !isDone(task));
  $: todayTasks = activeTasks
    .filter((task) => taskDate(task.dateUID) === today)
    .slice()
    .sort(taskSort);
  $: inProgressTasks = activeTasks
    .filter((task) => task.status === "progress")
    .slice()
    .sort(taskSort);
  $: overdueTasks = activeTasks
    .filter((task) => isTaskOverdue(task, today, nowTime))
    .slice()
    .sort(taskSort);
  $: deadlineToday = activeTasks
    .filter((task) => isDeadlineToday(task, today))
    .slice()
    .sort(taskSort);
  $: deadlineTomorrow = activeTasks
    .filter((task) => isDeadlineTomorrow(task, tomorrow))
    .slice()
    .sort(taskSort);
  $: unscheduledToday = todayTasks.filter((task) => !task.scheduledTime);
  $: upcomingToday = todayTasks.filter((task) => task.scheduledTime && task.scheduledTime >= nowTime);
  $: plannedToday = todayTasks.reduce((sum, task) => sum + plannedMinutes(task), 0);
  $: actualToday = todayTasks.reduce((sum, task) => sum + actualMinutes(task), 0);
  $: completedToday = $tasks.filter((task) => isDone(task) && taskDate(task.dateUID) === today).length;
  $: planPercent = plannedToday > 0 ? Math.min(100, Math.round((actualToday / plannedToday) * 100)) : 0;
  $: projectRows = Array.from(
    activeTasks.reduce((map, task) => {
      const key = task.projectId || "__none__";
      const existing = map.get(key) || {
        project: projectFor(task, projectMap),
        active: 0,
        today: 0,
        overdue: 0,
      };
      existing.active += 1;
      if (taskDate(task.dateUID) === today) existing.today += 1;
      if (isTaskOverdue(task, today, nowTime)) existing.overdue += 1;
      map.set(key, existing);
      return map;
    }, new Map<string, { project: IProject | null; active: number; today: number; overdue: number }>())
      .values()
  )
    .sort((a, b) => b.today - a.today || b.overdue - a.overdue || b.active - a.active)
    .slice(0, 6);
</script>

<div class="daily-overview">
  <header class="do-header">
    <div>
      <div class="do-kicker">{$t("dailyOverview.title")}</div>
      <h2>{dateTitle}</h2>
    </div>
    <div class="do-actions">
      <button type="button" on:click={() => onOpenSchedule?.()}>{$t("dailyOverview.schedule")}</button>
      <button type="button" class="primary" on:click={() => onOpenTasks?.()}>{$t("dailyOverview.tasks")}</button>
    </div>
  </header>

  <div class="do-stats">
    <div class="do-stat danger">
      <span class="do-stat-value">{overdueTasks.length}</span>
      <span class="do-stat-label">{$t("dailyOverview.overdue")}</span>
    </div>
    <div class="do-stat">
      <span class="do-stat-value">{todayTasks.length}</span>
      <span class="do-stat-label">{$t("dailyOverview.tasksToday")}</span>
    </div>
    <div class="do-stat warn">
      <span class="do-stat-value">{deadlineToday.length}</span>
      <span class="do-stat-label">{$t("dailyOverview.deadlines")}</span>
    </div>
    <div class="do-stat ok">
      <span class="do-stat-value">{completedToday}</span>
      <span class="do-stat-label">{$t("dailyOverview.doneToday")}</span>
    </div>
  </div>

  <div class="do-plan">
    <div class="do-plan-top">
      <span>{$t("dailyOverview.planFact")}</span>
      <strong>{formatMinutes(actualToday)} / {formatMinutes(plannedToday)}</strong>
    </div>
    <div class="do-progress">
      <span style="width: {planPercent}%"></span>
    </div>
  </div>

  <div class="do-grid">
    <section class="do-panel">
      <div class="do-panel-head">
        <h3>{$t("dailyOverview.now")}</h3>
        <span>{inProgressTasks.length + upcomingToday.length}</span>
      </div>
      {#if inProgressTasks.length === 0 && upcomingToday.length === 0}
        <p class="do-empty">{$t("dailyOverview.noTasks")}</p>
      {:else}
        <div class="do-list">
          {#each [...inProgressTasks, ...upcomingToday].slice(0, 5) as task (task.id)}
            <div class="do-task" class:progress={task.status === "progress"}>
              <span class="do-time">{task.scheduledTime || $t("dailyOverview.nowLabel")}</span>
              <span class="do-title">{task.title}</span>
              <span class="do-status">{statusLabel(task)}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="do-panel">
      <div class="do-panel-head">
        <h3>{$t("dailyOverview.overdueSection")}</h3>
        <span>{overdueTasks.length}</span>
      </div>
      {#if overdueTasks.length === 0}
        <p class="do-empty">{$t("dailyOverview.noOverdue")}</p>
      {:else}
        <div class="do-list">
          {#each overdueTasks.slice(0, 5) as task (task.id)}
            <div class="do-task danger">
              <span class="do-time">{task.scheduledTime || taskDate(task.dateUID)}</span>
              <span class="do-title">{task.title}</span>
              <span class="do-status">{statusLabel(task)}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="do-panel">
      <div class="do-panel-head">
        <h3>{$t("dailyOverview.deadlinesSection")}</h3>
        <span>{deadlineToday.length + deadlineTomorrow.length}</span>
      </div>
      {#if deadlineToday.length === 0 && deadlineTomorrow.length === 0}
        <p class="do-empty">{$t("dailyOverview.noDeadlines")}</p>
      {:else}
        <div class="do-list">
          {#each [...deadlineToday, ...deadlineTomorrow].slice(0, 5) as task (task.id)}
            <div class="do-task warn">
              <span class="do-time">{taskDate(task.deadline) === today ? $t("dailyOverview.todayLabel") : $t("dailyOverview.tomorrowLabel")}</span>
              <span class="do-title">{task.title}</span>
              <span class="do-status">{task.deadlineTime || ""}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="do-panel">
      <div class="do-panel-head">
        <h3>{$t("dailyOverview.noTime")}</h3>
        <span>{unscheduledToday.length}</span>
      </div>
      {#if unscheduledToday.length === 0}
        <p class="do-empty">{$t("dailyOverview.allTimed")}</p>
      {:else}
        <div class="do-list">
          {#each unscheduledToday.slice(0, 5) as task (task.id)}
            <div class="do-task">
              <span class="do-time">—</span>
              <span class="do-title">{task.title}</span>
              <span class="do-status">{statusLabel(task)}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  {#if projectRows.length > 0}
    <section class="do-projects">
      <div class="do-panel-head">
        <h3>{$t("dailyOverview.activeProjects")}</h3>
        <span>{projectRows.length}</span>
      </div>
      <div class="do-project-list">
        {#each projectRows as row}
          <div class="do-project">
            <span
              class="do-project-dot"
              style="background: {row.project?.color || 'var(--interactive-accent)'}"
            ></span>
            <span class="do-project-name">{row.project?.name || $t("dailyOverview.noProject")}</span>
            <span class="do-project-count">{row.today} {$t("dailyOverview.todayLabel")}</span>
            {#if row.overdue > 0}
              <span class="do-project-overdue">{row.overdue} проср.</span>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .daily-overview {
    width: 100%;
    max-width: 1000px;
    margin: 0 auto;
    padding: 18px;
    box-sizing: border-box;
    color: var(--text-normal);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
  }

  .daily-overview * {
    box-sizing: border-box;
  }

  .do-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 14px;
  }

  .do-kicker {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0;
    margin-bottom: 3px;
  }

  .do-header h2 {
    margin: 0;
    font-size: 20px;
    line-height: 1.2;
    letter-spacing: 0;
  }

  .do-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .do-actions button {
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    color: var(--text-muted);
    border-radius: 8px;
    padding: 7px 12px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    min-height: 32px;
  }

  .do-actions button:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .do-actions button.primary {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .do-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }

  .do-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    min-width: 0;
  }

  .do-stat-value {
    font-size: 22px;
    font-weight: 750;
    line-height: 1;
  }

  .do-stat-label {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .do-stat.danger .do-stat-value {
    color: var(--text-error, #f06565);
  }

  .do-stat.warn .do-stat-value {
    color: var(--text-warning, #f5a623);
  }

  .do-stat.ok .do-stat-value {
    color: var(--text-success, #3dd68c);
  }

  .do-plan {
    padding: 10px;
    border-radius: 8px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    margin-bottom: 10px;
  }

  .do-plan-top {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .do-plan-top strong {
    color: var(--text-normal);
    font-weight: 650;
  }

  .do-progress {
    height: 6px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--background-modifier-border);
  }

  .do-progress span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--interactive-accent);
    transition: width 0.2s ease;
  }

  .do-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .do-panel,
  .do-projects {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    padding: 10px;
    min-width: 0;
  }

  .do-projects {
    margin-top: 10px;
  }

  .do-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }

  .do-panel-head h3 {
    margin: 0;
    font-size: 13px;
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: 0;
  }

  .do-panel-head span {
    font-size: 11px;
    color: var(--text-muted);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;
    padding: 2px 7px;
  }

  .do-list,
  .do-project-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .do-task {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    border-radius: 8px;
    background: var(--background-primary);
    border: 1px solid transparent;
    min-height: 34px;
  }

  .do-task.progress {
    border-color: color-mix(in srgb, var(--interactive-accent) 45%, transparent);
  }

  .do-task.danger {
    border-color: color-mix(in srgb, var(--text-error, #f06565) 35%, transparent);
  }

  .do-task.warn {
    border-color: color-mix(in srgb, var(--text-warning, #f5a623) 35%, transparent);
  }

  .do-time {
    color: var(--text-muted);
    font-size: 11px;
    white-space: nowrap;
  }

  .do-title {
    font-size: 12px;
    color: var(--text-normal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .do-status {
    color: var(--text-muted);
    font-size: 11px;
    white-space: nowrap;
  }

  .do-empty {
    margin: 0;
    min-height: 34px;
    display: flex;
    align-items: center;
    color: var(--text-muted);
    font-size: 12px;
  }

  .do-project {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    border-radius: 8px;
    background: var(--background-primary);
  }

  .do-project-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .do-project-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .do-project-count,
  .do-project-overdue {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .do-project-overdue {
    color: var(--text-error, #f06565);
  }

  @media (max-width: 760px) {
    .daily-overview {
      padding: 12px;
    }

    .do-header {
      flex-direction: column;
    }

    .do-actions {
      width: 100%;
      justify-content: stretch;
    }

    .do-actions button {
      flex: 1;
    }

    .do-stats,
    .do-grid {
      grid-template-columns: 1fr;
    }

    .do-project {
      grid-template-columns: 10px minmax(0, 1fr) auto;
    }

    .do-project-overdue {
      grid-column: 2 / -1;
    }
  }
</style>
