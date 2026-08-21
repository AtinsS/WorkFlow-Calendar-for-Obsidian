import { App, TFile } from "obsidian";
import { get } from "svelte/store";

import type CalendarPlugin from "src/main";
import type { ITask, IProject } from "./types";
import { tasks, projects, updateTask } from "./stores";
import { settings } from "../ui/stores";

let isSyncing = false;

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 200);
}

/**
 * Проверяет, включена ли синхронизация для задачи.
 * Если syncAllTasksToNotes=true, все задачи синхронизируются.
 * Если isNoteTask=true, задача синхронизируется всегда.
 */
export function shouldSyncTaskToNote(task: ITask): boolean {
  const currentSettings = get(settings);
  return currentSettings.syncAllTasksToNotes || task.isNoteTask === true;
}

function buildNotePath(task: ITask, project: IProject | null, customPath?: string): string {
  if (customPath) {
    return customPath.endsWith(".md") ? customPath : customPath + ".md";
  }

  const currentSettings = get(settings);
  const baseFolder = currentSettings.tasksFolderPath || "Tasks";
  const filename = sanitizeFilename(task.title) + ".md";

  // Если задача привязана к проекту с папкой, используем её
  if (project?.folder) {
    return `${project.folder}/${filename}`;
  }

  return `${baseFolder}/${filename}`;
}

function buildNoteContent(task: ITask, project: IProject | null): string {
  // Извлекаем дату из dateUID (формат: "day-YYYY-MM-DD")
  const dateMatch = task.dateUID?.match(/^day-(\d{4}-\d{2}-\d{2})/);
  const dateStr = dateMatch ? dateMatch[1] : "";

  // Маппинг статусов на символы Tasks плагина
  const statusSymbolMap: Record<string, string> = {
    todo: " ",
    progress: "/",
    done: "x",
    paused: "-",
  };
  const statusSymbol = statusSymbolMap[task.status] || " ";

  // Форматируем recurrence для Tasks плагина
  let recurrenceStr = "";
  if (task.recurrence) {
    const interval = task.recurrence.interval || 1;
    switch (task.recurrence.type) {
      case "daily":
        recurrenceStr = interval === 1 ? "every day" : `every ${interval} days`;
        break;
      case "weekly":
        recurrenceStr = interval === 1 ? "every week" : `every ${interval} weeks`;
        break;
      case "monthly":
        recurrenceStr = interval === 1 ? "every month" : `every ${interval} months`;
        break;
    }
  }

  // Собираем теги в формате Tasks плагина
  const tagsStr = task.tags.length > 0 ? ` ${task.tags.map((t) => `#${t}`).join(" ")}` : "";

  // Формируем строку задачи в формате Tasks плагина
  let taskLine = `- [${statusSymbol}] ${task.title}`;

  // Добавляем дату (📅)
  if (dateStr) {
    taskLine += ` 📅 ${dateStr}`;
  }

  // Добавляем время запланировано (🛫)
  if (task.scheduledTime) {
    taskLine += ` 🛫 ${task.scheduledTime}`;
  }

  // Добавляем дедлайн (⏰)
  if (task.deadline) {
    const deadlineMatch = task.deadline.match(/^day-(\d{4}-\d{2}-\d{2})/);
    if (deadlineMatch) {
      taskLine += ` ⏰ ${deadlineMatch[1]}`;
      if (task.deadlineTime) {
        taskLine += ` ${task.deadlineTime}`;
      }
    }
  }

  // Добавляем повторение (🔁)
  if (recurrenceStr) {
    taskLine += ` 🔁 ${recurrenceStr}`;
  }

  // Добавляем приоритет (⏫/❇️/⬇️)
  if (task.priority === "high") {
    taskLine += " ⏫";
  } else if (task.priority === "low") {
    taskLine += " ⬇️";
  }

  // Добавляем теги
  taskLine += tagsStr;

  // Собираем frontmatter (наш формат для синхронизации)
  const frontmatter: string[] = [
    "---",
    `task_id: ${task.id}`,
    `title: ${task.title}`,
    `status: ${task.status}`,
    `completed: ${task.completed}`,
    `date: ${task.dateUID}`,
    `priority: ${task.priority}`,
    `tags: [${task.tags.map((t) => `"${t}"`).join(", ")}]`,
  ];

  if (project) {
    frontmatter.push(`project: ${project.name}`);
  }
  if (task.description) {
    frontmatter.push(`description: ${task.description}`);
  }
  if (task.deadline) {
    frontmatter.push(`deadline: ${task.deadline}`);
  }
  if (task.deadlineTime) {
    frontmatter.push(`deadline_time: ${task.deadlineTime}`);
  }
  if (task.estimatedTime) {
    frontmatter.push(`estimated_time: ${task.estimatedTime}`);
  }
  if (task.scheduledTime) {
    frontmatter.push(`scheduled_time: ${task.scheduledTime}`);
  }
  if (task.isWorkTask) {
    frontmatter.push(`is_work_task: ${task.isWorkTask}`);
    if (task.paymentType) {
      frontmatter.push(`payment_type: ${task.paymentType}`);
    }
    if (task.rate) {
      frontmatter.push(`rate: ${task.rate}`);
    }
    if (task.overtimeStart) {
      frontmatter.push(`overtime_start: ${task.overtimeStart}`);
    }
    if (task.overtimeMultiplier) {
      frontmatter.push(`overtime_multiplier: ${task.overtimeMultiplier}`);
    }
  }
  if (task.recurrence) {
    frontmatter.push(`recurrence_type: ${task.recurrence.type}`);
    if (task.recurrence.interval) {
      frontmatter.push(`recurrence_interval: ${task.recurrence.interval}`);
    }
    if (task.recurrence.daysOfWeek) {
      frontmatter.push(`recurrence_days_of_week: [${task.recurrence.daysOfWeek.join(", ")}]`);
    }
    if (task.recurrence.until) {
      frontmatter.push(`recurrence_until: ${task.recurrence.until}`);
    }
  }
  if (task.parentTaskId) {
    frontmatter.push(`parent_task_id: ${task.parentTaskId}`);
  }

  // Timestamp последней синхронизации
  frontmatter.push(`synced_at: ${new Date().toISOString()}`);

  frontmatter.push("---");

  // Формируем тело документа
  const bodyLines: string[] = ["", taskLine, ""];

  if (task.description) {
    bodyLines.splice(2, 0, "", task.description, "");
  }

  return [frontmatter.join("\n"), ...bodyLines, ""].join("\n");
}

