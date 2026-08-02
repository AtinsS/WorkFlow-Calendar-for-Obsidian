/**
 * SingularityApp bidirectional sync service (CRUD-based).
 * Pushes local task changes to SingularityApp, pulls remote changes into local store.
 */

import { get, writable } from "svelte/store";
import moment from "moment";
import type CalendarPlugin from "src/main";
import { tasks, projects, checklists } from "src/task-tracker/stores";
import { habits, habitLogs } from "src/habit-tracker/stores";
import { settings } from "src/ui/stores";
import {
  verifyToken,
  getAllTasks,
  createTask as apiCreateTask,
  updateTask as apiUpdateTask,
  deleteTask as apiDeleteTask,
  getProjects as apiGetProjects,
  createProject as apiCreateProject,
  updateProject as apiUpdateProject,
  getHabits as apiGetHabits,
  createHabit as apiCreateHabit,
  updateHabit as apiUpdateHabit,
  deleteHabit as apiDeleteHabit,
  getHabitProgress as apiGetHabitProgress,
  createHabitProgress as apiCreateHabitProgress,
  deleteHabitProgress as apiDeleteHabitProgress,
  getChecklistItems as apiGetChecklistItems,
  createChecklistItem as apiCreateChecklistItem,
  updateChecklistItem as apiUpdateChecklistItem,
  deleteChecklistItem as apiDeleteChecklistItem,
} from "./singularityApi";
import {
  parseRemoteUpdatedAt,
  buildReverseMap,
  buildReverseProjectMap,
  buildCreateTaskBody,
  buildUpdateTaskBody,
  buildLocalTaskFromRemote,
  hexToEmoji,
  emojiToHex,
  buildLocalHabitFromRemote,
  buildCreateHabitBody,
  buildUpdateHabitBody,
  buildReverseHabitMap,
  singularityColorToHex,
} from "./singularityMapper";

// --- Constants ---

const PUSH_DEBOUNCE_MS = 3000;
const SYNC_MAP_FILE = "calendar-data/singularitySync.json";
const API_CALL_DELAY_MS = 200;

// --- Types ---

interface SyncMapEntry {
  singularityId: string;
  lastPushedAt: number;
  lastPulledAt: number;
}

interface SingularitySyncMap {
  tasks: Record<string, SyncMapEntry>; // localTaskId -> entry
  projects: Record<string, { singularityId: string; lastSyncAt: number }>;
  projectMap: Record<string, string>; // localProjectId -> remoteProjectId
  habits: Record<string, SyncMapEntry>; // localHabitId -> entry
  habitMap: Record<string, string>; // localHabitId -> remoteHabitId
  habitDoneSnapshot: Record<string, string[]>; // localHabitId -> list of "YYYY-MM-DD" that were synced as done
  checklistMap: Record<string, string>; // localChecklistItemId -> remoteChecklistItemId
  lastFullPullAt: number;
  version: number;
}

export interface SingularitySyncStatus {
  connected: boolean;
  syncing: boolean;
  lastSync: string;
  error: string;
  pushedCount: number;
  pulledCount: number;
}

// --- Status Store ---

export const singularitySyncStatus = writable<SingularitySyncStatus>({
  connected: false,
  syncing: false,
  lastSync: "",
  error: "",
  pushedCount: 0,
  pulledCount: 0,
});

// --- Module State ---

let pluginInstance: CalendarPlugin | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let pushTimeout: ReturnType<typeof setTimeout> | null = null;
let unsubscribers: (() => void)[] = [];
let syncing = false;
let syncMap: SingularitySyncMap = createEmptySyncMap();
let loaded = false;
let skipNextPush = false; // flag to prevent re-push after updateTask(singularityId)
let skipNextProjectPush = false; // flag to prevent re-push after addProject from pull

function createEmptySyncMap(): SingularitySyncMap {
  return { tasks: {}, projects: {}, projectMap: {}, habits: {}, habitMap: {}, habitDoneSnapshot: {}, checklistMap: {}, lastFullPullAt: 0, version: 1 };
}

// --- Helpers ---

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Sync Map Persistence ---

async function loadSyncMap(): Promise<SingularitySyncMap> {
  if (!pluginInstance) return createEmptySyncMap();
  try {
    const content = await pluginInstance.app.vault.adapter.read(SYNC_MAP_FILE);
    if (content) {
      const parsed = JSON.parse(content) as SingularitySyncMap;
      if (parsed.version) {
        // Migrate: if projectMap is missing in file, seed from settings
        if (!parsed.projectMap) {
          parsed.projectMap = get(settings).singularityProjectMap || {};
        }
        return parsed;
      }
    }
  } catch {
    // File doesn't exist yet
  }
  return createEmptySyncMap();
}

async function saveSyncMap(): Promise<void> {
  if (!pluginInstance) return;
  try {
    const dir = SYNC_MAP_FILE.substring(0, SYNC_MAP_FILE.lastIndexOf("/"));
    try {
      await pluginInstance.app.vault.createFolder(dir);
    } catch {
      // Already exists
    }
    const content = JSON.stringify(syncMap, null, 2);
    try {
      const file = pluginInstance.app.vault.getAbstractFileByPath(SYNC_MAP_FILE);
      if (file) {
        await pluginInstance.app.vault.modify(file as import("obsidian").TFile, content);
      } else {
        await pluginInstance.app.vault.create(SYNC_MAP_FILE, content);
      }
    } catch {
      await pluginInstance.app.vault.adapter.write(SYNC_MAP_FILE, content);
    }
  } catch (e) {
    console.error("[SingularitySync] Failed to save sync map:", e);
  }
}

// --- Token Access ---

function getToken(): string | undefined {
  return get(settings).singularityToken;
}

function isEnabled(): boolean {
  const s = get(settings);
  return !!s.singularityToken && !!s.singularityAutoSync;
}

// --- Push Logic ---

