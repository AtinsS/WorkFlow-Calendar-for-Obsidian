<script lang="ts">
  import moment from "moment";
  import type { App } from "obsidian";
  import type { IHabit } from "./types";
  import {
    habits,
    habitLogs,
    addHabit,
    updateHabit,
    removeHabit,
    toggleHabitCompletion,
  } from "./stores";
  import { selectedDate } from "../task-tracker/stores";
  import HabitItem from "./HabitItem.svelte";
  import { HabitModal } from "./HabitModal";

  export let appInstance: App;

  $: currentDate = $selectedDate;
  $: dateStr = extractDateStr(currentDate);
  $: activeHabits = $habits.filter((h) => {
    if (h.archived) return false;
    const m = moment(dateStr, "YYYY-MM-DD");
    if (h.frequency === "weekly" && h.customDays && h.customDays.length > 0) {
      const dayOfWeek = m.day(); // 0=Sun
      return h.customDays.includes(dayOfWeek);
    }
    if (h.frequency === "monthly") {
      const dayOfMonth = m.date();
      return dayOfMonth === (h.monthlyDay || 1);
    }
    return true;
  });
  $: totalStreak = (() => {
    const logsByHabit = new Map<string, typeof $habitLogs>();
    for (const log of $habitLogs) {
      if (!log.completed) continue;
      const list = logsByHabit.get(log.habitId);
      if (list) list.push(log);
      else logsByHabit.set(log.habitId, [log]);
    }
    let total = 0;
    for (const h of activeHabits) {
      const logs = logsByHabit.get(h.id);
      if (!logs || logs.length === 0) continue;
      logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      let streak = 0;
      let streakDate = moment().startOf("day");
      for (const log of logs) {
        const logDate = moment(log.date, "YYYY-MM-DD").startOf("day");
        if (streakDate.diff(logDate, "days") <= 1) {
          streak++;
          streakDate = logDate.clone().subtract(1, "days");
        } else break;
      }
      total += streak;
    }
    return total;
  })();

  function extractDateStr(dateUID: string): string {
    if (!dateUID) {
      return moment().format("YYYY-MM-DD");
    }
    const match = dateUID.match(/^(?:day|week)-(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : moment().format("YYYY-MM-DD");
  }

  function openCreateHabit() {
    const modal = new HabitModal(
      appInstance,
      (habitData) => {
        addHabit({
          ...habitData,
          sortOrder: activeHabits.length,
        } as Omit<IHabit, "id" | "createdAt">);
      }
    );
    modal.open();
  }

  function handleToggle(event: CustomEvent<{ habit: IHabit }>) {
    const habit = event.detail.habit;
    toggleHabitCompletion(habit.id, dateStr, habit.targetCount || 1);
  }

  function handleEdit(event: CustomEvent<{ habit: IHabit }>) {
    const modal = new HabitModal(
      appInstance,
      (changes) => {
        updateHabit(event.detail.habit.id, changes);
      },
      event.detail.habit
    );
    modal.open();
  }

  function handleDelete(event: CustomEvent<{ habit: IHabit }>) {
    removeHabit(event.detail.habit.id);
  }
</script>

<div class="habit-tracker-panel">
  <div class="habit-tracker-header">
    <div class="habit-tracker-header-left">
      <span class="habit-tracker-title">Привычки</span>
      {#if totalStreak > 0}
        <span class="habit-tracker-streak">
          &#128293; {totalStreak}
        </span>
      {/if}
    </div>
    <div class="habit-tracker-header-right">
      <button
        class="habit-tracker-btn add-btn"
        on:click|stopPropagation={openCreateHabit}
        title="Добавить привычку"
      >
        +
      </button>
    </div>
  </div>

  <div class="habit-tracker-list">
    {#if activeHabits.length === 0}
      <div class="habit-tracker-empty">
        Нет привычек. Нажмите + чтобы создать.
      </div>
    {:else}
      {#each activeHabits as habit (habit.id)}
        <HabitItem
          {habit}
          date={dateStr}
          on:toggle={handleToggle}
          on:edit={handleEdit}
          on:delete={handleDelete}
        />
      {/each}
    {/if}
  </div>
</div>

<style>
  .habit-tracker-header {
    min-height: 44px;
  }

  .habit-tracker-btn {
    min-height: 44px;
  }

  .add-btn {
    min-width: auto;
  }
</style>
