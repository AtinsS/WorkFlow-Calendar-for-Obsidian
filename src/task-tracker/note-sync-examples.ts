/**
 * Примеры использования двусторонней синхронизации задач-заметок
 *
 * Этот файл содержит примеры того, как использовать функции синхронизации
 * и как тестировать различные сценарии.
 */

import { App, TFile } from "obsidian";
import { get } from "svelte/store";

import type { ITask } from "./types";
import { tasks, projects, updateTask } from "./stores";
import {
  createNoteTask,
  deleteNoteTask,
  syncTaskToNote,
} from "./noteTasks";

// =============================================================================
// ПРИМЕР 1: Создание задачи-заметки
// =============================================================================

/**
 * Создаёт задачу с привязкой к заметке.
 *
 * Шаги:
 * 1. Создаём задачу через addTask()
 * 2. Устанавливаем isNoteTask: true
 * 3. Вызываем createNoteTask() для создания .md файла
 * 4. Обновляем notePath в задаче
 */
export async function exampleCreateNoteTask(
  app: App
): Promise<void> {
  const { addTask } = await import("./stores");

  // 1. Создаём задачу
  const task = addTask({
    title: "Моя первая задача-заметка",
    description: "Описание задачи",
    completed: false,
    status: "todo",
    dateUID: "day-2024-10-25",
    projectId: null,
    notePath: null,
    priority: "medium",
    tags: ["важно", "срочно"],
    sortOrder: 0,
    isNoteTask: true,
  });

  // 2. Создаём заметку
  const project = get(projects).find((p) => p.id === task.projectId);
  const file = await createNoteTask(task, project, app);

  // 3. Обновляем notePath в задаче
  updateTask(task.id, { notePath: file.path });

  console.log(`Создана задача-заметка: ${file.path}`);
}

// =============================================================================
// ПРИМЕР 2: Изменение статуса через frontmatter
// =============================================================================

/**
 * Демонстрирует синхронизацию статуса из frontmatter в JSON.
 *
 * Шаги:
 * 1. Открываем заметку задачи
 * 2. Меняем status: "todo" → status: "done"
 * 3. Сохраняем файл
 * 4. Проверяем, что задача в JSON обновилась
 */
export async function exampleChangeStatusFromFrontmatter(
  app: App,
  task: ITask
): Promise<void> {
  if (!task.notePath) {
    console.warn("У задачи нет привязанной заметки");
    return;
  }

  const file = app.vault.getAbstractFileByPath(task.notePath);
  if (!(file instanceof TFile)) {
    console.warn("Файл не найден");
    return;
  }

  // Читаем текущее содержимое
  const content = await app.vault.cachedRead(file);
  const lines = content.split("\n");

  // Заменяем статус в frontmatter
  const updatedLines = lines.map((line) => {
    if (line.startsWith("status: ")) {
      return "status: done";
    }
    if (line.startsWith("completed: ")) {
      return "completed: true";
    }
    return line;
  });

  // Сохраняем файл
  await app.vault.modify(file, updatedLines.join("\n"));

  // Через 300ms (debounce) задача должна обновиться
  window.setTimeout(() => {
    const updatedTask = get(tasks).find((t) => t.id === task.id);
    console.log("Статус задачи:", updatedTask?.status);
    console.log("Завершена:", updatedTask?.completed);
  }, 500);
}

// =============================================================================
// ПРИМЕР 3: Изменение даты через frontmatter
// =============================================================================

/**
 * Демонстрирует синхронизацию даты из frontmatter.
 *
 * Шаги:
 * 1. Открываем заметку задачи
 * 2. Меняем date: "day-2024-10-25" → date: "day-2024-10-26"
 * 3. Сохраняем файл
 * 4. Проверяем, что dateUID обновился
 */
export async function exampleChangeDateFromFrontmatter(
  app: App,
  task: ITask
): Promise<void> {
  if (!task.notePath) return;

  const file = app.vault.getAbstractFileByPath(task.notePath);
  if (!(file instanceof TFile)) return;

  const content = await app.vault.cachedRead(file);
  const lines = content.split("\n");

  const updatedLines = lines.map((line) => {
    if (line.startsWith("date: ")) {
      return "date: day-2024-10-26";
    }
    return line;
  });

  await app.vault.modify(file, updatedLines.join("\n"));

  window.setTimeout(() => {
    const updatedTask = get(tasks).find((t) => t.id === task.id);
    console.log("DateUID задачи:", updatedTask?.dateUID);
  }, 500);
}

// =============================================================================
// ПРИМЕР 4: Изменение приоритета
// =============================================================================

