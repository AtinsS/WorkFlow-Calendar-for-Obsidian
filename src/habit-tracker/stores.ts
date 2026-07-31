import { writable, get } from "svelte/store";
import moment from "moment";

import type CalendarPlugin from "src/main";

import type { IHabit, IHabitLog, IHabitTrackerData } from "./types";
import { HABIT_TRACKER_DATA_VERSION } from "./types";
import { loadHabitData, saveHabitData, generateId } from "./storage";
import { settings } from "../ui/stores";

let pluginInstance: CalendarPlugin = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let loaded = false;

export const habits = writable<IHabit[]>([]);
export const habitLogs = writable<IHabitLog[]>([]);

// --- Cached lookup maps (avoid N store reads per render) ---
let cachedLogs: IHabitLog[] = [];
let logsByHabitDate: Map<string, IHabitLog> = new Map();

export function rebuildLogsCache(): void {
  const current = get(habitLogs);
  if (current === cachedLogs) return;
  cachedLogs = current;
  logsByHabitDate = new Map();
  for (const log of current) {
    logsByHabitDate.set(`${log.habitId}::${log.date}`, log);
  }
}

function cleanupOldHabitLogs(): void {
  const maxEntries = get(settings).habitLogCleanupThreshold || 1000;
  habitLogs.update((current) => {
    if (current.length <= maxEntries) return current;
    const sorted = [...current].sort(
      (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)
    );
    return sorted.slice(0, maxEntries);
  });
}

function debouncedSave(): void {
  if (!loaded) return;
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    const data: IHabitTrackerData = {
      habits: get(habits),
      habitLogs: get(habitLogs),
      version: HABIT_TRACKER_DATA_VERSION,
    };
    if (pluginInstance) {
      saveHabitData(pluginInstance, data);
    }
  }, 300);
}

export function immediateSave(): void {
  if (!loaded || !pluginInstance) return;
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  const data: IHabitTrackerData = {
    habits: get(habits),
    habitLogs: get(habitLogs),
    version: HABIT_TRACKER_DATA_VERSION,
  };
  saveHabitData(pluginInstance, data);
}

export async function initHabitStores(plugin: CalendarPlugin): Promise<void> {
  pluginInstance = plugin;

  async function doLoad(): Promise<void> {
    const data = await loadHabitData(plugin);
    habits.set(data.habits);
    habitLogs.set(data.habitLogs);
    rebuildLogsCache();
    loaded = true;
    if (data.habits.length > 0) {
      cleanupOldHabitLogs();
    }
  }

  await doLoad();

  // Retry after 2s if initial load returned empty (vault cache may not have been ready)
  setTimeout(() => {
    if (get(habits).length === 0) {
      loaded = false;
      doLoad();
    }
  }, 2000);
}

export function reloadHabitStores(plugin: CalendarPlugin): void {
  loadHabitData(plugin).then((data) => {
    habits.set(data.habits);
    habitLogs.set(data.habitLogs);
    rebuildLogsCache();
    cleanupOldHabitLogs();
  });
}

export function addHabit(
  habitData: Omit<IHabit, "id" | "createdAt">
): IHabit {
  const habit: IHabit = {
    ...habitData,
    id: generateId(),
    createdAt: Date.now(),
  };
  habits.update((current) => [...current, habit]);
  debouncedSave();
  return habit;
}

export function updateHabit(id: string, changes: Partial<IHabit>): void {
  habits.update((current) =>
    current.map((h) => (h.id === id ? { ...h, ...changes } : h))
  );
  debouncedSave();
}

export function removeHabit(id: string): void {
  habits.update((current) => current.filter((h) => h.id !== id));
  habitLogs.update((current) => {
    const next = current.filter((l) => l.habitId !== id);
    return next;
  });
  rebuildLogsCache();
  debouncedSave();
}

export function toggleHabitCompletion(
  habitId: string,
  date: string,
  targetCount = 1
): void {
  const key = `${habitId}::${date}`;
  const existing = logsByHabitDate.get(key);

  if (existing) {
    if (existing.count < targetCount) {
      // Increment count
      const newCount = existing.count + 1;
      habitLogs.update((current) =>
        current.map((l) =>
          l.id === existing.id
            ? { ...l, count: newCount, completed: newCount >= targetCount, completedAt: Date.now() }
            : l
        )
      );
    } else {
      // Reached target — toggle off (remove)
      habitLogs.update((current) => current.filter((l) => l.id !== existing.id));
    }
  } else {
    // First completion
    const log: IHabitLog = {
      id: generateId(),
      habitId,
      date,
      completed: targetCount <= 1,
      count: 1,
      completedAt: Date.now(),
    };
    habitLogs.update((current) => [...current, log]);
    cleanupOldHabitLogs();
  }
  rebuildLogsCache();
  debouncedSave();
}