async function pushLocalChanges(projectMap: Record<string, string>): Promise<{ pushed: number; errors: number }> {
  const token = getToken();
  if (!token || !pluginInstance) return { pushed: 0, errors: 0 };

  const localTasks = get(tasks);
  let pushed = 0;
  let errors = 0;

  console.log(`[SingularitySync] Push: ${localTasks.length} local tasks, ${Object.keys(syncMap.tasks).length} in syncMap`);

  // 1. Push new/updated tasks
  for (const task of localTasks) {
    if (task.isRecurringInstance && task.parentTaskId) continue; // skip recurring instances

    try {
      const syncEntry = syncMap.tasks[task.id];

      if (syncEntry) {
        // Task already synced — check if local is newer
        if (task.updatedAt <= syncEntry.lastPushedAt) continue;

        // UPDATE: build body via mapper
        const body = buildUpdateTaskBody(task, projectMap);
        await apiUpdateTask(token, syncEntry.singularityId, body);
        syncMap.tasks[task.id] = {
          ...syncEntry,
          lastPushedAt: Date.now(),
        };
        pushed++;
      } else {
        // CREATE: build body via mapper
        const body = buildCreateTaskBody(task, projectMap);
        console.log(`[SingularitySync] Create task "${task.title}" endTime="${task.endTime}" scheduledTime="${task.scheduledTime}" → body:`, JSON.stringify(body));
        const created = await apiCreateTask(token, body as Parameters<typeof apiCreateTask>[1]);

        if (!created.id) {
          console.error(`[SingularitySync] Created remote task "${task.title}" but received no ID:`, created);
          continue;
        }

        console.log(`[SingularitySync] Created task "${task.title}" → remote id: ${created.id}`);

        // Set flag BEFORE updateTask to prevent re-push via store subscription
        skipNextPush = true;

        // Update local task with singularityId
        const { updateTask } = await import("src/task-tracker/stores");
        updateTask(task.id, { singularityId: created.id });

        syncMap.tasks[task.id] = {
          singularityId: created.id,
          lastPushedAt: Date.now(),
          lastPulledAt: 0,
        };
        pushed++;
      }

      await delay(API_CALL_DELAY_MS);
    } catch (e) {
      errors++;
      console.error(`[SingularitySync] Push failed for task ${task.id}:`, e);
      if (e instanceof Error && e.name === "SingularityAuthError") {
        singularitySyncStatus.update((s) => ({
          ...s,
          connected: false,
          error: e.message,
        }));
        return { pushed, errors };
      }
    }
  }

  // 2. Delete remotely tasks that were removed locally
  const localIds = new Set(localTasks.map((t) => t.id));
  for (const [localId, entry] of Object.entries(syncMap.tasks)) {
    if (!localIds.has(localId)) {
      try {
        await apiDeleteTask(token, entry.singularityId);
        pushed++;
      } catch {
        // Task already deleted or network error — ignore, clean up mapping below
      }
      // Always remove from sync map — task no longer exists locally
      delete syncMap.tasks[localId];
      await delay(API_CALL_DELAY_MS);
    }
  }

  await saveSyncMap();
  return { pushed, errors };
}

// --- Pull Logic ---

