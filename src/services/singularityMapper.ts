/**
 * Pure mapping functions between local plugin model and SingularityApp API model.
 * All functions are side-effect-free and fully testable.
 */

import moment from "moment";
import type { TaskStatus } from "src/task-tracker/types";
import type { SingularityTask } from "./singularityApi";

// --- Constants ---

export const STATUS_TAG_PREFIX = "#sin-status:";

// --- Emoji conversion ---

/** Converts SingularityApp hex emoji code (e.g. "1f49e") to Unicode emoji character (e.g. "💌") */
export function hexToEmoji(hex: string | undefined): string {
  if (!hex) return "📁";
  try {
    // Handle compound codes like "1f468-200d-1f4bb" (man technologist)
    const codePoints = hex.split("-").map((part) => parseInt(part, 16));
    return String.fromCodePoint(...codePoints);
  } catch {
    return "📁";
  }
}

/** Converts Unicode emoji character (e.g. "💌") to SingularityApp hex code (e.g. "1f49e") */
export function emojiToHex(emoji: string | undefined): string | undefined {
  if (!emoji || emoji === "📁") return undefined;
  try {
    const codePoints: number[] = [];
    for (const char of emoji) {
      const cp = char.codePointAt(0);
      if (cp !== undefined) codePoints.push(cp);
    }
    if (codePoints.length === 0) return undefined;
    return codePoints.map((cp) => cp.toString(16)).join("-");
  } catch {
    return undefined;
  }
}

// --- Date conversion ---

