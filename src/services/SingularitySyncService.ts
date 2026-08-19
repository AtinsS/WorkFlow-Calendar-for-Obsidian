/**
 * SingularityApp bidirectional sync service (CRUD-based).
 * Pushes local task changes to SingularityApp, pulls remote changes into local store.
 */

import { get, writable } from "svelte/store";
import moment from "moment";
import type CalendarPlugin from "src/main";
import { tRaw } from "../i18n";
import { tasks, projects, checklists } from "src/task-tracker/stores";
import { habits, habitLogs } from "src/habit-tracker/stores";
import { settings } from "src/ui/stores";
import {
  verifyToken,
  getAllTasks,
  createTask as apiCreateTask,
  updateTask as apiUpdateTask,
  getProjects as apiGetProjects,
  createProject as apiCreateProject,
  updateProject as apiUpdateProject,
  deleteProject as apiDeleteProject,
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
  getTags as apiGetTags,
  createTag as apiCreateTag,
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
  STATUS_TAG_PREFIX,
  tagNameById,
} from "./singularityMapper";

// --- Constants ---

const PUSH_DEBOUNCE_MS = 3000;
const SYNC_MAP_FILE = "calendar-data/singularitySync.json";
const API_CALL_DELAY_MS = 500;

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
let syncCycleActive = false; // suppresses all store-triggered pushes during doSync
let lastSyncEndAt = 0; // timestamp of last doSync completion — used to suppress store-triggered re-push
let skipNextProjectPush = false; // flag to prevent re-push after addProject from pull
const skipPushTaskIds = new Set<string>(); // per-task skip flags to prevent missed pushes
let statusTagCache: Record<string, string> | null = null; // cached status tag IDs (status name → A-... ID)

function createEmptySyncMap(): SingularitySyncMap {
  return { tasks: {}, projects: {}, projectMap: {}, habits: {}, habitMap: {}, habitDoneSnapshot: {}, checklistMap: {}, lastFullPullAt: 0, version: 1 };
}

// --- Helpers ---

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isDryRun(): boolean {
  return !!get(settings).singularitySyncDryRun;
}

function dryLog(action: string, detail: string): void {
  console.log(`[SingularitySync][DRY RUN] ${action}: ${detail}`);
}

/** Resolve status tag names to SingularityApp tag IDs (A-... format).
 *  Creates missing tags on the remote side. Caches results. */
async function resolveStatusTagIds(token: string, statuses: string[]): Promise<string[]> {
  if (statuses.length === 0) return [];

  // Build or reuse cache
  if (!statusTagCache) {
    statusTagCache = {};
    try {
      const remoteTags = await apiGetTags(token, { maxCount: 200, includeRemoved: false });
      for (const tag of remoteTags) {
        if (tag.title && tag.id) {
          statusTagCache[tag.title] = tag.id;
          // Also populate reverse cache for statusFromRemote (tag ID → tag name)
          tagNameById[tag.id] = tag.title;
        }
      }
      console.log(`[SingularitySync] Tag cache loaded: ${Object.keys(statusTagCache).length} tags`);
    } catch (e) {
      console.warn("[SingularitySync] Failed to load tags for cache:", e);
      return [];
    }
  }

  const ids: string[] = [];
  for (const status of statuses) {
    const tagName = `${STATUS_TAG_PREFIX}${status}`;
    let tagId = statusTagCache[tagName];

    if (!tagId) {
      // Create the tag remotely
      try {
        if (isDryRun()) {
          dryLog("CREATE tag", tagName);
        } else {
          const created = await apiCreateTag(token, { title: tagName });
          if (created?.id) {
            tagId = created.id;
            statusTagCache[tagName] = tagId;
            tagNameById[tagId] = tagName;
            console.log(`[SingularitySync] Created status tag "${tagName}" → ${tagId}`);
            await delay(API_CALL_DELAY_MS);
          }
        }
      } catch (e) {
        console.warn(`[SingularitySync] Failed to create tag "${tagName}":`, e);
      }
    }

    if (tagId) ids.push(tagId);
  }

  return ids;
}

/** Invalidate the tag cache (e.g., after reset or on error) */
function invalidateTagCache(): void {
  statusTagCache = null;
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
        // Ensure all required fields exist
        if (!parsed.habits) parsed.habits = {};
        if (!parsed.habitMap) parsed.habitMap = {};
        if (!parsed.habitDoneSnapshot) parsed.habitDoneSnapshot = {};
        if (!parsed.checklistMap) parsed.checklistMap = {};
        // Clean stale entries on load
        cleanupSyncMapOnLoad(parsed);
        return parsed;
      }
    }
  } catch {
    // File doesn't exist yet
  }
  return createEmptySyncMap();
}