export async function exampleChangePriorityFromFrontmatter(
  app: App,
  task: ITask
): Promise<void> {
  if (!task.notePath) return;

  const file = app.vault.getAbstractFileByPath(task.notePath);
  if (!(file instanceof TFile)) return;

  const content = await app.vault.cachedRead(file);
  const lines = content.split("\n");

  const updatedLines = lines.map((line) => {
    if (line.startsWith("priority: ")) {
      return "priority: high";
    }
    return line;
  });

  await app.vault.modify(file, updatedLines.join("\n"));

  window.setTimeout(() => {
    const updatedTask = get(tasks).find((t) => t.id === task.id);
    console.log("Приоритет задачи:", updatedTask?.priority);
  }, 500);
}

// =============================================================================
// ПРИМЕР 5: Удаление заметки
// =============================================================================

/**
 * Демонстрирует обработку удаления заметки.
 *
 * Шаги:
 * 1. Удаляем .md файл вручную
 * 2. Проверяем, что task.notePath стал null
 * 3. Проверяем, что задача осталась в JSON
 */
export async function exampleDeleteNote(app: App, task: ITask): Promise<void> {
  if (!task.notePath) return;

  // Удаляем файл
  await deleteNoteTask(task.notePath, app);

  // Проверяем результат
  const updatedTask = get(tasks).find((t) => t.id === task.id);
  console.log("notePath после удаления:", updatedTask?.notePath);
  console.log("Задача всё ещё в JSON:", updatedTask !== undefined);
}

// =============================================================================
// ПРИМЕР 6: Переименование заметки
// =============================================================================

/**
 * Демонстрирует обработку переименования заметки.
 *
 * Шаги:
 * 1. Переименовываем файл через Obsidian
 * 2. Проверяем, что task.notePath обновился
 */
export async function exampleRenameNote(
  app: App,
  task: ITask
): Promise<void> {
  if (!task.notePath) return;

  const file = app.vault.getAbstractFileByPath(task.notePath);
  if (!(file instanceof TFile)) return;

  // Переименовываем файл
  const newPath = task.notePath.replace(".md", "_renamed.md");
  await app.vault.rename(file, newPath);

  // Проверяем результат
  const updatedTask = get(tasks).find((t) => t.id === task.id);
  console.log("notePath после переименования:", updatedTask?.notePath);
}

// =============================================================================
// ПРИМЕР 7: Синхронизация JSON → заметка
// =============================================================================

/**
 * Демонстрирует синхронизацию изменений из JSON в заметку.
 *
 * Используется, когда задача изменяется через UI плагина.
 */
export async function exampleSyncJsonToNote(
  app: App,
  task: ITask
): Promise<void> {
  if (!task.notePath) return;

  // Изменяем задачу через UI
  updateTask(task.id, {
    title: "Обновлённое название",
    priority: "high",
    status: "progress",
  });

  // Синхронизируем изменения в заметку
  const updatedTask = get(tasks).find((t) => t.id === task.id);
  if (updatedTask) {
    await syncTaskToNote(updatedTask, app);
    console.log("Заметка обновлена из JSON");
  }
}

// =============================================================================
// ПРИМЕР 8: Быстрое редактирование (debounce)
// =============================================================================

/**
 * Демонстрирует защиту от гонки данных при быстром редактировании.
 *
 * Шаги:
 * 1. Быстро изменяем frontmatter несколько раз подряд
 * 2. Проверяем, что updateTask вызвался только один раз
 */
export async function exampleDebounceTest(
  app: App,
  task: ITask
): Promise<void> {
  if (!task.notePath) return;

  const file = app.vault.getAbstractFileByPath(task.notePath);
  if (!(file instanceof TFile)) return;

  // Быстро изменяем frontmatter 5 раз
  for (let i = 0; i < 5; i++) {
    const content = await app.vault.cachedRead(file);
    const lines = content.split("\n");
    const updatedLines = lines.map((line) => {
      if (line.startsWith("priority: ")) {
        return `priority: ${i % 2 === 0 ? "high" : "low"}`;
      }
      return line;
    });
    await app.vault.modify(file, updatedLines.join("\n"));
  }

  // Ждём debounce (300ms) + запас
  window.setTimeout(() => {
    console.log("Debounce test completed");
  }, 500);
}

// =============================================================================
// ПРИМЕР 9: Невалидный frontmatter
// =============================================================================