export function getHabitCountOnDate(habitId: string, date: string): number {
  const log = logsByHabitDate.get(`${habitId}::${date}`);
  return log ? log.count : 0;
}

export function isHabitCompletedOnDate(habitId: string, date: string): boolean {
  const log = logsByHabitDate.get(`${habitId}::${date}`);
  return log ? log.completed : false;
}

export function calculateStreak(habitId: string): number {
  const logs = getHabitLogsSorted(habitId);
  if (logs.length === 0) return 0;

  let streak = 0;
  let currentDate = moment().startOf("day");

  for (const log of logs) {
    const logDate = moment(log.date, "YYYY-MM-DD").startOf("day");
    const diffDays = currentDate.diff(logDate, "days");

    if (diffDays <= 1) {
      streak++;
      currentDate = logDate.clone().subtract(1, "days");
    } else {
      break;
    }
  }

  return streak;
}

function getHabitLogsSorted(habitId: string): IHabitLog[] {
  return cachedLogs
    .filter((l) => l.habitId === habitId && l.completed)
    .sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );
}

// --- Analytics ---

export interface HeatmapCell {
  date: string;
  count: number;
  level: number; // 0-4 for color intensity
}

export interface WeeklyStats {
  weekStart: string;
  total: number;
}

export interface HabitStats {
  habitId: string;
  totalCompletions: number;
  currentStreak: number;
  longestStreak: number;
  completionRate: number; // 0-100
  lastCompleted: string | null;
}

export function getHeatmapData(habitId?: string): HeatmapCell[] {
  const today = moment();
  const yearAgo = today.clone().subtract(1, "year");
  const logs = habitId
    ? cachedLogs.filter((l) => l.habitId === habitId && l.completed)
    : cachedLogs.filter((l) => l.completed);

  // Count completions per date
  const countByDate = new Map<string, number>();
  for (const log of logs) {
    if (moment(log.date).isBefore(yearAgo)) continue;
    countByDate.set(log.date, (countByDate.get(log.date) || 0) + 1);
  }

  // Build cells for every day in the year
  const cells: HeatmapCell[] = [];
  const day = yearAgo.clone();
  while (day.isSameOrBefore(today)) {
    const dateStr = day.format("YYYY-MM-DD");
    const count = countByDate.get(dateStr) || 0;
    cells.push({ date: dateStr, count, level: 0 });
    day.add(1, "day");
  }

  // Compute levels (0-4 quartiles)
  const counts = cells.map((c) => c.count).filter((c) => c > 0);
  if (counts.length > 0) {
    counts.sort((a, b) => a - b);
    const q1 = counts[Math.floor(counts.length * 0.25)] || 1;
    const q2 = counts[Math.floor(counts.length * 0.5)] || 1;
    const q3 = counts[Math.floor(counts.length * 0.75)] || 1;
    for (const cell of cells) {
      if (cell.count === 0) cell.level = 0;
      else if (cell.count <= q1) cell.level = 1;
      else if (cell.count <= q2) cell.level = 2;
      else if (cell.count <= q3) cell.level = 3;
      else cell.level = 4;
    }
  }

  return cells;
}

export function getWeeklyStats(weeksBack = 12): WeeklyStats[] {
  const today = moment().startOf("week");
  const results: WeeklyStats[] = [];

  for (let i = weeksBack - 1; i >= 0; i--) {
    const weekStart = today.clone().subtract(i, "weeks");
    const weekEnd = weekStart.clone().endOf("week");
    let total = 0;
    for (const log of cachedLogs) {
      if (
        log.completed &&
        moment(log.date).isSameOrAfter(weekStart) &&
        moment(log.date).isSameOrBefore(weekEnd)
      ) {
        total++;
      }
    }
    results.push({
      weekStart: weekStart.format("YYYY-MM-DD"),
      total,
    });
  }

  return results;
}