export async function createNoteTask(
  task: ITask,
  project: IProject | null,
  app: App,
  customPath?: string
): Promise<TFile> {
  const path = buildNotePath(task, project, customPath);

  // Если файл уже существует — возвращаем его
  const existingFile = app.vault.getAbstractFileByPath(path);
  if (existingFile instanceof TFile) {
    return existingFile;
  }

  const parts = path.split("/");
  if (parts.length > 1) {
    const folderPath = parts.slice(0, -1).join("/");
    const folderObj = app.vault.getAbstractFileByPath(folderPath);
    if (!folderObj) {
      await app.vault.createFolder(folderPath);
    }
  }

  const content = buildNoteContent(task, project);
  const file = await app.vault.create(path, content);
  return file;
}

/**
 * Автоматически создаёт заметку для задачи, если включена синхронизация.
 * Используется при создании новой задачи или при включении настройки.
 */
export async function ensureNoteForTask(
  task: ITask,
  app: App
): Promise<TFile | null> {
  // Если уже есть заметка — не создаём
  if (task.notePath) {
    const existingFile = app.vault.getAbstractFileByPath(task.notePath);
    if (existingFile instanceof TFile) {
      return existingFile;
    }
  }

  // Проверяем, нужно ли синхронизировать
  if (!shouldSyncTaskToNote(task)) {
    return null;
  }

  const project = get(projects).find((p) => p.id === task.projectId);
  const file = await createNoteTask(task, project, app);

  // Обновляем notePath в задаче
  updateTask(task.id, { notePath: file.path });

  return file;
}

/**
 * Синхронизирует все существующие задачи, создавая для них заметки.
 * Вызывается при включении настройки syncAllTasksToNotes.
 */
