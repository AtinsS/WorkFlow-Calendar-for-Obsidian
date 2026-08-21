<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { IHabit } from "./types";
  import { habitLogs, isHabitCompletedOnDate, calculateStreak, getHabitCountOnDate, getHabitProgressOnDate } from "./stores";
  import { t } from "../i18n";

  export let habit: IHabit;

  export let date: string;

  const dispatch = createEventDispatcher();

  let isCompleted = false;
  let streak = 0;
  let currentCount = 0;
  let targetCount = 1;
  let progressState = 0; // 0=not done, 2=100%

  $: _logs = $habitLogs;
  $: {
    _logs;
    isCompleted = isHabitCompletedOnDate(habit.id, date);
    currentCount = getHabitCountOnDate(habit.id, date);
    targetCount = habit.targetCount || 1;
    progressState = getHabitProgressOnDate(habit.id, date);
  }
  $: {
    _logs;
    streak = calculateStreak(habit.id);
  }

  $: progress = targetCount > 1 ? Math.min(currentCount / targetCount, 1) : 0;
  $: isMultiTarget = targetCount > 1;

  function toggle() {
    dispatch("toggle", { habit });
  }

  function handleEdit() {
    dispatch("edit", { habit });
  }

  function handleDelete() {
    dispatch("delete", { habit });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    } else if (e.key === "Delete") {
      e.preventDefault();
      handleDelete();
    } else if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      handleEdit();
    }
  }
</script>

<div
  class="habit-item"
  class:completed={isCompleted && !isMultiTarget}
  class:multi-target={isMultiTarget}
  class:fully-done={isMultiTarget && currentCount >= targetCount}
  on:keydown={handleKeydown}
  tabindex="0"
  role="listitem"
  style="--habit-color: {habit.color}"
  aria-label={habit.title}
>
  <button
    class="habit-check-btn"
    class:checked={isCompleted}
    class:partial={isMultiTarget && currentCount > 0 && currentCount < targetCount}
    class:full={isMultiTarget && currentCount >= targetCount}
    style="--habit-color: {habit.color}; --progress: {progress}"
    on:click={toggle}
    aria-label={isCompleted ? $t("habits.item.undo") : $t("habits.item.markDone")}
  >
    {#if isMultiTarget}
      <span class="habit-check-count">{currentCount}</span>
    {:else if progressState === 2}
      <span class="habit-check-icon">&#10003;</span>
    {/if}
  </button>

  <span class="habit-icon">{habit.icon}</span>
  <span class="habit-title" class:completed-text={isCompleted && !isMultiTarget}>
    {habit.title}
  </span>

  {#if isMultiTarget}
    <span class="habit-progress-text" class:done={currentCount >= targetCount}>
      {currentCount}/{targetCount}
    </span>
  {/if}

  {#if streak > 0}
    <span class="habit-streak">
      <span class="streak-fire">&#128293;</span>
      {streak}
    </span>
  {/if}

  <button
    class="habit-edit-btn"
    disabled={isCompleted && !isMultiTarget}
    on:click={handleEdit}
    aria-label={isCompleted ? $t("habits.item.cannotEdit") : $t("habits.item.edit")}
  >
    &#9998;
  </button>

  <button
    class="habit-delete-btn"
    on:click={handleDelete}
    aria-label={$t("habits.item.delete")}
  >
    &#10005;
  </button>
</div>
