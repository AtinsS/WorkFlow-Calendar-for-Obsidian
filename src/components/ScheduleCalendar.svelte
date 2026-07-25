<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { Calendar } from "@fullcalendar/core";
  import dayGridPlugin from "@fullcalendar/daygrid";
  import timeGridPlugin from "@fullcalendar/timegrid";
  import interactionPlugin from "@fullcalendar/interaction";

  import type CalendarPlugin from "../main";
  import type { ITask } from "../task-tracker/types";
  import {
    tasks,
    projects,
    updateTask,
    updateTaskStatus,
    removeTask,
    addTask,
    resetTaskTimer,
  } from "../task-tracker/stores";
  import { createNoteTask, deleteNoteTask, shouldSyncTaskToNote, syncTaskToNote } from "../task-tracker/noteTasks";
  import { TaskModal } from "../task-tracker/TaskModal";
  import { getDateUID } from "obsidian-daily-notes-interface";
  import {
    tasksToEvents,
  } from "./scheduleUtils";
  import { fetchWeekWeather, type DayWeather } from "../services/weatherService";
  import { app } from "../stores/appStore";
  // holidays —暂时隐藏
  export let plugin: CalendarPlugin;
  export let scheduleDisplay: {
    scheduleShowTime?: boolean;
    scheduleShowStatus?: boolean;
    scheduleShowPriority?: boolean;
    scheduleShowWorkBadge?: boolean;
    scheduleShowNoteBadge?: boolean;
    scheduleShowDeadline?: boolean;
    scheduleShowOverdue?: boolean;
    scheduleShowDescription?: boolean;
    scheduleShowNowIndicator?: boolean;
    scheduleShowDeadlineEvents?: boolean;
  } = {};
  export let weatherEnabled: boolean = false;
  export let weatherLatitude: number = 55.75;
  export let weatherLongitude: number = 37.62;

  let calendarEl: HTMLDivElement;
  let calendar: Calendar;
  let refetchTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  let skipNextRefetch = false;
  let isDragging = false;

  // Weather state
  let weatherByDate: Map<string, DayWeather> = new Map();
  let weatherLoading = false;

  // Accessibility: live region for announcing view changes
  let ariaLiveEl: HTMLDivElement | null = null;

  function announceView(text: string) {
    if (!ariaLiveEl) {
      ariaLiveEl = document.createElement("div");
      ariaLiveEl.setAttribute("role", "status");
      ariaLiveEl.setAttribute("aria-live", "polite");
      ariaLiveEl.setAttribute("aria-atomic", "true");
      ariaLiveEl.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";
      document.body.appendChild(ariaLiveEl);
    }
    ariaLiveEl.textContent = text;
  }

  // Мобильное определение — реактивное через matchMedia
  const mqlMobile = typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)") : null;
  const mqlSmallPhone = typeof window !== "undefined" ? window.matchMedia("(max-width: 480px)") : null;
  let isMobile = mqlMobile?.matches ?? false;
  let isSmallPhone = mqlSmallPhone?.matches ?? false;

  function handleBreakpointChange(): void {
    isMobile = mqlMobile?.matches ?? false;
    isSmallPhone = mqlSmallPhone?.matches ?? false;
  }

  // Touch/swipe state (reference: SWIPE_MIN_DISTANCE=60, SWIPE_DIRECTION_RATIO=1.2)
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  let isSwiping = false;
  const SWIPE_THRESHOLD = 60;
  const SWIPE_DIRECTION_RATIO = 1.2;

  /** Debounced refetch — предотвращает каскадное обновление */
  function scheduleRefetch(): void {
    if (destroyed) return;
    if (isDragging) return;
    if (skipNextRefetch) { skipNextRefetch = false; return; }
    if (refetchTimer) clearTimeout(refetchTimer);
    refetchTimer = setTimeout(() => {
      refetchTimer = null;
      if (!destroyed && calendar) {
        calendar.refetchEvents();
      }
    }, 150);
  }

  async function loadWeather(startDate: string, endDate: string): Promise<void> {
    if (!weatherEnabled) { console.log("[Weather] loadWeather: disabled"); return; }
    if (destroyed || weatherLoading) { console.log("[Weather] loadWeather: skip (destroyed/loading)"); return; }
    weatherLoading = true;
    console.log("[Weather] loadWeather: fetching", { startDate, endDate, lat: weatherLatitude, lon: weatherLongitude });
    try {
      const days = await fetchWeekWeather(weatherLatitude, weatherLongitude, startDate, endDate);
      console.log("[Weather] loadWeather: got", days.length, "days", days);
      if (destroyed) return;
      const map = new Map<string, DayWeather>();
      for (const d of days) {
        map.set(d.date, d);
      }
      weatherByDate = map;
      console.log("[Weather] loadWeather: weatherByDate updated, map size:", map.size);
      // Force FullCalendar to re-render day headers with weather data
      if (calendar) {
        console.log("[Weather] loadWeather: calling calendar.render()");
        requestAnimationFrame(() => calendar.render());
      }
    } catch (e) {
      console.error("[ScheduleCalendar] weather load error:", e);
    } finally {
      weatherLoading = false;
    }
  }

  // Подписываемся и на tasks, и на projects
  const unsubTasks = tasks.subscribe(() => scheduleRefetch());
  const unsubProjects = projects.subscribe(() => scheduleRefetch());

  // Re-render events when schedule display settings change
  $: if (scheduleDisplay && calendar) {
    scheduleDisplay; // track dependency
    scheduleRefetch();
  }

  // Toggle now-indicator visibility via class
  $: if (calendarEl && scheduleDisplay) {
    const show = scheduleDisplay.scheduleShowNowIndicator !== false;
    calendarEl.classList.toggle("now-indicator-hidden", !show);
  }

  // Обработчик ресайза — переключаем вид при переходе через брейкпоинт
  let lastWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  function handleResize(): void {
    if (destroyed || !calendar) return;
    const w = window.innerWidth;
    const crossed =
      (lastWidth > 480 && w <= 480) ||
      (lastWidth <= 480 && w > 480) ||
      (lastWidth > 768 && w <= 768) ||
      (lastWidth <= 768 && w > 768);
    lastWidth = w;
    if (crossed) {
      // Only auto-switch from time-based views; respect user's month view choice
      const currentType = calendar.view.type;
      if (currentType === "dayGridMonth") return;
      const newView = w <= 480 ? "timeGridDay" : "timeGridWeek";
      if (currentType !== newView) {
        calendar.changeView(newView);
      }
    }
  }

  // ResizeObserver for container size changes (reference pattern)
  let resizeObserver: ResizeObserver | null = null;

  // Event highlighting (reference pattern)
  let currentHighlightIds = new Set<string>();
  let highlightInterval: ReturnType<typeof setInterval> | null = null;

  function updateEventHighlight(): void {
    if (!calendar || destroyed) return;
    const nowMs = Date.now();
    let current: string | null = null;
    let currentEnd = Infinity;
    let next: string | null = null;
    let nextStart = Infinity;

    for (const ev of calendar.getEvents()) {
      if (ev.allDay || !ev.start) continue;
      const s = ev.start.getTime();
      const e = ev.end?.getTime() ?? s;
      if (s <= nowMs && nowMs < e && e < currentEnd) { current = ev.id; currentEnd = e; }
      if (s > nowMs && s < nextStart) { next = ev.id; nextStart = s; }
    }

    const active = current ?? next;
    const nextIds = active ? new Set([active]) : new Set<string>();

    for (const id of currentHighlightIds) {
      if (!nextIds.has(id)) calendarEl?.querySelectorAll(`[data-event-id="${CSS.escape(id)}"]`).forEach(el => el.classList.remove("sch-event-active"));
    }
    for (const id of nextIds) {
      calendarEl?.querySelectorAll(`[data-event-id="${CSS.escape(id)}"]`).forEach(el => el.classList.add("sch-event-active"));
    }
    currentHighlightIds = nextIds;
  }

  function handleKeyNav(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const target = e.target as HTMLElement;
    if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
    e.preventDefault();
    if (e.key === "ArrowLeft") calendar?.prev();
    else calendar?.next();
  }

  function getLocalDateKey(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function handleDeadlineClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const deadlineSpan = target.closest(".sch-deadline[data-deadline-date]") as HTMLElement | null;
    if (!deadlineSpan) return;
    e.stopPropagation();
    const dateStr = deadlineSpan.dataset.deadlineDate;
    if (!dateStr) return;
    // Switch to month view
    if (calendar) {
      calendar.changeView("dayGridMonth");
      const m = window.moment(dateStr, "YYYY-MM-DD");
      calendar.gotoDate(m.toDate());
    }
    // Blink the day cell after navigation
    requestAnimationFrame(() => {
      setTimeout(() => {
        const dayCell = document.querySelector(`#calendar-container .day[data-date="${dateStr}"]`);
        if (dayCell) {
          dayCell.classList.add("deadline-highlight");
          setTimeout(() => dayCell.classList.remove("deadline-highlight"), 5000);
        }
      }, 150);
    });
  }

  onMount(() => {
    initCalendar();
    setupTouchNavigation();
    window.addEventListener("resize", handleResize);
    mqlMobile?.addEventListener("change", handleBreakpointChange);
    mqlSmallPhone?.addEventListener("change", handleBreakpointChange);
    // Keyboard navigation
    calendarEl?.addEventListener("keydown", handleKeyNav);
    if (calendarEl && !calendarEl.hasAttribute("tabindex")) {
      calendarEl.setAttribute("tabindex", "0");
      calendarEl.setAttribute("role", "application");
      calendarEl.setAttribute("aria-label", "Расписание — используйте стрелки для навигации");
    }
    // Delegate deadline click → navigate to month view + blink
    calendarEl?.addEventListener("click", handleDeadlineClick);
    // ResizeObserver
    if (calendarEl) {
      resizeObserver = new ResizeObserver(() => {
        if (!destroyed && calendar) calendar.updateSize();
      });
      resizeObserver.observe(calendarEl);
    }
    // Event highlighting — update every 60s
    highlightInterval = setInterval(updateEventHighlight, 60_000);
    document.addEventListener("visibilitychange", updateEventHighlight);
  });

  onDestroy(() => {
    destroyed = true;
    if (refetchTimer) clearTimeout(refetchTimer);
    if (dropDebounceTimer) clearTimeout(dropDebounceTimer);
    unsubTasks();
    unsubProjects();
    window.removeEventListener("resize", handleResize);
    mqlMobile?.removeEventListener("change", handleBreakpointChange);
    mqlSmallPhone?.removeEventListener("change", handleBreakpointChange);
    calendarEl?.removeEventListener("keydown", handleKeyNav);
    calendarEl?.removeEventListener("click", handleDeadlineClick);
    resizeObserver?.disconnect();
    if (highlightInterval) clearInterval(highlightInterval);
    document.removeEventListener("visibilitychange", updateEventHighlight);
    closeContextMenu();
    if (ariaLiveEl) { ariaLiveEl.remove(); ariaLiveEl = null; }
    if (calendarEl) {
      calendarEl.removeEventListener("touchstart", handleTouchStart);
      calendarEl.removeEventListener("touchmove", handleTouchMove);
      calendarEl.removeEventListener("touchend", handleTouchEnd);
    }
    if (calendar) {
      calendar.destroy();
      calendar = null;
    }
  });

  function setupTouchNavigation(): void {
    if (!calendarEl) return;

    calendarEl.addEventListener("touchstart", handleTouchStart, { passive: true });
    calendarEl.addEventListener("touchmove", handleTouchMove, { passive: true });
    calendarEl.addEventListener("touchend", handleTouchEnd, { passive: true });
  }

  function handleTouchStart(e: TouchEvent): void {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwiping = false;
  }

  function handleTouchMove(e: TouchEvent): void {
    touchEndX = e.touches[0].clientX;
    touchEndY = e.touches[0].clientY;

    const dx = Math.abs(touchEndX - touchStartX);
    const dy = Math.abs(touchEndY - touchStartY);

    if (dx > 20 && dx > dy * SWIPE_DIRECTION_RATIO && dy < 100) {
      isSwiping = true;
    }
  }

  function handleTouchEnd(): void {
    if (!isSwiping || !calendar) return;

    const dx = touchEndX - touchStartX;

    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      if (dx > 0) {
        calendar.prev();
      } else {
        calendar.next();
      }
    }

    isSwiping = false;
  }

  function initCalendar(): void {
    const initialView = isSmallPhone ? "timeGridDay" : "timeGridWeek";
    const headerToolbar = { left: "prev,next", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" };
    const mirrorParent = document.body;

    calendar = new Calendar(calendarEl, {
      plugins: [
        dayGridPlugin,
        timeGridPlugin,
        interactionPlugin,
      ],
      initialView,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: "ru",
      headerToolbar,
      buttonText: { month: "Месяц", week: "Неделя", day: "День" },
      slotMinTime: "06:00:00",
      slotMaxTime: "30:00:00",
      allDaySlot: true,
      allDayText: "Без времени",
      slotDuration: isSmallPhone ? "00:15:00" : "00:30:00",
      snapDuration: isSmallPhone ? "00:15:00" : "00:30:00",
      editable: !isMobile,
      fixedMirrorParent: mirrorParent,
      longPressDelay: 250,
      selectable: true,
      selectAllow: (selectInfo) => !selectInfo.end.getTime || (selectInfo.end.getTime() - selectInfo.start.getTime()) < 86400000 * 7,
      selectMirror: true,
      select: handleCalendarSelect,
      dayMaxEvents: true,
      weekends: true,
      firstDay: 1,
      height: "100%",
      nowIndicator: true,
      scrollTimeReset: false,
      eventTimeFormat: { hour: "numeric", minute: "2-digit", hour12: false },
      slotLabelFormat: { hour: "numeric", minute: "2-digit", hour12: false },
      dayHeaderFormat: { weekday: "short", day: "numeric", month: "numeric" },
      dayHeaderContent: (arg: any) => {
        const dateStr = arg.date
          ? `${arg.date.getFullYear()}-${String(arg.date.getMonth() + 1).padStart(2, "0")}-${String(arg.date.getDate()).padStart(2, "0")}`
          : null;
        const weather = dateStr ? weatherByDate.get(dateStr) : null;
        const headerText = arg.text || "";
        const isToday = dateStr === getLocalDateKey();
        const todayClass = isToday ? " fc-day-header-today" : "";

        if (weather) {
          return {
            html: `
              <div class="fc-day-header-content${todayClass}">
                <div class="fc-day-header-top">
                  <span class="fc-day-header-text">${headerText}</span>
                </div>
                <div class="fc-day-header-weather">
                  <span class="fc-weather-icon">${weather.icon}</span>
                  <span class="fc-weather-temp">${weather.tempMax}°/${weather.tempMin}°</span>
                </div>
              </div>
            `,
          };
        }
        return {
          html: `
            <div class="fc-day-header-content${todayClass}">
              <div class="fc-day-header-top">
                <span class="fc-day-header-text">${headerText}</span>
              </div>
            </div>
          `,
        };
      },
      // На телефоне — list view по умолчанию не используем
      views: isSmallPhone ? {
        timeGridDay: { titleFormat: { day: "numeric", month: "short" }, buttonText: "День" },
        timeGridWeek: { titleFormat: { day: "numeric", month: "short" }, buttonText: "Неделя" },
        dayGridMonth: { titleFormat: { month: "long", year: "numeric" }, buttonText: "Месяц" },
      } : {},
      eventSources: [
        {
          events: fetchEvents,
          id: "task-source",
        },
      ],
      eventContent: renderEventContent,
      eventClick: handleEventClick,
      eventDragStart: () => { isDragging = true; },
      eventDragStop: () => {
        isDragging = false;
        scheduleRefetch();
      },
      eventDrop: handleEventDrop,
      eventResize: handleEventResize,
      eventDidMount: handleEventDidMount,
      eventClassNames: (arg: any) => {
        if (arg.event.extendedProps?.isDeadlineEvent) return ["sch-event-deadline-marker"];
        return [];
      },
      datesSet: (info: any) => {
        const view = info.view;
        const viewType = view.type === "dayGridMonth" ? "Месяц" : view.type === "timeGridWeek" ? "Неделя" : "День";
        announceView(`${viewType}: ${view.title}`);

        // Load weather for the visible date range
        if (weatherEnabled && view.type !== "dayGridMonth") {
          const startStr = info.startStr
            ? info.startStr.slice(0, 10)
            : `${info.start.getFullYear()}-${String(info.start.getMonth() + 1).padStart(2, "0")}-${String(info.start.getDate()).padStart(2, "0")}`;
          const endStr = info.endStr
            ? info.endStr.slice(0, 10)
            : `${info.end.getFullYear()}-${String(info.end.getMonth() + 1).padStart(2, "0")}-${String(info.end.getDate()).padStart(2, "0")}`;
          console.log("[Weather] datesSet:", { startStr, endStr, weatherEnabled, lat: weatherLatitude, lon: weatherLongitude });
          loadWeather(startStr, endStr);
        }
      },
    });

    calendar.render();
  }

  async function fetchEvents(
    fetchInfo: { start: Date; end: Date },
    successCallback: (events: any[]) => void
  ): Promise<void> {
    try {
      const allTasks = get(tasks);
      const allProjects = get(projects);
      let events = tasksToEvents(allTasks, allProjects);
      if (scheduleDisplay.scheduleShowDeadlineEvents === false) {
        events = events.filter((e) => !e.extendedProps?.isDeadlineEvent);
      }

      const appInstance = get(app);
      if (appInstance) {
        const start = fetchInfo.start;
        const end = fetchInfo.end;
      }

      successCallback(events);
    } catch (e) {
      console.error("[ScheduleCalendar] fetchEvents error:", e);
      successCallback([]);
    }
  }

  /** FullCalendar v6 + luxon3 не сохраняет complex objects в extendedProps.
   *  Ищем task по ID из store — это гарантированно работает. */
  function resolveTask(event: any): ITask | null {
    const fromProps = event.extendedProps?.task as ITask | undefined;
    if (fromProps) return fromProps;
    const taskId = event.extendedProps?.taskId || event.id;
    if (!taskId) return null;
    return get(tasks).find((t) => t.id === taskId) || null;
  }

  function renderEventContent(eventInfo: any) {
    const { time, event } = eventInfo;

    const task = resolveTask(event);
    if (!task) {
      return { html: `<div class="sch-event sch-event-compact"><span class="sch-event-title">${event.title || "?"}</span></div>` };
    }
    const isDeadlineEvent = event.extendedProps?.isDeadlineEvent as boolean;

    if (isDeadlineEvent) {
      return {
        html: `
          <div class="sch-event sch-event-compact sch-event-deadline">
            <span class="sch-deadline-icon">&#9200;</span>
            <span class="sch-event-title">${event.title}</span>
          </div>
        `,
      };
    }

    const showTime = scheduleDisplay.scheduleShowTime !== false;
    const showStatus = scheduleDisplay.scheduleShowStatus !== false;
    const showPriority = scheduleDisplay.scheduleShowPriority !== false;
    const showWorkBadge = scheduleDisplay.scheduleShowWorkBadge !== false;
    const showNoteBadge = scheduleDisplay.scheduleShowNoteBadge !== false;
    const showDeadline = scheduleDisplay.scheduleShowDeadline !== false;
    const showOverdue = scheduleDisplay.scheduleShowOverdue !== false;
    const showDescription = scheduleDisplay.scheduleShowDescription !== false;

    const displayTime = showTime ? (time || (task.scheduledTime || "")) : "";
    const statusLabel =
      showStatus ? (
        task.status === "progress" ? "В работе" :
        task.status === "paused" ? "На паузе" :
        task.status === "done" ? "Готово" : ""
      ) : "";
    const statusHtml = statusLabel
      ? `<span class="sch-event-status sch-status-${task.status}" data-action="toggle-status" title="Нажмите для смены статуса">${statusLabel}</span>`
      : "";
    const priorityBadge = showPriority
      ? (task.priority === "high" ? '<span class="sch-priority sch-priority-high">!</span>' :
         task.priority === "medium" ? '<span class="sch-priority sch-priority-mid">~</span>' : "")
      : "";
    const workBadge = (showWorkBadge && task.isWorkTask)
      ? '<span class="sch-work-badge" title="Рабочая задача">&#128188;</span>' : "";
    const noteBadge = (showNoteBadge && task.boundNotePath)
      ? `<span class="sch-note-badge" data-action="open-note" title="Открыть заметку">&#128279;</span>`
      : "";

    let deadlineHtml = "";
    if (showDeadline && task.deadline && task.status !== "done") {
      const match = task.deadline.match(/^day-(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        const [, y, m, d] = match;
        const now = new Date();
        const dl = new Date(`${y}-${m}-${d}T00:00:00`);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffDays = Math.round((dl.getTime() - today.getTime()) / 86400000);
        let dlLabel = "";
        if (diffDays < 0) dlLabel = `${Math.abs(diffDays)}д просрочено`;
        else if (diffDays === 0) dlLabel = "Сегодня";
        else if (diffDays === 1) dlLabel = "Завтра";
        else dlLabel = `${diffDays}д`;
        if (task.deadlineTime) dlLabel += ` ${task.deadlineTime}`;
        const isOverdue = diffDays < 0;
        deadlineHtml = `<span class="sch-deadline sch-deadline-transparent ${isOverdue ? 'sch-deadline-overdue' : ''}" title="Показать в календаре" data-deadline-date="${y}-${m}-${d}" style="cursor:pointer">${dlLabel}</span>`;
      }
    }

    let overdueHtml = "";
    if (showOverdue && task.status === "todo" && task.scheduledTime && task.dateUID) {
      const dateMatch = task.dateUID.match(/^day-(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        const [, dy, dm, dd] = dateMatch;
        const [sh, sm] = task.scheduledTime.split(":").map(Number);
        const scheduledStart = new Date(`${dy}-${dm}-${dd}T${String(sh).padStart(2,"0")}:${String(sm).padStart(2,"0")}:00`);
        const now = new Date();
        if (now.getTime() > scheduledStart.getTime()) {
          const diffMs = now.getTime() - scheduledStart.getTime();
          const diffMin = Math.floor(diffMs / 60000);
          const diffH = Math.floor(diffMin / 60);
          const diffD = Math.floor(diffH / 24);
          let overdueLabel = "";
          if (diffD > 0) overdueLabel = `${diffD}д ${diffH % 24}ч`;
          else if (diffH > 0) overdueLabel = `${diffH}ч ${diffMin % 60}м`;
          else overdueLabel = `${diffMin}м`;
          overdueHtml = `<span class="sch-overdue" title="Просрочено">⚠ ${overdueLabel}</span>`;
        }
      }
    }

    const descriptionHtml = (showDescription && task.description)
      ? `<span class="sch-event-description">${task.description}</span>`
      : "";

    return {
      html: `
        <div class="sch-event sch-event-compact">
          <div class="sch-event-header">
            ${displayTime ? `<span class="sch-event-time${overdueHtml ? ' sch-time-overdue' : ''}">${displayTime}</span>` : ""}
            <span class="sch-event-title">${event.title}</span>
            ${statusHtml}
            ${workBadge}
            ${noteBadge}
            ${priorityBadge}
            ${overdueHtml}
            ${deadlineHtml}
          </div>
          ${descriptionHtml}
        </div>
      `,
    };
  }

  function handleEventDidMount(info: any): void {
    const el = info.el;
    el.setAttribute("data-event-id", info.event.id);
    const task = resolveTask(info.event);
    if (!task) return;
    const projectColor = info.event.extendedProps?.projectColor as string | null;
    const isDeadlineEvent = info.event.extendedProps?.isDeadlineEvent as boolean;

    if (isDeadlineEvent) {
      const deadlineDateStr = info.event.start
        ? `${info.event.start.getFullYear()}-${String(info.event.start.getMonth()+1).padStart(2,"0")}-${String(info.event.start.getDate()).padStart(2,"0")}`
        : "";
      el.setAttribute("title", `Дедлайн задачи: ${task.title}\nДата: ${deadlineDateStr}${task.deadlineTime ? ' ' + task.deadlineTime : ''}\nНажмите, чтобы найти задачу`);
      return;
    }

    if (projectColor) {
      el.style.setProperty("--event-project-color", projectColor);
      el.style.backgroundColor = projectColor;
    }

    // Completed task strikethrough
    if (task.status === "done") {
      el.classList.add("sch-event-done");
    }

    // Tooltip: full title + description + recurrence + estimated time
    const lines: string[] = [];
    lines.push(task.title);
    if (task.description) {
      lines.push(task.description);
    }
    if (task.recurrence) {
      const recMap: Record<string, string> = { daily: "Ежедневно", weekly: "Еженедельно", monthly: "Ежемесячно" };
      let recText = `Повторение: ${recMap[task.recurrence.type] || task.recurrence.type}`;
      if (task.recurrence.until) {
        const untilDate = task.recurrence.until.replace(/^day-/, "");
        recText += ` (до ${untilDate})`;
      }
      lines.push(recText);
    }
    if (task.estimatedTime) {
      const h = Math.floor(task.estimatedTime / 60);
      const m = task.estimatedTime % 60;
      lines.push(`Ожидаемое: ${h > 0 ? h + 'ч ' : ''}${m > 0 ? m + 'м' : ''}`);
    }
    if (lines.length > 0) {
      el.setAttribute("title", lines.join("\n"));
    }

    // Double-click → open task editor
    el.addEventListener("dblclick", (e: MouseEvent) => {
      e.stopPropagation();
      openTaskEditor(task);
    });
  }

  function handleEventClick(info: any): void {
    // Deadline event → blink the parent task in the schedule
    if (info.event.extendedProps?.isDeadlineEvent) {
      const task = resolveTask(info.event);
      if (!task) return;
      // Find the parent task's event element in the calendar and blink it
      requestAnimationFrame(() => {
        setTimeout(() => {
          const taskEl = calendarEl?.querySelector(`[data-event-id="${CSS.escape(task.id)}"]`);
          if (taskEl) {
            taskEl.classList.add("sch-event-blink");
            setTimeout(() => taskEl.classList.remove("sch-event-blink"), 3000);
          }
        }, 50);
      });
      return;
    }
    const task = resolveTask(info.event);
    if (!task) return;

    // If clicked on a sub-element with data-action, handle it directly
    const target = info.jsEvent?.target as HTMLElement;
    if (target) {
      const actionEl = target.closest("[data-action]") as HTMLElement | null;
      if (actionEl) {
        const action = actionEl.dataset.action;
        if (action === "toggle-status") {
          cycleTaskStatus(task);
          info.jsEvent.stopPropagation();
          return;
        }
        if (action === "open-note" && task.boundNotePath) {
          plugin.app.workspace.openLinkText(task.boundNotePath, "", false);
          info.jsEvent.stopPropagation();
          return;
        }
      }
    }

    const menuWidth = 220;
    const menuHeight = 260;
    let x = info.jsEvent?.clientX ?? 0;
    let y = info.jsEvent?.clientY ?? 0;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 8;
    }
    if (x < 8) x = 8;
    if (y + menuHeight > window.innerHeight) {
      y = Math.max(8, y - menuHeight - 4);
    }

    openContextMenu(task, x, y);
  }

  function cycleTaskStatus(task: ITask): void {
    const statusOrder: Array<"todo" | "progress" | "paused" | "done"> = ["todo", "progress", "paused", "done"];
    const currentStatus = task.status === "all" ? "todo" : task.status;
    const currentIdx = statusOrder.indexOf(currentStatus);
    const nextStatus = statusOrder[(currentIdx + 1) % statusOrder.length];
    updateTaskStatus(task.id, nextStatus);
    if (nextStatus === "todo") {
      resetTaskTimer(task.id);
    }
    const updatedTask = get(tasks).find((t) => t.id === task.id);
    if (updatedTask) {
      syncTaskToNote(updatedTask, plugin.app);
    }
    scheduleRefetch();
  }

  function handleCalendarSelect(info: any): void {
    if (!info.start || !calendar) return;

    // Use startStr for reliable timezone handling
    const startStr = info.startStr || "";
    const match = startStr.match(/^(\d{4}-\d{2}-\d{2})T?(\d{2}:\d{2})?/);
    let dateStr: string;
    let initialTime: string | undefined;

    if (match) {
      dateStr = match[1];
      initialTime = match[2] || undefined;
    } else {
      const date = info.start as Date;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      dateStr = `${year}-${month}-${day}`;
      initialTime = undefined;
    }

    const viewType = calendar.view?.type || "";
    const isTimeView = viewType.startsWith("timeGrid");
    const isAllDay = info.allDay === true;

    let estimatedTime: number | undefined;

    if (isTimeView && !isAllDay) {
      if (!initialTime) {
        // Fallback to date parsing
        const date = info.start as Date;
        initialTime = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      }

      if (info.end && info.start.getTime() !== info.end.getTime()) {
        const durationMin = Math.round((info.end.getTime() - info.start.getTime()) / 1000 / 60);
        if (durationMin > 0) {
          estimatedTime = Math.max(15, durationMin);
        }
      }
    }

    calendar.unselect();
    openTaskCreator(dateStr, initialTime, estimatedTime);
  }

  let dropDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function handleEventDrop(info: any): void {
    if (info.event.extendedProps?.isDeadlineEvent) return;
    const task = resolveTask(info.event);
    if (!task) { info.revert(); return; }

    const startStr = info.event.startStr as string;
    if (!startStr) { info.revert(); return; }

    const allDay = info.event.allDay;
    let dateStr: string | null = null;
    let newTime: string | undefined;

    if (allDay) {
      // Dragged to "Без времени" — startStr is just "YYYY-MM-DD"
      const dayMatch = startStr.match(/^(\d{4}-\d{2}-\d{2})$/);
      if (!dayMatch) { info.revert(); return; }
      dateStr = dayMatch[1];
      newTime = undefined;
    } else {
      // Dragged within time grid — startStr is "YYYY-MM-DDTHH:MM..."
      const match = startStr.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
      if (!match) { info.revert(); return; }
      dateStr = match[1];
      newTime = match[2];
    }

    if (!dateStr) { info.revert(); return; }
    const m = window.moment(dateStr, "YYYY-MM-DD", true);
    if (!m.isValid()) { info.revert(); return; }

    const newDateUID = getDateUID(m, "day");

    // Debounce data update — let FullCalendar finish its animation first
    if (dropDebounceTimer) clearTimeout(dropDebounceTimer);
    dropDebounceTimer = setTimeout(() => {
      dropDebounceTimer = null;
      skipNextRefetch = true;
      try {
        updateTask(task.id, {
          dateUID: newDateUID,
          scheduledTime: newTime,
          ...(allDay ? { estimatedTime: undefined } : {}),
        });
        const updatedTask = get(tasks).find((t) => t.id === task.id);
        if (updatedTask) syncTaskToNote(updatedTask, plugin.app);
      } catch (e) { /* ignore */ }
    }, 100);
  }

  function handleEventResize(info: any): void {
    const task = resolveTask(info.event);
    if (!task) { info.revert(); return; }
    const start = info.event.start as Date;
    const end = info.event.end as Date;

    if (start && end) {
      const durationMin = Math.round((end.getTime() - start.getTime()) / 1000 / 60);
      if (dropDebounceTimer) clearTimeout(dropDebounceTimer);
      dropDebounceTimer = setTimeout(() => {
        dropDebounceTimer = null;
        skipNextRefetch = true;
        try {
          updateTask(task.id, { estimatedTime: Math.max(15, durationMin) });
          const updatedTask = get(tasks).find((t) => t.id === task.id);
          if (updatedTask) syncTaskToNote(updatedTask, plugin.app);
        } catch (e) { /* ignore */ }
      }, 100);
    }
  }

  async function openTaskEditor(task: ITask): Promise<void> {
    new TaskModal(plugin.app, async (updates) => {
      updateTask(task.id, updates);
      // Получаем обновлённую задачу
      const updatedTask = get(tasks).find((t) => t.id === task.id);
      if (!updatedTask) return;

      // Если нет Task заметки — создаём
      if (!updatedTask.notePath && shouldSyncTaskToNote(updatedTask)) {
        const project = get(projects).find((p) => p.id === updatedTask.projectId);
        const file = await createNoteTask(updatedTask, project, plugin.app);
        if (file) {
          updateTask(updatedTask.id, { notePath: file.path });
        }
      }

      // Синхронизируем Task заметку
      await syncTaskToNote(updatedTask, plugin.app);
    }, task).open();
  }

  async function deleteNoteFileIfNeeded(task: ITask): Promise<void> {
    if (!shouldSyncTaskToNote(task) || !task.notePath) return;
    await deleteNoteTask(task.notePath, plugin.app);
  }

  async function openTaskCreator(dateStr: string, timeStr?: string, prefillEstimatedTime?: number): Promise<void> {
    const moment = window.moment(dateStr, "YYYY-MM-DD", true);
    if (!moment.isValid()) return;

    const dateUID = getDateUID(moment, "day");

    // Определяем текущий вид: time-based (неделя/день) или месяц
    const viewType = calendar?.view?.type || "";
    const isTimeView = viewType.startsWith("timeGrid");
    const initialDate = dateStr;
    const initialTime = isTimeView ? timeStr : undefined;

    new TaskModal(plugin.app, async (data) => {
      const task = addTask({
        title: data.title || "Новая задача",
        description: data.description,
        completed: false,
        status: "todo",
        dateUID: data.dateUID || dateUID,
        projectId: data.projectId || null,
        notePath: null,
        boundNotePath: data.boundNotePath || null,
        priority: data.priority || "medium",
        tags: [],
        sortOrder: 0,
        recurrence: data.recurrence,
        estimatedTime: data.estimatedTime || prefillEstimatedTime,
        scheduledTime: data.scheduledTime || initialTime,
      });

      // Всегда создаём Task заметку в Tasks/ если включена синхронизация
      if (shouldSyncTaskToNote(task)) {
        const project = get(projects).find((p) => p.id === data.projectId);
        try {
          const file = await createNoteTask(task, project, plugin.app);
          if (file) {
            updateTask(task.id, { notePath: file.path });
          }
        } catch (error) {
          console.error("[ScheduleCalendar] failed to create note task:", error);
        }
      }

      if (!destroyed && calendar) {
        calendar.refetchEvents();
      }
    }, undefined, initialDate, initialTime, prefillEstimatedTime).open();
  }

  // Контекстное меню задачи — рендерим в document.body,
  // чтобы position:fixed работал относительно viewport,
  // а не относительно schedule-view-container с backdrop-filter
  let contextMenuTask: ITask | null = null;
  let contextMenuEl: HTMLDivElement | null = null;

  function openContextMenu(task: ITask, x: number, y: number): void {
    closeContextMenu(); // убираем предыдущее, если есть
    contextMenuTask = task;

    // Создаём DOM-элемент в document.body, минуя backdrop-filter containing block
    const el = document.createElement("div");
    el.className = "sch-context-overlay";
    el.addEventListener("click", closeContextMenu);
    el.addEventListener("keydown", closeContextMenu);

    const menu = document.createElement("div");
    menu.className = "sch-context-menu";
    menu.style.position = "fixed";
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.zIndex = "9999";

    // Кнопки меню
    const items = [
      // Редактирование только для незавершённых задач
      ...(task.status !== "done"
        ? [{ label: "📝 Редактировать", action: () => contextEditTask() }]
        : []),
      // Открыть заметку — только если есть привязанная заметка
      ...(task.boundNotePath
        ? [{ label: "📄 Открыть заметку", action: () => contextOpenNote() }]
        : []),
      // Смена статуса — доступна всегда, включая из "done"
      { label: "Перевести статус:", disabled: true },
      ...(task.status !== "todo"
        ? [{ label: "🟢 Сделать", action: () => contextChangeStatus("todo") }]
        : []),
      ...(task.status !== "progress"
        ? [{ label: "▶️ В работу", action: () => contextChangeStatus("progress") }]
        : []),
      ...(task.status !== "paused"
        ? [{ label: "⏸️ На паузу", action: () => contextChangeStatus("paused") }]
        : []),
      ...(task.status !== "done"
        ? [{ label: "✅ Готово", action: () => contextChangeStatus("done") }]
        : []),
      { divider: true },
      { label: "🗑️ Удалить", action: () => contextDeleteTask(), danger: true },
    ];

    for (const item of items) {
      if ("divider" in item && item.divider) {
        const div = document.createElement("div");
        div.className = "sch-context-divider";
        menu.appendChild(div);
      } else if ("disabled" in item && item.disabled) {
        const lbl = document.createElement("div");
        lbl.className = "sch-context-label";
        lbl.textContent = item.label;
        menu.appendChild(lbl);
      } else if ("action" in item) {
        const btn = document.createElement("button");
        btn.className = "sch-context-item" + ("danger" in item && item.danger ? " sch-context-danger" : "");
        btn.innerHTML = item.label;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          item.action();
        });
        menu.appendChild(btn);
      }
    }

    el.appendChild(menu);
    document.body.appendChild(el);
    contextMenuEl = el;

    // Границы viewport — сдвигаем меню, если не помещается
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
      }
    });
  }

  function closeContextMenu(): void {
    if (contextMenuEl) {
      contextMenuEl.remove();
      contextMenuEl = null;
    }
    contextMenuTask = null;
  }

  function contextEditTask(): void {
    if (contextMenuTask) {
      openTaskEditor(contextMenuTask);
    }
    closeContextMenu();
  }

  async function contextOpenNote(): Promise<void> {
    if (!contextMenuTask?.boundNotePath) return;
    try {
      plugin.app.workspace.openLinkText(contextMenuTask.boundNotePath, "", false);
    } catch (error) {
      console.error("[ScheduleCalendar] failed to open note:", error);
    }
    closeContextMenu();
  }

  function contextChangeStatus(newStatus: "todo" | "progress" | "done" | "paused"): void {
    if (contextMenuTask) {
      updateTaskStatus(contextMenuTask.id, newStatus);
      if (newStatus === "todo") {
        resetTaskTimer(contextMenuTask.id);
      }
      // Синхронизируем заметку
      const updatedTask = get(tasks).find((t) => t.id === contextMenuTask!.id);
      if (updatedTask) {
        syncTaskToNote(updatedTask, plugin.app);
      }
    }
    closeContextMenu();
  }

  async function contextDeleteTask(): Promise<void> {
    if (contextMenuTask) {
      await deleteNoteFileIfNeeded(contextMenuTask);
      removeTask(contextMenuTask.id);
    }
    closeContextMenu();
  }

  export function refresh(): void {
    scheduleRefetch();
  }