/** Converts local dateUID ("day-2026-08-02T00:00:00+03:00" or "day-2026-08-01") to ISO-8601 datetime in UTC */
export function dateUIDToISO(dateUID: string, scheduledTime?: string): string | undefined {
  const raw = dateUID.replace(/^day-/, "");
  if (!raw) return undefined;

  if (scheduledTime && /^\d{1,2}:\d{2}$/.test(scheduledTime)) {
    // Extract date part (YYYY-MM-DD) from the dateUID
    const dateMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) return undefined;
    const [h, m] = scheduledTime.split(":").map(Number);
    const local = new Date(`${dateMatch[1]}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
    return local.toISOString();
  }

  // Parse the dateUID which may include timezone offset (e.g. "2026-08-02T00:00:00+03:00")
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/** Converts ISO-8601 datetime to local dateUID format matching getDateUID from obsidian-daily-notes-interface.
 *  Format: "day-YYYY-MM-DDTHH:mm:ssZ" (moment startOf day with local timezone offset) */
export function isoToDateUID(iso: string): string {
  const m = moment(iso);
  if (!m.isValid()) return `day-${moment().startOf("day").format()}`;
  return `day-${m.startOf("day").format()}`;
}

/** Parses ISO datetime string to epoch ms, returns 0 on failure */
export function parseRemoteUpdatedAt(isoStr: string | undefined): number {
  if (!isoStr) return 0;
  const ms = new Date(isoStr).getTime();
  return isNaN(ms) ? 0 : ms;
}

// --- Priority mapping ---

/** Maps local priority to SingularityApp priority number */
export function priorityToSingularity(priority: string): number {
  switch (priority) {
    case "high": return 0;
    case "medium": return 1;
    case "low": return 2;
    default: return 1;
  }
}

/** Maps SingularityApp priority number to local priority */
export function singularityPriorityToLocal(p: number | undefined): "high" | "medium" | "low" {
  switch (p) {
    case 0: return "high";
    case 2: return "low";
    default: return "medium";
  }
}

// --- Status mapping ---

/** Extracts local status from a SingularityApp task */
export function statusFromRemote(task: SingularityTask): { status: TaskStatus; completed: boolean } {
  if (task.journalDate) {
    return { status: "done", completed: true };
  }

  if (task.tags) {
    for (const tag of task.tags) {
      if (tag === `${STATUS_TAG_PREFIX}progress`) return { status: "progress", completed: false };
      if (tag === `${STATUS_TAG_PREFIX}paused`) return { status: "paused", completed: false };
    }
  }

  return { status: "todo", completed: false };
}

// --- Body builders ---

/** Builds the API body for creating a task remotely */
export function buildCreateTaskBody(task: {
  title: string;
  dateUID: string;
  description?: string;
  priority: string;
  projectId?: string | null;
  scheduledTime?: string;
  endTime?: string;
  deadline?: string;
  deadlineTime?: string;
}, projectMap: Record<string, string>): Record<string, unknown> {
  const body: Record<string, unknown> = { title: task.title };
  // SingularityApp requires full ISO-8601 datetime for start
  const start = dateUIDToISO(task.dateUID, task.scheduledTime);
  if (start) body.start = start;
  // useTime = true enables time display in SingularityApp UI
  if (task.scheduledTime) body.useTime = true;
  // timeLength = duration in minutes (computed from scheduledTime → endTime)
  if (task.scheduledTime && task.endTime) {
    const [sh, sm] = task.scheduledTime.split(":").map(Number);
    const [eh, em] = task.endTime.split(":").map(Number);
    const durationMin = (eh * 60 + em) - (sh * 60 + sm);
    if (durationMin > 0) body.timeLength = durationMin;
  }
  // Deadline (separate concept — дедлайн)
  if (task.deadline) {
    const deadline = dateUIDToISO(task.deadline, task.deadlineTime);
    if (deadline) body.deadline = deadline;
  }
  if (task.description) body.note = task.description;
  body.priority = priorityToSingularity(task.priority);
  if (task.projectId && projectMap[task.projectId]) {
    body.projectId = projectMap[task.projectId];
  }
  return body;
}

/** Builds the API body for updating a task remotely */
export function buildUpdateTaskBody(task: {
  title: string;
  dateUID: string;
  description?: string;
  priority: string;
  projectId?: string | null;
  status: TaskStatus;
  scheduledTime?: string;
  endTime?: string;
  deadline?: string;
  deadlineTime?: string;
}, projectMap: Record<string, string>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  body.title = task.title;
  if (task.description !== undefined) body.note = task.description || "";
  // SingularityApp requires full ISO-8601 datetime for start
  const start = dateUIDToISO(task.dateUID, task.scheduledTime);
  if (start) body.start = start;
  // useTime = true enables time display in SingularityApp UI
  if (task.scheduledTime) body.useTime = true;
  // timeLength = duration in minutes (computed from scheduledTime → endTime)
  if (task.scheduledTime && task.endTime) {
    const [sh, sm] = task.scheduledTime.split(":").map(Number);
    const [eh, em] = task.endTime.split(":").map(Number);
    const durationMin = (eh * 60 + em) - (sh * 60 + sm);
    if (durationMin > 0) body.timeLength = durationMin;
  }
  // Deadline (separate concept — дедлайн)
  if (task.deadline) {
    const deadline = dateUIDToISO(task.deadline, task.deadlineTime);
    if (deadline) body.deadline = deadline;
  }
  body.priority = priorityToSingularity(task.priority);
  if (task.projectId && projectMap[task.projectId]) {
    body.projectId = projectMap[task.projectId];
  }
  if (task.status === "done") {
    body.journalDate = new Date().toISOString();
  }
  return body;
}

/** Extracts time "HH:MM" from ISO datetime if it's not midnight */
export function isoToScheduledTime(iso: string): string | undefined {
  // Parse as UTC then convert to local time
  const d = new Date(iso);
  if (isNaN(d.getTime())) return undefined;
  const h = d.getHours();
  const min = d.getMinutes();
  if (h === 0 && min === 0) return undefined; // no explicit time set
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Builds the local task data from a remote SingularityApp task */
export function buildLocalTaskFromRemote(remote: SingularityTask, reverseProjectMap: Map<string, string>): {
  title: string;
  description: string | undefined;
  status: TaskStatus;
  completed: boolean;
  dateUID: string;
  scheduledTime?: string;
  endTime?: string;
  estimatedTime?: number;
  deadline?: string;
  deadlineTime?: string;
  priority: "high" | "medium" | "low";
  projectId: string | null;
  singularityId: string;
} {
  const { status, completed } = statusFromRemote(remote);
  // start is always full ISO-8601 datetime: "2026-08-01T14:30:00.000Z"
  const dateUID = remote.start ? isoToDateUID(remote.start) : `day-${moment().startOf("day").format()}`;
  // Only extract scheduledTime if the task has useTime enabled (user explicitly set a time)
  const scheduledTime = remote.start && remote.useTime ? isoToScheduledTime(remote.start) : undefined;
  // endTime: compute from start + timeLength (SingularityApp stores duration, not end time)
  let endTime: string | undefined;
  let estimatedTime: number | undefined;
  if (scheduledTime && remote.timeLength && remote.timeLength > 0) {
    const [h, m] = scheduledTime.split(":").map(Number);
    const totalMin = h * 60 + m + remote.timeLength;
    const eh = Math.floor(totalMin / 60) % 24;
    const em = totalMin % 60;
    endTime = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
    estimatedTime = remote.timeLength;
  }
  // deadline (separate concept — дедлайн)
  let deadline: string | undefined;
  let deadlineTime: string | undefined;
  if (remote.deadline) {
    deadline = isoToDateUID(remote.deadline);
    deadlineTime = isoToScheduledTime(remote.deadline);
  }
  return {
    title: remote.title || "Без названия",
    description: remote.note || undefined,
    status,
    completed,
    dateUID,
    scheduledTime,
    endTime,
    estimatedTime,
    deadline,
    deadlineTime,
    priority: singularityPriorityToLocal(remote.priority),
    projectId: remote.projectId ? reverseProjectMap.get(remote.projectId) || null : null,
    singularityId: remote.id,
  };
}

// --- Sync map helpers ---

/** Builds a reverse map: singularityId -> localId */
export function buildReverseMap(syncMapTasks: Record<string, { singularityId: string }>): Map<string, string> {
  const reverseMap = new Map<string, string>();
  for (const [localId, entry] of Object.entries(syncMapTasks)) {
    reverseMap.set(entry.singularityId, localId);
  }
  return reverseMap;
}

/** Builds a reverse project map: remoteProjectId -> localProjectId */
export function buildReverseProjectMap(projectMap: Record<string, string>): Map<string, string> {
  const reverseMap = new Map<string, string>();
  for (const [localId, remoteId] of Object.entries(projectMap)) {
    reverseMap.set(remoteId, localId);
  }
  return reverseMap;
}

// --- Habit color mapping ---

const SINGULARITY_COLOR_MAP: Record<string, string> = {
  red: "#f44336", pink: "#e91e63", purple: "#9c27b0", deepPurple: "#673ab7",
  indigo: "#3f51b5", lightBlue: "#03a9f4", cyan: "#00bcd4", teal: "#009688",
  green: "#4caf50", lightGreen: "#8bc34a", lime: "#cddc39", yellow: "#ffeb3b",
  amber: "#ffc107", orange: "#ff9800", deepOrange: "#ff5722", brown: "#795548",
  grey: "#9e9e9e", blueGrey: "#607d8b",
};

function hexToClosestSingularityColor(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  const h = hex.toLowerCase();
  for (const [name, value] of Object.entries(SINGULARITY_COLOR_MAP)) {
    if (value.toLowerCase() === h) return name;
  }
  // Find closest by simple RGB distance
  const parseHex = (c: string) => {
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return [r, g, b] as [number, number, number];
  };
  if (!h.startsWith("#") || h.length < 7) return undefined;
  const [r1, g1, b1] = parseHex(h);
  let bestName = "grey";
  let bestDist = Infinity;
  for (const [name, value] of Object.entries(SINGULARITY_COLOR_MAP)) {
    const [r2, g2, b2] = parseHex(value);
    const dist = (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
    if (dist < bestDist) { bestDist = dist; bestName = name; }
  }
  return bestName;
}

export function singularityColorToHex(color: string | undefined): string {
  if (!color) return "#607d8b";
  return SINGULARITY_COLOR_MAP[color.toLowerCase()] || "#607d8b";
}

// --- Habit mapping ---

export function buildLocalHabitFromRemote(remote: { title?: string; color?: string; description?: string; id?: string }): {
  title: string;
  color: string;
  icon: string;
} {
  return {
    title: remote.title || "Без названия",
    color: singularityColorToHex(remote.color),
    icon: "🔁",
  };
}

export function buildCreateHabitBody(habit: { title: string; color?: string }): {
  title: string; color?: string;
} {
  const body: { title: string; color?: string } = { title: habit.title };
  const color = hexToClosestSingularityColor(habit.color);
  if (color) body.color = color;
  return body;
}

export function buildUpdateHabitBody(habit: { title: string; color?: string }): {
  title: string; color?: string;
} {
  const body: { title: string; color?: string } = { title: habit.title };
  const color = hexToClosestSingularityColor(habit.color);
  if (color) body.color = color;
  return body;
}

/** Builds a reverse habit map: singularityHabitId -> localHabitId */
export function buildReverseHabitMap(habitMap: Record<string, string>): Map<string, string> {
  const reverseMap = new Map<string, string>();
  for (const [localId, remoteId] of Object.entries(habitMap)) {
    reverseMap.set(remoteId, localId);
  }
  return reverseMap;
}
