import { writable, get } from "svelte/store";
import { moment } from "obsidian";
import type { Moment } from "moment";

import type CalendarPlugin from "src/main";
import { getDateUID } from "obsidian-daily-notes-interface";

import type { ITask, IProject, ITaskTrackerData, IChecklistItem, TimeLog, TaskStatus, DateUID } from "./types";
import { TASK_TRACKER_DATA_VERSION } from "./types";
import { loadTaskData, saveTaskData, generateId } from "./storage";
import { startTimer, resumeTimer, stopTimer, addTimeLog } from "./TimerManager";
import { settings } from "../ui/stores";
import { tRaw } from "../i18n";

let pluginInstance: CalendarPlugin = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let loaded = false;

const DEFAULT_AUTO_CLEANUP_THRESHOLD = 180;

function notifyStatusChange(taskTitle: string, statusLabel: string): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const n = new Notification(tRaw("taskStore.notificationTitle"), {
    body: tRaw("taskStore.statusChanged", { title: taskTitle, label: statusLabel }),
  });
  n.onclick = () => { window.focus(); n.close(); };
  window.setTimeout(() => n.close(), 5000);
}

function autoCleanupCompleted(): void {
  const allTasks = get(tasks);
  const completed = allTasks
    .filter((t) => t.completed)
    .sort((a, b) => a.updatedAt - b.updatedAt);

  const threshold = get(settings).autoCleanupThreshold || DEFAULT_AUTO_CLEANUP_THRESHOLD;

  if (completed.length <= threshold) return;

  const toRemove = completed.slice(0, completed.length - threshold);
  const removeIds = new Set(toRemove.map((t) => t.id));

  // Удаляем Task заметки из Tasks/
  const tasksFolderPath = get(settings).tasksFolderPath || "Tasks";
  if (pluginInstance) {
    for (const task of toRemove) {
      if (task.notePath && task.notePath.startsWith(tasksFolderPath + "/")) {
        const file = pluginInstance.app.vault.getAbstractFileByPath(task.notePath);
        if (file) {
          pluginInstance.app.vault.delete(file).catch(() => {
            // Игнорируем ошибки удаления
          });
        }
      }
    }
  }

  tasks.update((current) => current.filter((t) => !removeIds.has(t.id)));
  debouncedSave();
}

export const tasks = writable<ITask[]>([]);
export const projects = writable<IProject[]>([]);
export const selectedDate = writable<DateUID>(null);
export const activeTab = writable<TaskStatus>("all");
export const taskFilter = writable<{
  projectId: string | null;
}>({
  projectId: null,
});

export const timeLogs = writable<TimeLog[]>([]);
export const checklists = writable<IChecklistItem[]>([]);

function debouncedSave(): void {
  if (!loaded) return;
  if (saveTimeout) {
    window.clearTimeout(saveTimeout);
  }
  saveTimeout = window.setTimeout(() => {
    const data: ITaskTrackerData = {
      tasks: get(tasks),
      projects: get(projects),
      timeLogs: get(timeLogs),
      checklists: get(checklists),
      version: TASK_TRACKER_DATA_VERSION,
    };
    if (pluginInstance) {
      saveTaskData(pluginInstance, data);
    }
  }, 300);
}

