import type CalendarPlugin from "src/main";
import type { IHabitTrackerData } from "./types";
import { HABIT_TRACKER_DATA_VERSION } from "./types";
import { loadModuleData, saveModuleData } from "../io/vaultStorage";
import { generateId } from "../utils/id";

export { generateId };

export async function loadHabitData(
  plugin: CalendarPlugin
): Promise<IHabitTrackerData> {
  // 1. Always try vault files first (primary storage)
  const moduleData = await loadModuleData(plugin.app, "habitTracker");
  if (moduleData && Object.keys(moduleData).length > 0) {
    const data = moduleData as unknown as IHabitTrackerData;
    console.log(`[Habit] vault: ${data.habits?.length ?? 0} habits`);
    return data;
  }
  console.log(`[Habit] vault empty, trying data.json...`);

  // 2. Fallback: try plugin data.json (legacy format)
  const raw = await plugin.loadDataSafe();
  if (raw && raw["habitTracker"]) {
    const data = raw["habitTracker"] as IHabitTrackerData;
    console.log(`[Habit] data.json: ${data.habits?.length ?? 0} habits`);
    return data;
  }
  console.log(`[Habit] NO DATA`);
  return {
    habits: [],
    habitLogs: [],
    version: HABIT_TRACKER_DATA_VERSION,
  };
}

export async function saveHabitData(
  plugin: CalendarPlugin,
  data: IHabitTrackerData
): Promise<void> {
  // Always save to vault files (primary storage)
  await saveModuleData(plugin.app, "habitTracker", data as unknown as Record<string, unknown>);
}
