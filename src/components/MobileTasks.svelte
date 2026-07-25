<script lang="ts">
  import type CalendarPlugin from "../main";
  import TaskPanel from "../task-tracker/TaskPanel.svelte";

  export let plugin: CalendarPlugin;
</script>

<div class="mobile-tasks">
  <TaskPanel appInstance={plugin.app} />
</div>

<style>
  .mobile-tasks {
    height: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--background-primary, #1a1a2e);
  }

  .mobile-tasks :global(.task-tracker-panel) {
    padding: 12px 14px;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .mobile-tasks :global(.task-tracker-list) {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .mobile-tasks :global(.task-tracker-filter-bar) {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    flex-wrap: nowrap;
    padding: 4px 0;
    gap: 4px;
  }

  .mobile-tasks :global(.task-tracker-filter-bar::-webkit-scrollbar) {
    display: none;
  }

  .mobile-tasks :global(.task-tracker-filter-btn) {
    flex-shrink: 0;
  }
</style>