export function immediateSave(): void {
  if (!loaded || !pluginInstance) return;
  if (saveTimeout) {
    window.clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  const data: ITaskTrackerData = {
    tasks: get(tasks),
    projects: get(projects),
    timeLogs: get(timeLogs),
    checklists: get(checklists),
    version: TASK_TRACKER_DATA_VERSION,
  };
  saveTaskData(pluginInstance, data);
}

export async function initTaskStores(plugin: CalendarPlugin): Promise<void> {
  pluginInstance = plugin;

  async function doLoad(): Promise<void> {
    const data = await loadTaskData(plugin);
    tasks.set(data.tasks);
    projects.set(data.projects);
    timeLogs.set(data.timeLogs || []);
    checklists.set(data.checklists || []);
    loaded = true;

    // Only run cleanup if we actually loaded data (prevents overwriting vault with empty arrays
    // if vault wasn't ready yet during load)
    if (data.tasks.length > 0) {
      autoCleanupCompleted();
    }

    // Auto-resume timers for tasks that were in "progress" when Obsidian closed
    const inProgress = data.tasks.filter(
      (t) => t.status === "progress" && t.timerStartedAt
    );
    for (const task of inProgress) {
      resumeTimer(task.id, task.timerStartedAt);
    }

    // Генерируем повторяющиеся задачи до конца месяца
    window.setTimeout(() => generateAllMonthlyRecurringTasks(), 100);
  }

  await doLoad();

  // Retry after 2s if initial load returned empty (vault cache may not have been ready)
  window.setTimeout(() => {
    if (get(tasks).length === 0) {
      loaded = false;
      doLoad();
    }
  }, 2000);
}

export function reloadTaskStores(plugin: CalendarPlugin): void {
  loadTaskData(plugin).then((data) => {
    tasks.set(data.tasks);
    projects.set(data.projects);
    timeLogs.set(data.timeLogs || []);
    checklists.set(data.checklists || []);
    if (data.tasks.length > 0) {
      autoCleanupCompleted();
    }

    // Auto-resume timers for tasks in "progress" that don't have an active timer yet
    const inProgress = data.tasks.filter(
      (t) => t.status === "progress" && t.timerStartedAt
    );
    for (const task of inProgress) {
      resumeTimer(task.id, task.timerStartedAt);
    }
  });
}

export function addTask(
  taskData: Omit<ITask, "id" | "createdAt" | "updatedAt">
): ITask {
  const now = Date.now();
  const task: ITask = {
    ...taskData,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  tasks.update((current) => [...current, task]);
  debouncedSave();

  // Auto-create note for task if syncAllTasksToNotes is enabled
  const currentSettings = get(settings);
  if (currentSettings.syncAllTasksToNotes && pluginInstance) {
    import("./noteTasks").then(({ ensureNoteForTask }) => {
      ensureNoteForTask(task, pluginInstance.app).catch((e) =>
        console.error("[Calendar Plugin] Failed to create note for task:", e)
      );
    });
  }

  // Если задача с повторением и не является экземпляром — генерируем до конца месяца
  if (task.recurrence && !task.isRecurringInstance) {
    // Даём время на обновление store, затем генерируем
    window.setTimeout(() => generateMonthlyRecurringTasks(task.id), 50);
  }

  return task;
}

export function updateTask(id: string, changes: Partial<ITask>): void {
  tasks.update((current) =>
    current.map((t) =>
      t.id === id ? { ...t, ...changes, updatedAt: Date.now() } : t
    )
  );
  debouncedSave();

  // Sync task changes to note if task has a notePath
  if (changes.status !== undefined || changes.completed !== undefined || changes.title !== undefined) {
    const allTasks = get(tasks);
    const task = allTasks.find((t) => t.id === id);
    if (task?.notePath && pluginInstance) {
      import("./noteTasks").then(({ syncTaskToFrontmatter }) => {
        syncTaskToFrontmatter(task, pluginInstance.app).catch((e) =>
          console.error("[Calendar Plugin] Failed to sync task to note:", e)
        );
      });
    }
  }

  // Only run cleanup check if we're approaching the threshold
  if (changes.completed !== undefined) {
    const allTasks = get(tasks);
    const completedCount = allTasks.filter((t) => t.completed).length;
    const threshold = get(settings).autoCleanupThreshold || DEFAULT_AUTO_CLEANUP_THRESHOLD;
    if (completedCount > threshold - 20) {
      autoCleanupCompleted();
    }
  }
}

function startTaskTimer(id: string): void {
  const allTasks = get(tasks);
  const task = allTasks.find((t) => t.id === id);

  // If task was paused, resume from where it left off
  if (task?.status === "paused" && task.pausedAt && task.pausedWorkTime) {
    startTimer(id);
    tasks.update((current) =>
      current.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "progress" as TaskStatus,
              completed: false,
              timerStartedAt: Date.now(),
              pausedAt: undefined,
              pausedWorkTime: undefined,
              updatedAt: Date.now(),
            }
          : t
      )
    );
    return;
  }

  startTimer(id);
  tasks.update((current) =>
    current.map((t) =>
      t.id === id
        ? { ...t, status: "progress" as TaskStatus, completed: false, timerStartedAt: Date.now(), updatedAt: Date.now() }
        : t
    )
  );
}

