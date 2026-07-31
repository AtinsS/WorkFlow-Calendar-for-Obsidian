import type CalendarPlugin from "src/main";

import { ITaskTrackerData, TASK_TRACKER_DATA_VERSION } from "./types";
import { loadModuleData, saveModuleData } from "../io/vaultStorage";
import { generateId } from "../utils/id";

export { generateId };

const TASK_TRACKER_KEY = "taskTracker";

export async function loadTaskData(
  plugin: CalendarPlugin
): Promise<ITaskTrackerData> {
  // 1. Always try vault files first (they work reliably across Obsidian versions)
  const moduleData = await loadModuleData(plugin.app, "taskTracker");
  if (moduleData && Object.keys(moduleData).length > 0) {
    const data = moduleData as unknown as ITaskTrackerData;
    console.log(`[Task] vault: ${data.tasks?.length ?? 0} tasks`);
    if (data.version < TASK_TRACKER_DATA_VERSION) {
      return migrateData(data);
    }
    return data;
  }
  console.log(`[Task] vault empty, trying data.json...`);

  // 2. Fallback: try plugin data.json (legacy format)
  const raw = await plugin.loadDataSafe();
  if (raw && raw[TASK_TRACKER_KEY]) {
    const data = raw[TASK_TRACKER_KEY] as ITaskTrackerData;
    console.log(`[Task] data.json: ${data.tasks?.length ?? 0} tasks`);
    if (data.version < TASK_TRACKER_DATA_VERSION) {
      return migrateData(data);
    }
    return data;
  }
  console.log(`[Task] NO DATA`);
  return { tasks: [], projects: [], timeLogs: [], version: TASK_TRACKER_DATA_VERSION };
}

export async function saveTaskData(
  plugin: CalendarPlugin,
  data: ITaskTrackerData
): Promise<void> {
  // Always save to vault files (primary storage across Obsidian versions)
  await saveModuleData(plugin.app, "taskTracker", data as unknown as Record<string, unknown>);
}

function migrateData(data: ITaskTrackerData): ITaskTrackerData {
  let migrated = { ...data };

  // v1 -> v2: add description and recurrence fields to tasks
  if (data.version < 2) {
    migrated = {
      ...migrated,
      tasks: data.tasks.map((t) => ({
        ...t,
        description: undefined,
        recurrence: undefined,
      })),
      version: 2,
    };
  }

  // v2 -> v3: add status field, migrate completed -> status
  if (data.version < 3) {
    migrated = {
      ...migrated,
      tasks: migrated.tasks.map((t) => ({
        ...t,
        status: t.completed ? "done" : ("todo" as const),
      })),
      version: 3,
    };
  }

  // v3 -> v4: add timeLogs array
  if (data.version < 4) {
    migrated = {
      ...migrated,
      timeLogs: [],
      version: 4,
    };
  }

  // v4 -> v5: (removed destructive description stripping — description is still used)
  if (data.version < 5) {
    migrated = { ...migrated, version: 5 };
  }

  // v5 -> v6: add deadline and deadlineTime fields to tasks
  if (data.version < 6) {
    migrated = {
      ...migrated,
      tasks: migrated.tasks.map((t) => ({
        ...t,
        deadline: undefined,
        deadlineTime: undefined,
      })),
      version: 6,
    };
  }

  return { ...migrated, version: TASK_TRACKER_DATA_VERSION };
}