/**
 * Демонстрирует обработку невалидных данных в frontmatter.
 *
 * Шаги:
 * 1. Добавляем в frontmatter некорректные данные
 * 2. Проверяем, что плагин не крашится
 * 3. Проверяем, что в консоль выводится предупреждение
 */
export async function exampleInvalidFrontmatter(
  app: App,
  task: ITask
): Promise<void> {
  if (!task.notePath) return;

  const file = app.vault.getAbstractFileByPath(task.notePath);
  if (!(file instanceof TFile)) return;

  const content = await app.vault.cachedRead(file);
  const lines = content.split("\n");

  // Добавляем невалидный приоритет
  const updatedLines = lines.map((line) => {
    if (line.startsWith("priority: ")) {
      return "priority: invalid_value";
    }
    return line;
  });

  // Сохраняем — плагин не должен крашнуться
  await app.vault.modify(file, updatedLines.join("\n"));

  // Проверяем, что задача не обновилась
  window.setTimeout(() => {
    const updatedTask = get(tasks).find((t) => t.id === task.id);
    console.log("Приоритет остался прежним:", updatedTask?.priority);
  }, 500);
}

// =============================================================================
// ПРИМЕР 10: Задача без task_id
// =============================================================================

/**
 * Демонстрирует обработку заметки без task_id.
 *
 * Шаги:
 * 1. Создаём заметку без task_id в frontmatter
 * 2. Проверяем, что плагин её игнорирует
 */
export async function exampleNoteWithoutTaskId(app: App): Promise<void> {
  // Создаём обычную заметку без task_id
  const content = [
    "---",
    "title: Обычная заметка",
    "---",
    "",
    "# Обычная заметка",
    "",
    "Это обычная заметка без task_id.",
  ].join("\n");

  const file = await app.vault.create("test-note.md", content);

  // Проверяем, что в консоли нет ошибок
  console.log("Создана заметка без task_id:", file.path);
  console.log("Плагин должен её игнорировать");
}

// =============================================================================
// ТЕСТОВЫЕ СЦЕНАРИИ
// =============================================================================

/**
 * Тест 1: Создание задачи-заметки
 */
export async function test1_CreateNoteTask(app: App): Promise<boolean> {
  console.log("=== Тест 1: Создание задачи-заметки ===");

  const { addTask } = await import("./stores");

  const task = addTask({
    title: "Тестовая задача",
    completed: false,
    status: "todo",
    dateUID: "day-2024-10-25",
    projectId: null,
    notePath: null,
    priority: "medium",
    tags: ["test"],
    sortOrder: 0,
    isNoteTask: true,
  });

  const file = await createNoteTask(task, null, app);
  updateTask(task.id, { notePath: file.path });

  // Проверяем, что .md файл создан
  const createdFile = app.vault.getAbstractFileByPath(file.path);
  if (!(createdFile instanceof TFile)) {
    console.error("Файл не создан");
    return false;
  }

  // Проверяем frontmatter
  const cache = app.metadataCache.getFileCache(createdFile);
  const frontmatter = cache?.frontmatter;

  if (!frontmatter?.task_id || frontmatter.task_id !== task.id) {
    console.error("task_id не совпадает");
    return false;
  }

  if (frontmatter.priority !== "medium") {
    console.error("priority не совпадает");
    return false;
  }

  // Проверяем notePath
  const updatedTask = get(tasks).find((t) => t.id === task.id);
  if (updatedTask?.notePath !== file.path) {
    console.error("notePath не обновился");
    return false;
  }

  console.log("✓ Тест 1 пройден");
  return true;
}

/**
 * Тест 2: Изменение статуса через frontmatter
 */
export async function test2_ChangeStatusFromFrontmatter(
  app: App
): Promise<boolean> {
  console.log("=== Тест 2: Изменение статуса через frontmatter ===");

  const { addTask } = await import("./stores");

  const task = addTask({
    title: "Тест статуса",
    completed: false,
    status: "todo",
    dateUID: "day-2024-10-25",
    projectId: null,
    notePath: null,
    priority: "medium",
    tags: [],
    sortOrder: 0,
    isNoteTask: true,
  });

  const file = await createNoteTask(task, null, app);
  updateTask(task.id, { notePath: file.path });

  // Меняем статус в frontmatter
  const content = await app.vault.cachedRead(file);
  const lines = content.split("\n");
  const updatedLines = lines.map((line) => {
    if (line.startsWith("status: ")) return "status: done";
    if (line.startsWith("completed: ")) return "completed: true";
    return line;
  });

  await app.vault.modify(file, updatedLines.join("\n"));

  // Ждём debounce
  await new Promise((resolve) => window.setTimeout(resolve, 500));

  const updatedTask = get(tasks).find((t) => t.id === task.id);
  if (updatedTask?.status !== "done" || !updatedTask?.completed) {
    console.error("Статус не обновился");
    return false;
  }

  console.log("✓ Тест 2 пройден");
  return true;
}