/** Remove stale mappings at load time (local projects that no longer exist) */
function cleanupSyncMapOnLoad(map: SingularitySyncMap): void {
  const localProjectIds = new Set(get(projects).map(p => p.id));
  let cleaned = 0;

  // Clean projectMap: remove entries where local project doesn't exist
  for (const localId of Object.keys(map.projectMap || {})) {
    if (!localProjectIds.has(localId)) {
      delete map.projectMap[localId];
      cleaned++;
    }
  }

  // Deduplicate projectMap
  const seenRemoteIds = new Set<string>();
  for (const [localId, remoteId] of Object.entries(map.projectMap || {})) {
    if (seenRemoteIds.has(remoteId)) {
      delete map.projectMap[localId];
      cleaned++;
    } else {
      seenRemoteIds.add(remoteId);
    }
  }

  // Clean task sync map: remove entries where local task doesn't exist
  const localTaskIds = new Set(get(tasks).map(t => t.id));
  for (const localId of Object.keys(map.tasks || {})) {
    if (!localTaskIds.has(localId)) {
      delete map.tasks[localId];
      cleaned++;
    }
  }

  // Clean habit map: remove entries where local habit doesn't exist
  const localHabitIds = new Set(get(habits).map(h => h.id));
  for (const localId of Object.keys(map.habitMap || {})) {
    if (!localHabitIds.has(localId)) {
      delete map.habitMap[localId];
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[SingularitySync] Cleaned ${cleaned} stale entries on load`);
    saveSyncMap().catch((e) => console.warn("[SingularitySync] Failed to save cleaned map:", e));
  }
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
  // All tasks including recurring instances are synced as normal tasks
  // (SingularityApp API doesn't support recurrence, so each instance is independent)
  const excludeTagsRaw = get(settings).singularitySyncExcludeTags || "";
  const excludeTags = excludeTagsRaw.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);

  // Pre-resolve status tag IDs (A-... format) — the API rejects text-based tag names
  const statusesInUse = [...new Set(localTasks.map(t => t.status))];
  const statusTagIds = await resolveStatusTagIds(token, statusesInUse);
  console.log(`[SingularitySync] Resolved ${statusTagIds.length} status tag IDs for statuses: ${statusesInUse.join(", ")}`);

  for (const task of localTasks) {
    // Skip tasks with excluded tags
    if (excludeTags.length > 0 && task.tags?.some(t => excludeTags.includes(t.toLowerCase()))) {
      continue;
    }

    // Skip tasks that were just updated from pull (per-task skip flag)
    if (skipPushTaskIds.has(task.id)) {
      skipPushTaskIds.delete(task.id);
      continue;
    }

    try {
      const syncEntry = syncMap.tasks[task.id];

      if (syncEntry) {
        // Task already synced — check if local is newer
        if (task.updatedAt <= syncEntry.lastPushedAt) continue;

        // UPDATE: build body via mapper (now includes status tags as A-... IDs)
        const body = buildUpdateTaskBody(task, projectMap, statusTagIds);
        if (isDryRun()) {
          dryLog("UPDATE task", `${task.title} (${syncEntry.singularityId}) body=${JSON.stringify(body)}`);
        } else {
          await apiUpdateTask(token, syncEntry.singularityId, body);
        }

        // If task is done, archive it in SingularityApp (set journalDate)
        if (task.status === "done" || task.completed) {
          if (isDryRun()) {
            dryLog("ARCHIVE task", `${task.title} (${syncEntry.singularityId})`);
          } else {
            try {
              await apiUpdateTask(token, syncEntry.singularityId, {
                journalDate: new Date().toISOString(),
              });
            } catch (e) {
              console.warn(`[SingularitySync] Failed to archive task ${task.title}:`, e);
            }
          }
        }

        syncMap.tasks[task.id] = {
          ...syncEntry,
          lastPushedAt: Date.now(),
        };
        pushed++;
      } else {
        // CREATE: build body via mapper (now includes externalId, tags as A-... IDs, deadline)
        const body = buildCreateTaskBody(task, projectMap, statusTagIds);
        if (isDryRun()) {
          dryLog("CREATE task", `${task.title} body=${JSON.stringify(body)}`);
          pushed++;
          continue;
        }

        console.log(`[SingularitySync] Create task "${task.title}" endTime="${task.endTime}" scheduledTime="${task.scheduledTime}" → body:`, JSON.stringify(body));
        const created = await apiCreateTask(token, body as Parameters<typeof apiCreateTask>[1]);

        if (!created.id) {
          console.error(`[SingularitySync] Created remote task "${task.title}" but received no ID:`, created);
          continue;
        }

        console.log(`[SingularitySync] Created task "${task.title}" → remote id: ${created.id}`);

        // Set per-task flag BEFORE updateTask to prevent re-push via store subscription
        skipPushTaskIds.add(task.id);

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

  // 2. Soft-delete remotely tasks that were removed locally
  // Use PATCH with deleteDate (corzina) instead of hard DELETE
  const localIds = new Set(localTasks.map((t) => t.id));
  for (const [localId, entry] of Object.entries(syncMap.tasks)) {
    if (!localIds.has(localId)) {
      if (isDryRun()) {
        dryLog("SOFT-DELETE task", `remote ${entry.singularityId} (local ${localId} removed)`);
        pushed++;
      } else {
        try {
          await apiUpdateTask(token, entry.singularityId, {
            deleteDate: new Date().toISOString(),
          });
          pushed++;
        } catch {
          // Task already deleted or network error — ignore, clean up mapping below
        }
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
    const remoteTasks = await getAllTasks(token, { includeArchived: true, includeAllRecurrenceInstances: true });
    console.log(`[SingularitySync] Pull: fetched ${remoteTasks.length} remote tasks total`);
    if (remoteTasks.length > 0) {
      console.log(`[SingularitySync] Remote task IDs: ${remoteTasks.map(t => `${t.id}(${t.title})`).join(", ")}`);
    }

    const localTasks = get(tasks);
    const reverseMap = buildReverseMap(syncMap.tasks);
    const reverseProjectMap = buildReverseProjectMap(projectMap);

    console.log(`[SingularitySync] Pull: ${remoteTasks.length} remote tasks, ${localTasks.length} local tasks, ${reverseMap.size} in syncMap`);

    for (const remote of remoteTasks) {
      // Trashed tasks — if they were synced locally, mark for deletion
      if (remote.deleteDate) {
        const localId = reverseMap.get(remote.id);
        if (localId) {
          const localExists = localTasks.some((t) => t.id === localId);
          if (localExists) {
            if (isDryRun()) {
              dryLog("DELETE local task", `${remote.title} (${remote.id}) → local ${localId} (trashed remotely)`);
            } else {
              const { removeTask } = await import("src/task-tracker/stores");
              skipNextPush = true; // global flag needed — task won't exist in store after removal
              removeTask(localId);
            }
            pulled++;
          }
          delete syncMap.tasks[localId];
        }
        continue;
      }

      try {
        const localId = reverseMap.get(remote.id);

        if (localId) {
          // READ (update existing): check if remote is newer or status changed
          const localTask = localTasks.find((t) => t.id === localId);
          if (!localTask) {
            console.log(`[SingularitySync] Pull skip (local not found): ${remote.id}(${remote.title}) localId=${localId}`);
            continue;
          }

          const remoteUpdated = parseRemoteUpdatedAt(remote.updatedAt) || parseRemoteUpdatedAt(remote.modificatedDate);
          const syncEntry = syncMap.tasks[localId];
          const remoteData = buildLocalTaskFromRemote(remote, reverseProjectMap);
          const statusChanged = remoteData.status !== localTask.status;
          const descriptionChanged = remoteData.description !== undefined && remoteData.description !== localTask.description;
          const titleChanged = remoteData.title !== localTask.title;
          const dateChanged = remoteData.dateUID !== localTask.dateUID;
          const timeChanged = remoteData.scheduledTime !== localTask.scheduledTime;
          const deadlineChanged = remoteData.deadline !== localTask.deadline;
          const recurrenceChanged = JSON.stringify(remoteData.recurrence) !== JSON.stringify(localTask.recurrence);

          if (statusChanged || descriptionChanged || titleChanged || dateChanged || timeChanged || deadlineChanged || recurrenceChanged || (remoteUpdated > localTask.updatedAt && remoteUpdated > (syncEntry?.lastPulledAt || 0))) {
            if (isDryRun()) {
              dryLog("UPDATE local task", `${remote.title} (${remote.id}) → local ${localId} statusChanged=${statusChanged}`);
            } else {
              const { updateTask } = await import("src/task-tracker/stores");
              skipPushTaskIds.add(localId);
              updateTask(localId, {
                ...remoteData,
                singularityId: remote.id,
                projectId: remoteData.projectId ?? localTask.projectId,
              });
            }

            syncMap.tasks[localId] = {
              ...syncEntry,
              lastPushedAt: Date.now(),
              lastPulledAt: Date.now(),
            };
            pulled++;
          } else {
            console.log(`[SingularitySync] Pull skip (not newer): ${remote.id}(${remote.title}) remoteUpdated=${remoteUpdated} localUpdated=${localTask.updatedAt}`);
          }
        } else {
          // READ (create new): remote task doesn't exist locally
          // DEDUP: check if remote.externalId matches an existing local task ID
          // (this happens when push created the remote task but sync map was lost/corrupted)
          if (remote.externalId) {
            const existingLocal = localTasks.find(t => t.id === remote.externalId);
            if (existingLocal) {
              console.log(`[SingularitySync] Pull dedup: remote ${remote.id}(${remote.title}) matched local ${existingLocal.id} via externalId`);
              skipPushTaskIds.add(existingLocal.id);
              syncMap.tasks[existingLocal.id] = {
                singularityId: remote.id,
                lastPushedAt: Date.now(),
                lastPulledAt: Date.now(),
              };
              // Also update local task's singularityId if missing
              if (!existingLocal.singularityId) {
                const { updateTask: updateTaskForDedup } = await import("src/task-tracker/stores");
                updateTaskForDedup(existingLocal.id, { singularityId: remote.id });
              }
              continue;
            }
          }

          const remoteData = buildLocalTaskFromRemote(remote, reverseProjectMap);
          if (isDryRun()) {
            dryLog("CREATE local task", `${remote.title} (${remote.id}) dateUID=${remoteData.dateUID}`);
            pulled++;
            continue;
          }

          console.log(`[SingularitySync] Pull creating: ${remote.id}(${remote.title}) dateUID=${remoteData.dateUID} scheduledTime=${remoteData.scheduledTime}`);
          const { addTask } = await import("src/task-tracker/stores");
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
            ...(remoteData.recurrence ? { recurrence: remoteData.recurrence } : {}),
            ...(remoteData.isRecurringInstance ? { isRecurringInstance: true } : {}),
            ...(remoteData.parentTaskId ? { parentTaskId: remoteData.parentTaskId } : {}),
          });

          skipPushTaskIds.add(newTask.id);
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

    // 3. Delete local tasks whose remote counterparts are missing from the API response
    // (deleted in SingularityApp). Only if we successfully fetched all tasks.
    const remoteIds = new Set(remoteTasks.map((t) => t.id));
    const { removeTask: removeTaskForDeleted } = await import("src/task-tracker/stores");
    const currentLocalTasks = get(tasks);
    for (const [localId, entry] of Object.entries(syncMap.tasks)) {
      if (!remoteIds.has(entry.singularityId)) {
        const localExists = currentLocalTasks.some((t) => t.id === localId);
        if (localExists) {
          if (isDryRun()) {
            dryLog("DELETE local task", `remote ${entry.singularityId} missing from API → local ${localId}`);
          } else {
            skipNextPush = true;
            removeTaskForDeleted(localId);
          }
          pulled++;
          console.log(`[SingularitySync] Pull deleted (missing from remote): ${entry.singularityId} → local ${localId}`);
        }
        delete syncMap.tasks[localId];
      }
    }
    // Tasks are only deleted locally when the remote explicitly has deleteDate set (handled above).

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
  if (!isEnabled() || !loaded || syncCycleActive) return;

  // Suppress store-triggered pushes that happen right after a sync completes.
  // Without this, store updates from doSync → pullRemoteChanges trigger
  // subscriptions → schedulePush → 3s debounce → doSync → infinite loop.
  const sinceLastSync = Date.now() - lastSyncEndAt;
  if (sinceLastSync < PUSH_DEBOUNCE_MS * 2) {
    console.log(`[SingularitySync] schedulePush suppressed (${sinceLastSync}ms since last sync)`);
    return;
  }

  if (pushTimeout) clearTimeout(pushTimeout);
  pushTimeout = setTimeout(async () => {
    if (syncing || !isEnabled()) return;
    // Re-check: a sync may have completed while we were waiting
    if (Date.now() - lastSyncEndAt < PUSH_DEBOUNCE_MS * 2) return;
    await doSync("both");
  }, PUSH_DEBOUNCE_MS);
}

async function doSync(direction: "push" | "pull" | "both"): Promise<void> {
  if (syncing) return;
  const token = getToken();
  if (!token) return;

  console.log(`[SingularitySync] doSync(${direction}) starting...`);
  syncing = true;
  syncCycleActive = true;
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

    // Sync habits — respect syncDirection
    if (syncDirection === "both" || syncDirection === "pull" || syncDirection === "push") {
      await syncHabits(syncDirection);
      console.log(`[SingularitySync] doSync: habits synced (direction=${syncDirection})`);
    }

    // Sync checklists — respect syncDirection
    if (syncDirection === "both" || syncDirection === "pull" || syncDirection === "push") {
      await syncChecklists(syncDirection);
      console.log(`[SingularitySync] doSync: checklists synced (direction=${syncDirection})`);
    }

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
    const msg = e instanceof Error ? e.message : tRaw("singularity.syncError");
    singularitySyncStatus.update((s) => ({
      ...s,
      syncing: false,
      error: msg,
    }));
  } finally {
    syncing = false;
    syncCycleActive = false;
    lastSyncEndAt = Date.now();
    // Cancel any push that was scheduled by store updates during this sync
    if (pushTimeout) {
      clearTimeout(pushTimeout);
      pushTimeout = null;
    }
  }

  if (pushed || pulled) {
    console.log(`[SingularitySync] Sync complete: pushed=${pushed}, pulled=${pulled}, errors=${errors}`);
  }
}

export async function triggerManualSync(): Promise<void> {
  await doSync("both");
}

// --- Polling ---

function startPolling(): void {
  stopPolling();
  const intervalMin = get(settings).singularitySyncInterval || 5;
  const intervalMs = Math.max(1, intervalMin) * 60 * 1000;

  pollInterval = setInterval(() => {
    if (isEnabled() && !syncing) {
      doSync("both");
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
    tasks.subscribe((currentTasks) => {
      if (skipNextPush) {
        skipNextPush = false;
        return;
      }
      // Clear per-task skip flags for tasks that are still in the store
      for (const task of currentTasks) {
        skipPushTaskIds.delete(task.id);
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

  // Subscribe to settings changes (only react to sync-relevant fields)
  let prevAutoSync = get(settings).singularityAutoSync;
  let prevToken = get(settings).singularityToken;
  let prevInterval = get(settings).singularitySyncInterval;
  unsubscribers.push(
    settings.subscribe((s) => {
      const autoSyncChanged = s.singularityAutoSync !== prevAutoSync;
      const tokenChanged = s.singularityToken !== prevToken;
      const intervalChanged = s.singularitySyncInterval !== prevInterval;
      prevAutoSync = s.singularityAutoSync;
      prevToken = s.singularityToken;
      prevInterval = s.singularitySyncInterval;

      // Ignore changes made by doSync itself (singularityLastSync etc.)
      if (!autoSyncChanged && !tokenChanged && !intervalChanged) return;

      const wasConnected = get(singularitySyncStatus).connected;
      const hasToken = !!s.singularityToken;

      if (tokenChanged && hasToken && !wasConnected) {
        verifyToken(s.singularityToken!).then((result) => {
          singularitySyncStatus.update((st) => ({
            ...st,
            connected: result.success,
            error: result.error || "",
          }));
        });
      }

      // Only restart polling when sync-related settings actually change
      if (autoSyncChanged || tokenChanged || intervalChanged) {
        if (s.singularityAutoSync && hasToken) {
          startPolling();
        } else {
          stopPolling();
        }
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
  invalidateTagCache();
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
  invalidateTagCache();
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

/** Reset only project mapping — clears corrupted projectMap and lets sync rebuild it */
export async function resetProjectMap(): Promise<void> {
  syncMap.projectMap = {};
  if (syncMap.habitMap) syncMap.habitMap = {};
  await saveSyncMap();

  // Also clear settings projectMap
  if (pluginInstance) {
    await (pluginInstance as unknown as { writeOptions: (c: Record<string, unknown>) => Promise<void> }).writeOptions.call(pluginInstance, { singularityProjectMap: {} });
  }

  console.log("[SingularitySync] Project map reset — will rebuild on next sync");
}

export async function syncProjects(): Promise<Record<string, string>> {
  const token = getToken();
  if (!token || !pluginInstance) return syncMap.projectMap || {};

  let created = 0;
  let mapped = 0;
  let pulled = 0;

  try {
    // Do NOT include removed (trashed) projects — they pollute the mapping
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

    // 0. Aggressive cleanup: remove all invalid mappings
    const localProjectIds = new Set(localProjects.map(lp => lp.id));
    const seenRemoteIds = new Set<string>();
    const deletedRemoteIds = new Set<string>();
    const justCleanedLocalIds = new Set<string>(); // track cleaned to prevent re-creation
    let cleaned = 0;

    for (const mapLocalId of Object.keys(projectMap)) {
      const remoteId = projectMap[mapLocalId];
      let shouldRemove = false;

      // Local project deleted — also delete remote
      if (!localProjectIds.has(mapLocalId)) {
        shouldRemove = true;
        if (isDryRun()) {
          dryLog("DELETE remote project", `${remoteId} (local ${mapLocalId} removed)`);
          deletedRemoteIds.add(remoteId);
        } else {
          const deleted = await apiDeleteProject(token, remoteId);
          if (deleted) {
            deletedRemoteIds.add(remoteId);
            console.log(`[SingularitySync] Deleted remote project ${remoteId} (local ${mapLocalId} removed)`);
          }
        }
      }
      // Remote project deleted/trashed
      else {
        const remote = remoteProjects.find(rp => rp.id === remoteId);
        if (!remote || remote.removed) {
          shouldRemove = true;
          deletedRemoteIds.add(remoteId);
        }
      }
      // Duplicate remote ID
      if (!shouldRemove && seenRemoteIds.has(remoteId)) {
        shouldRemove = true;
      }

      if (shouldRemove) {
        justCleanedLocalIds.add(mapLocalId);
        delete projectMap[mapLocalId];
        cleaned++;
      } else {
        seenRemoteIds.add(remoteId);
      }
    }

    if (cleaned > 0) {
      console.log(`[SingularitySync] Cleaned ${cleaned} stale project mappings`);
    }

    // Rebuild mappedRemoteIds after cleanup
    mappedRemoteIds.clear();
    for (const remoteId of Object.values(projectMap)) {
      mappedRemoteIds.add(remoteId);
    }

    // 1. Auto-map by name match + push local projects that have no remote match
    for (const local of localProjects) {
      if (projectMap[local.id]) {
        // Already mapped — verify remote project still exists and update color
        const remoteId = projectMap[local.id];
        console.log(`[SingularitySync] Checking mapped project "${local.name}": localId=${local.id}, remoteId=${remoteId}`);
        const remote = remoteProjects.find((rp) => rp.id === remoteId);
        if (!remote || remote.removed) {
          // Remote project was deleted or trashed — remove stale mapping
          console.warn(`[SingularitySync] Remote project for "${local.name}" (${remoteId}) not found or removed, removing mapping`);
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
              if (isDryRun()) {
                dryLog("UPDATE remote project", `"${local.name}" (${remoteId}) body=${JSON.stringify(updateBody)}`);
              } else {
                await apiUpdateProject(token, remoteId, updateBody);
                console.log(`[SingularitySync] Updated remote project "${local.name}" color/emoji:`, updateBody);
              }
            } catch (e) {
              if (e instanceof Error && e.name === "SingularityNotFoundError") {
                // Project was trashed — clean up mapping
                console.warn(`[SingularitySync] Project "${local.name}" not found on remote, cleaning mapping`);
                delete projectMap[local.id];
                mappedRemoteIds.delete(remoteId);
              } else {
                console.warn(`[SingularitySync] Failed to update project ${local.name}:`, e);
              }
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

      // Skip projects that were just cleaned (prevent cleanup → create cycle)
      if (justCleanedLocalIds.has(local.id)) {
        console.log(`[SingularitySync] Skipping project "${local.name}" — just cleaned, will not re-create`);
        continue;
      }

      // Try to find remote match by name (not removed, not already mapped to another local)
      const match = remoteProjects.find(
        (rp) => rp.title.toLowerCase() === local.name.toLowerCase() && !rp.removed && !mappedRemoteIds.has(rp.id)
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
          if (isDryRun()) {
            dryLog("CREATE remote project", `"${local.name}" color=${local.color} icon=${local.icon}`);
            created++;
            continue;
          }

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
      if (deletedRemoteIds.has(remote.id)) continue;
      if (remote.removed || remote.archived) continue;

      // Check if a local project with the same name already exists (not already mapped)
      const existingLocal = localProjects.find(
        (lp) => lp.name.toLowerCase() === remote.title.toLowerCase() && !projectMap[lp.id]
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

    // 2b. Delete locally projects that were removed remotely
    localProjects = get(projects);
    for (const local of localProjects) {
      const remoteId = projectMap[local.id];
      if (!remoteId) continue; // not synced
      const remote = remoteProjects.find((rp) => rp.id === remoteId);
      const shouldDelete = !remote || remote.removed;
      if (shouldDelete) {
        console.log(`[SingularitySync] Project "${local.name}" remote deleted: remote=${!!remote}, removed=${remote?.removed}`);
        // Remote project was deleted — delete locally
        skipNextProjectPush = true;
        const { removeProject } = await import("src/task-tracker/stores");
        removeProject(local.id);
        delete projectMap[local.id];
        pulled++;
        console.log(`[SingularitySync] Deleted local project "${local.name}" (remote removed)`);
      }
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

export async function syncHabits(syncDirection: "both" | "push" | "pull" = "both"): Promise<Record<string, string>> {
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
    if (remoteHabits.length > 0) {
      console.log(`[SingularitySync] Remote habits: ${remoteHabits.map(h => `${h.id}(${h.title})`).join(", ")}`);
    }

    const mappedRemoteIds = new Set(Object.values(habitMap));

    // 0. Clean stale map entries + delete remotely habits removed locally (push only)
    const remoteHabitIds = new Set(remoteHabits.map((h) => h.id));
    const localHabitIds = new Set(localHabits.map((h) => h.id));
    for (const mapLocalId of Object.keys(habitMap)) {
      if (!localHabitIds.has(mapLocalId)) {
        const remoteId = habitMap[mapLocalId];
        // Delete remotely only when direction allows push
        if (syncDirection !== "pull" && remoteHabitIds.has(remoteId)) {
          if (isDryRun()) {
            dryLog("DELETE remote habit", `${remoteId} (local removed)`);
          } else {
            try {
              await apiDeleteHabit(token, remoteId);
              console.log(`[SingularitySync] Deleted remote habit ${remoteId} (local removed)`);
            } catch { /* already deleted */ }
          }
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

            if (remoteModMs > localModMs && syncDirection !== "push") {
              // Remote is newer — pull to local
              skipNextHabitPush = true;
              const { updateHabit } = await import("src/habit-tracker/stores");
              const changes: Partial<{ title: string; color: string }> = {};
              if (titleChanged) changes.title = remote.title;
              if (colorChanged) changes.color = remoteColorHex;
              updateHabit(local.id, changes);
              console.log(`[SingularitySync] Pulled habit changes "${remote.title}"`);
            } else if (syncDirection !== "pull") {
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
      } else if (syncDirection !== "pull") {
        // Create remote habit (push only)
        try {
          if (isDryRun()) {
            dryLog("CREATE remote habit", `"${local.title}" color=${local.color}`);
            created++;
            continue;
          }

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
      console.log(`[SingularitySync] Creating local habit from remote: "${remoteData.title}" color=${remoteData.color}`);
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

    // 3. Sync habit progress (last 30 days) — respect syncDirection
    await syncHabitProgress(token, habitMap, syncDirection);

    // 4. Save
    syncMap.habitMap = habitMap;
    await saveSyncMap();

    console.log(`[SingularitySync] Habits sync done: created=${created}, mapped=${mapped}, pulled=${pulled}`);
  } catch (e) {
    console.error("[SingularitySync] Habit sync failed:", e);
  }

  return syncMap.habitMap || {};
}

async function syncHabitProgress(token: string, habitMap: Record<string, string>, syncDirection: "both" | "push" | "pull" = "both"): Promise<void> {
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
    if (remoteProgress.length > 0) {
      console.log(`[SingularitySync] Remote progress samples: ${remoteProgress.slice(0, 3).map(rp => `${rp.habit}@${rp.date}=${rp.progress}`).join(", ")}`);
    }
    console.log(`[SingularitySync] Syncable habit IDs: ${[...syncableHabitIds].join(", ")}`);
    console.log(`[SingularitySync] Reverse habit map: ${JSON.stringify([...reverseHabitMap.entries()].slice(0, 5))}`);

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

      if (action === "pull" && syncDirection !== "push") {
        skipNextHabitPush = true;
        setHabitProgress(localId, date, newProg);
      } else if (action === "push" && syncDirection !== "pull") {
        const remoteId = habitMap[localId];
        if (remoteId) {
          // Convert local progress to remote: 0→1(cancel), 1→1, 2→2
          const remoteProgValue = localProg === 0 ? 1 : localProg === 1 ? 1 : 2;
          try {
            // Check if entry already exists — delete first to avoid 409
            const existingEntry = allRemoteProgress.find(
              (rp) => rp.habit === remoteId && rp.date === date
            );
            if (existingEntry) {
              await apiDeleteHabitProgress(token, existingEntry.id);
              await delay(API_CALL_DELAY_MS);
            }
            await apiCreateHabitProgress(token, { habit: remoteId, date, progress: remoteProgValue });
            await delay(API_CALL_DELAY_MS);
          } catch (e) {
            console.warn(`[SingularitySync] Failed to push habit progress ${remoteId} ${date}:`, e);
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

export async function syncChecklists(syncDirection: "both" | "push" | "pull" = "both"): Promise<void> {
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

  // Pre-index: local checklist item IDs → task ID, and task IDs with mapped checklists
  const localItemIdToTaskId = new Map<string, string>();
  const tasksWithMappedChecklists = new Set<string>();
  for (const item of localChecklists) {
    localItemIdToTaskId.set(item.id, item.taskId);
  }
  for (const localId of Object.keys(checklistMap)) {
    const taskId = localItemIdToTaskId.get(localId);
    if (taskId) tasksWithMappedChecklists.add(taskId);
  }

  // Process each synced task (with delay to avoid 429 rate limit)
  let taskIndex = 0;
  for (const task of localTasks) {
    if (!task.singularityId) continue;

    const localItems = localChecklists.filter((c) => c.taskId === task.id);

    // Skip API call if task has no local checklists and no mapped remote checklists
    if (localItems.length === 0 && !tasksWithMappedChecklists.has(task.id)) continue;

    // Throttle between tasks
    if (taskIndex > 0) {
      await new Promise((r) => setTimeout(r, 1500));
    }
    taskIndex++;

    try {
      // Fetch remote checklist items for this task
      const remoteItems = await apiGetChecklistItems(token, task.singularityId);

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
              // Determine which side is newer using modificatedDate from API (ISO string, not number)
              const remoteModMs = remote.modificatedDate ? new Date(remote.modificatedDate).getTime() : 0;
              const localModMs = local.updatedAt || 0;

              if (remoteModMs > localModMs && syncDirection !== "push") {
                // Remote is newer — pull to local
                skipNextChecklistPush = true;
                const { updateChecklistItem } = await import("src/task-tracker/stores");
                const changes: { title?: string; checked?: boolean } = {};
                if (titleChanged) changes.title = remote.title;
                if (checkedChanged) changes.checked = remoteChecked;
                updateChecklistItem(local.id, changes);
              } else if (syncDirection !== "pull") {
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
            const remoteModMs = match.modificatedDate ? new Date(match.modificatedDate).getTime() : 0;
            const localModMs = local.updatedAt || 0;
            if (remoteModMs > localModMs && syncDirection !== "push") {
              // Remote is newer — pull to local
              skipNextChecklistPush = true;
              const { updateChecklistItem } = await import("src/task-tracker/stores");
              updateChecklistItem(local.id, { checked: !!match.done });
            } else if (syncDirection !== "pull") {
              // Local is newer — push to remote
              try {
                await apiUpdateChecklistItem(token, match.id, { done: local.checked });
              } catch { /* ignore */ }
            }
          }
        } else if (syncDirection !== "pull") {
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
          // Push local checked status to remote (local is authoritative) — only when direction allows push
          if (syncDirection !== "pull" && !!remote.done !== existingLocal.checked) {
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

      // 3. Delete remotely items that were removed locally (push only)
      if (syncDirection !== "pull") {
        const localItemIds = new Set(localItems.map((l) => l.id));
        for (const [localId, remoteId] of Object.entries(checklistMap)) {
          if (!localItemIds.has(localId)) {
            try {
              await apiDeleteChecklistItem(token, remoteId);
            } catch { /* already deleted */ }
            delete checklistMap[localId];
          }
        }
      }

    } catch (e) {
      console.warn(`[SingularitySync] Checklist sync failed for task ${task.id}:`, e);
      // Stop entirely on rate limit — quota exhausted, continuing is pointless
      if (e instanceof Error && e.message.includes("429")) {
        console.warn("[SingularitySync] Rate limit hit, aborting checklist sync for this cycle");
        break;
      }
    }
  }

  // Save updated map
  syncMap.checklistMap = checklistMap;
  await saveSyncMap();
}
