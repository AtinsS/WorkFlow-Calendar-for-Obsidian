import { get } from "svelte/store";
import { moment, requestUrl } from "obsidian";
import type CalendarPlugin from "src/main";
import { tasks } from "src/task-tracker/stores";
import type { ITask } from "src/task-tracker/types";
import type { ISettings } from "src/settings";
import { getActiveTimer } from "src/task-tracker/TimerManager";
import { recordNotificationEvent } from "./notificationTelemetry";
import { tRaw } from "../i18n";

const DEFAULT_CHECK_INTERVAL_MS = 60_000; // 1 minute
const DEFAULT_REMINDER_MINUTES = 5;

export interface NotificationSettings {
  notificationsEnabled: boolean;
  reminderMinutesBefore: number;
  checkIntervalMs: number;
  notifyReminders: boolean;
  notifyOverdue: boolean;
  notifyEstimateExceeded: boolean;
  notifyDeadlines: boolean;
}

export const defaultNotificationSettings: NotificationSettings = {
  notificationsEnabled: false,
  reminderMinutesBefore: DEFAULT_REMINDER_MINUTES,
  checkIntervalMs: DEFAULT_CHECK_INTERVAL_MS,
  notifyReminders: true,
  notifyOverdue: true,
  notifyEstimateExceeded: true,
  notifyDeadlines: true,
};

export class NotificationService {
  private plugin: CalendarPlugin;
  private timer: ReturnType<typeof setInterval> | null = null;
  private firedReminders = new Set<string>();
  private firedOverdue = new Set<string>();
  private firedDeadline = new Set<string>();
  private firedEstimateExceeded = new Set<string>();

  constructor(plugin: CalendarPlugin) {
    this.plugin = plugin;
  }

  async start(): Promise<void> {
    if (this.timer) return;

    await this.loadFiredState();
    this.requestPermission();
    this.timer = window.setInterval(() => this.check(), this.getSettings().checkIntervalMs);
    this.check(); // run immediately
  }

  stop(): void {
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.firedReminders.clear();
    this.firedOverdue.clear();
    this.firedDeadline.clear();
    this.firedEstimateExceeded.clear();
  }

  restart(): void {
    this.stop();
    if (this.getSettings().notificationsEnabled) {
      this.start();
    }
  }

  private getSettings(): NotificationSettings {
    const opts = this.plugin.options as ISettings;
    return {
      notificationsEnabled: opts.notificationsEnabled ?? defaultNotificationSettings.notificationsEnabled,
      reminderMinutesBefore: opts.reminderMinutesBefore ?? defaultNotificationSettings.reminderMinutesBefore,
      checkIntervalMs: opts.checkIntervalMs ?? defaultNotificationSettings.checkIntervalMs,
      notifyReminders: opts.notifyReminders ?? defaultNotificationSettings.notifyReminders,
      notifyOverdue: opts.notifyOverdue ?? defaultNotificationSettings.notifyOverdue,
      notifyEstimateExceeded: opts.notifyEstimateExceeded ?? defaultNotificationSettings.notifyEstimateExceeded,
      notifyDeadlines: opts.notifyDeadlines ?? defaultNotificationSettings.notifyDeadlines,
    };
  }