/**
 * Тест 3: Обработка невалидного frontmatter
 */
export async function test3_InvalidFrontmatter(app: App): Promise<boolean> {
  console.log("=== Тест 3: Невалидный frontmatter ===");

  const { addTask } = await import("./stores");

  const task = addTask({
    title: "Тест невалидных данных",
    completed: false,
    status: "todo",
    dateUID: "day-2024-10-25",
    projectId: null,
    notePath: null,
    priority: "medium",
    tags: [],
    sortOrder: 0,
    isNoteTask: true,
  });

  const file = await createNoteTask(task, null, app);
  updateTask(task.id, { notePath: file.path });

  // Добавляем невалидный приоритет
  const content = await app.vault.cachedRead(file);
  const lines = content.split("\n");
  const updatedLines = lines.map((line) => {
    if (line.startsWith("priority: ")) return "priority: INVALID";
    return line;
  });

  await app.vault.modify(file, updatedLines.join("\n"));

  // Ждём debounce
  await new Promise((resolve) => window.setTimeout(resolve, 500));

  const updatedTask = get(tasks).find((t) => t.id === task.id);
  if (updatedTask?.priority !== "medium") {
    console.error("Приоритет не должен был измениться");
    return false;
  }

  console.log("✓ Тест 3 пройден");
  return true;
}

/**
 * Тест 4: Удаление заметки
 */
export async function test4_DeleteNote(app: App): Promise<boolean> {
  console.log("=== Тест 4: Удаление заметки ===");

  const { addTask } = await import("./stores");

  const task = addTask({
    title: "Тест удаления",
    completed: false,
    status: "todo",
    dateUID: "day-2024-10-25",
    projectId: null,
    notePath: null,
    priority: "medium",
    tags: [],
    sortOrder: 0,
    isNoteTask: true,
  });

  const file = await createNoteTask(task, null, app);
  updateTask(task.id, { notePath: file.path });

  // Удаляем файл
  await deleteNoteTask(file.path, app);

  // Ждём обработки события
  await new Promise((resolve) => window.setTimeout(resolve, 500));

  const updatedTask = get(tasks).find((t) => t.id === task.id);
  if (updatedTask?.notePath !== null) {
    console.error("notePath не стал null");
    return false;
  }

  // Проверяем, что задача осталась в JSON
  if (!updatedTask) {
    console.error("Задача удалена из JSON");
    return false;
  }

  console.log("✓ Тест 4 пройден");
  return true;
}

/**
 * Тест 5: Переименование заметки
 */
export async function test5_RenameNote(app: App): Promise<boolean> {
  console.log("=== Тест 5: Переименование заметки ===");

  const { addTask } = await import("./stores");

  const task = addTask({
    title: "Тест переименования",
    completed: false,
    status: "todo",
    dateUID: "day-2024-10-25",
    projectId: null,
    notePath: null,
    priority: "medium",
    tags: [],
    sortOrder: 0,
    isNoteTask: true,
  });

  const file = await createNoteTask(task, null, app);
  updateTask(task.id, { notePath: file.path });

  const oldPath = file.path;
  const newPath = oldPath.replace(".md", "_renamed.md");

  // Переименовываем файл
  await app.vault.rename(file, newPath);

  // Ждём обработки события
  await new Promise((resolve) => window.setTimeout(resolve, 500));

  const updatedTask = get(tasks).find((t) => t.id === task.id);
  if (updatedTask?.notePath !== newPath) {
    console.error("notePath не обновился после переименования");
    return false;
  }

  console.log("✓ Тест 5 пройден");
  return true;
}

// =============================================================================
// ЗАПУСК ВСЕХ ТЕСТОВ
// =============================================================================

export async function runAllTests(app: App): Promise<void> {
  console.log("Запуск всех тестов...\n");

  const results: boolean[] = [];

  results.push(await test1_CreateNoteTask(app));
  results.push(await test2_ChangeStatusFromFrontmatter(app));
  results.push(await test3_InvalidFrontmatter(app));
  results.push(await test4_DeleteNote(app));
  results.push(await test5_RenameNote(app));

  const passed = results.filter((r) => r).length;
  const failed = results.filter((r) => !r).length;

  console.log(`\nРезультаты: ${passed} пройдено, ${failed} провалено`);
}
