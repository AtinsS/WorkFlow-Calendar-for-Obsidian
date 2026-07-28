<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { IHabit } from "./types";
  import { habitLogs, isHabitCompletedOnDate, calculateStreak, getHabitCountOnDate } from "./stores";

  export let habit: IHabit;

  export let date: string;

  const dispatch = createEventDispatcher();

  let isCompleted = false;
  let streak = 0;
  let currentCount = 0;
  let targetCount = 1;

  $: _logs = $habitLogs;
  $: {
    _logs;
    isCompleted = isHabitCompletedOnDate(habit.id, date);
    currentCount = getHabitCountOnDate(habit.id, date);
    targetCount = habit.targetCount || 1;
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
    aria-label={isCompleted ? "Отменить выполнение" : "Отметить выполнение"}
  >
    {#if isMultiTarget}
      <span class="habit-check-count">{currentCount}</span>
    {:else if isCompleted}
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
    aria-label={isCompleted ? "Нельзя редактировать выполненную привычку" : "Редактировать привычку"}
  >
    &#9998;
  </button>

  <button
    class="habit-delete-btn"
    on:click={handleDelete}
    aria-label="Удалить привычку"
  >
    &#10005;
  </button>
</div>
