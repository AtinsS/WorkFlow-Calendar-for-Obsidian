<script lang="ts">
  import type { ITask, IProject, TimeLog } from "../task-tracker/types";
  import { projects, timeLogs } from "../task-tracker/stores";
  import { formatDuration } from "../task-tracker/TimerManager";
  import { t } from "../i18n";

  export let tasks: ITask[] = [];

  interface ProjectData {
    projectId: string | null;
    projectName: string;
    projectColor: string;
    totalMs: number;
    taskCount: number;
    earnings: number;
  }

  $: projectStats = buildProjectStats($projects, tasks, $timeLogs);

  function buildProjectStats(
    allProjects: IProject[],
    monthTasks: ITask[],
    allTimeLogs: TimeLog[],
  ): ProjectData[] {
    const projectMap = new Map<string, ProjectData>();
    const noProjectKey = "__none__";

    const timeByTask = new Map<string, number>();
    for (const log of allTimeLogs) {
      timeByTask.set(log.taskId, (timeByTask.get(log.taskId) || 0) + log.duration);
    }

    for (const p of allProjects) {
      projectMap.set(p.id, {
        projectId: p.id,
        projectName: p.name,
        projectColor: p.color,
        totalMs: 0,
        taskCount: 0,
        earnings: 0,
      });
    }

    for (const task of monthTasks) {
      const pKey = task.projectId || noProjectKey;
      if (!projectMap.has(pKey)) {
        const proj = task.projectId ? allProjects.find((p) => p.id === task.projectId) : null;
        projectMap.set(pKey, {
          projectId: task.projectId,
          projectName: proj?.name || $t("projectAnalytics.noProject"),
          projectColor: proj?.color || "#647177",
          totalMs: 0,
          taskCount: 0,
          earnings: 0,
        });
      }
      const entry = projectMap.get(pKey);
      entry.taskCount++;
      const taskMs = task.totalWorkTime || timeByTask.get(task.id) || 0;
      entry.totalMs += taskMs;
      if (task.isWorkTask && task.rate && task.status === "done") {
        if (task.paymentType === "hour" && task.totalWorkTime) {
          const totalHours = task.totalWorkTime / 3600000;
          const overtimeStart = task.overtimeStart || 0;
          const overtimeMultiplier = task.overtimeMultiplier || 1;
          if (overtimeStart > 0 && overtimeMultiplier > 1 && totalHours > overtimeStart) {
            const regularHours = overtimeStart;
            const overtimeHours = totalHours - overtimeStart;
            entry.earnings += Math.round(task.rate * (regularHours + overtimeHours * overtimeMultiplier));
          } else {
            entry.earnings += Math.round(task.rate * totalHours);
          }
        } else if (task.paymentType === "day") {
          entry.earnings += task.rate;
        }
      }
    }

    const result = Array.from(projectMap.values());
    result.sort((a, b) => b.totalMs - a.totalMs);
    return result;
  }

  $: maxMs = projectStats.length > 0 ? Math.max(...projectStats.map((p) => p.totalMs)) : 0;
  $: totalMs = projectStats.reduce((sum, p) => sum + p.totalMs, 0);

  function getShare(ms: number): string {
    if (totalMs === 0) return "0%";
    return Math.round((ms / totalMs) * 100) + "%";
  }

  function formatTime(ms: number): string {
    return formatDuration(ms);
  }
</script>

<div class="project-table">
  <div class="project-table-header">
    <span class="pt-col-name">{$t("projectAnalytics.project")}</span>
    <span class="pt-col-time">{$t("projectAnalytics.time")}</span>
    <span class="pt-col-earnings">{$t("projectAnalytics.earnings")}</span>
    <span class="pt-col-share">{$t("projectAnalytics.share")}</span>
  </div>
  {#each projectStats as p (p.projectId || "__none__")}
    <div class="project-table-row">
      <span class="pt-col-name">
        <span class="pt-dot" style="background: {p.projectColor}"></span>
        {p.projectName}
      </span>
      <span class="pt-col-time">{formatTime(p.totalMs)}</span>
      <span class="pt-col-earnings">{p.earnings > 0 ? p.earnings.toLocaleString($t("locale.numberLocale")) + " " + $t("locale.currencySymbol") : "—"}</span>
      <span class="pt-col-share">{getShare(p.totalMs)}</span>
    </div>
  {/each}
</div>

<style>
  .project-table {
    width: 100%;
  }

  .project-table-header {
    display: grid;
    grid-template-columns: 1fr 90px 80px 60px;
    gap: 8px;
    padding: 6px 0;
    font-size: 10px;
    font-weight: 600;
    color: var(--mcp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--mcp-glass-border);
  }

  .project-table-row {
    display: grid;
    grid-template-columns: 1fr 90px 80px 60px;
    gap: 8px;
    padding: 8px 0;
    align-items: center;
    font-size: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }

  .project-table-row:last-child {
    border-bottom: none;
  }

  .pt-col-name {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--mcp-text-muted);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pt-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .pt-col-time {
    text-align: right;
    font-weight: 600;
    color: var(--mcp-text-muted);
    font-size: 11px;
  }

  .pt-col-earnings {
    text-align: right;
    font-weight: 600;
    color: var(--mcp-success);
    font-size: 11px;
  }

  .pt-col-share {
    text-align: right;
    font-weight: 500;
    color: var(--mcp-text-faint);
    font-size: 11px;
  }
</style>
