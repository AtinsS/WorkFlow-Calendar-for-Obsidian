import { get } from "svelte/store";
import moment from "moment";
import { requestUrl } from "obsidian";
import type CalendarPlugin from "src/main";
import { tasks } from "src/task-tracker/stores";
import type { ITask } from "src/task-tracker/types";
import type { ISettings } from "src/settings";
import { getActiveTimer } from "src/task-tracker/TimerManager";

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
    this.timer = setInterval(() => this.check(), this.getSettings().checkIntervalMs);
    this.check(); // run immediately
    this.startNtfyListener();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stopNtfyListener();
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
              `📅 Calendar Remastered`,
              `⏱️ Напоминание: ${task.title}\nЗадача через ${this.getSettings().reminderMinutesBefore} мин (${task.scheduledTime})`
            );
          }

          // Просрочка — сразу при наступлении запланированного времени
          if (this.getSettings().notifyOverdue && task.status === "todo" && now >= fireAt && !this.firedOverdue.has(overdueKey)) {
            this.firedOverdue.add(overdueKey);
            this.notify(
              `📅 Calendar Remastered`,
              `‼️ Просрочено: ${task.title}\nЗапланировано на ${task.scheduledTime}`
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
              `📅 Calendar Remastered`,
              `⏰ Превышен лимит: ${task.title}\nОжидается: ${estStr} · Факт: ${actStr}`
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
              `📅 Calendar Remastered`,
              `🎯 Дедлайн сегодня: ${task.title}${timeStr}`
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
                  `📅 Calendar Remastered`,
                  `🔴 Дедлайн истёк: ${task.title}\nВремя: ${task.deadlineTime}`
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
              `📅 Calendar Remastered`,
              `⏰ Дедлайн завтра: ${task.title}${timeStr}`
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

  private notify(title: string, body: string): void {
    if (!("Notification" in window) || (Notification as any).permission !== "granted") return;

    const notification = new (Notification as any)(title, {
      body,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Auto-close after 10 seconds
    setTimeout(() => notification.close(), 10_000);

    // Also send via ntfy.sh if enabled
    this.sendNtfy(body);
  }

  private sendNtfy(body: string): void {
    const opts = this.plugin.options as ISettings;
    if (!opts.ntfyEnabled || !opts.ntfyTopic) return;

    requestUrl({
      url: `https://ntfy.sh/${opts.ntfyTopic}`,
      method: "POST",
      body,
    }).catch((e) => console.warn("[ntfy] send failed:", e));
  }

  private ntfyPollTimer: ReturnType<typeof setInterval> | null = null;
  private ntfyLastId = "";

  private startNtfyListener(): void {
    const opts = this.plugin.options as ISettings;
    if (!opts.ntfyEnabled || !opts.ntfyTopic) return;

    this.stopNtfyListener();

    const topic = opts.ntfyTopic;

    // Poll ntfy every 30 seconds for new messages
    this.ntfyPollTimer = setInterval(async () => {
      try {
        const sinceParam = this.ntfyLastId ? `&since=${this.ntfyLastId}` : "&since=5m";
        const url = `https://ntfy.sh/${topic}/json?poll=1${sinceParam}`;
        const response = await requestUrl({ url });
        if (response.status !== 200) return;

        const text = response.text;
        if (!text.trim()) return;

        const lines = text.split("\n").filter((l) => l.trim().startsWith("{"));

        for (const line of lines) {
          try {
            const event = JSON.parse(line.trim());
            if (event.id) this.ntfyLastId = event.id;
          } catch {
            // ignore parse errors
          }
        }
      } catch (e) {
        console.warn("[ntfy] poll error:", e);
      }
    }, 30_000);
  }

  private stopNtfyListener(): void {
    if (this.ntfyPollTimer) {
      clearInterval(this.ntfyPollTimer);
      this.ntfyPollTimer = null;
    }
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
