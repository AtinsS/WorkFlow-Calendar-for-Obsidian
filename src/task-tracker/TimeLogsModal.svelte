<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { timeLogs } from "./stores";
  import { formatDuration, groupLogsByDate } from "./TimerManager";
  import BarChart from "../components/BarChart.svelte";
  import { t } from "../i18n";

  export let onClose: () => void;

  $: grouped = groupLogsByDate($timeLogs);
  $: dates = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));

  function formatDate(dateStr: string): string {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    if (dateStr === today) return $t("tasks.timeLogs.today");
    if (dateStr === yesterday) return $t("tasks.timeLogs.yesterday");
    const d = new Date(dateStr);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  }

  function clearAll() {
    if (!confirm($t("tasks.timeLogs.clearConfirm"))) return;
    timeLogs.set([]);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
  });

  onDestroy(() => {
    document.removeEventListener("keydown", handleKeydown);
  });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="time-logs-overlay" on:click={handleBackdrop}>
  <div class="time-logs-popup">
    <div class="time-logs-header">
      <h2>{$t("tasks.timeLogs.title")}</h2>
      <button class="time-logs-close" on:click={onClose}>&#10005;</button>
    </div>

    <div class="time-logs-body">
      {#if dates.length === 0}
        <div class="time-logs-empty">{$t("tasks.timeLogs.empty")}</div>
      {:else}
        <div class="time-logs-chart">
          <BarChart logs={$timeLogs} />
        </div>
        {#each dates as date (date)}
          <div class="time-logs-date-group">
            <div class="time-logs-date-label">{formatDate(date)}</div>
            {#each grouped.get(date) as log (log.id)}
              <div class="time-logs-entry">
                <span class="time-logs-title">{log.taskTitle}</span>
                <span class="time-logs-duration">{formatDuration(log.duration)}</span>
              </div>
            {/each}
          </div>
        {/each}
      {/if}
    </div>

    {#if dates.length > 0}
      <div class="time-logs-footer">
        <button class="time-logs-clear" on:click={clearAll}>{$t("tasks.timeLogs.clearAll")}</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .time-logs-overlay {
    touch-action: none;
  }

  .time-logs-popup {
    touch-action: manipulation;
  }

  .time-logs-chart {
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--mcp-glass-border);
  }

  .time-logs-entry {
    min-height: 36px;
    touch-action: manipulation;
  }

  .time-logs-close {
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .time-logs-clear {
    min-height: 44px;
    width: 100%;
  }
</style>
