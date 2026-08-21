/**
 * Service for syncing .ics calendar data to GitHub Gist.
 */

import { get } from "svelte/store";
import { writable } from "svelte/store";
import type CalendarPlugin from "../main";
import { generateIcs, type IcsEvent } from "../finance/icsGenerator";
import { createGist, verifyToken, type GistConfig, type GistResult } from "./githubGist";
import { tasks, projects } from "../task-tracker/stores";
import { settings } from "../ui/stores";
import { tRaw } from "../i18n";

export interface GistSyncStatus {
  connected: boolean;
  gistUrl: string;
  rawUrl: string;
  lastSync: string;
  error: string;
  syncing: boolean;
  lastAutoSync: string;
}

export const gistSyncStatus = writable<GistSyncStatus>({
  connected: false,
  gistUrl: "",
  rawUrl: "",
  lastSync: "",
  error: "",
  syncing: false,
  lastAutoSync: "",
});

let pluginInstance: CalendarPlugin = null;
let autoSyncTimeout: ReturnType<typeof setTimeout> | null = null;
let unsubscribers: (() => void)[] = [];
let autoSyncEnabled = false;

function scheduleAutoSync(): void {
  if (!autoSyncEnabled) return;

  if (autoSyncTimeout) window.clearTimeout(autoSyncTimeout);
  autoSyncTimeout = window.setTimeout(async () => {
    if (!autoSyncEnabled) return;
    console.log("[GistSync] Auto-sync triggered, syncing...");
    gistSyncStatus.update((s) => ({ ...s, lastAutoSync: new Date().toLocaleTimeString("ru-RU") }));
    const result = await syncToGist();
    if (result.success) {
      console.log("[GistSync] Auto-sync completed successfully");
    } else {
      console.error("[GistSync] Auto-sync failed:", result.error);
    }
  }, 5000);
}

export function initGistSync(plugin: CalendarPlugin): void {
  pluginInstance = plugin;

  // Clean up old subscriptions
  unsubscribers.forEach((u) => u());
  unsubscribers = [];

  // Subscribe to tasks and projects for auto-sync
  unsubscribers.push(tasks.subscribe(() => scheduleAutoSync()));
  unsubscribers.push(projects.subscribe(() => scheduleAutoSync()));

  // Subscribe to settings changes to update auto-sync state
  unsubscribers.push(settings.subscribe(() => checkAutoSyncSetting()));
}

function checkAutoSyncSetting(): void {
  const currentSettings = get(settings);
  const wasEnabled = autoSyncEnabled;
  autoSyncEnabled = !!currentSettings.gistAutoSync && !!currentSettings.githubToken && !!currentSettings.gistId;

  if (autoSyncEnabled !== wasEnabled) {
    console.log("[GistSync] Auto-sync", autoSyncEnabled ? "ENABLED" : "DISABLED");
  }
}

export function setAutoSync(enabled: boolean): void {
  autoSyncEnabled = enabled;
  console.log("[GistSync] setAutoSync called with", enabled);

  if (!enabled && autoSyncTimeout) {
    window.clearTimeout(autoSyncTimeout);
    autoSyncTimeout = null;
  }
}

export async function connectGist(
  token: string
): Promise<{ success: boolean; error?: string; warning?: string }> {
  try {
    gistSyncStatus.update((s) => ({ ...s, error: "" }));
    const result = await verifyToken(token);
    gistSyncStatus.update((s) => ({ ...s, connected: true }));

    if (!result.hasGistScope) {
      return {
        success: true,
        warning: tRaw("gist.tokenConnected", { login: result.login }),
      };
    }

    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : tRaw("gist.connectionError");
    gistSyncStatus.update((s) => ({ ...s, error: msg }));
    return { success: false, error: msg };
  }
}