function stopTaskTimerAndLog(id: string, status: TaskStatus): void {
  const allTasks = get(tasks);
  const task = allTasks.find((t) => t.id === id);
  const log = stopTimer(id);
  if (log && task) {
    log.taskTitle = task.title;
    const updatedLogs = addTimeLog(log, get(timeLogs));
    timeLogs.set(updatedLogs);
    tasks.update((current) =>
      current.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              completed: status === "done",
              totalWorkTime: (t.totalWorkTime || 0) + log.duration,
              timerStartedAt: undefined,
              updatedAt: Date.now(),
            }
          : t
      )
    );
  } else {
    tasks.update((current) =>
      current.map((t) =>
        t.id === id
          ? { ...t, status, completed: status === "done", timerStartedAt: undefined, updatedAt: Date.now() }
          : t
      )
    );
  }
}

function pauseTaskTimer(id: string): void {
  const allTasks = get(tasks);
  const task = allTasks.find((t) => t.id === id);
  if (!task || task.status !== "progress") return;

  // Stop the timer and log the work time
  const log = stopTimer(id);
  if (log && task) {
    log.taskTitle = task.title;
    const updatedLogs = addTimeLog(log, get(timeLogs));
    timeLogs.set(updatedLogs);

    tasks.update((current) =>
      current.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "paused" as TaskStatus,
              completed: false,
              totalWorkTime: (t.totalWorkTime || 0) + log.duration,
              pausedWorkTime: (t.totalWorkTime || 0) + log.duration,
              pausedAt: Date.now(),
              timerStartedAt: undefined,
              updatedAt: Date.now(),
            }
          : t
      )
    );
  } else {
    tasks.update((current) =>
      current.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "paused" as TaskStatus,
              completed: false,
              pausedAt: Date.now(),
              pausedWorkTime: t.totalWorkTime,
              timerStartedAt: undefined,
              updatedAt: Date.now(),
            }
          : t
      )
    );
  }
}

function setTaskStatus(id: string, status: TaskStatus): void {
  tasks.update((current) =>
    current.map((t) =>
      t.id === id
        ? { ...t, status, completed: status === "done", updatedAt: Date.now() }
        : t
    )
  );
}

export function updateTaskStatus(id: string, status: TaskStatus): void {
  const allTasks = get(tasks);
  const task = allTasks.find((t) => t.id === id);
  const oldStatus = task?.status;

  if (oldStatus !== "progress" && status === "progress") {
    startTaskTimer(id);
    notifyStatusChange(task?.title || tRaw("taskStore.defaultTaskTitle"), tRaw("taskStore.statusToWork"));
  } else if (oldStatus === "progress" && status === "paused") {
    pauseTaskTimer(id);
    notifyStatusChange(task?.title || tRaw("taskStore.defaultTaskTitle"), tRaw("taskStore.statusToPause"));
  } else if (oldStatus === "progress" && status !== "progress") {
    stopTaskTimerAndLog(id, status);
  } else if (oldStatus === "paused" && status === "progress") {
    startTaskTimer(id);
    notifyStatusChange(task?.title || tRaw("taskStore.defaultTaskTitle"), tRaw("taskStore.statusResumed"));
  } else {
    setTaskStatus(id, status);
  }

  // Sync status change to note if task has a notePath
  if (task?.notePath && pluginInstance) {
    import("./noteTasks").then(({ syncTaskToFrontmatter }) => {
      const updatedTasks = get(tasks);
      const updatedTask = updatedTasks.find((t) => t.id === id);
      if (updatedTask) {
        syncTaskToFrontmatter(updatedTask, pluginInstance.app).catch((e) =>
          console.error("[Calendar Plugin] Failed to sync task status to note:", e)
        );
      }
    });
  }

  debouncedSave();
}

