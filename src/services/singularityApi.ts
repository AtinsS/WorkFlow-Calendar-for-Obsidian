/**
 * SingularityApp REST API v2 client.
 * Uses Obsidian's requestUrl() for cross-platform compatibility (desktop + mobile).
 */

import { requestUrl } from "obsidian";
import { tRaw } from "../i18n";

const BASE_URL = "https://api.singularity-app.com/v2";

// --- Types ---

export interface SingularityRecurrence {
  time?: string; // e.g. "07:00"
  paused?: boolean;
  ending?: {
    date?: string; // ISO datetime
    type?: number; // 0=no end, 1=end by date, 2=end by iterations
    limit?: number;
    iterations?: number;
  };
  repeat?: {
    everyday?: { type?: number; interval?: number };
    everyweek?: { type?: number; interval?: number; days?: number[] }; // 0=Sun..6=Sat
    everymonth?: { type?: number; interval?: number; days?: { dayType?: number; dayNumber?: number }[] };
  };
  startTime?: string; // ISO datetime — when recurrence started
  nextTime?: string; // ISO datetime — next instance
  lastTime?: string; // ISO datetime — last generated instance
  onlyOnComplete?: boolean;
  startAfterComplete?: boolean;
  lastGeneratedTaskId?: string;
  notifies?: number[];
  timeLength?: number; // duration in minutes
}

export interface SingularityTask {
  id: string;
  title: string;
  note?: string;
  start?: string; // ISO-8601 datetime with timezone, e.g. "2026-08-01T14:30:00.000Z"
  end?: string; // ISO-8601 datetime — end time
  deadline?: string; // ISO-8601 datetime — deadline
  useTime?: boolean; // whether time is enabled for this task
  timeLength?: number; // time length in minutes
  priority?: number; // 0=high, 1=medium, 2=low
  projectId?: string;
  journalDate?: string; // set = archived/done
  deleteDate?: string; // set = trashed
  checked?: number; // 0=unchecked, 1=checked/done, 2=cancelled
  updatedAt?: string; // ISO datetime
  createdAt?: string;
  tags?: string[];
  isNote?: boolean;
  parent?: string; // parent task ID for subtasks
  externalId?: string; // external system identifier (e.g. local task UUID)
  modificatedDate?: string; // last modification timestamp
  recurrence?: SingularityRecurrence; // recurrence config (only on generator/template tasks)
  recurrenceGeneratorId?: string; // links instance to generator (non-empty = this is a recurring instance)
}

export interface SingularityProject {
  id: string;
  title: string;
  note?: string;
  color?: string;
  emoji?: string;
  archived?: boolean;
  removed?: boolean;
  updatedAt?: string;
  createdAt?: string;
}

export interface SingularityTag {
  id: string;
  title: string;
  parent?: string;
  removed?: boolean;
}

interface ApiResponse<T> {
  data: T;
  total?: number;
  hasMore?: boolean;
}

// --- Helpers ---