export async function syncAllExistingTasks(app: App): Promise<number> {
  const allTasks = get(tasks);
  let created = 0;

  for (const task of allTasks) {
    if (shouldSyncTaskToNote(task) && !task.notePath) {
      try {
        await ensureNoteForTask(task, app);
        created++;
      } catch (error) {
        console.error(`[Calendar Plugin] Failed to create note for task ${task.id}:`, error);
      }
    }
  }

  return created;
}

export async function deleteNoteTask(
  notePath: string,
  app: App
): Promise<void> {
  const file = app.vault.getAbstractFileByPath(notePath);
  if (file instanceof TFile) {
    await app.vault.delete(file);
  }
}

export async function archiveNoteTask(
  notePath: string,
  archiveFolder: string,
  app: App
): Promise<string | null> {
  const file = app.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) return null;

  // Ensure archive folder exists
  if (archiveFolder) {
    const folderObj = app.vault.getAbstractFileByPath(archiveFolder);
    if (!folderObj) {
      await app.vault.createFolder(archiveFolder);
    }
  }

  const newPath = archiveFolder
    ? `${archiveFolder}/${file.name}`
    : file.name;

  await app.vault.rename(file, newPath);
  return newPath;
}

export async function syncTaskToFrontmatter(
  task: ITask,
  app: App
): Promise<void> {
  if (!task.notePath) return;

  const file = app.vault.getAbstractFileByPath(task.notePath);
  if (!(file instanceof TFile)) return;

  const cache = app.metadataCache.getFileCache(file);
  const frontmatter = cache?.frontmatter;
  if (!frontmatter) return;

  const content = await app.vault.cachedRead(file);
  const lines = content.split("\n");

  const fmStart = lines.indexOf("---");
  const fmEnd = lines.indexOf("---", fmStart + 1);
  if (fmStart === -1 || fmEnd === -1) return;

  const project = get(projects).find((p) => p.id === task.projectId);

  const newFrontmatter: string[] = ["---"];
  newFrontmatter.push(`task_id: ${task.id}`);
  newFrontmatter.push(`title: ${task.title}`);
  newFrontmatter.push(`status: ${task.status}`);
  newFrontmatter.push(`completed: ${task.completed}`);
  newFrontmatter.push(`date: ${task.dateUID}`);
  newFrontmatter.push(`priority: ${task.priority}`);
  newFrontmatter.push(`tags: [${task.tags.map((t) => `"${t}"`).join(", ")}]`);

  if (project) {
    newFrontmatter.push(`project: ${project.name}`);
  }
  if (task.description) {
    newFrontmatter.push(`description: ${task.description}`);
  }
  if (task.deadline) {
    newFrontmatter.push(`deadline: ${task.deadline}`);
  }
  if (task.deadlineTime) {
    newFrontmatter.push(`deadline_time: ${task.deadlineTime}`);
  }
  if (task.estimatedTime) {
    newFrontmatter.push(`estimated_time: ${task.estimatedTime}`);
  }
  if (task.scheduledTime) {
    newFrontmatter.push(`scheduled_time: ${task.scheduledTime}`);
  }
  if (task.isWorkTask) {
    newFrontmatter.push(`is_work_task: ${task.isWorkTask}`);
    if (task.paymentType) {
      newFrontmatter.push(`payment_type: ${task.paymentType}`);
    }
    if (task.rate) {
      newFrontmatter.push(`rate: ${task.rate}`);
    }
    if (task.overtimeStart) {
      newFrontmatter.push(`overtime_start: ${task.overtimeStart}`);
    }
    if (task.overtimeMultiplier) {
      newFrontmatter.push(`overtime_multiplier: ${task.overtimeMultiplier}`);
    }
  }
  if (task.recurrence) {
    newFrontmatter.push(`recurrence_type: ${task.recurrence.type}`);
    if (task.recurrence.interval) {
      newFrontmatter.push(`recurrence_interval: ${task.recurrence.interval}`);
    }
    if (task.recurrence.daysOfWeek) {
      newFrontmatter.push(`recurrence_days_of_week: [${task.recurrence.daysOfWeek.join(", ")}]`);
    }
    if (task.recurrence.until) {
      newFrontmatter.push(`recurrence_until: ${task.recurrence.until}`);
    }
  }
  if (task.parentTaskId) {
    newFrontmatter.push(`parent_task_id: ${task.parentTaskId}`);
  }

  // Timestamp последней синхронизации
  newFrontmatter.push(`synced_at: ${new Date().toISOString()}`);

  newFrontmatter.push("---");

  // Генерируем строку задачи в формате Tasks плагина
  const statusSymbolMap: Record<string, string> = {
    todo: " ",
    progress: "/",
    done: "x",
    paused: "-",
  };
  const statusSymbol = statusSymbolMap[task.status] || " ";
  let taskLine = `- [${statusSymbol}] ${task.title}`;

  // Добавляем дату (📅)
  const dateMatch = task.dateUID?.match(/^day-(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    taskLine += ` 📅 ${dateMatch[1]}`;
  }

  // Добавляем время запланировано (🛫)
  if (task.scheduledTime) {
    taskLine += ` 🛫 ${task.scheduledTime}`;
  }

  // Добавляем дедлайн (⏰)
  if (task.deadline) {
    const deadlineMatch = task.deadline.match(/^day-(\d{4}-\d{2}-\d{2})/);
    if (deadlineMatch) {
      taskLine += ` ⏰ ${deadlineMatch[1]}`;
      if (task.deadlineTime) {
        taskLine += ` ${task.deadlineTime}`;
      }
    }
  }

  // Добавляем повторение
  if (task.recurrence) {
    const interval = task.recurrence.interval || 1;
    let recurrenceStr = "";
    switch (task.recurrence.type) {
      case "daily":
        recurrenceStr = interval === 1 ? "every day" : `every ${interval} days`;
        break;
      case "weekly":
        recurrenceStr = interval === 1 ? "every week" : `every ${interval} weeks`;
        break;
      case "monthly":
        recurrenceStr = interval === 1 ? "every month" : `every ${interval} months`;
        break;
    }
    if (recurrenceStr) {
      taskLine += ` 🔁 ${recurrenceStr}`;
    }
  }

  // Добавляем приоритет
  if (task.priority === "high") {
    taskLine += " ⏫";
  } else if (task.priority === "low") {
    taskLine += " ⬇️";
  }

  // Добавляем теги
  if (task.tags.length > 0) {
    taskLine += ` ${task.tags.map((t) => `#${t}`).join(" ")}`;
  }

  // Обновляем body: заменяем строку задачи на новую
  const bodyLines = lines.slice(fmEnd + 1);
  let taskLineIndex = -1;

  // Ищем строку задачи (начинается с "- [" и содержит любой статус)
  for (let i = 0; i < bodyLines.length; i++) {
    if (bodyLines[i].match(/^- \[[ x/-]\]/)) {
      taskLineIndex = i;
      break;
    }
  }

  if (taskLineIndex >= 0) {
    bodyLines[taskLineIndex] = taskLine;
  } else {
    // Если строки задачи нет, добавляем после пустой строки
    bodyLines.unshift("", taskLine, "");
  }

  const newContent = [
    ...newFrontmatter,
    ...bodyLines,
  ].join("\n");

  isSyncing = true;
  await app.vault.modify(file, newContent);
  isSyncing = false;
}

/**
 * Полная синхронизация задачи в заметку (JSON → note).
 * Используется при изменении задачи через UI, когда нужно обновить frontmatter.
 */
export async function syncTaskToNote(task: ITask, app: App): Promise<void> {
  if (!task.notePath) return;

  const file = app.vault.getAbstractFileByPath(task.notePath);
  if (!(file instanceof TFile)) return;

  await syncTaskToFrontmatter(task, app);
}

// Debounce таймеры для предотвращения гонки данных
const syncDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const SYNC_DEBOUNCE_MS = 300;

// Валидные значения полей
const VALID_PRIORITIES = ["low", "medium", "high"];
const VALID_STATUSES = ["todo", "progress", "done", "paused"];
const VALID_PAYMENT_TYPES = ["hour", "day"];

function validateFrontmatterField(
  field: string,
  value: unknown,
  validValues?: readonly unknown[]
): { valid: boolean; sanitized?: unknown } {
  if (value === undefined || value === null) {
    return { valid: true, sanitized: undefined };
  }

  if (validValues && !validValues.includes(value)) {
    console.warn(`[Calendar Plugin] Invalid value for ${field}: "${value}". Ignoring.`);
    return { valid: false };
  }

  return { valid: true, sanitized: value };
}

export function setupNoteRenameSync(app: App, plugin: CalendarPlugin): void {
  plugin.registerEvent(
    app.vault.on("rename", async (file, oldPath) => {
      if (!(file instanceof TFile)) return;

      // Ищем задачу по старому пути
      const allTasks = get(tasks);
      const task = allTasks.find((t) => t.notePath === oldPath);

      if (task) {
        // Обновляем notePath на новый путь
        isSyncing = true;
        updateTask(task.id, { notePath: file.path });
        isSyncing = false;
        return;
      }

      // Проверяем frontmatter — возможно, это заметка задачи с другим task_id
      const cache = app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter;
      if (!frontmatter?.task_id) return;

      const taskId = frontmatter.task_id;
      const taskById = allTasks.find((t) => t.id === taskId);

      if (taskById && taskById.notePath !== file.path) {
        isSyncing = true;
        updateTask(taskId, { notePath: file.path });
        isSyncing = false;
      }
    })
  );
}

export function setupNoteDeleteSync(app: App, plugin: CalendarPlugin): void {
  plugin.registerEvent(
    app.vault.on("delete", async (file) => {
      if (!(file instanceof TFile)) return;

      const allTasks = get(tasks);
      const task = allTasks.find((t) => t.notePath === file.path);

      if (task) {
        // Очищаем notePath — задача остаётся в JSON
        isSyncing = true;
        updateTask(task.id, { notePath: null });
        isSyncing = false;
      }
    })
  );
}

/**
 * Парсит YAML frontmatter из текста файла в простой Record<string, unknown>.
 * Используется вместо metadataCache, т.к. кэш может быть устаревшим
 * в момент вызова vault.on('modify').
 */
function parseFrontmatterFromContent(content: string): Record<string, unknown> {
  const lines = content.split("\n");
  let fmStart = -1;
  let fmEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      if (fmStart === -1) fmStart = i;
      else { fmEnd = i; break; }
    }
  }

  if (fmStart === -1 || fmEnd === -1) return {};

  const fmLines = lines.slice(fmStart + 1, fmEnd);
  const result: Record<string, unknown> = {};

  for (const line of fmLines) {
    const match = line.match(/^([\w_]+):\s*(.*)/);
    if (!match) continue;
    const key = match[1];
    const raw = match[2].trim();

    if (raw === "true") { result[key] = true; continue; }
    if (raw === "false") { result[key] = false; continue; }
    if (raw === "null" || raw === "") { result[key] = undefined; continue; }

    // Arrays: [a, b, c]
    if (raw.startsWith("[") && raw.endsWith("]")) {
      const inner = raw.slice(1, -1).trim();
      if (inner === "") { result[key] = []; continue; }
      result[key] = inner.split(",").map((s: string) => s.trim().replace(/^["']|["']$/g, ""));
      continue;
    }

    result[key] = raw;
  }

  return result;
}

export function setupNoteTaskSync(app: App, plugin: CalendarPlugin): void {
  plugin.registerEvent(
    app.vault.on("modify", async (file) => {
      if (isSyncing) return;
      if (!(file instanceof TFile)) return;

      // Быстрая проверка через metadataCache — есть ли task_id
      const cache = app.metadataCache.getFileCache(file);
      if (!cache?.frontmatter?.task_id) return;

      const taskId = cache.frontmatter.task_id as string;

      // Debounce — предотвращает гонку при быстром редакировании.
      // Чтение файла и парсинг frontmatter происходят ВНУТРИ таймера,
      // чтобы данные были актуальны на момент применения.
      if (syncDebounceTimers.has(taskId)) {
        window.clearTimeout(syncDebounceTimers.get(taskId));
      }

      syncDebounceTimers.set(
        taskId,
        window.setTimeout(async () => {
          syncDebounceTimers.delete(taskId);

          const allTasks = get(tasks);
          const task = allTasks.find((t) => t.id === taskId);
          if (!task) return;

          // Читаем файл с диска — гарантированно свежие данные
          const content = await app.vault.read(file);
          const frontmatter = parseFrontmatterFromContent(content);
          const taskLineData = parseTaskLine(content);

          applyFrontmatterChanges(taskId, frontmatter, task, taskLineData);
        }, SYNC_DEBOUNCE_MS)
      );
    })
  );
}

/**
 * Парсит строку задачи из тела документа (формат Tasks плагина).
 * Примеры:
 *   - [ ] Купить молоко 📅 2024-10-25 🛫 14:30
 *   - [/] В работе 📅 2024-10-25
 *   - [-] Приостановлено 📅 2024-10-25
 *   - [x] Готово 📅 2024-10-25
 */
function parseTaskLine(content: string): {
  status?: "done" | "todo" | "progress" | "paused";
  date?: string;
  scheduledTime?: string;
  deadline?: string;
  deadlineTime?: string;
} | null {
  const lines = content.split("\n");

  // Маппинг символов статусов Tasks плагина
  const symbolToStatus: Record<string, "done" | "todo" | "progress" | "paused"> = {
    " ": "todo",
    "x": "done",
    "/": "progress",
    "-": "paused",
  };

  // Ищем строку задачи (начинается с "- [")
  for (const line of lines) {
    const match = line.match(/^- \[([ x/-])\]\s+(.*)/);
    if (!match) continue;

    const status = symbolToStatus[match[1]] || "todo";
    const rest = match[2];

    // Извлекаем 📅 дату
    const dateMatch = rest.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? `day-${dateMatch[1]}` : undefined;

    // Извлекаем 🛫 время запланировано
    const scheduledMatch = rest.match(/🛫\s*(\d{1,2}:\d{2})/);
    const scheduledTime = scheduledMatch ? scheduledMatch[1] : undefined;

    // Извлекаем ⏰ дедлайн
    const deadlineMatch = rest.match(/⏰\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?/);
    const deadline = deadlineMatch ? `day-${deadlineMatch[1]}` : undefined;
    const deadlineTime = deadlineMatch?.[2];

    return {
      status,
      date,
      scheduledTime,
      deadline,
      deadlineTime,
    };
  }

  return null;
}

function applyFrontmatterChanges(
  taskId: string,
  frontmatter: Record<string, unknown>,
  task: ITask,
  taskLineData?: {
    status?: "done" | "todo" | "progress" | "paused";
    date?: string;
    scheduledTime?: string;
    deadline?: string;
    deadlineTime?: string;
  } | null
): void {
  const changes: Partial<ITask> = {};

  // Приоритет: сначала проверяем task line, потом frontmatter
  if (taskLineData?.date && taskLineData.date !== task.dateUID) {
    changes.dateUID = taskLineData.date;
  } else if (frontmatter.date && typeof frontmatter.date === "string" && frontmatter.date !== task.dateUID) {
    changes.dateUID = frontmatter.date;
  }

  // Время запланировано
  if (taskLineData?.scheduledTime && taskLineData.scheduledTime !== task.scheduledTime) {
    changes.scheduledTime = taskLineData.scheduledTime;
  } else if (frontmatter.scheduled_time !== undefined) {
    const scheduled = typeof frontmatter.scheduled_time === "string" ? frontmatter.scheduled_time : undefined;
    if (scheduled !== task.scheduledTime) {
      changes.scheduledTime = scheduled;
    }
  }

  // Дедлайн
  if (taskLineData?.deadline && taskLineData.deadline !== task.deadline) {
    changes.deadline = taskLineData.deadline;
  } else if (frontmatter.deadline !== undefined) {
    const deadline = typeof frontmatter.deadline === "string" ? frontmatter.deadline : undefined;
    if (deadline !== task.deadline) {
      changes.deadline = deadline;
    }
  }

  // Время дедлайна
  if (taskLineData?.deadlineTime && taskLineData.deadlineTime !== task.deadlineTime) {
    changes.deadlineTime = taskLineData.deadlineTime;
  } else if (frontmatter.deadline_time !== undefined) {
    const deadlineTime = typeof frontmatter.deadline_time === "string" ? frontmatter.deadline_time : undefined;
    if (deadlineTime !== task.deadlineTime) {
      changes.deadlineTime = deadlineTime;
    }
  }

  // Статус из строки задачи
  if (taskLineData?.status && taskLineData.status !== task.status) {
    changes.status = taskLineData.status;
    changes.completed = taskLineData.status === "done";
  }

  // title
  if (frontmatter.title && typeof frontmatter.title === "string" && frontmatter.title !== task.title) {
    changes.title = frontmatter.title;
  }

  // status (из frontmatter, если не был изменён через task line)
  if (!changes.status) {
    const statusResult = validateFrontmatterField("status", frontmatter.status, VALID_STATUSES);
    if (statusResult.valid && statusResult.sanitized && statusResult.sanitized !== task.status) {
      changes.status = statusResult.sanitized as ITask["status"];
      changes.completed = statusResult.sanitized === "done";
    }
  }

  // completed (если status не был изменён)
  if (frontmatter.completed !== undefined && !changes.status) {
    const completed = Boolean(frontmatter.completed);
    if (completed !== task.completed) {
      changes.completed = completed;
      changes.status = completed ? "done" : "todo";
    }
  }

  // priority
  const priorityResult = validateFrontmatterField("priority", frontmatter.priority, VALID_PRIORITIES);
  if (priorityResult.valid && priorityResult.sanitized && priorityResult.sanitized !== task.priority) {
    changes.priority = priorityResult.sanitized as ITask["priority"];
  }

  // tags
  if (Array.isArray(frontmatter.tags)) {
    const validTags = frontmatter.tags.filter((t: unknown) => typeof t === "string");
    if (JSON.stringify(validTags) !== JSON.stringify(task.tags)) {
      changes.tags = validTags;
    }
  }

  // description
  if (frontmatter.description !== undefined) {
    const desc = typeof frontmatter.description === "string" ? frontmatter.description : undefined;
    if (desc !== task.description) {
      changes.description = desc;
    }
  }

  // estimated_time
  if (frontmatter.estimated_time !== undefined) {
    const estimated = Number(frontmatter.estimated_time);
    if (!isNaN(estimated) && estimated !== task.estimatedTime) {
      changes.estimatedTime = estimated;
    }
  }

  // is_work_task
  if (frontmatter.is_work_task !== undefined) {
    const isWork = Boolean(frontmatter.is_work_task);
    if (isWork !== task.isWorkTask) {
      changes.isWorkTask = isWork;
    }
  }

  // payment_type
  if (frontmatter.payment_type !== undefined) {
    const ptResult = validateFrontmatterField("payment_type", frontmatter.payment_type, VALID_PAYMENT_TYPES);
    if (ptResult.valid && ptResult.sanitized && ptResult.sanitized !== task.paymentType) {
      changes.paymentType = ptResult.sanitized as ITask["paymentType"];
    }
  }

  // rate
  if (frontmatter.rate !== undefined) {
    const rate = Number(frontmatter.rate);
    if (!isNaN(rate) && rate > 0 && rate !== task.rate) {
      changes.rate = rate;
    }
  }

  // overtime_start
  if (frontmatter.overtime_start !== undefined) {
    const otStart = Number(frontmatter.overtime_start);
    if (!isNaN(otStart) && otStart !== task.overtimeStart) {
      changes.overtimeStart = otStart;
    }
  }

  // overtime_multiplier
  if (frontmatter.overtime_multiplier !== undefined) {
    const otMult = Number(frontmatter.overtime_multiplier);
    if (!isNaN(otMult) && otMult > 0 && otMult !== task.overtimeMultiplier) {
      changes.overtimeMultiplier = otMult;
    }
  }

  // recurrence — только чтение (нельзя менять из frontmatter, структура сложная)
  // parent_task_id — только чтение

  if (Object.keys(changes).length > 0) {
    isSyncing = true;
    updateTask(taskId, changes);
    isSyncing = false;
  }
}