async function pullRemoteChanges(projectMap: Record<string, string>): Promise<{ pulled: number; errors: number }> {
  const token = getToken();
  if (!token || !pluginInstance) return { pulled: 0, errors: 0 };

  let pulled = 0;
  let errors = 0;

  try {
    // Fetch ALL tasks (no date filter — tasks without start date would be missed otherwise)
    const remoteTasks = await getAllTasks(token, { includeArchived: true });
    console.log(`[SingularitySync] Pull: fetched ${remoteTasks.length} remote tasks total`);
    if (remoteTasks.length > 0) {
      console.log(`[SingularitySync] Remote task IDs: ${remoteTasks.map(t => `${t.id}(${t.title})`).join(", ")}`);
    }

    const localTasks = get(tasks);
    const reverseMap = buildReverseMap(syncMap.tasks);
    const reverseProjectMap = buildReverseProjectMap(projectMap);

    console.log(`[SingularitySync] Pull: ${remoteTasks.length} remote tasks, ${localTasks.length} local tasks, ${reverseMap.size} in syncMap`);

    for (const remote of remoteTasks) {
      // Skip trashed tasks
      if (remote.deleteDate) {
        console.log(`[SingularitySync] Pull skip (trashed): ${remote.id}(${remote.title})`);
        continue;
      }

      try {
        const localId = reverseMap.get(remote.id);

        if (localId) {
          // READ (update existing): check if remote is newer
          const localTask = localTasks.find((t) => t.id === localId);
          if (!localTask) {
            console.log(`[SingularitySync] Pull skip (local not found): ${remote.id}(${remote.title}) localId=${localId}`);
            continue;
          }

          const remoteUpdated = parseRemoteUpdatedAt(remote.updatedAt);
          const syncEntry = syncMap.tasks[localId];

          if (remoteUpdated > localTask.updatedAt && remoteUpdated > (syncEntry?.lastPulledAt || 0)) {
            const remoteData = buildLocalTaskFromRemote(remote, reverseProjectMap);
            const { updateTask } = await import("src/task-tracker/stores");
            skipNextPush = true;
            updateTask(localId, {
              ...remoteData,
              singularityId: remote.id,
              projectId: remoteData.projectId ?? localTask.projectId,
            });

            syncMap.tasks[localId] = {
              ...syncEntry,
              lastPushedAt: Date.now(),
              lastPulledAt: Date.now(),
            };
            pulled++;
            console.log(`[SingularitySync] Pull updated: ${remote.id}(${remote.title}) → local ${localId}`);
          } else {
            console.log(`[SingularitySync] Pull skip (not newer): ${remote.id}(${remote.title}) remoteUpdated=${remoteUpdated} localUpdated=${localTask.updatedAt}`);
          }
        } else {
          // READ (create new): remote task doesn't exist locally
          const remoteData = buildLocalTaskFromRemote(remote, reverseProjectMap);
          console.log(`[SingularitySync] Pull creating: ${remote.id}(${remote.title}) dateUID=${remoteData.dateUID} scheduledTime=${remoteData.scheduledTime}`);
          const { addTask } = await import("src/task-tracker/stores");
          skipNextPush = true;
          const newTask = addTask({
            title: remoteData.title,
            description: remoteData.description,
            completed: remoteData.completed,
            status: remoteData.status,
            dateUID: remoteData.dateUID,
            projectId: remoteData.projectId,
            notePath: null,
            priority: remoteData.priority,
            tags: [],
            sortOrder: 0,
            singularityId: remote.id,
            ...(remoteData.scheduledTime ? { scheduledTime: remoteData.scheduledTime } : {}),
            ...(remoteData.endTime ? { endTime: remoteData.endTime } : {}),
            ...(remoteData.estimatedTime ? { estimatedTime: remoteData.estimatedTime } : {}),
            ...(remoteData.deadline ? { deadline: remoteData.deadline } : {}),
            ...(remoteData.deadlineTime ? { deadlineTime: remoteData.deadlineTime } : {}),
          });

          syncMap.tasks[newTask.id] = {
            singularityId: remote.id,
            lastPushedAt: Date.now(),
            lastPulledAt: Date.now(),
          };
          pulled++;
          console.log(`[SingularitySync] Pull created: ${remote.id}(${remote.title}) → local ${newTask.id}`);
        }

        await delay(API_CALL_DELAY_MS);
      } catch (e) {
        errors++;
        console.error(`[SingularitySync] Pull failed for remote task ${remote.id}:`, e);
      }
    }

    // 3. Detect remotely deleted tasks — remove locally if they were synced
    const remoteIds = new Set(remoteTasks.map((t) => t.id));
    const { removeTask } = await import("src/task-tracker/stores");
    const currentLocalTasks = get(tasks);
    for (const [localId, entry] of Object.entries(syncMap.tasks)) {
      if (!remoteIds.has(entry.singularityId)) {
        // Task was deleted remotely — delete locally
        const localExists = currentLocalTasks.some((t) => t.id === localId);
        if (localExists) {
          skipNextPush = true;
          removeTask(localId);
          pulled++;
          console.log(`[SingularitySync] Pull deleted (removed remotely): ${entry.singularityId} → local ${localId}`);
        }
        delete syncMap.tasks[localId];
      }
    }

    console.log(`[SingularitySync] Pull complete: ${pulled} tasks pulled, ${errors} errors`);
    await saveSyncMap();
  } catch (e) {
    errors++;
    console.error("[SingularitySync] Pull failed:", e);
    if (e instanceof Error && e.name === "SingularityAuthError") {
      singularitySyncStatus.update((s) => ({
        ...s,
        connected: false,
        error: e.message,
      }));
    }
  }

  return { pulled, errors };
}

// --- Sync Orchestration ---

function schedulePush(): void {
  if (!isEnabled() || !loaded) return;

  if (pushTimeout) clearTimeout(pushTimeout);
  pushTimeout = setTimeout(async () => {
    if (syncing || !isEnabled()) return;
    await doSync("both");
  }, PUSH_DEBOUNCE_MS);
}

