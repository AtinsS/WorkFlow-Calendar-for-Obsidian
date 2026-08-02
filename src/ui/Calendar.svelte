<svelte:options immutable />

<script lang="ts">
  import type { Moment } from "moment";
  import {
    Calendar as CalendarBase,
    ICalendarSource,
    configureGlobalMomentLocale,
  } from "obsidian-calendar-ui";
  import { onDestroy, onMount, afterUpdate } from "svelte";

  import { activeFile, dailyNotes, settings, weeklyNotes } from "./stores";
  import { tasks } from "../task-tracker/stores";
  import { habitLogs } from "../habit-tracker/stores";
  import { selectedDate } from "../task-tracker/stores";
  import { getDateUID } from "obsidian-daily-notes-interface";

  let today: Moment = window.moment();

  // Initialize Russian locale with Monday as first day
  $: {
    configureGlobalMomentLocale("ru", "monday");
    window.moment.updateLocale("ru", {
      calendar: {
        sameDay: "[Сегодня в] LT",
        nextDay: "[Завтра в] LT",
        lastDay: "[Вчера в] LT",
        nextWeek: function (now: moment.Moment) {
          if (now.week() !== this.week()) {
            switch (this.day()) {
              case 0:
                return "[В следующее] dddd, [в] LT";
              case 1:
              case 2:
              case 4:
                return "[В следующий] dddd, [в] LT";
              case 3:
              case 5:
                return "[В следующую] dddd, [в] LT";
              case 6:
                return "[В следующую субботу, в] LT";
              default:
                return "[В] dddd, [в] LT";
            }
          }
          return "[В] dddd, [в] LT";
        },
        lastWeek: function () {
          switch (this.day()) {
            case 0:
              return "[В прошлое] dddd, [в] LT";
            case 1:
            case 2:
            case 4:
              return "[В прошлый] dddd, [в] LT";
            case 3:
            case 5:
              return "[В прошлую] dddd, [в] LT";
            case 6:
              return "[В прошлую субботу, в] LT";
            default:
              return "[В] dddd, [в] LT";
          }
        },
        sameElse: "L",
      },
    });
    dailyNotes.reindex();
    weeklyNotes.reindex();
    today = window.moment();
  }

  export let displayedMonth: Moment = today;
  export let sources: ICalendarSource[];

  // When tasks or habits change, re-render calendar so badges update.
  // Clone displayedMonth to force CalendarBase to recompute month → getDailyMetadata.
  const unsubTasks = tasks.subscribe(() => {
    today = window.moment();
    displayedMonth = displayedMonth.clone();
  });
  const unsubHabits = habitLogs.subscribe(() => {
    today = window.moment();
    displayedMonth = displayedMonth.clone();
  });
  export let onHoverDay: (date: Moment, targetEl: EventTarget) => boolean;
  export let onHoverWeek: (date: Moment, targetEl: EventTarget) => boolean;
  export let onClickDay: (date: Moment, isMetaPressed: boolean) => boolean;
  export let onClickWeek: (date: Moment, isMetaPressed: boolean) => boolean;
  export let onContextMenuDay: (date: Moment, event: MouseEvent) => boolean;
  export let onContextMenuWeek: (date: Moment, event: MouseEvent) => boolean;
  export let onMonthChange: (monthKey: string) => void = () => {};

  let lastMonthKey = "";

  $: {
    const mk = `${displayedMonth.year()}-${String(displayedMonth.month() + 1).padStart(2, "0")}`;
    if (mk !== lastMonthKey) {
      lastMonthKey = mk;
      onMonthChange(mk);
    }
  }

  let lastHeartbeatDay: string = today.format("YYYY-MM-DD");

  const heartbeat = setInterval(() => {
    const currentDay = window.moment().format("YYYY-MM-DD");
    if (currentDay !== lastHeartbeatDay) {
      lastHeartbeatDay = currentDay;
      today = window.moment();

      if (displayedMonth.isSame(today, "month")) {
        displayedMonth = today;
      }
    }
  }, 1000 * 60);

  // Long-press for context menu on touch devices
  let containerEl: HTMLElement;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressStartX = 0;
  let longPressStartY = 0;
  const LONG_PRESS_MS = 500;
  const MOVE_THRESHOLD = 10;

  function findDayCell(target: EventTarget): HTMLElement | null {
    return (target as HTMLElement)?.closest?.(".day") || null;
  }

  function onContainerTouchStart(e: TouchEvent) {
    const dayCell = findDayCell(e.target);
    if (!dayCell) return;

    const dateStr = dayCell.getAttribute("data-date");
    if (!dateStr) return;

    const touch = e.touches[0];
    longPressStartX = touch.clientX;
    longPressStartY = touch.clientY;

    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      const moment = window.moment(dateStr, "YYYY-MM-DD");
      onContextMenuDay(moment, {
        pageX: longPressStartX,
        pageY: longPressStartY,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as MouseEvent);
    }, LONG_PRESS_MS);
  }

  function onContainerTouchMove(e: TouchEvent) {
    if (!longPressTimer) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - longPressStartX);
    const dy = Math.abs(touch.clientY - longPressStartY);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function onContainerTouchEnd() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  onMount(() => {
    if (!containerEl) return;
    containerEl.addEventListener("touchstart", onContainerTouchStart, { passive: true });
    containerEl.addEventListener("touchmove", onContainerTouchMove, { passive: true });
    containerEl.addEventListener("touchend", onContainerTouchEnd, { passive: true });
    containerEl.addEventListener("touchcancel", onContainerTouchEnd, { passive: true });

    // Hook into the Nav's reset button to also toggle task panel's selectedDate
    const resetBtn = containerEl.querySelector(".reset-button");
    if (resetBtn) {
      resetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const todayUID = getDateUID(window.moment(), "day");
        const current = $selectedDate;
        if (current === todayUID) {
          selectedDate.set(null);
          activeFile.setUID(null);
        } else {
          selectedDate.set(todayUID);
          activeFile.setUID(todayUID);
        }
      });
    }
  });

  // Sync active class on reset button after every render
  function syncResetButtonActive() {
    if (!containerEl) return;
    const resetBtn = containerEl.querySelector(".reset-button");
    if (!resetBtn) return;
    const todayUID = getDateUID(window.moment(), "day");
    if ($selectedDate === todayUID) {
      resetBtn.classList.add("active");
    } else {
      resetBtn.classList.remove("active");
    }
  }

  afterUpdate(() => {
    syncResetButtonActive();
  });

  $: $selectedDate, syncResetButtonActive();

  onDestroy(() => {
    clearInterval(heartbeat);
    unsubTasks();
    unsubHabits();
    if (longPressTimer) clearTimeout(longPressTimer);
    if (containerEl) {
      containerEl.removeEventListener("touchstart", onContainerTouchStart);
      containerEl.removeEventListener("touchmove", onContainerTouchMove);
      containerEl.removeEventListener("touchend", onContainerTouchEnd);
      containerEl.removeEventListener("touchcancel", onContainerTouchEnd);
    }
  });
</script>

<div bind:this={containerEl}>
  <CalendarBase
    {sources}
    {today}
    {onHoverDay}
    {onHoverWeek}
    {onContextMenuDay}
    {onContextMenuWeek}
    {onClickDay}
    {onClickWeek}
    bind:displayedMonth
    localeData={today.localeData()}
    selectedId={$activeFile}
    showWeekNums={$settings.showWeeklyNote}
  />
</div>
