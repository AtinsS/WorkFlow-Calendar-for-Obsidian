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
  import { t, tRaw, locale } from "../i18n";
  import { tasks } from "../task-tracker/stores";
  import { habitLogs } from "../habit-tracker/stores";
  import { selectedDate } from "../task-tracker/stores";
  import { getDateUID } from "obsidian-daily-notes-interface";
  import { fetchWeekWeather, type DayWeather, getWeatherAttribution } from "../services/weatherService";

  let today: Moment = window.moment();
  let weekWeather: DayWeather[] = [];
  let weatherWeekOffset = 0;

  $: {
    const lat = $settings.weatherLatitude;
    const lon = $settings.weatherLongitude;
    if (lat && lon && $settings.weatherEnabled !== false) {
      const base = today.clone().add(weatherWeekOffset, "weeks");
      const start = base.clone().startOf("week").format("YYYY-MM-DD");
      const end = base.clone().endOf("week").format("YYYY-MM-DD");
      fetchWeekWeather(lat, lon, start, end, $settings.weatherProvider as any, $settings.weatherApiKey).then(data => {
        weekWeather = data;
      }).catch(() => { weekWeather = []; });
    }
  }

  function shiftWeatherWeek(delta: number) {
    weatherWeekOffset += delta;
  }

  // Initialize locale-aware calendar with correct first day of week
  $: {
    const $loc = $locale;
    const momentLocale = $loc === "en" ? "en" : "ru";
    const sow = $settings.startOfWeek || "system";
    let firstDay: "monday" | "sunday";
    if (sow === "monday") firstDay = "monday";
    else if (sow === "sunday") firstDay = "sunday";
    else firstDay = $loc === "en" ? "sunday" : "monday";
    configureGlobalMomentLocale(momentLocale, firstDay);
    window.moment.updateLocale(momentLocale, {
      calendar: {
        sameDay: tRaw("calendar.sameDay"),
        nextDay: tRaw("calendar.nextDay"),
        lastDay: tRaw("calendar.lastDay"),
        nextWeek: function (now: moment.Moment) {
          if (now.week() !== this.week()) {
            switch (this.day()) {
              case 0:
                return tRaw("calendar.nextWeekNeuter");
              case 1:
              case 2:
              case 4:
                return tRaw("calendar.nextWeek");
              case 3:
              case 5:
                return tRaw("calendar.nextWeekFeminine");
              case 6:
                return tRaw("calendar.nextWeekSaturday");
              default:
                return tRaw("calendar.defaultDay");
            }
          }
          return tRaw("calendar.defaultDay");
        },
        lastWeek: function () {
          switch (this.day()) {
            case 0:
              return tRaw("calendar.lastWeekNeuter");
            case 1:
            case 2:
            case 4:
              return tRaw("calendar.lastWeek");
            case 3:
            case 5:
              return tRaw("calendar.lastWeekFeminine");
            case 6:
              return tRaw("calendar.lastWeekSaturday");
            default:
              return tRaw("calendar.defaultDay");
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
  {#if $settings.weatherEnabled !== false}
    {@const weekStart = today.clone().add(weatherWeekOffset, "weeks").startOf("week")}
    {@const weekEnd = today.clone().add(weatherWeekOffset, "weeks").endOf("week")}
    <div class="cal-weather">
      <div class="cal-weather-title">
        <button class="cal-weather-nav" on:click={() => shiftWeatherWeek(-1)} aria-label={$t("calendar.weatherPrevWeek")}>‹</button>
        <span class="cal-weather-title-text">{weekStart.format("D.MM")} – {weekEnd.format("D.MM")}</span>
        <button class="cal-weather-nav" on:click={() => shiftWeatherWeek(1)} aria-label={$t("calendar.weatherNextWeek")}>›</button>
      </div>
      {#if weekWeather.length > 0}
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
      {:else}
        <div class="cal-weather-empty">{$t("calendar.weatherNoData")}</div>
      {/if}
      {#if getWeatherAttribution($settings.weatherProvider)}
        <div class="cal-weather-attr" title={getWeatherAttribution($settings.weatherProvider)}>{getWeatherAttribution($settings.weatherProvider)}</div>
      {/if}
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    padding: 0 4px;
  }

  .cal-weather-title-text {
    flex: 1;
    text-align: center;
  }

  .cal-weather-nav {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 16px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
  }

  .cal-weather-nav:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
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
    border: 1.5px solid var(--interactive-accent);
    color: var(--text-normal);
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

  .cal-weather-attr {
    font-size: 9px;
    color: var(--text-faint);
    text-align: right;
    padding-top: 2px;
    opacity: 0.6;
  }

  .cal-weather-empty {
    font-size: 11px;
    color: var(--text-faint);
    text-align: center;
    padding: 6px 0;
    opacity: 0.7;
  }
</style>
