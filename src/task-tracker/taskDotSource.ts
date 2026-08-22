import { moment } from "obsidian";
import type { Moment } from "moment";

// Obsidian's type defs export moment as `typeof Moment` (the module namespace),
// but at runtime it's the callable moment function. Cast once here.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const momentFn: (inp?: unknown, format?: string, strict?: boolean) => Moment =
  moment as unknown as (inp?: unknown, format?: string, strict?: boolean) => Moment;
import type {
  ICalendarSource,
  IDayMetadata,
} from "obsidian-calendar-ui";
import { getDateUID } from "obsidian-daily-notes-interface";
import { get } from "svelte/store";

import { tasks } from "./stores";
import type { ITask } from "./types";

// --- Cached lookup to avoid N store reads per render ---
let cachedTasks: ITask[] = [];
let cachedMap: Map<string, ITask[]> = new Map();
let cachedTodayUID = "";
let lastTodayCheck = 0;

function getTodayUID(): string {
  const now = Date.now();
  // Re-compute only once per second (enough for calendar render)
  if (!cachedTodayUID || now - lastTodayCheck > 1000) {
    cachedTodayUID = getDateUID(momentFn(), "day");
    lastTodayCheck = now;
  }
  return cachedTodayUID;
}

function getTaskMap(): Map<string, ITask[]> {
  const current = get(tasks);
  if (current !== cachedTasks) {
    cachedTasks = current;
    cachedMap = new Map();
    for (const t of current) {
      // Index by assigned date
      const arr = cachedMap.get(t.dateUID);
      if (arr) {
        arr.push(t);
      } else {
        cachedMap.set(t.dateUID, [t]);
      }
      // Also index by deadline date if different
      if (t.deadline && t.deadline !== t.dateUID && t.status !== "done") {
        const dArr = cachedMap.get(t.deadline);
        if (dArr) {
          dArr.push(t);
        } else {
          cachedMap.set(t.deadline, [t]);
        }
      }
    }
  }
  return cachedMap;
}

function getMetadataForDate(dateUID: string): IDayMetadata {
  const map = getTaskMap();
  const dateTasks = map.get(dateUID);

  if (!dateTasks || dateTasks.length === 0) {
    return {};
  }

  let uncompletedCount = 0;
  let completedCount = 0;
  let hasDeadlineOnDate = false;
  for (const t of dateTasks) {
    if (t.completed) {
      completedCount++;
    } else {
      uncompletedCount++;
    }
    if (t.deadline === dateUID && t.status !== "done") {
      hasDeadlineOnDate = true;
    }
  }

  const allCompleted = uncompletedCount === 0 && completedCount > 0;
  const todayUID = getTodayUID();
  const isPast = dateUID < todayUID;
  const hasOverdue = isPast && uncompletedCount > 0;

  const classes: string[] = [];
  let badgeValue: string;

  if (allCompleted) {
    badgeValue = "\u2713";
    classes.push("all-completed");
  } else {
    badgeValue = uncompletedCount > 9 ? "9+" : String(uncompletedCount);
  }

  if (hasOverdue) {
    classes.push("has-overdue");
  }

  if (hasDeadlineOnDate) {
    classes.push("has-deadline");
  }

  classes.push("has-task-tracker-tasks");

  return {
    dataAttributes: {
      "data-task-count": badgeValue,
    },
    classes,
  };
}

export const taskDotSource: ICalendarSource = {
  getDailyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const dateUID = getDateUID(date, "day");
    return getMetadataForDate(dateUID);
  },
  getWeeklyMetadata: async (date: Moment): Promise<IDayMetadata> => {
    const dateUID = getDateUID(date, "week");
    return getMetadataForDate(dateUID);
  },
};