function tasksToIcsEvents(): IcsEvent[] {
  const allTasks = get(tasks);
  const allProjects = get(projects);
  const events: IcsEvent[] = [];

  for (const task of allTasks) {
    if (task.status === "done") continue;
    if (!task.dateUID) continue;

    const match = task.dateUID.match(/day-(\d{4})-(\d{2})-(\d{2})/);
    if (!match) continue;

    const [, year, month, day] = match;
    const dateStr = `${year}${month}${day}`;
    const project = task.projectId ? allProjects.find((p) => p.id === task.projectId) : null;

    const description = [
      task.description || "",
      project ? tRaw("gist.project", { name: project.name }) : "",
      task.scheduledTime ? tRaw("gist.time", { time: task.scheduledTime }) : "",
      task.deadline ? tRaw("gist.deadline", { deadline: task.deadline }) : "",
      task.isWorkTask ? `${tRaw("gist.workTask")}${task.rate ? ` (${task.rate}₽)` : ""}` : "",
    ]
      .filter(Boolean)
      .join("\\n");

    const statusLabel: Record<string, string> = {
      todo: "\u27A1\uFE0F",
      progress: "\uD83D\uDD04",
      paused: "\u23F8\uFE0F",
    };
    const statusIcon = statusLabel[task.status] || "";
    const summary = project
      ? `${statusIcon} [${project.name}] ${task.title}`
      : `${statusIcon} ${task.title}`;

    if (task.scheduledTime) {
      const [hours, minutes] = task.scheduledTime.split(":").map(Number);
      const durationMin = task.estimatedTime || 60;
      const endMinutes = hours * 60 + minutes + durationMin;
      const endH = Math.floor(endMinutes / 60) % 24;
      const endM = endMinutes % 60;

      events.push({
        uid: `task-${task.id}@calendar-plugin-remastered`,
        summary,
        description: description || undefined,
        dtstart: `${dateStr}T${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}00`,
        dtend: `${dateStr}T${String(endH).padStart(2, "0")}${String(endM).padStart(2, "0")}00`,
        allday: false,
        status: task.status === "progress" ? "CONFIRMED" : "TENTATIVE",
        categories: project ? [project.name] : undefined,
      });
    } else {
      events.push({
        uid: `task-${task.id}@calendar-plugin-remastered`,
        summary,
        description: description || undefined,
        dtstart: dateStr,
        allday: true,
        status: task.status === "progress" ? "CONFIRMED" : "TENTATIVE",
        categories: project ? [project.name] : undefined,
      });
    }

    if (task.deadline && task.deadline !== task.dateUID) {
      const dlMatch = task.deadline.match(/day-(\d{4})-(\d{2})-(\d{2})/);
      if (dlMatch) {
        events.push({
          uid: `deadline-${task.id}@calendar-plugin-remastered`,
          summary: tRaw("gist.deadlineEvent", { title: task.title }),
          dtstart: `${dlMatch[1]}${dlMatch[2]}${dlMatch[3]}`,
          allday: true,
          categories: [tRaw("gist.deadlineCategory")],
        });
      }
    }
  }

  return events;
}

export async function syncToGist(): Promise<{ success: boolean; error?: string; url?: string }> {
  const currentSettings = get(settings);
  const token = currentSettings.githubToken;
  const gistId = currentSettings.gistId || undefined;

  console.log("[GistSync] syncToGist called, gistId:", gistId ? gistId.substring(0, 8) + "..." : "NONE");

  if (!token) {
    return { success: false, error: tRaw("gist.tokenNotConfigured") };
  }

  gistSyncStatus.update((s) => ({ ...s, syncing: true, error: "" }));

  try {
    const allEvents = tasksToIcsEvents();
    const icsContent = generateIcs(allEvents);
    const config: GistConfig = { token, gistId };

    console.log("[GistSync] Creating", gistId ? "PATCH (update)" : "POST (new)", "gist...");
    const result: GistResult = await createGist(
      config,
      "obsidian-calendar.ics",
      icsContent,
      "Obsidian Calendar Plugin — iCal export"
    );

    if (pluginInstance) {
      await pluginInstance.writeOptions({
        gistId: result.id,
        gistUrl: result.url,
        gistRawUrl: result.rawUrl,
      });
      console.log("[GistSync] Gist saved to settings. ID:", result.id);
    }

    gistSyncStatus.update((s) => ({
      ...s,
      connected: true,
      syncing: false,
      gistUrl: result.url,
      rawUrl: result.rawUrl,
      lastSync: new Date().toLocaleString("ru-RU"),
    }));

    console.log("[GistSync] Sync complete. URL:", result.rawUrl);

    return { success: true, url: result.rawUrl };
  } catch (e) {
    const msg = e instanceof Error ? e.message : tRaw("gist.syncError");
    gistSyncStatus.update((s) => ({ ...s, syncing: false, error: msg }));
    return { success: false, error: msg };
  }
}
