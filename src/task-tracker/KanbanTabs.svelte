<script lang="ts">
  import type { TaskStatus } from "./types";
  import { tasks, activeTab, selectedDate } from "./stores";
  import { t } from "../i18n";

  $: currentDate = $selectedDate;

  $: counts = (() => {
    const result = { all: 0, todo: 0, progress: 0, paused: 0, done: 0 };
    for (const task of $tasks) {
      if (currentDate && task.dateUID !== currentDate) continue;
      if (task.status === "done") {
        result.done++;
      } else if (task.status === "todo") {
        result.todo++;
        result.all++;
      } else if (task.status === "progress") {
        result.progress++;
        result.all++;
      } else if (task.status === "paused") {
        result.paused++;
        result.all++;
      }
    }
    return result;
  })();

  $: tabs = [
    { key: "all" as TaskStatus, icon: "📋", label: $t("tasks.kanban.all") },
    { key: "todo" as TaskStatus, icon: "🟢", label: $t("tasks.kanban.todo") },
    { key: "progress" as TaskStatus, icon: "🔥", label: $t("tasks.kanban.progress") },
    { key: "paused" as TaskStatus, icon: "☕", label: $t("tasks.kanban.paused") },
    { key: "done" as TaskStatus, icon: "✅", label: $t("tasks.kanban.done") },
  ];

  function setTab(tab: TaskStatus) {
    activeTab.set(tab);
  }
</script>

<div class="kanban-tabs-flat">
  {#each tabs as tab (tab.key)}
    <button
      class="kanban-tab-btn"
      class:active={$activeTab === tab.key}
      on:click={() => setTab(tab.key)}
    >
      <span class="kanban-tab-icon">{tab.icon}</span>
      <span class="kanban-tab-label">{tab.label}</span>
      {#if counts[tab.key] > 0}
        <span class="kanban-tab-count">{counts[tab.key]}</span>
      {/if}
    </button>
  {/each}
</div>