export function removeTask(id: string): void {
  stopTimer(id);
  tasks.update((current) => current.filter((t) => t.id !== id));
  debouncedSave();
}

export function resetTaskTimer(id: string): void {
  // Stop active timer if running
  stopTimer(id);

  // Reset task timer fields and return to todo status
  tasks.update((current) =>
    current.map((t) =>
      t.id === id
        ? {
            ...t,
            status: "todo" as TaskStatus,
            completed: false,
            totalWorkTime: 0,
            timerStartedAt: undefined,
            pausedAt: undefined,
            pausedWorkTime: undefined,
            updatedAt: Date.now(),
          }
        : t
    )
  );

  // Remove time logs for this task
  timeLogs.update((current) => current.filter((l) => l.taskId !== id));

  debouncedSave();
}

export function createNextRecurringInstance(taskId: string): void {
  const allTasks = get(tasks);
  const task = allTasks.find((t) => t.id === taskId);
  if (!task || !task.recurrence) return;

  const dateMatch = task.dateUID.match(
    /^day-(\d{4}-\d{2}-\d{2})/
  );
  if (!dateMatch) return;

  const currentDate = moment(dateMatch[1], "YYYY-MM-DD");
  if (!currentDate.isValid()) return;

  let nextDate = currentDate.clone();

  switch (task.recurrence.type) {
    case "daily":
      nextDate.add(task.recurrence.interval || 1, "days");
      break;
    case "weekly":
      if (
        task.recurrence.daysOfWeek &&
        task.recurrence.daysOfWeek.length > 0
      ) {
        const currentDow = currentDate.day();
        const sortedDays = [...task.recurrence.daysOfWeek].sort(
          (a, b) => a - b
        );
        let foundNext = false;
        for (let offset = 1; offset <= 7; offset++) {
          const candidateDow = (currentDow + offset) % 7;
          if (sortedDays.includes(candidateDow)) {
            nextDate = currentDate.clone().add(offset, "days");
            foundNext = true;
            break;
          }
        }
        if (!foundNext) {
          const daysUntilNextWeek = 7 - currentDow + sortedDays[0];
          nextDate.add(daysUntilNextWeek, "days");
        }
      } else {
        nextDate.add(task.recurrence.interval || 1, "weeks");
      }
      break;
    case "monthly":
      nextDate.add(task.recurrence.interval || 1, "months");
      break;
  }

  // Проверка: не выходит ли следующая дата за пределы until
  if (task.recurrence.until) {
    const untilMoment = moment(task.recurrence.until.replace(/^day-/, ""), "YYYY-MM-DD");
    if (untilMoment.isValid() && nextDate.isAfter(untilMoment)) {
      return; // повторение завершено
    }
  }

  const newDateUID = getDateUID(nextDate, "day");

  const existingTask = allTasks.find(
    (t) => t.title === task.title && t.dateUID === newDateUID && t.parentTaskId === task.id
  );
  if (existingTask) return;

  addTask({
    title: task.title,
    description: task.description,
    completed: false,
    status: "todo",
    dateUID: newDateUID,
    projectId: task.projectId,
    notePath: task.notePath,
    priority: task.priority,
    tags: [...task.tags],
    sortOrder: 0,
    recurrence: task.recurrence,
    scheduledTime: task.scheduledTime,
    endTime: task.endTime,
    estimatedTime: task.estimatedTime,
    totalWorkTime: 0,
    isRecurringInstance: true,
    parentTaskId: task.id,
    isWorkTask: task.isWorkTask,
    paymentType: task.paymentType,
    rate: task.rate,
    overtimeStart: task.overtimeStart,
    overtimeMultiplier: task.overtimeMultiplier,
    deadline: task.deadline,
    deadlineTime: task.deadlineTime,
  });
}

