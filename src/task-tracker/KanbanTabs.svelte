<script lang="ts">
  import type { TaskStatus } from "./types";
  import { tasks, activeTab, selectedDate } from "./stores";

  $: currentDate = $selectedDate;

  $: counts = (() => {
    const result = { all: 0, todo: 0, progress: 0, paused: 0, done: 0 };
    for (const t of $tasks) {
      if (currentDate && t.dateUID !== currentDate) continue;
      if (t.status === "done") {
        result.done++;
      } else if (t.status === "todo") {
        result.todo++;
        result.all++;
      } else if (t.status === "progress") {
        result.progress++;
        result.all++;
      } else if (t.status === "paused") {
        result.paused++;
        result.all++;
      }
    }
    return result;
  })();

  const tabs: { key: TaskStatus; icon: string; label: string }[] = [
    { key: "all", icon: "📋", label: "Все" },
    { key: "todo", icon: "🟢", label: "Сделать" },
    { key: "progress", icon: "🔥", label: "В работе" },
    { key: "paused", icon: "☕", label: "На паузе" },
    { key: "done", icon: "✅", label: "Готово" },
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