/** Unwrap API response: handles { data: T }, { project: T }, { task: T }, and direct T formats */
function unwrapResponse<T>(result: T | ApiResponse<T> | Record<string, unknown>): T {
  if (result && typeof result === "object") {
    if ("data" in result) return (result as ApiResponse<T>).data;
    // SingularityApp wraps project creation in { project: {...}, taskGroup: {...} }
    if ("project" in result && typeof (result as Record<string, unknown>).project === "object") {
      return (result as Record<string, unknown>).project as T;
    }
    // SingularityApp wraps task creation in { task: {...} }
    if ("task" in result && typeof (result as Record<string, unknown>).task === "object") {
      return (result as Record<string, unknown>).task as T;
    }
  }
  return result as T;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function apiRequest<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  retries = 3,
  noRetry429 = false
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const requestBody = body != null ? JSON.stringify(body) : undefined;
      if (body != null) {
        console.log(`[SingularityApp] ${method} ${path} body:`, requestBody);
      }

      const response = await requestUrl({
        url,
        method: method as "GET" | "POST" | "PATCH" | "DELETE",
        headers: authHeaders(token),
        body: requestBody,
        throw: false,
      });

      const status = response.status;
      const responseText = typeof response.text === "string" ? response.text : JSON.stringify(response.json);

      // Retry on rate limit (429) and transient server errors (5xx)
      if (status === 429 || (status >= 500 && status < 600)) {
        const label = status === 429 ? tRaw("singularity.rateLimit") : `${tRaw("singularity.serverError")} ${status}`;
        lastError = new Error(`SingularityApp: ${label} (${status})`);
        if (status === 429 && noRetry429) {
          throw lastError; // fail fast, caller handles backoff
        }
        const delayMs = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
        console.warn(`[SingularityApp] ${method} ${path} → ${status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      if (status === 401) {
        throw new SINGULARITY_AUTH_ERROR();
      }

      if (status === 404) {
        throw new SINGULARITY_NOT_FOUND_ERROR(path);
      }

      // 409 Conflict — resource already exists, treat as success for progress/duplicate endpoints
      if (status === 409) {
        console.log(`[SingularityApp] ${method} ${path} → 409 conflict (ignored)`);
        return undefined as T;
      }

      if (status < 200 || status >= 300) {
        console.error(`[SingularityApp] ${method} ${path} → ${status}:`, responseText);
        throw new Error(
          `SingularityApp API error ${status}: ${responseText}`
        );
      }

      // DELETE returns empty body
      if (method === "DELETE" || responseText === "") {
        return undefined as T;
      }

      return JSON.parse(responseText) as T;
    } catch (e) {
      if (e instanceof SINGULARITY_AUTH_ERROR || e instanceof SINGULARITY_NOT_FOUND_ERROR) {
        throw e;
      }
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < retries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error("SingularityApp API: unknown error");
}

class SINGULARITY_AUTH_ERROR extends Error {
  constructor() {
    super(tRaw("singularity.invalidToken"));
    this.name = "SingularityAuthError";
  }
}

class SINGULARITY_NOT_FOUND_ERROR extends Error {
  constructor(path: string) {
    super(`SingularityApp: ${tRaw("singularity.notFound")} (${path})`);
    this.name = "SingularityNotFoundError";
  }
}

// --- API Methods ---

export async function verifyToken(
  token: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch a single task to verify the token works
    await apiRequest<unknown>(token, "GET", "/task?maxCount=1");
    return { success: true };
  } catch (e) {
    if (e instanceof SINGULARITY_AUTH_ERROR) {
      return { success: false, error: e.message };
    }
    // Network or other error — token might still be valid
    if (e instanceof Error && e.message.includes("API error")) {
      return { success: false, error: e.message };
    }
    return { success: true }; // Token is valid, just couldn't fetch
  }
}

export async function getTasks(
  token: string,
  params?: {
    startDateFrom?: string;
    startDateTo?: string;
    maxCount?: number;
    offset?: number;
    projectId?: string;
    includeArchived?: boolean;
    includeRemoved?: boolean;
    includeAllRecurrenceInstances?: boolean;
  }
): Promise<SingularityTask[]> {
  const searchParams = new URLSearchParams();
  if (params?.startDateFrom) searchParams.set("startDateFrom", params.startDateFrom);
  if (params?.startDateTo) searchParams.set("startDateTo", params.startDateTo);
  if (params?.maxCount != null) searchParams.set("maxCount", String(params.maxCount));
  if (params?.offset != null) searchParams.set("offset", String(params.offset));
  if (params?.projectId) searchParams.set("projectId", params.projectId);
  if (params?.includeArchived) searchParams.set("includeArchived", "true");
  if (params?.includeRemoved) searchParams.set("includeRemoved", "true");
  if (params?.includeAllRecurrenceInstances) searchParams.set("includeAllRecurrenceInstances", "true");

  const query = searchParams.toString();
  const path = `/task${query ? `?${query}` : ""}`;

  const result = await apiRequest<SingularityTask[] | ApiResponse<SingularityTask[]>>(
    token, "GET", path
  );

  console.log("[SingularityApp] getTasks raw response type:", Array.isArray(result) ? "array" : typeof result, "keys:", result && typeof result === "object" ? Object.keys(result as unknown as Record<string, unknown>).join(",") : "N/A");

  // API may return array directly or wrapped in { data, total } or { tasks: [...] }
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const obj = result as unknown as Record<string, unknown>;
    if ("data" in obj) {
      const data = obj.data;
      return Array.isArray(data) ? data as SingularityTask[] : [];
    }
    if ("tasks" in obj && Array.isArray(obj.tasks)) {
      return obj.tasks as SingularityTask[];
    }
    // Fallback: find first array property in the response object
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) {
        console.log(`[SingularityApp] getTasks: using array from key "${key}"`);
        return obj[key] as SingularityTask[];
      }
    }
  }
  console.warn("[SingularityApp] getTasks: unrecognized response format:", JSON.stringify(result).substring(0, 300));
  return [];
}

export async function getAllTasks(
  token: string,
  params?: {
    startDateFrom?: string;
    startDateTo?: string;
    includeArchived?: boolean;
    includeRemoved?: boolean;
    includeAllRecurrenceInstances?: boolean;
  }
): Promise<SingularityTask[]> {
  const allTasks: SingularityTask[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (allTasks.length < 10000) {
    const batch = await getTasks(token, {
      ...params,
      maxCount: pageSize,
      offset,
    });

    allTasks.push(...batch);

    if (batch.length < pageSize) break;
    offset += pageSize;

    // Safety: max 10000 tasks
    if (allTasks.length >= 10000) break;
  }

  return allTasks;
}

export async function createTask(
  token: string,
  body: {
    title: string;
    start?: string;
    note?: string;
    priority?: number;
    projectId?: string;
    deadline?: string;
    useTime?: boolean;
    timeLength?: number;
    tags?: string[];
    externalId?: string;
    isNote?: boolean;
  }
): Promise<SingularityTask> {
  const result = await apiRequest<SingularityTask | ApiResponse<SingularityTask>>(token, "POST", "/task", body);
  return unwrapResponse(result);
}

export async function getTask(
  token: string,
  id: string
): Promise<SingularityTask> {
  const result = await apiRequest<SingularityTask | ApiResponse<SingularityTask>>(token, "GET", `/task/${id}`);
  return unwrapResponse(result);
}

export async function updateTask(
  token: string,
  id: string,
  body: {
    title?: string;
    start?: string;
    note?: string;
    priority?: number;
    projectId?: string;
    deadline?: string;
    useTime?: boolean;
    timeLength?: number;
    journalDate?: string;
    deleteDate?: string;
    tags?: string[];
    externalId?: string;
    checked?: number;
  }
): Promise<void> {
  await apiRequest<void>(token, "PATCH", `/task/${id}`, body);
}

export async function deleteTask(token: string, id: string): Promise<void> {
  await apiRequest<void>(token, "DELETE", `/task/${id}`);
}

export async function getProjects(
  token: string,
  params?: {
    maxCount?: number;
    offset?: number;
    includeArchived?: boolean;
    includeRemoved?: boolean;
  }
): Promise<SingularityProject[]> {
  const searchParams = new URLSearchParams();
  if (params?.maxCount != null) searchParams.set("maxCount", String(params.maxCount));
  if (params?.offset != null) searchParams.set("offset", String(params.offset));
  if (params?.includeArchived) searchParams.set("includeArchived", "true");
  if (params?.includeRemoved) searchParams.set("includeRemoved", "true");

  const query = searchParams.toString();
  const path = `/project${query ? `?${query}` : ""}`;

  const result = await apiRequest<SingularityProject[] | ApiResponse<SingularityProject[]>>(
    token, "GET", path
  );

  console.log("[SingularityApp] getProjects raw response:", JSON.stringify(result).substring(0, 500));

  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const obj = result as unknown as Record<string, unknown>;
    if ("data" in obj) {
      const data = obj.data;
      return Array.isArray(data) ? data as SingularityProject[] : [];
    }
    // SingularityApp may return { projects: [...] }
    if ("projects" in obj && Array.isArray(obj.projects)) {
      return obj.projects as SingularityProject[];
    }
    // Fallback: find first array property in the response object
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) {
        console.log(`[SingularityApp] getProjects: using array from key "${key}"`);
        return obj[key] as SingularityProject[];
      }
    }
  }
  console.warn("[SingularityApp] getProjects: unrecognized response format:", JSON.stringify(result).substring(0, 300));
  return [];
}

export async function createProject(
  token: string,
  body: {
    title: string;
    note?: string;
    color?: string;
    emoji?: string;
  }
): Promise<SingularityProject> {
  const result = await apiRequest<SingularityProject | ApiResponse<SingularityProject>>(token, "POST", "/project", body);
  console.log("[SingularityApp] createProject raw response:", JSON.stringify(result));
  const unwrapped = unwrapResponse(result);
  console.log("[SingularityApp] createProject unwrapped:", JSON.stringify(unwrapped));
  return unwrapped;
}

export async function updateProject(
  token: string,
  id: string,
  body: {
    title?: string;
    note?: string;
    color?: string;
    emoji?: string;
  }
): Promise<void> {
  await apiRequest<void>(token, "PATCH", `/project/${id}`, body);
}

export async function deleteProject(token: string, id: string): Promise<boolean> {
  try {
    await apiRequest<void>(token, "DELETE", `/project/${id}`);
    return true;
  } catch {
    return false;
  }
}

export async function getTags(
  token: string,
  params?: {
    maxCount?: number;
    offset?: number;
    includeRemoved?: boolean;
  }
): Promise<SingularityTag[]> {
  const searchParams = new URLSearchParams();
  if (params?.maxCount != null) searchParams.set("maxCount", String(params.maxCount));
  if (params?.offset != null) searchParams.set("offset", String(params.offset));
  if (params?.includeRemoved) searchParams.set("includeRemoved", "true");

  const query = searchParams.toString();
  const path = `/tag${query ? `?${query}` : ""}`;

  const result = await apiRequest<SingularityTag[] | ApiResponse<SingularityTag[]>>(
    token, "GET", path
  );

  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "data" in result) return result.data;
  return [];
}

export async function createTag(
  token: string,
  body: { title: string; parent?: string }
): Promise<SingularityTag> {
  const result = await apiRequest<SingularityTag | ApiResponse<SingularityTag>>(token, "POST", "/tag", body);
  return unwrapResponse(result);
}

export async function deleteTag(token: string, id: string): Promise<void> {
  await apiRequest<void>(token, "DELETE", `/tag/${id}`);
}

// --- Habit API Types ---

export interface SingularityHabit {
  id: string;
  title: string;
  description?: string;
  color?: string; // named color: "red", "purple", "teal", etc.
  archived?: boolean;
  removed?: boolean;
  updatedAt?: string;
  createdAt?: string;
}

export interface SingularityHabitProgress {
  id: string;
  habit: string; // habit ID
  date: string; // YYYY-MM-DD
  progress: number; // 0=no change, 1=not done (keeps streak), 2=done
}

// --- Habit API Methods ---

export async function getHabits(
  token: string,
  params?: { maxCount?: number }
): Promise<SingularityHabit[]> {
  const searchParams = new URLSearchParams();
  if (params?.maxCount != null) searchParams.set("maxCount", String(params.maxCount));
  const query = searchParams.toString();
  const path = `/habit${query ? `?${query}` : ""}`;

  const result = await apiRequest<SingularityHabit[] | ApiResponse<SingularityHabit[]>>(
    token, "GET", path
  );

  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const obj = result as unknown as Record<string, unknown>;
    if ("data" in obj && Array.isArray(obj.data)) return obj.data as SingularityHabit[];
    if ("habits" in obj && Array.isArray(obj.habits)) return obj.habits as SingularityHabit[];
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) return obj[key] as SingularityHabit[];
    }
  }
  return [];
}

export async function createHabit(
  token: string,
  body: { title: string; description?: string; color?: string }
): Promise<SingularityHabit> {
  const result = await apiRequest<SingularityHabit | ApiResponse<SingularityHabit>>(token, "POST", "/habit", body);
  return unwrapResponse(result);
}

export async function updateHabit(
  token: string,
  id: string,
  body: { title?: string; description?: string; color?: string }
): Promise<void> {
  await apiRequest<void>(token, "PATCH", `/habit/${id}`, body);
}

export async function deleteHabit(token: string, id: string): Promise<void> {
  await apiRequest<void>(token, "DELETE", `/habit/${id}`);
}

export async function getHabitProgress(
  token: string,
  params?: { maxCount?: number; offset?: number }
): Promise<SingularityHabitProgress[]> {
  const searchParams = new URLSearchParams();
  if (params?.maxCount != null) searchParams.set("maxCount", String(params.maxCount));
  if (params?.offset != null) searchParams.set("offset", String(params.offset));
  const query = searchParams.toString();
  const path = `/habit-progress${query ? `?${query}` : ""}`;

  const result = await apiRequest<SingularityHabitProgress[] | ApiResponse<SingularityHabitProgress[]>>(
    token, "GET", path
  );

  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const obj = result as unknown as Record<string, unknown>;
    if ("data" in obj && Array.isArray(obj.data)) return obj.data as SingularityHabitProgress[];
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) return obj[key] as SingularityHabitProgress[];
    }
  }
  return [];
}

export async function createHabitProgress(
  token: string,
  body: { habit: string; date: string; progress: number }
): Promise<SingularityHabitProgress> {
  const result = await apiRequest<SingularityHabitProgress | ApiResponse<SingularityHabitProgress>>(token, "POST", "/habit-progress", body);
  return unwrapResponse(result);
}

export async function deleteHabitProgress(token: string, id: string): Promise<void> {
  await apiRequest<void>(token, "DELETE", `/habit-progress/${id}`);
}

// --- Checklist API Types ---

export interface SingularityChecklistItem {
  id: string;
  title: string;
  parent?: string; // task ID
  done?: boolean; // SingularityApp uses "done" for checklist completion
  parentOrder?: number;
  removed?: boolean;
  modificatedDate?: string;
}

// --- Checklist API Methods ---

export async function getChecklistItems(
  token: string,
  taskId: string
): Promise<SingularityChecklistItem[]> {
  // SingularityApp uses "parent" to filter checklist items by task
  const result = await apiRequest<SingularityChecklistItem[] | ApiResponse<SingularityChecklistItem[]>>(
    token, "GET", `/checklist-item?parent=${encodeURIComponent(taskId)}`, undefined, 3, true
  );

  console.log("[SingularityApp] getChecklistItems raw:", JSON.stringify(result).substring(0, 500));

  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const obj = result as unknown as Record<string, unknown>;
    if ("data" in obj && Array.isArray(obj.data)) return obj.data as SingularityChecklistItem[];
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) return obj[key] as SingularityChecklistItem[];
    }
  }
  return [];
}

export async function createChecklistItem(
  token: string,
  body: { title: string; parent: string }
): Promise<SingularityChecklistItem> {
  const result = await apiRequest<SingularityChecklistItem | ApiResponse<SingularityChecklistItem>>(token, "POST", "/checklist-item", body);
  return unwrapResponse(result);
}

export async function updateChecklistItem(
  token: string,
  id: string,
  body: { title?: string; done?: boolean }
): Promise<void> {
  await apiRequest<void>(token, "PATCH", `/checklist-item/${id}`, body);
}

export async function deleteChecklistItem(token: string, id: string): Promise<void> {
  await apiRequest<void>(token, "DELETE", `/checklist-item/${id}`);
}