/**
 * Генерирует все экземпляры повторяющейся задачи до даты until (или конца месяца если until не задан).
 * Вызывается при создании задачи с recurrence или при загрузке плагина.
 */
export function generateMonthlyRecurringTasks(taskId: string): void {
  const allTasks = get(tasks);
  const task = allTasks.find((t) => t.id === taskId);
  if (!task || !task.recurrence) return;

  const dateMatch = task.dateUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return;

  const startDate = moment(dateMatch[1], "YYYY-MM-DD");
  if (!startDate.isValid()) return;

  // Конец периода: until если задана, иначе конец текущего месяца
  let endOfPeriod: Moment;
  if (task.recurrence.until) {
    const untilMoment = moment(task.recurrence.until.replace(/^day-/, ""), "YYYY-MM-DD");
    endOfPeriod = untilMoment.isValid() ? untilMoment : startDate.clone().endOf("month");
  } else {
    endOfPeriod = startDate.clone().endOf("month");
  }

  let currentDate = startDate.clone();
  let created = 0;
  const maxInstances = 366; // максимум — год ежедневных задач

  while (currentDate.isBefore(endOfPeriod) && created < maxInstances) {
    // Вычисляем следующую дату
    let nextDate = currentDate.clone();

    switch (task.recurrence.type) {
      case "daily":
        nextDate.add(task.recurrence.interval || 1, "days");
        break;
      case "weekly":
        if (task.recurrence.daysOfWeek && task.recurrence.daysOfWeek.length > 0) {
          const currentDow = currentDate.day();
          const sortedDays = [...task.recurrence.daysOfWeek].sort((a, b) => a - b);
          let foundNext = false;
          for (let offset = 1; offset <= 7; offset++) {
            const candidateDow = (currentDow + offset) % 7;
            if (sortedDays.includes(candidateDow)) {
              nextDate = currentDate.clone().add(offset, "days");
              foundNext = true;
              break;
            }
          }
          if (!foundNext) {
            // Переходим на следующую неделю
            nextDate = currentDate.clone().add(7 - currentDow + sortedDays[0], "days");
          }
        } else {
          nextDate.add(task.recurrence.interval || 1, "weeks");
        }
        break;
      case "monthly":
        nextDate.add(task.recurrence.interval || 1, "months");
        break;
    }

    // Если следующая дата выходит за пределы периода — останавливаемся
    if (nextDate.isAfter(endOfPeriod)) break;

    const newDateUID = getDateUID(nextDate, "day");

    // Проверяем, нет ли уже такой задачи
    const existing = allTasks.find(
      (t) => t.title === task.title && t.dateUID === newDateUID && t.parentTaskId === task.id
    );

    if (!existing) {
      addTask({
        title: task.title,
        description: task.description,
        completed: false,
        status: "todo",
        dateUID: newDateUID,
        projectId: task.projectId,
        notePath: task.notePath,
        priority: task.priority,
        tags: [...task.tags],
        sortOrder: 0,
        recurrence: task.recurrence,
        scheduledTime: task.scheduledTime,
        endTime: task.endTime,
        estimatedTime: task.estimatedTime,
        totalWorkTime: 0,
        isRecurringInstance: true,
        parentTaskId: task.id,
        isWorkTask: task.isWorkTask,
        paymentType: task.paymentType,
        rate: task.rate,
        overtimeStart: task.overtimeStart,
        overtimeMultiplier: task.overtimeMultiplier,
        deadline: task.deadline,
        deadlineTime: task.deadlineTime,
      });
      created++;
    }

    currentDate = nextDate;
  }
}