</script>

<div class="schedule-calendar-wrapper">
  {#if isSwiping}
    <div class="swipe-indicator" class:swipe-left={touchEndX < touchStartX} class:swipe-right={touchEndX > touchStartX}>
      <span class="swipe-arrow">{touchEndX < touchStartX ? '&#8250;' : '&#8249;'}</span>
    </div>
  {/if}
  <div bind:this={calendarEl} class="schedule-calendar"></div>

  <!-- Контекстное меню теперь рендерится в document.body через DOM API,
       чтобы position:fixed работал корректно (backdrop-filter на
       schedule-view-container создаёт containing block) -->
</div>

<style>
  .schedule-calendar-wrapper {
    flex: 1;
    height: 100%;
    width: 100%;
    position: relative;
    overflow: hidden;
  }

  .schedule-calendar {
    height: 100%;
    width: 100%;
    touch-action: pan-y pinch-zoom;
  }

  .swipe-indicator {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 100;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
    animation: swipeHint 0.3s ease;
  }

  .swipe-indicator.swipe-left {
    right: 8px;
  }

  .swipe-indicator.swipe-right {
    left: 8px;
  }

  .swipe-arrow {
    font-size: 24px;
    color: var(--mcp-accent);
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  @keyframes swipeHint {
    0% { opacity: 0; transform: translateY(-50%) scale(0.8); }
    50% { opacity: 0.8; }
    100% { opacity: 0; transform: translateY(-50%) scale(1); }
  }

  /* Контекстное меню задачи — global, т.к. рендерится в document.body */
  :global(.sch-context-overlay) {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: transparent;
  }

  :global(.sch-context-menu) {
    position: fixed;
    z-index: 9999;
    min-width: 200px;
    background: var(--background-primary, #1e1e2e);
    border: 1px solid var(--background-modifier-border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    padding: 4px;
    font-family: var(--font-interface);
    font-size: 13px;
  }

  :global(.sch-context-item) {
    display: block;
    width: 100%;
    padding: 7px 12px;
    border: none;
    background: transparent;
    color: var(--text-normal, #e8ecf0);
    text-align: left;
    cursor: pointer;
    border-radius: 5px;
    transition: background 0.15s;
    font-family: var(--font-interface);
    font-size: 13px;
  }

  :global(.sch-context-item:hover) {
    background: var(--background-modifier-hover, rgba(255, 255, 255, 0.06));
  }

  :global(.sch-context-divider) {
    height: 1px;
    background: var(--background-modifier-border, rgba(255, 255, 255, 0.06));
    margin: 3px 8px;
  }

  :global(.sch-context-label) {
    padding: 4px 12px 2px;
    font-size: 11px;
    color: var(--text-faint, rgba(200, 210, 220, 0.4));
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  :global(.sch-context-danger) {
    color: var(--text-error, #ef4444);
  }

  :global(.sch-context-danger:hover) {
    background: rgba(239, 68, 68, 0.12);
  }

  /* ===== FullCalendar — Glassmorphism тема ===== */

  :global(.fc) {
    height: 100%;
    font-family: var(--font-interface);
    /* Obsidian theme variable mapping (reference pattern) */
    --fc-button-text-color: var(--text-normal);
    --fc-button-bg-color: var(--interactive-normal, rgba(255,255,255,0.05));
    --fc-button-border-color: var(--interactive-normal, rgba(255,255,255,0.08));
    --fc-button-hover-bg-color: var(--interactive-hover, rgba(255,255,255,0.10));
    --fc-button-hover-border-color: var(--interactive-hover, rgba(255,255,255,0.14));
    --fc-button-active-bg-color: var(--interactive-accent, rgba(95,153,225,0.5));
    --fc-button-active-border-color: var(--interactive-accent, rgba(95,153,225,0.5));
    --fc-event-text-color: var(--text-on-accent, #fff);
    --fc-border-color: var(--background-modifier-border, rgba(255,255,255,0.06));
    --fc-today-bg-color: transparent;
    --fc-page-bg-color: transparent;
    --fc-neutral-bg-color: rgba(255,255,255,0.03);
    --fc-list-event-hover-bg-color: var(--background-secondary, rgba(255,255,255,0.04));
    --fc-now-indicator-color: var(--text-error, #ef4444);
    --fc-highlight-color: var(--text-highlight-bg, rgba(95,153,225,0.08));
  }

  /* Контейнер расписания — стеклянная панель */
  :global(.schedule-view-container) {
    height: 100%;
    overflow: hidden;
    background: var(--mcp-glass-bg, rgba(35, 40, 55, 0.4));
    backdrop-filter: var(--mcp-blur, blur(20px));
    -webkit-backdrop-filter: var(--mcp-blur, blur(20px));
    border: 1px solid var(--mcp-glass-border, rgba(255, 255, 255, 0.06));
    border-radius: var(--mcp-radius, 14px);
    box-shadow: var(--mcp-shadow, 0 8px 32px rgba(0, 0, 0, 0.15)),
                var(--mcp-shadow-glow, 0 0 40px rgba(80, 170, 210, 0.06));
  }

  /* Тулбар — стекло */
  :global(.fc .fc-toolbar) {
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: var(--mcp-radius-sm, 10px);
    margin: 8px 8px 0;
  }

  :global(.fc .fc-toolbar-title) {
    color: var(--mcp-text, var(--text-normal));
    font-size: 1.15em;
    font-weight: 600;
  }

  :global(.fc .fc-button) {
    background: rgba(255, 255, 255, 0.05);
    color: var(--mcp-text, var(--text-normal));
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--mcp-radius-sm, 10px);
    font-size: 0.82em;
    padding: 5px 14px;
    transition: all var(--mcp-transition, 0.3s cubic-bezier(0.4, 0, 0.2, 1));
    font-weight: 500;
  }

  :global(.fc .fc-button:hover) {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.12);
  }

  :global(.fc .fc-button-active) {
    background: var(--mcp-accent) !important;
    color: var(--mcp-text, var(--text-normal)) !important;
    border-color: var(--mcp-accent-faint) !important;
    box-shadow: 0 0 12px var(--mcp-accent-faint);
  }

  :global(.fc .fc-button:disabled) {
    background: rgba(255, 255, 255, 0.02);
    color: var(--mcp-text-faint, rgba(200, 210, 220, 0.25));
    border-color: transparent;
  }

  /* Сетка — полупрозрачные линии */
  :global(.fc .fc-scrollgrid) {
    border-color: rgba(255, 255, 255, 0.04);
  }

  :global(.fc td),
  :global(.fc th) {
    border-color: rgba(255, 255, 255, 0.04);
  }

  :global(.fc .fc-col-header-cell) {
    background: rgba(255, 255, 255, 0.02);
  }

  :global(.fc .fc-col-header-cell-cushion) {
    color: var(--mcp-text-muted, var(--text-muted));
    padding: 8px 0;
    font-weight: 500;
    font-size: 0.85em;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* Weather in day headers */
  :global(.fc .fc-day-header-content) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    border-radius: 8px;
  }

  :global(.fc .fc-day-header-content.fc-day-header-today) {
    background: var(--mcp-accent, rgba(95, 153, 225, 0.55));
    color: #fff;
  }

  :global(.fc .fc-day-header-top) {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  :global(.fc .fc-day-header-text) {
    font-size: 0.85em;
    font-weight: 600;
    text-transform: capitalize;
  }


  :global(.fc .fc-day-header-weather) {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.78em;
    font-weight: 400;
    opacity: 0.85;
  }

  :global(.fc .fc-day-header-content.fc-day-header-today .fc-day-header-weather) {
    opacity: 1;
  }

  :global(.fc .fc-weather-icon) {
    font-size: 1em;
    line-height: 1;
  }

  :global(.fc .fc-weather-temp) {
    font-size: 0.9em;
    color: var(--mcp-text, var(--text-normal));
    white-space: nowrap;
  }

  :global(.fc .fc-day-header-content.fc-day-header-today .fc-weather-temp) {
    color: #fff;
  }

  :global(.fc .fc-timegrid-axis-cushion),
  :global(.fc .fc-timegrid-slot-label-cushion) {
    color: var(--mcp-text-faint, var(--text-faint));
    font-size: 11px;
    font-weight: 500;
  }

  /* Не переопределяем height слотов — FullCalendar рассчитывает
     позиции highlight/drag/snap на основе slotDuration,
     а CSS height создаёт рассинхрон */

  :global(.fc .fc-daygrid-day-number) {
    color: var(--mcp-text, var(--text-normal));
    padding: 4px 8px;
    font-size: 0.85em;
  }

  /* Сегодня — в month view */

  :global(.fc .fc-timegrid .fc-day-today) {
    background: rgba(95, 153, 225, 0.06) !important;
  }

  /* Только колонки в timegrid body, не header/all-day slot */
  :global(.fc .fc-timegrid-body .fc-timegrid-col.fc-day-today) {
    border-left: 2px solid var(--mcp-accent) !important;
    border-right: 2px solid var(--mcp-accent) !important;
    position: relative;
    z-index: 1;
  }

  /* Верхняя/нижняя рамка today — через pseudo-элементы на колонке */
  :global(.fc .fc-timegrid-body .fc-timegrid-col.fc-day-today::before),
  :global(.fc .fc-timegrid-body .fc-timegrid-col.fc-day-today::after) {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--mcp-accent);
    z-index: 2;
  }

  :global(.fc .fc-timegrid-body .fc-timegrid-col.fc-day-today::before) {
    top: 0;
  }

  :global(.fc .fc-timegrid-body .fc-timegrid-col.fc-day-today::after) {
    bottom: 0;
  }

  /* Заголовок today — выделяем рамкой */
  :global(.fc .fc-col-header-cell.fc-day-today) {
    border-left: 2px solid var(--mcp-accent) !important;
    border-right: 2px solid var(--mcp-accent) !important;
    border-top: 2px solid var(--mcp-accent) !important;
    position: relative;
    z-index: 1;
  }

  :global(.fc .fc-col-header-cell.fc-day-today::after) {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    background: var(--mcp-accent);
    z-index: 2;
  }

  /* Сегодня в day header — уже стилизован через fc-day-header-today */

  /* Now indicator */
  :global(.fc .fc-timegrid-now-indicator-line) {
    border-color: var(--mcp-accent);
    z-index: 10;
    visibility: visible !important;
    opacity: 1 !important;
  }

  :global(.now-indicator-hidden .fc .fc-timegrid-now-indicator-line),
  :global(.now-indicator-hidden .fc .fc-timegrid-now-indicator-arrow),
  :global(.now-indicator-hidden .fc .fc-timegrid-now-indicator-container),
  :global(.now-indicator-hidden .fc .fc-timegrid-now-indicator-now) {
    display: none !important;
  }

  :global(.fc .fc-timegrid-now-indicator-arrow) {
    border-color: var(--mcp-accent);
    z-index: 11;
    position: relative;
    visibility: visible !important;
    opacity: 1 !important;
    display: block !important;
  }

  :global(.fc .fc-timegrid-now-indicator-container) {
    overflow: visible;
  }

  :global(.fc .fc-timegrid-now-indicator-now) {
    color: var(--mcp-accent);
    font-weight: 600;
    font-size: 10px;
    z-index: 11;
  }

  /* Выделение */
  :global(.fc .fc-highlight) {
    background: var(--mcp-accent-ultra-dim);
    border-radius: 4px;
  }

  /* Hover на слотах времени */
  :global(.fc .fc-timegrid-slot) {
    transition: background-color 0.15s ease;
  }

  :global(.fc .fc-timegrid-slot:hover) {
    background: var(--mcp-accent-ultra-dim);
  }

  :global(.fc .fc-timegrid-slot-lane:hover) {
    background: var(--mcp-accent-ultra-dim);
  }

  :global(.fc .fc-daygrid-day:hover) {
    background: var(--mcp-accent-ultra-dim);
  }

  :global(.fc .fc-daygrid-more-link) {
    color: var(--mcp-text-muted, var(--text-muted));
    font-size: 11px;
  }

  /* ===== Glassmorphism события ===== */

  :global(.fc .fc-event) {
    cursor: pointer;
    border: none !important;
    border-radius: 8px !important;
    transition: background-color 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
    box-shadow: inset 3px 0 0 var(--event-project-color, rgba(120, 145, 175, 1)), 0 2px 8px rgba(0, 0, 0, 0.12);
  }

  :global(.fc .fc-event:has(.sch-event)) {
    background-color: var(--event-project-color, rgba(110, 130, 160, 0.8)) !important;
    box-shadow: inset 3px 0 0 var(--event-project-color, rgba(120, 145, 175, 1)), 0 2px 8px rgba(0, 0, 0, 0.12) !important;
  }

  :global(.fc .fc-event:has(.sch-event-compact)) {
    background-color: var(--event-project-color, rgba(110, 130, 160, 0.8)) !important;
    box-shadow: inset 3px 0 0 var(--event-project-color, rgba(120, 145, 175, 1)), 0 2px 8px rgba(0, 0, 0, 0.12) !important;
  }

  :global(.sch-event) {
    padding: 4px 8px;
    line-height: 1.35;
    min-width: 0;
  }

  :global(.fc .fc-timegrid-event) {
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    pointer-events: auto;
    cursor: pointer;
  }

  /* Pass clicks through overlay harnesses to actual event elements */
  :global(.fc .fc-timegrid-event-harness) {
    pointer-events: none;
  }

  :global(.fc .fc-timegrid-event-harness-inset) {
    pointer-events: none;
  }

  :global(.fc .fc-event:hover) {
    transform: scale(1.01);
    box-shadow: inset 3px 0 0 var(--event-project-color, rgba(120, 145, 175, 1)), 0 4px 16px rgba(0, 0, 0, 0.25);
    filter: brightness(1.15);
  }

  /* Active/current event highlight — multi-layered glow (reference pattern) */
  :global(.fc .fc-event.sch-event-active) {
    box-shadow: 0 0 0 2px rgba(255,255,255,0.85),
      0 0 24px 8px var(--mcp-accent-faint),
      0 0 56px 24px var(--mcp-accent-dim);
    outline: none;
    overflow: visible;
    isolation: isolate;
    z-index: 3;
    filter: none;
  }
  :global(.fc .fc-timegrid-event.sch-event-active) {
    box-shadow: inset 3px 0 0 var(--event-project-color, rgba(120,145,175,1)),
      0 0 0 2px rgba(255,255,255,0.85),
      0 0 24px 8px var(--mcp-accent-faint);
  }
  :global(.fc .fc-daygrid-event.sch-event-active) {
    background: var(--mcp-accent-dim) !important;
    border: 1px solid var(--mcp-accent) !important;
  }

  :global(.fc .fc-event.fc-dragging),
  :global(.fc .fc-event-event-dragging),
  :global(.fc .fc-event-mirror) {
    transition: none !important;
    will-change: auto;
    opacity: 0.9;
    z-index: 9999;
    box-shadow: none !important;
    filter: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  :global(.fc .fc-event-main) {
    border-radius: 8px;
    overflow: hidden;
  }

  :global(.sch-event-compact) {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 4px 8px;
    line-height: 1.35;
    min-width: 0;
    overflow: hidden;
  }

  :global(.sch-event-compact .sch-event-header) {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  :global(.sch-event-compact .sch-event-time) {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    flex-shrink: 0;
  }

  :global(.sch-event-compact .sch-event-title) {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #fff;
    min-width: 0;
  }

  :global(.sch-event-compact .sch-event-description) {
    font-size: 10px;
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: rgba(255, 255, 255, 0.7);
    display: block;
    line-height: 1.2;
    margin-top: 1px;
  }

  :global(.sch-recurrence) {
    font-size: 11px;
    flex-shrink: 0;
    opacity: 0.85;
  }

  :global(.sch-deadline) {
    font-size: 9px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(251, 191, 36, 0.3);
    color: rgba(255, 230, 150, 0.95);
    flex-shrink: 0;
    white-space: nowrap;
    transition: background 0.15s ease, transform 0.15s ease;
  }

  :global(.sch-deadline:hover) {
    background: rgba(251, 191, 36, 0.5);
    transform: scale(1.05);
  }

  :global(.sch-deadline-transparent) {
    background: transparent !important;
    color: rgba(255, 230, 150, 0.4) !important;
    border: 1px dashed rgba(251, 191, 36, 0.25) !important;
    font-weight: 400;
  }

  :global(.sch-deadline-overdue) {
    background: rgba(220, 100, 100, 0.4);
    color: rgba(255, 180, 180, 0.95);
  }

  :global(.sch-event-deadline-marker),
  :global(.fc .fc-event.sch-event-deadline-marker),
  :global(.fc .fc-daygrid-event.sch-event-deadline-marker),
  :global(.fc .fc-timegrid-event.sch-event-deadline-marker) {
    background: rgba(180, 60, 60, 0.35) !important;
    border-color: rgba(220, 100, 100, 0.6) !important;
    border-left: 3px solid rgba(220, 100, 100, 0.8) !important;
    box-shadow: none !important;
    cursor: pointer !important;
  }

  :global(.sch-event-deadline-marker .fc-event-main),
  :global(.sch-event-deadline-marker .fc-event-main-frame),
  :global(.sch-event-deadline-marker .fc-event-bg),
  :global(.sch-event-deadline-marker .fc-daygrid-event-dot) {
    background: transparent !important;
    border-color: transparent !important;
  }

  :global(.fc .fc-list-event.sch-event-deadline-marker td) {
    background: rgba(180, 60, 60, 0.2) !important;
  }

  :global(.sch-event-blink) {
    animation: sch-blink 0.5s ease-in-out 5;
  }

  @keyframes sch-blink {
    0%, 100% { opacity: 1; box-shadow: none; }
    50% { opacity: 0.5; box-shadow: 0 0 12px 2px rgba(251, 191, 36, 0.6); }
  }

  :global(.sch-overdue) {
    font-size: 9px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(220, 80, 80, 0.35);
    color: rgba(255, 160, 160, 0.95);
    flex-shrink: 0;
    white-space: nowrap;
  }

  :global(.sch-time-overdue) {
    color: rgba(255, 130, 130, 0.95) !important;
  }

  :global(.sch-event-deadline) {
    opacity: 0.9;
  }

  :global(.sch-event-deadline .sch-event-title) {
    color: #fff;
    font-style: italic;
  }

  :global(.sch-deadline-icon) {
    font-size: 11px;
    flex-shrink: 0;
  }

  /* ===== Кастомный контент события ===== */

  :global(.sch-event) {
    padding: 4px 8px;
    line-height: 1.35;
    min-width: 0;
  }

  :global(.sch-event-header) {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  :global(.sch-event-title) {
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--mcp-text, var(--text-normal));
  }

  :global(.sch-priority) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 700;
    flex-shrink: 0;
    transition: transform 0.15s ease;
  }

  :global(.sch-priority:hover) {
    transform: scale(1.15);
  }

  :global(.sch-priority-high) {
    background: rgba(220, 150, 150, 0.35);
    color: rgba(240, 170, 170, 0.95);
  }

  :global(.sch-priority-mid) {
    background: rgba(220, 190, 130, 0.25);
    color: rgba(230, 210, 150, 0.85);
  }

  :global(.sch-note-icon) {
    font-size: 10px;
    opacity: 0.6;
    flex-shrink: 0;
  }

  :global(.sch-event-meta) {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 1px;
    flex-wrap: wrap;
  }

  :global(.sch-event-time) {
    font-size: 10px;
    color: var(--mcp-text-muted, rgba(200, 210, 220, 0.5));
    font-weight: 500;
  }

  :global(.sch-event-status) {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 4px;
    font-weight: 500;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: filter 0.15s ease, transform 0.15s ease;
  }

  :global(.sch-event-status:hover) {
    filter: brightness(1.3);
    transform: scale(1.05);
  }

  :global(.sch-event-status:active) {
    transform: scale(0.95);
  }

  :global(.sch-status-todo) {
    background: rgba(140, 160, 190, 0.15);
    color: rgba(180, 195, 215, 0.8);
  }

  :global(.sch-status-progress) {
    background: rgba(214, 178, 108, 0.15);
    color: rgba(225, 195, 130, 0.85);
  }

  :global(.sch-status-done) {
    background: rgba(110, 190, 160, 0.12);
    color: rgba(140, 205, 175, 0.75);
  }

  /* Task completed strikethrough (reference pattern) */
  :global(.fc .fc-event.sch-event-done .fc-event-title) {
    background-image: linear-gradient(currentColor, currentColor);
    background-position: 0 50%;
    background-repeat: no-repeat;
    background-size: 100% 1px;
    opacity: 0.6;
  }
  :global(.fc .fc-list-event.sch-event-done .fc-list-event-title a) {
    text-decoration: none;
    background-image: linear-gradient(currentColor, currentColor);
    background-position: 0 50%;
    background-repeat: no-repeat;
    background-size: 100% 1px;
    opacity: 0.6;
  }

  :global(.sch-status-paused) {
    background: rgba(180, 150, 100, 0.15);
    color: rgba(200, 170, 110, 0.85);
  }

  :global(.sch-duration) {
    font-size: 9px;
    color: var(--mcp-text-faint, rgba(200, 210, 220, 0.25));
  }

  :global(.sch-work-badge) {
    font-size: 10px;
    opacity: 0.8;
    flex-shrink: 0;
    transition: opacity 0.15s ease;
  }

  :global(.sch-work-badge:hover) {
    opacity: 1;
  }

  :global(.sch-note-badge) {
    font-size: 10px;
    opacity: 0.85;
    flex-shrink: 0;
    cursor: pointer;
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  :global(.sch-note-badge:hover) {
    opacity: 1;
    transform: scale(1.2);
  }

  :global(.sch-note-badge:active) {
    transform: scale(0.9);
  }

  /* ===== List view ===== */

  :global(.fc .fc-list-event:hover td) {
    background-color: rgba(255, 255, 255, 0.03);
  }

  :global(.fc .fc-list-event-title a) {
    color: var(--mcp-text, var(--text-normal));
  }

  :global(.fc .fc-list-event-time a) {
    color: var(--mcp-text-muted, var(--text-muted));
  }

  /* ===== Header / day cells ===== */

  :global(.fc .fc-day-header) {
    background: rgba(255, 255, 255, 0.02);
  }

  :global(.fc .fc-timegrid-header) {
    border-bottom-color: rgba(255, 255, 255, 0.04);
  }

  /* ===== Мобильная адаптация — планшет (≤768px) ===== */
  @media (max-width: 768px) {
    /* Контейнер — убираем скругления и тени на мобилке */
    :global(.schedule-view-container) {
      border-radius: 0;
      border: none;
      box-shadow: none;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      background: transparent;
    }

    /* Тулбар — двухстрочный, компактный */
    :global(.fc .fc-toolbar) {
      flex-wrap: wrap;
      gap: 4px;
      padding: 6px 8px;
      margin: 4px 4px 0;
    }

    :global(.fc .fc-toolbar-title) {
      font-size: 13px;
      order: -1;
      width: 100%;
      text-align: center;
      margin-bottom: 2px;
      font-weight: 700;
    }

    :global(.fc .fc-toolbar-chunk) {
      display: flex;
      gap: 4px;
      min-height: 36px;
    }

    :global(.fc .fc-toolbar-chunk:last-child) {
      margin-left: auto;
    }

    :global(.fc .fc-button) {
      font-size: 11px;
      padding: 6px 10px;
      min-height: 36px;
      min-width: 40px;
      border-radius: 8px;
    }

    :global(.fc .fc-col-header-cell-cushion) {
      font-size: 10.5px;
      padding: 6px 0;
      text-transform: none;
      letter-spacing: 0;
    }

    :global(.fc .fc-timegrid-slot-label-cushion) {
      font-size: 9.5px;
    }

    /* Боковая ось — шире */
    :global(.fc .fc-timegrid-axis) {
      width: 34px;
    }

    /* События — компактнее */
    :global(.sch-event) {
      padding: 3px 6px;
    }

    :global(.sch-event-title) {
      font-size: 11px;
    }

    :global(.sch-event-meta) {
      gap: 4px;
    }

    :global(.sch-event-status) {
      font-size: 8.5px;
      padding: 1px 4px;
    }

    :global(.sch-priority) {
      width: 13px;
      height: 13px;
      font-size: 8.5px;
    }

    /* Touch scroll */
    :global(.fc .fc-scrollgrid) {
      -webkit-overflow-scrolling: touch;
    }

    :global(.fc .fc-timegrid-body) {
      min-height: 400px;
    }
  }

  /* ===== Телефон (≤480px) ===== */
  @media (max-width: 480px) {
    :global(.fc .fc-toolbar) {
      padding: 4px 6px;
      margin: 2px 2px 0;
      gap: 3px;
      flex-wrap: wrap;
    }

    :global(.fc .fc-toolbar-title) {
      font-size: 11px;
    }

    :global(.fc .fc-button) {
      font-size: 10px;
      padding: 6px 8px;
      min-height: 32px;
      min-width: 36px;
      border-radius: 7px;
    }

    :global(.fc .fc-toolbar-chunk:last-child) {
      flex-wrap: wrap;
      gap: 2px;
    }

    :global(.fc .fc-button-active) {
      box-shadow: 0 0 8px var(--mcp-accent-dim);
    }

    /* Заголовки дней — компактные */
    :global(.fc .fc-col-header-cell-cushion) {
      font-size: 9.5px;
      padding: 5px 0;
    }

    :global(.fc .fc-daygrid-day-number) {
      font-size: 11px;
      padding: 3px 5px;
    }

    /* Сетка времени — FullCalendar сам управляет высотой слотов */

    :global(.fc .fc-timegrid-axis-cushion),
    :global(.fc .fc-timegrid-slot-label-cushion) {
      font-size: 10px;
      padding-right: 2px;
    }

    /* Боковая ось — шире для читаемости */
    :global(.fc .fc-timegrid-axis) {
      width: 36px;
    }

    /* События — крупные тап-таргеты, читаемый контент */
    :global(.fc .fc-event) {
      border-radius: 6px !important;
      min-height: 32px;
    }

    :global(.sch-event) {
      padding: 2px 5px;
      line-height: 1.3;
    }

    :global(.sch-event-header) {
      gap: 3px;
    }

    :global(.sch-event-title) {
      font-size: 11px;
      font-weight: 600;
    }

    :global(.sch-event-meta) {
      gap: 3px;
      margin-top: 0;
    }

    :global(.sch-event-time) {
      font-size: 9px;
    }

    /* Скрываем статус и приоритет на телефоне — избыточно */
    :global(.sch-event-status) {
      display: none;
    }

    :global(.sch-priority) {
      width: 12px;
      height: 12px;
      font-size: 8px;
      border-radius: 3px;
    }

    :global(.sch-note-icon) {
      font-size: 9px;
    }

    :global(.sch-note-badge) {
      font-size: 9px;
    }

    :global(.sch-overdue) {
      font-size: 8px;
      padding: 1px 4px;
    }

    :global(.sch-duration) {
      font-size: 8px;
    }

    :global(.fc .fc-timegrid-event .sch-event) {
      padding: 2px 5px;
    }

    /* Now indicator — заметнее */
    :global(.fc .fc-timegrid-now-indicator-line) {
      border-width: 2px;
    }

    :global(.fc .fc-timegrid-now-indicator-arrow) {
      border-width: 2px;
    }

    :global(.fc .fc-timegrid-now-indicator-now) {
      display: none;
    }

    /* Выделение при тапе */
    :global(.fc .fc-highlight) {
      background: var(--mcp-accent-dim);
      border-radius: 4px;
    }

    /* Day grid — крупные ячейки */
    :global(.fc .fc-daygrid-day) {
      min-height: 48px;
    }

    :global(.fc .fc-daygrid-more-link) {
      font-size: 10px;
      padding: 2px 4px;
    }

    /* List view */
    :global(.fc .fc-list-event-title a) {
      font-size: 12px;
    }

    :global(.fc .fc-list-event-time a) {
      font-size: 10.5px;
    }

    :global(.fc .fc-list-day-cushion) {
      padding: 4px 8px;
    }

    /* Горизонтальный скролл timegrid — если колонки не помещаются */
    :global(.fc .fc-timegrid-scroll) {
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
    }

    /* Месяц — события читаемые */
    :global(.fc .fc-daygrid-event) {
      font-size: 10px;
      margin: 1px 1px;
      padding: 1px 4px;
    }

    :global(.fc .fc-daygrid-event .sch-event-title) {
      font-size: 10px;
    }

    :global(.fc .fc-daygrid-more-link) {
      font-size: 9px;
    }
  }

  /* ===== Мобильная сетка месяца (dayGridMonth) ===== */
  @media (max-width: 768px) {
    /* Сетка месяца — полная 7x5/7x6 сетка */
    :global(.fc .fc-daygrid) {
      min-height: 280px;
    }

    :global(.fc .fc-daygrid-day) {
      min-height: 42px;
      padding: 2px;
    }

    :global(.fc .fc-daygrid-day-number) {
      font-size: 12px;
      padding: 3px 6px;
      min-width: 24px;
      text-align: center;
    }

    /* События в ячейках месяца — компактные полоски */
    :global(.fc .fc-daygrid-event) {
      margin: 1px 2px;
      padding: 1px 4px;
      font-size: 10px;
      border-radius: 3px;
      line-height: 1.3;
    }

    :global(.fc .fc-daygrid-event .sch-event) {
      padding: 1px 3px;
      line-height: 1.25;
    }

    :global(.fc .fc-daygrid-event .sch-event-title) {
      font-size: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    :global(.fc .fc-daygrid-event .sch-priority) {
      width: 10px;
      height: 10px;
      font-size: 7px;
    }

    :global(.fc .fc-daygrid-more-link) {
      font-size: 9px;
      padding: 1px 4px;
      color: var(--mcp-accent);
    }

    /* Заголовки дней месяца */
    :global(.fc .fc-col-header-cell-cushion) {
      font-size: 10px;
      padding: 5px 0;
    }

    /* Сегодня в timegrid на мобилке — рамка как на десктопе */
    :global(.fc .fc-timegrid .fc-day-today) {
      background: rgba(95, 153, 225, 0.06) !important;
    }

    :global(.fc .fc-timegrid-body .fc-timegrid-col.fc-day-today) {
      border-left: 2px solid var(--mcp-accent) !important;
      border-right: 2px solid var(--mcp-accent) !important;
    }

    :global(.fc .fc-col-header-cell.fc-day-today) {
      border-left: 2px solid var(--mcp-accent) !important;
      border-right: 2px solid var(--mcp-accent) !important;
      border-top: 2px solid var(--mcp-accent) !important;
    }
  }

  /* ===== Маленький телефон (≤360px) ===== */
  @media (max-width: 360px) {
    :global(.fc .fc-toolbar-title) {
      font-size: 10px;
    }

    :global(.fc .fc-button) {
      font-size: 9px;
      padding: 4px 5px;
      min-height: 30px;
      min-width: 30px;
    }

    :global(.fc .fc-col-header-cell-cushion) {
      font-size: 9px;
    }

    :global(.fc .fc-timegrid-axis) {
      width: 32px;
    }

    :global(.fc .fc-timegrid-axis-cushion) {
      font-size: 9px;
    }

    :global(.sch-event-title) {
      font-size: 10px;
    }

    :global(.fc .fc-daygrid-day-number) {
      font-size: 10px;
      padding: 2px 4px;
    }

    /* Месяц — компактные ячейки */
    :global(.fc .fc-daygrid-day) {
      min-height: 40px;
    }

    :global(.fc .fc-daygrid-event) {
      font-size: 9px;
      padding: 1px 3px;
      margin: 0 1px;
    }

    :global(.fc .fc-daygrid-event .sch-event-title) {
      font-size: 9px;
    }

    :global(.fc .fc-daygrid-event .sch-priority) {
      display: none;
    }

    :global(.fc .fc-daygrid-more-link) {
      font-size: 8px;
      padding: 1px 3px;
    }

    :global(.fc .fc-timegrid-event) {
      min-height: 28px;
    }

    :global(.sch-event) {
      padding: 1px 4px;
    }

    :global(.sch-event-title) {
      font-size: 10px;
    }
  }

  /* ===== Альбомная ориентация ===== */
  @media (max-width: 768px) and (orientation: landscape) {
    :global(.fc .fc-toolbar) {
      flex-direction: row;
      flex-wrap: nowrap;
      gap: 6px;
      align-items: center;
    }

    :global(.fc .fc-toolbar-title) {
      width: auto;
      order: 0;
      font-size: 12px;
    }

    :global(.sch-event) {
      padding: 2px 5px;
    }
  }

  /* ===== Touch-устройства — улучшенные тап-таргеты ===== */
  @media (hover: none) and (pointer: coarse) {
    :global(.fc .fc-button) {
      min-height: 40px;
      min-width: 40px;
    }

    :global(.fc .fc-event) {
      min-height: 32px;
    }

    :global(.fc .fc-daygrid-day) {
      min-height: 44px;
    }

    :global(.fc .fc-daygrid-more-link) {
      padding: 4px 8px;
    }

    /* Убираем hover-эффекты на тач */
    :global(.fc .fc-event:hover) {
      transform: none;
      filter: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }

    /* Увеличиваем область тапа на заголовки дней */
    :global(.fc .fc-col-header-cell) {
      padding: 4px 0;
    }

    :global(.fc .fc-col-header-cell-cushion) {
      padding: 6px 0;
    }

    /* Увеличиваем тап-таргеты для месячного вида */
    :global(.fc .fc-daygrid-day) {
      min-height: 48px;
    }

    :global(.fc .fc-daygrid-event) {
      min-height: 20px;
      padding: 2px 4px;
    }

    /* Увеличиваем кнопки навигации */
    :global(.fc .fc-prev-button),
    :global(.fc .fc-next-button) {
      min-height: 44px;
      min-width: 44px;
    }
  }

  /* ===== Safe area (iOS notch / home indicator) ===== */
  @supports (padding: env(safe-area-inset-bottom)) {
    :global(.schedule-view-container) {
      padding-bottom: env(safe-area-inset-bottom);
    }

    :global(.fc .fc-toolbar) {
      padding-top: calc(6px + env(safe-area-inset-top));
    }
  }
</style>
