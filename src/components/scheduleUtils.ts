import type { ITask, IProject } from "../task-tracker/types";

export function extractDateFromUID(dateUID: string): string | null {
  const match = dateUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function calculateEndTime(
  date: string,
  time: string,
  durationMin: number
): string {
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + durationMin;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;

  let endDate = date;
  if (totalMinutes >= 1440) {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + 1);
    endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  return `${endDate}T${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}:00`;
}

/** Цвет проекта для glassmorphism-стиля — сохраняем насыщенность и непрозрачность */
function tintWithAlpha(hex: string, alpha = 0.92): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Лёгкое осветление — 92% оригинала + 8% белого (сохраняем насыщенность)
  const mr = Math.round(r * 0.92 + 255 * 0.08);
  const mg = Math.round(g * 0.92 + 255 * 0.08);
  const mb = Math.round(b * 0.92 + 255 * 0.08);
  return `rgba(${mr}, ${mg}, ${mb}, ${alpha})`;
}

/** Цвет статуса — мягкие пастельные тона */
export function getStatusColor(status: string): string {
  switch (status) {
    case "progress":
      return "rgba(180, 145, 85, 0.85)";
    case "paused":
      return "rgba(180, 150, 100, 0.7)";
    case "done":
      return "rgba(85, 160, 130, 0.8)";
    case "todo":
    default:
      return "rgba(110, 130, 160, 0.8)";
  }
}

/** Цвет бордюра статуса — насыщеннее */
export function getStatusBorder(status: string): string {
  switch (status) {
    case "progress":
      return "rgba(200, 165, 100, 1)";
    case "paused":
      return "rgba(180, 150, 100, 0.8)";
    case "done":
      return "rgba(95, 175, 145, 1)";
    case "todo":
    default:
      return "rgba(120, 145, 175, 1)";
  }
}

export interface ScheduleEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    task: ITask;
    taskId: string;
    projectId: string | null;
    projectColor: string | null;
    isDeadlineEvent?: boolean;
    sourceTimezone: string;
  };
}

/** Get local timezone offset as "+03:00" / "-05:00" */
function getLocalTzOffset(): string {
  const offset = -new Date().getTimezoneOffset(); // in minutes, positive = east of UTC
  const sign = offset >= 0 ? "+" : "-";
  const h = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const m = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}

/** Create ISO string with local timezone offset — FullCalendar + luxonPlugin handle this correctly */
function localISO(dateStr: string, time: string): string {
  return `${dateStr}T${time}:00${getLocalTzOffset()}`;
}

/** Advance an ISO datetime string by durationMin minutes */
function addMinutesISO(dateStr: string, time: string, durationMin: number): string {
  const totalMin = parseInt(time.split(":")[0], 10) * 60 + parseInt(time.split(":")[1], 10) + durationMin;
  let endH = Math.floor(totalMin / 60);
  const endM = totalMin % 60;
  let endStr = dateStr;
  if (endH >= 24) {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + 1);
    endStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    endH -= 24;
  }
  return `${endStr}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00${getLocalTzOffset()}`;
}

export function taskToEvent(
  task: ITask,
  projects: IProject[]
): ScheduleEvent | null {
  const dateStr = extractDateFromUID(task.dateUID);
  if (!dateStr) return null;

  const hasTime = !!task.scheduledTime;
  const start = hasTime
    ? localISO(dateStr, task.scheduledTime)
    : localISO(dateStr, "00:00");

  // Compute duration: prefer estimatedTime, fallback to endTime - scheduledTime, default 60min
  let durationMin = task.estimatedTime || 60;
  if (!task.estimatedTime && task.endTime && task.scheduledTime) {
    const [sh, sm] = task.scheduledTime.split(":").map(Number);
    const [eh, em] = task.endTime.split(":").map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff > 0) durationMin = diff;
  }

  const end = hasTime
    ? addMinutesISO(dateStr, task.scheduledTime, durationMin)
    : `${dateStr}T00:00:00${getLocalTzOffset()}`;

  const project = projects.find((p) => p.id === task.projectId);
  const hasProject = !!project;

  return {
    id: task.id,
    title: task.title,
    start,
    end,
    allDay: !hasTime,
    backgroundColor: hasProject
      ? tintWithAlpha(project.color, 0.95)
      : getStatusColor(task.status),
    borderColor: hasProject
      ? tintWithAlpha(project.color, 0.6)
      : getStatusBorder(task.status),
    textColor: "#e8ecf0",
    extendedProps: {
      task,
      taskId: task.id,
      projectId: task.projectId,
      projectColor: project?.color || null,
      sourceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };
}

/** Создаёт событие-дедлайн для задачи, если дедлайн отличается от дня задачи */
function deadlineToEvent(
  task: ITask,
  projects: IProject[]
): ScheduleEvent | null {
  if (!task.deadline || task.status === "done") return null;

  const deadlineDateStr = extractDateFromUID(task.deadline);
  const taskDateStr = extractDateFromUID(task.dateUID);
  if (!deadlineDateStr || deadlineDateStr === taskDateStr) return null;

  const hasTime = !!task.deadlineTime;
  const start = hasTime
    ? localISO(deadlineDateStr, task.deadlineTime)
    : localISO(deadlineDateStr, "00:00");
  const end = hasTime
    ? localISO(deadlineDateStr, task.deadlineTime)
    : localISO(deadlineDateStr, "23:59");

  const project = projects.find((p) => p.id === task.projectId);

  return {
    id: `deadline-${task.id}`,
    title: `Дедлайн: ${task.title}`,
    start,
    end,
    allDay: !hasTime,
    backgroundColor: "rgba(180, 60, 60, 0.85)",
    borderColor: "#b43c3c",
    textColor: "#fff",
    extendedProps: {
      task,
      taskId: task.id,
      projectId: task.projectId,
      projectColor: project?.color || null,
      isDeadlineEvent: true,
      sourceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };
}

export function tasksToEvents(
  tasks: ITask[],
  projects: IProject[]
): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  for (const task of tasks) {
    if (!task.dateUID) continue;
    const mainEvent = taskToEvent(task, projects);
    if (mainEvent) events.push(mainEvent);
    const dlEvent = deadlineToEvent(task, projects);
    if (dlEvent) events.push(dlEvent);
  }
  return events;
}