/**
 * Генерирует повторяющиеся задачи для всех активных recurring задач до конца месяца.
 * Вызывается при загрузке плагина.
 */
export function generateAllMonthlyRecurringTasks(): void {
  const allTasks = get(tasks);
  const recurringTasks = allTasks.filter(
    (t) => t.recurrence && !t.isRecurringInstance
  );

  for (const task of recurringTasks) {
    generateMonthlyRecurringTasks(task.id);
  }
}

export function addProject(
  projectData: Omit<IProject, "id" | "createdAt">
): IProject {
  const project: IProject = {
    ...projectData,
    id: generateId(),
    createdAt: Date.now(),
  };
  projects.update((current) => [...current, project]);
  debouncedSave();
  return project;
}

export function updateProject(id: string, changes: Partial<IProject>): void {
  projects.update((current) =>
    current.map((p) => (p.id === id ? { ...p, ...changes } : p))
  );
  debouncedSave();
}

export function removeProject(id: string): void {
  projects.update((current) => current.filter((p) => p.id !== id));
  tasks.update((current) =>
    current.map((t) => (t.projectId === id ? { ...t, projectId: null } : t))
  );
  debouncedSave();
}

export function reorderProjects(orderedIds: string[]): void {
  projects.update((current) => {
    const map = new Map(current.map((p) => [p.id, p]));
    return orderedIds
      .map((id, i) => {
        const p = map.get(id);
        if (p) return { ...p, sortOrder: i };
        return null;
      })
      .filter(Boolean) as IProject[];
  });
  debouncedSave();
}

export function clearAllRecurringTasks(): { parentCount: number; instanceCount: number } {
  const allTasks = get(tasks);
  const parentIds = new Set(
    allTasks.filter((t) => t.recurrence && !t.isRecurringInstance).map((t) => t.id)
  );
  const recurringInstances = allTasks.filter(
    (t) => t.isRecurringInstance && t.parentTaskId
  );

  const parentCount = parentIds.size;
  const instanceCount = recurringInstances.length;

  // Remove all recurring instances and parent recurring tasks
  const idsToRemove = new Set([
    ...parentIds,
    ...recurringInstances.map((t) => t.id),
  ]);
  tasks.update((current) => current.filter((t) => !idsToRemove.has(t.id)));
  debouncedSave();

  return { parentCount, instanceCount };
}

export function calculateTaskEarnings(task: ITask): number {
  if (!task.isWorkTask || !task.rate || task.status !== "done") return 0;
  if (task.paymentType === "hour" && task.totalWorkTime) {
    const totalHours = task.totalWorkTime / 3600000;
    const overtimeStart = task.overtimeStart || 0;
    const overtimeMultiplier = task.overtimeMultiplier || 1;

    if (overtimeStart > 0 && overtimeMultiplier > 1 && totalHours > overtimeStart) {
      const regularHours = overtimeStart;
      const overtimeHours = totalHours - overtimeStart;
      return Math.round(task.rate * (regularHours + overtimeHours * overtimeMultiplier));
    }

    return Math.round(task.rate * totalHours);
  }
  if (task.paymentType === "day") {
    return task.rate;
  }
  return 0;
}

export function getEarningsForMonth(year: number, month: number): number {
  const allTasks = get(tasks);
  return allTasks
    .filter((t) => {
      if (!t.isWorkTask || !t.rate || t.status !== "done") return false;
      const match = t.dateUID.match(/^day-(\d{4})-(\d{2})/);
      if (!match) return false;
      return parseInt(match[1]) === year && parseInt(match[2]) === month;
    })
    .reduce((sum, t) => sum + calculateTaskEarnings(t), 0);
}

