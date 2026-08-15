import type { App } from "obsidian";
import {
  loadModuleData,
  updateNotificationModuleData,
} from "../io/vaultStorage";

export const NOTIFICATION_TELEMETRY_EVENT =
  "worklife-calendar:notification-telemetry-updated";

export type NotificationChannel = "browser" | "ntfy" | "github-actions";
export type NotificationStatus = "sent" | "failed" | "skipped";

export interface NotificationHistoryEntry {
  id: string;
  createdAt: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string;
  body: string;
  source?: string;
  topic?: string;
  error?: string;
}

export interface NotificationDiagnostics {
  overdueCheckEnabled: boolean;
  ntfyTopic: string;
  lastNotificationAt?: string;
  lastNotificationChannel?: string;
  lastNotificationStatus?: string;
  lastNtfyAt?: string;
  lastNtfyStatus?: string;
  lastNtfyError?: string;
  lastGithubActionCheck?: string;
  lastGithubActionStatus?: string;
  lastGithubActionMessage?: string;
  lastGithubActionError?: string;
  lastGithubActionSentCount?: number;
  lastOverdueCheck?: string;
  overdueChecksToday: string[];
  history: NotificationHistoryEntry[];
}

type PartialHistoryEntry = Omit<NotificationHistoryEntry, "id" | "createdAt"> &
  Partial<Pick<NotificationHistoryEntry, "id" | "createdAt">>;

const HISTORY_LIMIT = 100;

function nowIso(): string {
  return new Date().toISOString();
}

function eventId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asHistory(value: unknown): NotificationHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is NotificationHistoryEntry => {
      if (!item || typeof item !== "object") return false;
      const entry = item as Record<string, unknown>;
      return (
        typeof entry.id === "string" &&
        typeof entry.createdAt === "string" &&
        typeof entry.channel === "string" &&
        typeof entry.status === "string" &&
        typeof entry.title === "string" &&
        typeof entry.body === "string"
      );
    })
    .slice(0, HISTORY_LIMIT);
}

function shortText(value: string): string {
  return value.length > 600 ? `${value.slice(0, 597)}...` : value;
}

function emitTelemetryUpdated(): void {
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent(NOTIFICATION_TELEMETRY_EVENT));
  }
}

export async function loadNotificationDiagnostics(
  app: App
): Promise<NotificationDiagnostics> {
  const data = await loadModuleData(app, "notifications");
  return {
    overdueCheckEnabled: data.overdueCheckEnabled === true,
    ntfyTopic: asString(data.ntfyTopic),
    lastNotificationAt: asString(data.lastNotificationAt) || undefined,
    lastNotificationChannel: asString(data.lastNotificationChannel) || undefined,
    lastNotificationStatus: asString(data.lastNotificationStatus) || undefined,
    lastNtfyAt: asString(data.lastNtfyAt) || undefined,
    lastNtfyStatus: asString(data.lastNtfyStatus) || undefined,
    lastNtfyError: asString(data.lastNtfyError) || undefined,
    lastGithubActionCheck: asString(data.lastGithubActionCheck) || undefined,
    lastGithubActionStatus: asString(data.lastGithubActionStatus) || undefined,
    lastGithubActionMessage: asString(data.lastGithubActionMessage) || undefined,
    lastGithubActionError: asString(data.lastGithubActionError) || undefined,
    lastGithubActionSentCount: asNumber(data.lastGithubActionSentCount),
    lastOverdueCheck: asString(data.lastOverdueCheck) || undefined,
    overdueChecksToday: asStringArray(data.overdueChecksToday),
    history: asHistory(data.notificationHistory),
  };
}

export async function recordNotificationEvent(
  app: App,
  event: PartialHistoryEntry
): Promise<NotificationHistoryEntry> {
  const entry: NotificationHistoryEntry = {
    id: event.id || eventId(),
    createdAt: event.createdAt || nowIso(),
    channel: event.channel,
    status: event.status,
    title: shortText(event.title),
    body: shortText(event.body),
    source: event.source,
    topic: event.topic,
    error: event.error ? shortText(event.error) : undefined,
  };

  await updateNotificationModuleData(app, (existing) => {
    const history = asHistory(existing.notificationHistory);
    const updated: Record<string, unknown> = {
      ...existing,
      notificationHistory: [entry, ...history].slice(0, HISTORY_LIMIT),
      lastNotificationAt: entry.createdAt,
      lastNotificationChannel: entry.channel,
      lastNotificationStatus: entry.status,
    };

    if (entry.channel === "ntfy") {
      updated.lastNtfyAt = entry.createdAt;
      updated.lastNtfyStatus = entry.status;
      if (entry.error) {
        updated.lastNtfyError = entry.error;
      } else {
        delete updated.lastNtfyError;
      }
    }

    return updated;
  });

  emitTelemetryUpdated();
  return entry;
}

export async function clearNotificationHistory(app: App): Promise<void> {
  await updateNotificationModuleData(app, (existing) => ({
    ...existing,
    notificationHistory: [],
  }));
  emitTelemetryUpdated();
}