  private requestPermission(): void {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  private check(): void {
    if (!this.getSettings().notificationsEnabled) return;
    if ("Notification" in window && (Notification as any).permission !== "granted") return;

    const allTasks = get(tasks);
    const now = Date.now();

    for (const task of allTasks) {
      if (task.completed || task.status === "done") continue;

      // Scheduled time reminders
      if (task.scheduledTime && task.dateUID) {
        const scheduledMoment = this.getScheduledMoment(task);
        if (scheduledMoment && scheduledMoment.isValid()) {
          const fireAt = scheduledMoment.valueOf();
          const reminderKey = `${task.id}:reminder`;
          const overdueKey = `${task.id}:overdue`;

          const reminderMs = this.getSettings().reminderMinutesBefore * 60_000;
          if (this.getSettings().notifyReminders && now >= fireAt - reminderMs && now < fireAt && !this.firedReminders.has(reminderKey)) {
            this.firedReminders.add(reminderKey);
            this.notify(
              tRaw("taskStore.notificationTitle"),
              tRaw("notifications.reminder", { title: task.title, minutes: String(this.getSettings().reminderMinutesBefore), time: task.scheduledTime || "" }),
              "reminder"
            );
          }

          // Просрочка — сразу при наступлении запланированного времени
          if (this.getSettings().notifyOverdue && task.status === "todo" && now >= fireAt && !this.firedOverdue.has(overdueKey)) {
            this.firedOverdue.add(overdueKey);
            this.notify(
              tRaw("taskStore.notificationTitle"),
              tRaw("notifications.overdue", { title: task.title, time: task.scheduledTime || "" }),
              "overdue"
            );
          }
        }
      }

      // Estimated time exceeded — notify when work time exceeds estimate
      if (this.getSettings().notifyEstimateExceeded && task.estimatedTime && task.status === "progress") {
        const estimateKey = `${task.id}:estimate-exceeded`;
        if (!this.firedEstimateExceeded.has(estimateKey)) {
          const estimatedMs = task.estimatedTime * 60_000;
          const currentSessionMs = getActiveTimer(task.id) || 0;
          const totalMs = (task.totalWorkTime || 0) + currentSessionMs;
          if (totalMs > estimatedMs) {
            this.firedEstimateExceeded.add(estimateKey);
            const estH = Math.floor(task.estimatedTime / 60);
            const estM = task.estimatedTime % 60;
            const estStr = estH > 0 ? `${estH}ч ${estM > 0 ? estM + 'м' : ''}` : `${estM}м`;
            const actH = Math.floor(totalMs / 3_600_000);
            const actM = Math.floor((totalMs % 3_600_000) / 60_000);
            const actStr = actH > 0 ? `${actH}ч ${actM > 0 ? actM + 'м' : ''}` : `${actM}м`;
            this.notify(
              tRaw("taskStore.notificationTitle"),
              tRaw("notifications.estimateExceeded", { title: task.title, expected: estStr, actual: actStr }),
              "estimate-exceeded"
            );
          }
        }
      }

      // Deadline notifications
      if (this.getSettings().notifyDeadlines && task.deadline) {
        const deadlineMatch = task.deadline.match(/^day-(\d{4})-(\d{2})-(\d{2})/);
        if (deadlineMatch) {
          const [, y, m, d] = deadlineMatch;
          const deadlineDate = new Date(`${y}-${m}-${d}T00:00:00`);
          const nowDate = new Date();
          const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
          const diffMs = deadlineDate.getTime() - today.getTime();
          const diffDays = Math.round(diffMs / 86400000);

          // Deadline start — when the deadline day begins (9:00 AM)
          const deadlineStartKey = `${task.id}:deadline-start`;
          if (diffDays === 0 && nowDate.getHours() >= 9 && !this.firedDeadline.has(deadlineStartKey)) {
            this.firedDeadline.add(deadlineStartKey);
            const timeStr = task.deadlineTime ? ` в ${task.deadlineTime}` : "";
            this.notify(
              tRaw("taskStore.notificationTitle"),
              tRaw("notifications.deadlineToday", { title: task.title, time: timeStr }),
              "deadline-today"
            );
          }

          // Deadline end — when the deadline time passes
          if (task.deadlineTime && diffDays <= 0) {
            const deadlineEndKey = `${task.id}:deadline-end`;
            if (!this.firedDeadline.has(deadlineEndKey)) {
              const deadlineDateTime = new Date(`${y}-${m}-${d}T${task.deadlineTime}:00`);
              if (now >= deadlineDateTime.getTime()) {
                this.firedDeadline.add(deadlineEndKey);
                this.notify(
                  tRaw("taskStore.notificationTitle"),
                  tRaw("notifications.deadlineExpired", { title: task.title, time: task.deadlineTime || "" }),
                  "deadline-expired"
                );
              }
            }
          }

          // 1 day before deadline
          const deadlineKey = `${task.id}:deadline`;
          if (diffDays === 1 && !this.firedDeadline.has(deadlineKey)) {
            this.firedDeadline.add(deadlineKey);
            const timeStr = task.deadlineTime ? ` в ${task.deadlineTime}` : "";
            this.notify(
              tRaw("taskStore.notificationTitle"),
              tRaw("notifications.deadlineTomorrow", { title: task.title, time: timeStr }),
              "deadline-tomorrow"
            );
          }
        }
      }
    }

    this.cleanupFiredKeys(allTasks);
  }

  private getScheduledMoment(task: ITask): moment.Moment | null {
    const match = task.dateUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
    if (!match) return null;

    const dateStr = match[1];
    return moment(`${dateStr} ${task.scheduledTime}`, "YYYY-MM-DD HH:mm", true);
  }

  private notify(title: string, body: string, source: string): void {
    if (!("Notification" in window) || (Notification as any).permission !== "granted") return;

    const notification = new (Notification as any)(title, {
      body,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Auto-close after 10 seconds
    window.setTimeout(() => notification.close(), 10_000);

    void recordNotificationEvent(this.plugin.app, {
      channel: "browser",
      status: "sent",
      title,
      body,
      source,
    }).catch((e) => console.warn("[notification] history write failed:", e));

    // Also send via ntfy.sh if enabled
    this.sendNtfy(title, body, source);
  }

  private sendNtfy(title: string, body: string, source: string): void {
    const opts = this.plugin.options as ISettings;
    if (!opts.ntfyEnabled) return;
    if (!opts.ntfyTopic) {
      void recordNotificationEvent(this.plugin.app, {
        channel: "ntfy",
        status: "failed",
        title,
        body,
        source,
        error: "ntfy.sh topic is empty",
      }).catch((e) => console.warn("[ntfy] history write failed:", e));
      return;
    }

    requestUrl({
      url: `https://ntfy.sh/${encodeURIComponent(opts.ntfyTopic)}`,
      method: "POST",
      body,
    }).then((response) => {
      const status = response.status >= 200 && response.status < 300 ? "sent" : "failed";
      return recordNotificationEvent(this.plugin.app, {
        channel: "ntfy",
        status,
        title,
        body,
        source,
        topic: opts.ntfyTopic,
        error: status === "failed" ? `HTTP ${response.status}` : undefined,
      });
    }).catch((e) => {
      console.warn("[ntfy] send failed:", e);
      return recordNotificationEvent(this.plugin.app, {
        channel: "ntfy",
        status: "failed",
        title,
        body,
        source,
        topic: opts.ntfyTopic,
        error: e instanceof Error ? e.message : String(e),
      }).catch((historyError) => console.warn("[ntfy] history write failed:", historyError));
    });
  }

  private cleanupFiredKeys(activeTasks: ITask[]): void {
    const activeIds = new Set(activeTasks.map((t) => t.id));
    for (const key of this.firedReminders) {
      const taskId = key.split(":")[0];
      if (!activeIds.has(taskId)) {
        this.firedReminders.delete(key);
      }
    }
    for (const key of this.firedOverdue) {
      const taskId = key.split(":")[0];
      if (!activeIds.has(taskId)) {
        this.firedOverdue.delete(key);
      }
    }
    for (const key of this.firedDeadline) {
      const taskId = key.split(":")[0];
      if (!activeIds.has(taskId)) {
        this.firedDeadline.delete(key);
      }
    }
    for (const key of this.firedEstimateExceeded) {
      const taskId = key.split(":")[0];
      if (!activeIds.has(taskId)) {
        this.firedEstimateExceeded.delete(key);
      }
    }
    this.saveFiredState();
  }

  private async loadFiredState(): Promise<void> {
    try {
      const data = await this.plugin.loadData();
      const fired = data?.firedNotifications || {};
      this.firedReminders = new Set(fired.reminders || []);
      this.firedOverdue = new Set(fired.overdue || []);
      this.firedDeadline = new Set(fired.deadline || []);
      this.firedEstimateExceeded = new Set(fired.estimateExceeded || []);
    } catch {
      // ignore
    }
  }

  private saveFiredState(): void {
    const firedData = {
      reminders: [...this.firedReminders],
      overdue: [...this.firedOverdue],
      deadline: [...this.firedDeadline],
      estimateExceeded: [...this.firedEstimateExceeded],
    };
    this.plugin.loadData().then((existing) => {
      const updated = { ...(existing || {}) };
      updated.firedNotifications = firedData;
      this.plugin.saveData(updated);
    }).catch(() => { /* ignore */ });
  }
}