export function getEarningsForYear(year: number): number {
  const allTasks = get(tasks);
  return allTasks
    .filter((t) => {
      if (!t.isWorkTask || !t.rate || t.status !== "done") return false;
      const match = t.dateUID.match(/^day-(\d{4})/);
      if (!match) return false;
      return parseInt(match[1]) === year;
    })
    .reduce((sum, t) => sum + calculateTaskEarnings(t), 0);
}

export function getMonthlyEarningsForYear(year: number): { month: number; amount: number }[] {
  const result: { month: number; amount: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    result.push({ month: m, amount: getEarningsForMonth(year, m) });
  }
  return result;
}

export function calculateExpectedTaskEarnings(task: ITask, avgTimeMs?: number): number {
  if (!task.isWorkTask || !task.rate) return 0;
  if (task.paymentType === "hour") {
    const timeMs = task.estimatedTime || avgTimeMs || 0;
    const hours = timeMs / 3600000;
    return Math.round(task.rate * hours);
  }
  if (task.paymentType === "day") {
    return task.rate;
  }
  return 0;
}

export function getExpectedEarningsForMonth(year: number, month: number): number {
  const allTasks = get(tasks);
  const monthTasks = allTasks.filter((t) => {
    if (!t.isWorkTask || !t.rate) return false;
    const match = t.dateUID.match(/^day-(\d{4})-(\d{2})/);
    if (!match) return false;
    return parseInt(match[1]) === year && parseInt(match[2]) === month;
  });

  if (monthTasks.length === 0) return 0;

  // Calculate average time per project for tasks without estimate
  const projectAvgTime = new Map<string, { total: number; count: number }>();
  const doneWithTime = allTasks.filter(
    (t) => t.isWorkTask && t.paymentType === "hour" && t.totalWorkTime && t.totalWorkTime > 0
  );
  for (const t of doneWithTime) {
    const key = t.projectId || "__none__";
    const existing = projectAvgTime.get(key) || { total: 0, count: 0 };
    existing.total += t.totalWorkTime;
    existing.count += 1;
    projectAvgTime.set(key, existing);
  }
  const avgByProject = new Map<string, number>();
  for (const [key, val] of projectAvgTime) {
    avgByProject.set(key, val.total / val.count);
  }

  let total = 0;
  for (const task of monthTasks) {
    const avgTime = task.projectId ? avgByProject.get(task.projectId) : undefined;
    total += calculateExpectedTaskEarnings(task, avgTime);
  }
  return total;
}

// --- Checklist CRUD ---

export function addChecklistItem(taskId: string, title: string): IChecklistItem {
  const items = get(checklists).filter((c) => c.taskId === taskId);
  const item: IChecklistItem = {
    id: generateId(),
    taskId,
    title,
    checked: false,
    sortOrder: items.length,
    updatedAt: Date.now(),
  };
  checklists.update((current) => [...current, item]);
  debouncedSave();
  return item;
}

export function updateChecklistItem(id: string, changes: Partial<IChecklistItem>): void {
  checklists.update((current) =>
    current.map((c) => (c.id === id ? { ...c, ...changes, updatedAt: Date.now() } : c))
  );
  debouncedSave();
}

export function toggleChecklistItem(id: string): void {
  checklists.update((current) =>
    current.map((c) => (c.id === id ? { ...c, checked: !c.checked, updatedAt: Date.now() } : c))
  );
  debouncedSave();
}

export function removeChecklistItem(id: string): void {
  checklists.update((current) => current.filter((c) => c.id !== id));
  debouncedSave();
}

export function removeChecklistForTask(taskId: string): void {
  checklists.update((current) => current.filter((c) => c.taskId !== taskId));
  debouncedSave();
}

export function getChecklistForTask(taskId: string): IChecklistItem[] {
  return get(checklists)
    .filter((c) => c.taskId === taskId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