export function getHabitStats(habitId: string): HabitStats {
  const logs = getHabitLogsSorted(habitId);
  const totalCompletions = logs.length;

  const currentStreak = calculateStreak(habitId);

  // Longest streak
  let longestStreak = 0;
  if (logs.length > 0) {
    let streak = 1;
    const sortedAsc = [...logs].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    for (let i = 1; i < sortedAsc.length; i++) {
      const prev = moment(sortedAsc[i - 1].date).startOf("day");
      const curr = moment(sortedAsc[i].date).startOf("day");
      if (curr.diff(prev, "days") === 1) {
        streak++;
      } else {
        longestStreak = Math.max(longestStreak, streak);
        streak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, streak);
  }

  // Completion rate (last 7 days)
  const habit = get(habits).find((h) => h.id === habitId);
  let completionRate = 0;
  if (habit) {
    const today = moment().startOf("day");
    const weekAgo = today.clone().subtract(7, "days");
    const recentLogs = logs.filter(l => moment(l.date).isAfter(weekAgo));
    const maxPerWeek = habit.frequency === "weekly" ? 1 : 7;
    completionRate = Math.min(100, Math.round((recentLogs.length / maxPerWeek) * 100));
  }

  const lastCompleted = logs.length > 0 ? logs[0].date : null;

  return {
    habitId,
    totalCompletions,
    currentStreak,
    longestStreak,
    completionRate,
    lastCompleted,
  };
}

// --- Day-of-week productivity analysis ---

export interface DayOfWeekStats {
  dayIndex: number; // 0=Mon, 6=Sun
  dayName: string;
  completions: number;
  totalDays: number;
  productivityRate: number; // 0-100
}

const DAY_NAMES_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Check if a habit is "active" on a given date */
function isHabitActiveOnDate(habit: IHabit, date: moment.Moment): boolean {
  if (habit.archived) return false;
  const dow = (date.day() + 6) % 7; // Mon=0
  switch (habit.frequency) {
    case "daily":
      return true;
    case "weekly":
      if (!habit.customDays || habit.customDays.length === 0) return true;
      return habit.customDays.includes(dow);
    case "monthly":
      return habit.monthlyDay != null && date.date() === habit.monthlyDay;
  }
}

export function getDayOfWeekProductivity(): DayOfWeekStats[] {
  // Get active (non-archived) habits
  const activeHabits = get(habits).filter((h) => !h.archived);

  // Build a set of unique dates from logs
  const dateSet = new Set<string>();
  for (const log of cachedLogs) {
    dateSet.add(log.date);
  }
  // Also include dates from today backwards to fill gaps
  const sortedDates = Array.from(dateSet).sort();

  // For each date, compute completion rate
  // key: dayOfWeek (0-6), value: { completedSum, activeSum }
  const statsByDay = new Map<number, { completedSum: number; activeSum: number; count: number }>();

  for (const dateStr of sortedDates) {
    const date = moment(dateStr, "YYYY-MM-DD");
    if (!date.isValid()) continue;
    const dayOfWeek = (date.day() + 6) % 7;

    // How many habits are active on this date?
    let activeCount = 0;
    let completedCount = 0;
    for (const habit of activeHabits) {
      if (!isHabitActiveOnDate(habit, date)) continue;
      activeCount++;
      const key = `${habit.id}::${dateStr}`;
      if (logsByHabitDate.has(key)) {
        completedCount++;
      }
    }

    if (activeCount === 0) continue;

    let entry = statsByDay.get(dayOfWeek);
    if (!entry) {
      entry = { completedSum: 0, activeSum: 0, count: 0 };
      statsByDay.set(dayOfWeek, entry);
    }
    entry.completedSum += completedCount;
    entry.activeSum += activeCount;
    entry.count++;
  }

  const result: DayOfWeekStats[] = [];
  for (let i = 0; i < 7; i++) {
    const entry = statsByDay.get(i);
    const productivityRate = entry && entry.activeSum > 0
      ? Math.round((entry.completedSum / entry.activeSum) * 100)
      : 0;
    result.push({
      dayIndex: i,
      dayName: DAY_NAMES_RU[i],
      completions: entry?.completedSum || 0,
      totalDays: entry?.count || 0,
      productivityRate,
    });
  }

  return result;
}

export function getProductiveDays(): DayOfWeekStats[] {
  return getDayOfWeekProductivity()
    .filter((d) => d.productivityRate > 0)
    .sort((a, b) => b.productivityRate - a.productivityRate);
}

export function getProcrastinationDays(): DayOfWeekStats[] {
  return getDayOfWeekProductivity()
    .filter((d) => d.productivityRate === 0 || d.completions === 0)
    .sort((a, b) => a.productivityRate - b.productivityRate);
}
