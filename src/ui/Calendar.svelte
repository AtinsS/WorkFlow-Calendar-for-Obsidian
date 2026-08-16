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
  import { fetchWeekWeather, type DayWeather } from "../services/weatherService";

  let today: Moment = window.moment();
  let weekWeather: DayWeather[] = [];

  $: {
    const lat = $settings.weatherLatitude;
    const lon = $settings.weatherLongitude;
    if (lat && lon && $settings.weatherEnabled !== false) {
      const start = today.clone().startOf("isoWeek").format("YYYY-MM-DD");
      const end = today.clone().endOf("isoWeek").format("YYYY-MM-DD");
      fetchWeekWeather(lat, lon, start, end).then(data => {
        weekWeather = data;
      }).catch(() => { weekWeather = []; });
    }
  }

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
  {#if weekWeather.length > 0}
    <div class="cal-weather">
      <div class="cal-weather-title">Погода на неделю</div>
      {#each weekWeather as day (day.date)}
        {@const isToday = day.date === today.format("YYYY-MM-DD")}
        {@const m = window.moment(day.date, "YYYY-MM-DD")}
        <div class="cal-weather-row" class:today={isToday}>
          <span class="cal-weather-day">{m.format("dd")}</span>
          <span class="cal-weather-num">{m.format("D.MM")}</span>
          <span class="cal-weather-icon">{day.icon}</span>
          <span class="cal-weather-desc">{day.label}</span>
          <span class="cal-weather-temp">{day.tempMin}…{day.tempMax}°</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .cal-weather {
    padding: 6px 8px 4px;
    border-top: 1px solid var(--background-modifier-border);
    margin-top: 4px;
  }

  .cal-weather-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    padding: 0 4px;
  }

  .cal-weather-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-muted);
    transition: background 0.1s ease;
  }

  .cal-weather-row:hover {
    background: var(--background-modifier-hover);
  }

  .cal-weather-row.today {
    background: var(--interactive-accent);
    color: var(--text-on-accent, #fff);
  }

  .cal-weather-day {
    width: 22px;
    font-weight: 700;
    font-size: 12px;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .cal-weather-num {
    width: 42px;
    font-size: 12px;
    opacity: 0.7;
    flex-shrink: 0;
  }

  .cal-weather-icon {
    font-size: 18px;
    line-height: 1;
    flex-shrink: 0;
  }

  .cal-weather-desc {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .cal-weather-temp {
    font-weight: 700;
    font-size: 13px;
    white-space: nowrap;
    flex-shrink: 0;
  }
</style>
