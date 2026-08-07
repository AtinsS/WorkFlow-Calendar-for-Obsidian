import type { Moment } from "moment";
import type {
  ICalendarSource,
  IDayMetadata,
} from "obsidian-calendar-ui";
import { get } from "svelte/store";

import { habitLogs, habits } from "./stores";
import type { IHabitLog } from "./types";

// --- Cached lookup to avoid N store reads per render ---
let cachedLogs: IHabitLog[] = [];
let cachedMap: Map<string, number> = new Map();
let cachedActiveCount = 0;
let cachedHabitsVersion = 0;

function getLogsMap(): Map<string, number> {
  const current = get(habitLogs);
  if (current !== cachedLogs) {
    cachedLogs = current;
    cachedMap = new Map();
    for (const log of current) {
      // Count both 100% (completed) and 50% (count >= 1, not completed)
      if (log.completed || log.count >= 1) {
        cachedMap.set(log.date, (cachedMap.get(log.date) || 0) + 1);
      }
    }
  }
  return cachedMap;
}

function getActiveCount(): number {
  const current = get(habits);
  const version = current.length;
  if (version !== cachedHabitsVersion) {
    cachedHabitsVersion = version;
    cachedActiveCount = current.filter((h) => !h.archived).length;
  }
  return cachedActiveCount;
}

function getMetadataForDate(dateStr: string): IDayMetadata {
  const map = getLogsMap();
  const count = map.get(dateStr) || 0;

  if (count === 0) {
    return {};
  }

  const activeCount = getActiveCount();
  const allCompleted = activeCount > 0 && count >= activeCount;
  const badge = allCompleted ? "\uD83C\uDFC6" : "\uD83D\uDD25" + " " + String(count);

  return {
    dataAttributes: {
      "data-habit-count": badge,
    },
    classes: ["has-habit-logs"],
  };
}

function getWeeklyMetadataForDate(weekStart: Moment): IDayMetadata {
  const map = getLogsMap();
  let totalCount = 0;

  for (let i = 0; i < 7; i++) {
    const dateStr = weekStart.clone().add(i, "days").format("YYYY-MM-DD");
    totalCount += map.get(dateStr) || 0;
  }

  if (totalCount === 0) {
    return {};
  }

  const activeCount = getActiveCount();
  const maxPossible = activeCount * 7;
  const allCompleted = activeCount > 0 && totalCount >= maxPossible;
  const badge = allCompleted ? "\uD83C\uDFC6" : "\uD83D\uDD25" + " " + String(totalCount);

  return {
    dataAttributes: {
      "data-habit-count": badge,
    },
    classes: ["has-habit-logs"],
  };
}

export const habitSource: ICalendarSource = {
  getDailyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const dateStr = date.format("YYYY-MM-DD");
    return getMetadataForDate(dateStr);
  },
  getWeeklyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const weekStart = date.clone().startOf("isoWeek");
    return getWeeklyMetadataForDate(weekStart);
  },
};