async function doSync(direction: "push" | "pull" | "both"): Promise<void> {
  if (syncing) return;
  const token = getToken();
  if (!token) return;

  console.log(`[SingularitySync] doSync(${direction}) starting...`);
  syncing = true;
  singularitySyncStatus.update((s) => ({ ...s, syncing: true, error: "" }));

  let pushed = 0;
  let pulled = 0;
  let errors = 0;

  try {
    const syncDirection = get(settings).singularitySyncDirection || "both";
    console.log(`[SingularitySync] doSync: direction=${direction} syncDirection=${syncDirection}`);

    // Sync projects first so projectMap is populated before task push/pull
    const projectMap = await syncProjects();
    console.log(`[SingularitySync] doSync: projects synced, map has ${Object.keys(projectMap).length} entries`);

    if ((direction === "push" || direction === "both") && (syncDirection === "both" || syncDirection === "push")) {
      const result = await pushLocalChanges(projectMap);
      pushed = result.pushed;
      errors += result.errors;
      console.log(`[SingularitySync] doSync: push done, pushed=${pushed} errors=${errors}`);
    }

    if ((direction === "pull" || direction === "both") && (syncDirection === "both" || syncDirection === "pull")) {
      const result = await pullRemoteChanges(projectMap);
      pulled = result.pulled;
      errors += result.errors;
      console.log(`[SingularitySync] doSync: pull done, pulled=${pulled} errors=${errors}`);
    } else {
      console.log(`[SingularitySync] doSync: pull skipped (direction=${direction} syncDirection=${syncDirection})`);
    }

    // Sync habits (bidirectional, always runs)
    await syncHabits();
    console.log(`[SingularitySync] doSync: habits synced`);

    // Sync checklists (bidirectional, always runs)
    await syncChecklists();
    console.log(`[SingularitySync] doSync: checklists synced`);

    // Update last sync time
    const now = Date.now();
    if (pluginInstance) {
      await (pluginInstance as unknown as { writeOptions: (c: Record<string, unknown>) => Promise<void> }).writeOptions.call(pluginInstance, { singularityLastSync: now });
    }

    singularitySyncStatus.update((s) => ({
      ...s,
      syncing: false,
      lastSync: new Date(now).toLocaleString("ru-RU"),
      pushedCount: s.pushedCount + pushed,
      pulledCount: s.pulledCount + pulled,
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка синхронизации";
    singularitySyncStatus.update((s) => ({
      ...s,
      syncing: false,
      error: msg,
    }));
  } finally {
    syncing = false;
  }

  if (pushed || pulled) {
    console.log(`[SingularitySync] Sync complete: pushed=${pushed}, pulled=${pulled}, errors=${errors}`);
  }
}

// --- Polling ---

function startPolling(): void {
  stopPolling();
  const intervalMin = get(settings).singularitySyncInterval || 5;
  const intervalMs = Math.max(1, intervalMin) * 60 * 1000;

  pollInterval = setInterval(() => {
    if (isEnabled() && !syncing) {
      doSync("pull");
    }
  }, intervalMs);
}

function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// --- Public API ---

export async function initSingularitySync(plugin: CalendarPlugin): Promise<void> {
  pluginInstance = plugin;

  // Load sync map
  syncMap = await loadSyncMap();
  loaded = true;

  // Check token validity
  const token = getToken();
  if (token) {
    const result = await verifyToken(token);
    singularitySyncStatus.update((s) => ({
      ...s,
      connected: result.success,
      error: result.error || "",
    }));

    if (result.success && isEnabled()) {
      // Initial pull
      await doSync("pull");
    }
  }

  // Subscribe to store changes for push
  unsubscribers.push(
    tasks.subscribe(() => {
      if (skipNextPush) {
        skipNextPush = false;
        return;
      }
      if (loaded && isEnabled()) schedulePush();
    })
  );

  // Subscribe to project changes for push
  unsubscribers.push(
    projects.subscribe(() => {
      if (skipNextProjectPush) {
        skipNextProjectPush = false;
        return;
      }
      if (loaded && isEnabled()) schedulePush();
    })
  );

  // Subscribe to habit changes for push (habit list: add/remove/edit)
  unsubscribers.push(
    habits.subscribe(() => {
      if (skipNextHabitPush) {
        skipNextHabitPush = false;
        return;
      }
      if (loaded && isEnabled()) schedulePush();
    })
  );

  // Subscribe to habitLogs changes for push (completion toggles)
  unsubscribers.push(
    habitLogs.subscribe(() => {
      if (skipNextHabitPush) {
        skipNextHabitPush = false;
        return;
      }
      if (loaded && isEnabled()) schedulePush();
    })
  );

  // Subscribe to checklist changes for push
  unsubscribers.push(
    checklists.subscribe(() => {
      if (skipNextChecklistPush) {
        skipNextChecklistPush = false;
        return;
      }
      if (loaded && isEnabled()) schedulePush();
    })
  );

  // Subscribe to settings changes
  unsubscribers.push(
    settings.subscribe((s) => {
      const wasConnected = get(singularitySyncStatus).connected;
      const hasToken = !!s.singularityToken;

      if (hasToken && !wasConnected) {
        // Token just added — verify
        verifyToken(s.singularityToken!).then((result) => {
          singularitySyncStatus.update((st) => ({
            ...st,
            connected: result.success,
            error: result.error || "",
          }));
        });
      }

      if (s.singularityAutoSync && hasToken) {
        startPolling();
      } else {
        stopPolling();
      }
    })
  );

  // Start polling if auto-sync is enabled
  if (isEnabled()) {
    startPolling();
  }
}

export function cleanupSingularitySync(): void {
  // Flush pending push
  if (pushTimeout) {
    clearTimeout(pushTimeout);
    pushTimeout = null;
  }

  // Stop polling
  stopPolling();

  // Unsubscribe
  unsubscribers.forEach((u) => u());
  unsubscribers = [];

  // Save sync map
  if (pluginInstance) {
    saveSyncMap().catch((e) =>
      console.error("[SingularitySync] Failed to save sync map on cleanup:", e)
    );
  }

  pluginInstance = null;
  loaded = false;
  syncing = false;
}

export async function fullSync(): Promise<void> {
  console.log("[SingularitySync] fullSync() called, syncing=", syncing, "loaded=", loaded);
  if (syncing) {
    console.log("[SingularitySync] fullSync() skipped — already syncing");
    return;
  }
  await doSync("both");
}

export async function testConnection(
  token: string
): Promise<{ success: boolean; error?: string }> {
  return verifyToken(token);
}

export async function resetSyncMap(): Promise<void> {
  syncMap = createEmptySyncMap();
  await saveSyncMap();

  // Clear singularityId from all local tasks
  const { updateTask } = await import("src/task-tracker/stores");
  const localTasks = get(tasks);
  for (const task of localTasks) {
    if (task.singularityId) {
      updateTask(task.id, { singularityId: undefined });
    }
  }

  singularitySyncStatus.update((s) => ({
    ...s,
    pushedCount: 0,
    pulledCount: 0,
    lastSync: "",
  }));
}

export async function syncProjects(): Promise<Record<string, string>> {
  const token = getToken();
  if (!token || !pluginInstance) return syncMap.projectMap || {};

  let created = 0;
  let mapped = 0;
  let pulled = 0;

  try {
    const remoteProjects = await apiGetProjects(token, { maxCount: 100, includeArchived: true });
    // Use projectMap from syncMap (persisted reliably), not from settings
    const projectMap = { ...(syncMap.projectMap || {}) };

    // Re-read local projects fresh each time
    let localProjects = get(projects);

    console.log(`[SingularitySync] Projects: ${remoteProjects.length} remote, ${localProjects.length} local, ${Object.keys(projectMap).length} mapped`);
    console.log(`[SingularitySync] Remote project IDs: ${remoteProjects.map(rp => rp.id).join(", ")}`);
    console.log(`[SingularitySync] Project map: ${JSON.stringify(projectMap)}`);

    // Build set of already-mapped remote IDs
    const mappedRemoteIds = new Set(Object.values(projectMap));

    // 0. Clean stale map entries where local project no longer exists
    const localProjectIds = new Set(localProjects.map(lp => lp.id));
    for (const mapLocalId of Object.keys(projectMap)) {
      if (!localProjectIds.has(mapLocalId)) {
        console.log(`[SingularitySync] Cleaning stale map entry: local ${mapLocalId} no longer exists`);
        mappedRemoteIds.delete(projectMap[mapLocalId]);
        delete projectMap[mapLocalId];
      }
    }

    // 1. Auto-map by name match + push local projects that have no remote match
    for (const local of localProjects) {
      if (projectMap[local.id]) {
        // Already mapped — verify remote project still exists and update color
        const remoteId = projectMap[local.id];
        console.log(`[SingularitySync] Checking mapped project "${local.name}": localId=${local.id}, remoteId=${remoteId}`);
        const remote = remoteProjects.find((rp) => rp.id === remoteId);
        if (!remote) {
          // Remote project was deleted — remove stale mapping so it can be re-created
          console.warn(`[SingularitySync] Remote project for "${local.name}" (${remoteId}) not found, removing stale mapping`);
          console.warn(`[SingularitySync] Available remote IDs: ${remoteProjects.map(rp => rp.id).join(", ")}`);
          delete projectMap[local.id];
          mappedRemoteIds.delete(remoteId);
          // Fall through to name-match / create logic below
        } else {
          // Check if color or emoji changed — push updates
          const remoteEmojiHex = remote.emoji;
          const localEmojiHex = emojiToHex(local.icon);
          const colorChanged = local.color && remote.color !== local.color;
          const emojiChanged = localEmojiHex && remoteEmojiHex !== localEmojiHex;
          // Also pull remote emoji if local has default and remote has a real one
          const shouldPullEmoji = remoteEmojiHex && (!localEmojiHex || local.icon === "📁") && hexToEmoji(remoteEmojiHex) !== local.icon;
          if (colorChanged || emojiChanged) {
            try {
              const updateBody: Record<string, unknown> = {};
              if (colorChanged) updateBody.color = local.color;
              if (emojiChanged) updateBody.emoji = localEmojiHex;
              await apiUpdateProject(token, remoteId, updateBody);
              console.log(`[SingularitySync] Updated remote project "${local.name}" color/emoji:`, updateBody);
            } catch (e) {
              console.warn(`[SingularitySync] Failed to update project ${local.name}:`, e);
            }
          }
          if (shouldPullEmoji) {
            skipNextProjectPush = true;
            const { updateProject } = await import("src/task-tracker/stores");
            updateProject(local.id, { icon: hexToEmoji(remoteEmojiHex) });
            console.log(`[SingularitySync] Pulled emoji for project "${local.name}": ${remoteEmojiHex} → ${hexToEmoji(remoteEmojiHex)}`);
          }
          continue;
        }
      }

      // Try to find remote match by name
      const match = remoteProjects.find(
        (rp) => rp.title.toLowerCase() === local.name.toLowerCase()
      );
      if (match) {
        projectMap[local.id] = match.id;
        mappedRemoteIds.add(match.id);
        mapped++;
        // Update local project emoji from remote if available
        if (match.emoji) {
          const remoteIcon = hexToEmoji(match.emoji);
          if (remoteIcon !== local.icon) {
            skipNextProjectPush = true;
            const { updateProject } = await import("src/task-tracker/stores");
            updateProject(local.id, { icon: remoteIcon });
          }
        }
      } else {
        // No remote match — create project remotely
        try {
          const remote = await apiCreateProject(token, {
            title: local.name,
            color: local.color || undefined,
            emoji: emojiToHex(local.icon),
          });
          if (remote.id) {
            projectMap[local.id] = remote.id;
            mappedRemoteIds.add(remote.id);
            created++;
            console.log(`[SingularitySync] Created remote project "${local.name}" → ${remote.id}`);
          } else {
            console.error(`[SingularitySync] Created remote project "${local.name}" but received no ID:`, remote);
          }
        } catch (e) {
          console.error(`[SingularitySync] Failed to create remote project "${local.name}":`, e);
        }
      }
    }

    // 2. Pull remote projects that have no local match
    // Re-read local projects in case we added some above
    localProjects = get(projects);
    for (const remote of remoteProjects) {
      if (mappedRemoteIds.has(remote.id)) continue;
      if (remote.removed || remote.archived) continue;

      // Check if a local project with the same name already exists (including just-created)
      const existingLocal = localProjects.find(
        (lp) => lp.name.toLowerCase() === remote.title.toLowerCase()
      );
      if (existingLocal) {
        // Just map it
        projectMap[existingLocal.id] = remote.id;
        mapped++;
        console.log(`[SingularitySync] Mapped local project "${existingLocal.name}" → remote ${remote.id}`);
        continue;
      }

      // Create local project
      skipNextProjectPush = true;
      const { addProject } = await import("src/task-tracker/stores");
      const newProject = addProject({
        name: remote.title,
        color: remote.color || "#647177",
        icon: hexToEmoji(remote.emoji),
        folder: null,
        archived: false,
        sortOrder: 0,
      });
      projectMap[newProject.id] = remote.id;
      pulled++;
      console.log(`[SingularitySync] Pulled remote project "${remote.title}" → local ${newProject.id}`);
    }

    // 3. Save updated map to syncMap (primary persistence) and settings (backward compat)
    syncMap.projectMap = projectMap;
    await saveSyncMap();
    
    if (pluginInstance) {
      await (pluginInstance as unknown as { writeOptions: (c: Record<string, unknown>) => Promise<void> }).writeOptions.call(pluginInstance, { singularityProjectMap: projectMap });
    }

    console.log(`[SingularitySync] Projects sync done: created=${created}, mapped=${mapped}, pulled=${pulled}`);
  } catch (e) {
    console.error("[SingularitySync] Project sync failed:", e);
  }

  return syncMap.projectMap || {};
}

// --- Habit Sync ---

let skipNextHabitPush = false;

export async function syncHabits(): Promise<Record<string, string>> {
  const token = getToken();
  if (!token || !pluginInstance) return syncMap.habitMap || {};

  let created = 0;
  let mapped = 0;
  let pulled = 0;

  try {
    const remoteHabits = await apiGetHabits(token, { maxCount: 100 });
    const habitMap = { ...(syncMap.habitMap || {}) };
    let localHabits = get(habits);

    console.log(`[SingularitySync] Habits: ${remoteHabits.length} remote, ${localHabits.length} local, ${Object.keys(habitMap).length} mapped`);

    const mappedRemoteIds = new Set(Object.values(habitMap));

    // 0. Clean stale map entries + delete remotely habits removed locally
    const remoteHabitIds = new Set(remoteHabits.map((h) => h.id));
    const localHabitIds = new Set(localHabits.map((h) => h.id));
    for (const mapLocalId of Object.keys(habitMap)) {
      if (!localHabitIds.has(mapLocalId)) {
        const remoteId = habitMap[mapLocalId];
        // Delete remotely if the remote habit still exists
        if (remoteHabitIds.has(remoteId)) {
          try {
            await apiDeleteHabit(token, remoteId);
            console.log(`[SingularitySync] Deleted remote habit ${remoteId} (local removed)`);
          } catch { /* already deleted */ }
        }
        mappedRemoteIds.delete(remoteId);
        delete habitMap[mapLocalId];
      }
    }

    // 1. Map by name + push local habits with no remote match
    for (const local of localHabits) {
      if (habitMap[local.id]) {
        const remoteId = habitMap[local.id];
        const remote = remoteHabits.find((rh) => rh.id === remoteId);
        if (!remote) {
          delete habitMap[local.id];
          mappedRemoteIds.delete(remoteId);
          // Fall through to name-match / create
        } else {
          // Bidirectional sync: compare remote vs local changes
          const remoteColorHex = singularityColorToHex(remote.color);
          const titleChanged = remote.title !== local.title;
          const colorChanged = remoteColorHex !== local.color;

          if (titleChanged || colorChanged) {
            const remoteModMs = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
            const localModMs = local.createdAt || 0;

            if (remoteModMs > localModMs) {
              // Remote is newer — pull to local
              skipNextHabitPush = true;
              const { updateHabit } = await import("src/habit-tracker/stores");
              const changes: Partial<{ title: string; color: string }> = {};
              if (titleChanged) changes.title = remote.title;
              if (colorChanged) changes.color = remoteColorHex;
              updateHabit(local.id, changes);
              console.log(`[SingularitySync] Pulled habit changes "${remote.title}"`);
            } else {
              // Local is newer — push to remote
              try {
                await apiUpdateHabit(token, remoteId, buildUpdateHabitBody(local));
                console.log(`[SingularitySync] Pushed habit changes "${local.title}"`);
              } catch (e) {
                console.warn(`[SingularitySync] Failed to update habit ${local.title}:`, e);
              }
            }
          }
          continue;
        }
      }

      // Try name match
      const match = remoteHabits.find(
        (rh) => rh.title.toLowerCase() === local.title.toLowerCase()
      );
      if (match) {
        habitMap[local.id] = match.id;
        mappedRemoteIds.add(match.id);
        mapped++;
        // Pull color from remote
        if (match.color) {
          const remoteHex = singularityColorToHex(match.color);
          if (remoteHex !== local.color) {
            skipNextHabitPush = true;
            const { updateHabit } = await import("src/habit-tracker/stores");
            updateHabit(local.id, { color: remoteHex });
          }
        }
      } else {
        // Create remote habit
        try {
          const remote = await apiCreateHabit(token, buildCreateHabitBody(local));
          if (remote.id) {
            habitMap[local.id] = remote.id;
            mappedRemoteIds.add(remote.id);
            created++;
            console.log(`[SingularitySync] Created remote habit "${local.title}" → ${remote.id}`);
          }
        } catch (e) {
          console.error(`[SingularitySync] Failed to create remote habit "${local.title}":`, e);
        }
      }
    }

    // 2. Pull remote habits with no local match
    localHabits = get(habits);
    for (const remote of remoteHabits) {
      if (mappedRemoteIds.has(remote.id)) continue;
      if (remote.removed || remote.archived) continue;

      const existingLocal = localHabits.find(
        (lh) => lh.title.toLowerCase() === remote.title.toLowerCase()
      );
      if (existingLocal) {
        habitMap[existingLocal.id] = remote.id;
        mapped++;
        continue;
      }

      // Create local habit
      skipNextHabitPush = true;
      const { addHabit } = await import("src/habit-tracker/stores");
      const remoteData = buildLocalHabitFromRemote(remote);
      const newHabit = addHabit({
        title: remoteData.title,
        icon: remoteData.icon,
        color: remoteData.color,
        frequency: "daily",
        targetCount: 1,
        archived: false,
        sortOrder: 0,
      });
      habitMap[newHabit.id] = remote.id;
      pulled++;
      console.log(`[SingularitySync] Pulled remote habit "${remote.title}" → local ${newHabit.id}`);
    }

    // 2b. Delete locally habits that were removed remotely
    localHabits = get(habits);
    for (const local of localHabits) {
      const remoteId = habitMap[local.id];
      if (!remoteId) continue; // not synced
      const remote = remoteHabits.find((rh) => rh.id === remoteId);
      if (!remote || remote.removed) {
        // Remote habit was deleted — delete locally
        skipNextHabitPush = true;
        const { removeHabit } = await import("src/habit-tracker/stores");
        removeHabit(local.id);
        delete habitMap[local.id];
        pulled++;
        console.log(`[SingularitySync] Deleted local habit "${local.title}" (remote removed)`);
      }
    }

    // 3. Sync habit progress (last 30 days)
    await syncHabitProgress(token, habitMap);

    // 4. Save
    syncMap.habitMap = habitMap;
    await saveSyncMap();

    console.log(`[SingularitySync] Habits sync done: created=${created}, mapped=${mapped}, pulled=${pulled}`);
  } catch (e) {
    console.error("[SingularitySync] Habit sync failed:", e);
  }

  return syncMap.habitMap || {};
}

async function syncHabitProgress(token: string, habitMap: Record<string, string>): Promise<void> {
  const reverseHabitMap = buildReverseHabitMap(habitMap);
  const localHabits = get(habits);

  // Only sync daily habits (targetCount <= 1)
  const syncableHabitIds = new Set(
    localHabits.filter((h) => (h.targetCount || 1) <= 1 && habitMap[h.id]).map((h) => h.id)
  );

  const dateFrom = moment().subtract(30, "days").format("YYYY-MM-DD");
  const dateTo = moment().format("YYYY-MM-DD");

  try {
    // 1. Fetch remote progress
    const allRemoteProgress = await apiGetHabitProgress(token, { maxCount: 500 });
    const remoteProgress = allRemoteProgress.filter(
      (rp) => rp.date >= dateFrom && rp.date <= dateTo
    );
    console.log(`[SingularitySync] Habit progress: ${remoteProgress.length} remote entries (of ${allRemoteProgress.length} total)`);

    const { getHabitProgressOnDate, setHabitProgress } = await import("src/habit-tracker/stores");

    // Mapping between local and remote progress:
    //   Local:  0 = not done, 1 = 50%, 2 = 100%
    //   Remote: 1 = cancel/keep streak, 2 = done
    //   Remote→Local: 1→0, 2→2
    //   Local→Remote: 0→1, 1→1, 2→2

    // 2. Build remote progress map: "localHabitId::date" -> LOCAL progress (0,1,2)
    const remoteProgressMap = new Map<string, number>();
    for (const rp of remoteProgress) {
      const localId = reverseHabitMap.get(rp.habit);
      if (!localId || !syncableHabitIds.has(localId)) continue;
      // Convert remote progress to local: remote 1 → local 0, remote 2 → local 2
      const localProg = rp.progress === 1 ? 0 : rp.progress === 2 ? 2 : 0;
      remoteProgressMap.set(`${localId}::${rp.date}`, localProg);
    }

    // 3. Load previous snapshot
    const snapshot = syncMap.habitDoneSnapshot || {};
    const prevSyncedProgress = new Map<string, number>();
    for (const [localId, entries] of Object.entries(snapshot)) {
      if (!syncableHabitIds.has(localId)) continue;
      for (const entry of entries) {
        // entries stored as "date:progress" e.g. "2026-08-02:2"
        const [date, prog] = entry.split(":");
        prevSyncedProgress.set(`${localId}::${date}`, parseInt(prog) || 2);
      }
    }

    // 4. Sync each habit+date cell (SingularityApp model)
    const newSnapshot: Record<string, string[]> = {};

    // Collect all dates we need to check (union of remote, local, prev snapshot)
    const allKeys = new Set<string>();
    for (const key of remoteProgressMap.keys()) allKeys.add(key);
    for (const key of prevSyncedProgress.keys()) allKeys.add(key);
    // Also add local progress entries
    const localLogs = get(habitLogs);
    for (const log of localLogs) {
      if (!syncableHabitIds.has(log.habitId)) continue;
      if (log.date < dateFrom) continue;
      allKeys.add(`${log.habitId}::${log.date}`);
    }

    for (const key of allKeys) {
      const [localId, date] = key.split("::");
      if (!syncableHabitIds.has(localId)) continue;

      const remoteProg = remoteProgressMap.get(key) ?? 0;
      const localProg = getHabitProgressOnDate(localId, date);
      const prevProg = prevSyncedProgress.get(key) ?? 0;

      let action: "none" | "pull" | "push" = "none";
      let newProg = localProg;

      if (remoteProg === localProg) {
        // In sync — no action
        action = "none";
      } else if (localProg !== prevProg) {
        // Local changed since last sync — always push (user action takes priority)
        action = "push";
        newProg = localProg;
      } else if (remoteProg !== prevProg) {
        // Only remote changed — pull
        action = "pull";
        newProg = remoteProg;
      } else {
        // Neither changed but different — shouldn't happen, skip
        action = "none";
      }

      if (action === "pull") {
        skipNextHabitPush = true;
        setHabitProgress(localId, date, newProg);
      } else if (action === "push") {
        const remoteId = habitMap[localId];
        if (remoteId) {
          // Convert local progress to remote: 0→1(cancel), 1→1, 2→2
          const remoteProgValue = localProg === 0 ? 1 : localProg === 1 ? 1 : 2;
          try {
            await apiCreateHabitProgress(token, { habit: remoteId, date, progress: remoteProgValue });
            await delay(API_CALL_DELAY_MS);
          } catch {
            // 409 — entry already exists. Delete old one, create new.
            const existingEntry = allRemoteProgress.find(
              (rp) => rp.habit === remoteId && rp.date === date
            );
            if (existingEntry) {
              try {
                await apiDeleteHabitProgress(token, existingEntry.id);
                await delay(API_CALL_DELAY_MS);
                await apiCreateHabitProgress(token, { habit: remoteId, date, progress: remoteProgValue });
                await delay(API_CALL_DELAY_MS);
              } catch { /* ignore */ }
            }
          }
        }
      }

      // Update snapshot — always store, even when progress=0 (needed for change detection)
      const finalProg = action === "pull" ? newProg : localProg;
      if (!newSnapshot[localId]) newSnapshot[localId] = [];
      newSnapshot[localId].push(`${date}:${finalProg}`);
    }

    // Preserve snapshot entries older than dateFrom (not processed this sync)
    for (const [localId, entries] of Object.entries(snapshot)) {
      if (!newSnapshot[localId]) newSnapshot[localId] = [];
      for (const entry of entries) {
        const [date] = entry.split(":");
        if (date < dateFrom && !allKeys.has(`${localId}::${date}`)) {
          newSnapshot[localId].push(entry);
        }
      }
    }

    syncMap.habitDoneSnapshot = newSnapshot;
    console.log(`[SingularitySync] Habit progress sync done: ${allKeys.size} cells checked`);
  } catch (e) {
    console.warn("[SingularitySync] Failed to sync habit progress:", e);
  }
}

// --- Checklist Sync ---

let skipNextChecklistPush = false;

export async function syncChecklists(): Promise<void> {
  const token = getToken();
  if (!token || !pluginInstance) return;

  const localTasks = get(tasks);
  const localChecklists = get(checklists);
  const checklistMap = { ...(syncMap.checklistMap || {}) };

  // Build reverse map: remoteChecklistId -> localChecklistId
  const reverseChecklistMap = new Map<string, string>();
  for (const [localId, remoteId] of Object.entries(checklistMap)) {
    reverseChecklistMap.set(remoteId, localId);
  }

  // Process each synced task
  for (const task of localTasks) {
    if (!task.singularityId) continue;

    try {
      // Fetch remote checklist items for this task
      const remoteItems = await apiGetChecklistItems(token, task.singularityId);
      const localItems = localChecklists.filter((c) => c.taskId === task.id);

      // Map remote items to local by ID mapping or title match
      const matchedRemoteIds = new Set<string>();

      // 1. Update existing mapped items
      for (const local of localItems) {
        const remoteId = checklistMap[local.id];
        if (remoteId) {
          const remote = remoteItems.find((r) => r.id === remoteId);
          if (remote) {
            matchedRemoteIds.add(remote.id);
            const remoteChecked = !!remote.done;
            const titleChanged = remote.title !== local.title;
            const checkedChanged = remoteChecked !== local.checked;

            if (titleChanged || checkedChanged) {
              // Determine which side is newer using modificatedDate from API
              const remoteModMs = remote.modificatedDate ? Number(remote.modificatedDate) : 0;
              const localModMs = local.updatedAt || 0;

              if (remoteModMs > localModMs) {
                // Remote is newer — pull to local
                skipNextChecklistPush = true;
                const { updateChecklistItem } = await import("src/task-tracker/stores");
                const changes: { title?: string; checked?: boolean } = {};
                if (titleChanged) changes.title = remote.title;
                if (checkedChanged) changes.checked = remoteChecked;
                updateChecklistItem(local.id, changes);
              } else {
                // Local is newer — push to remote
                try {
                  const body: { title?: string; done?: boolean } = {};
                  if (titleChanged) body.title = local.title;
                  if (checkedChanged) body.done = local.checked;
                  await apiUpdateChecklistItem(token, remoteId, body);
                } catch { /* ignore */ }
              }
            }
            continue;
          }
          // Remote item was deleted — delete local
          delete checklistMap[local.id];
          skipNextChecklistPush = true;
          const { removeChecklistItem } = await import("src/task-tracker/stores");
          removeChecklistItem(local.id);
          continue;
        }

        // Try title match for unmapped items
        const match = remoteItems.find(
          (r) => r.title === local.title && !matchedRemoteIds.has(r.id)
        );
        if (match) {
          checklistMap[local.id] = match.id;
          matchedRemoteIds.add(match.id);
          // Bidirectional sync of checked status
          if (!!match.done !== local.checked) {
            const remoteModMs = match.modificatedDate ? Number(match.modificatedDate) : 0;
            const localModMs = local.updatedAt || 0;
            if (remoteModMs > localModMs) {
              // Remote is newer — pull to local
              skipNextChecklistPush = true;
              const { updateChecklistItem } = await import("src/task-tracker/stores");
              updateChecklistItem(local.id, { checked: !!match.done });
            } else {
              // Local is newer — push to remote
              try {
                await apiUpdateChecklistItem(token, match.id, { done: local.checked });
              } catch { /* ignore */ }
            }
          }
        } else {
          // Push local item to remote
          try {
            const created = await apiCreateChecklistItem(token, {
              title: local.title,
              parent: task.singularityId,
            });
            if (created.id) {
              checklistMap[local.id] = created.id;
              if (local.checked) {
                await apiUpdateChecklistItem(token, created.id, { done: true });
              }
            }
          } catch (e) {
            console.warn(`[SingularitySync] Failed to push checklist item "${local.title}":`, e);
          }
        }
        await delay(API_CALL_DELAY_MS);
      }

      // 2. Pull remote items that have no local match
      for (const remote of remoteItems) {
        if (matchedRemoteIds.has(remote.id)) continue;
        // Check if a local item with the same title exists
        const existingLocal = localItems.find(
          (l) => l.title === remote.title && !checklistMap[l.id]
        );
        if (existingLocal) {
          checklistMap[existingLocal.id] = remote.id;
          // Push local checked status to remote (local is authoritative)
          if (!!remote.done !== existingLocal.checked) {
            try {
              await apiUpdateChecklistItem(token, remote.id, { done: existingLocal.checked });
            } catch { /* ignore */ }
          }
        } else {
          // Create local item
          skipNextChecklistPush = true;
          const { addChecklistItem, updateChecklistItem } = await import("src/task-tracker/stores");
          const newItem = addChecklistItem(task.id, remote.title || "");
          checklistMap[newItem.id] = remote.id;
          if (remote.done) {
            updateChecklistItem(newItem.id, { checked: true });
          }
        }
      }

      // 3. Delete remotely items that were removed locally
      const localItemIds = new Set(localItems.map((l) => l.id));
      for (const [localId, remoteId] of Object.entries(checklistMap)) {
        if (!localItemIds.has(localId)) {
          try {
            await apiDeleteChecklistItem(token, remoteId);
          } catch { /* already deleted */ }
          delete checklistMap[localId];
        }
      }

    } catch (e) {
      console.warn(`[SingularitySync] Checklist sync failed for task ${task.id}:`, e);
    }
  }

  // Save updated map
  syncMap.checklistMap = checklistMap;
  await saveSyncMap();
}
