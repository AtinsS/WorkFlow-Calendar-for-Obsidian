<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import type { App } from "obsidian";
  import type { ITask, IProject } from "./types";
  import {
    tasks,
    projects,
    selectedDate,
    activeTab,
    taskFilter,
    addTask,
    updateTask,
    updateTaskStatus,
    removeTask,
    createNextRecurringInstance,
    reorderProjects,
    clearAllRecurringTasks,
    resetTaskTimer,
  } from "./stores";
  import { createNoteTask, deleteNoteTask, shouldSyncTaskToNote, syncTaskToNote } from "./noteTasks";
  import { settings } from "../ui/stores";
  import TaskItem from "./TaskItem.svelte";
  import KanbanTabs from "./KanbanTabs.svelte";
  import TimeLogsModal from "./TimeLogsModal.svelte";
  import { TaskModal } from "./TaskModal";
  import { ProjectModal } from "./ProjectModal";

  export let appInstance: App;

  let isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
  let mqlMobile: MediaQueryList | null = null;
  let mqlHandler: ((e: MediaQueryListEvent) => void) | null = null;

  onMount(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      mqlMobile = window.matchMedia("(max-width: 768px)");
      isMobile = mqlMobile.matches;
      mqlHandler = (e: MediaQueryListEvent) => { isMobile = e.matches; };
      mqlMobile.addEventListener("change", mqlHandler);
    }
  });

  onDestroy(() => {
    if (mqlMobile && mqlHandler) {
      mqlMobile.removeEventListener("change", mqlHandler);
    }
  });

  let showTimeLogs = false;
  let showMenu = false;
  let showSearch = false;
  let searchQuery = "";
  // Collapse disabled — panel is always open

  $: currentDate = $selectedDate;
  $: allTasksForDate = currentDate
    ? $tasks.filter((t) => t.dateUID === currentDate)
    : $tasks;
  $: filteredTasks = allTasksForDate.filter((t) => {
    if ($taskFilter.projectId && t.projectId !== $taskFilter.projectId)
      return false;
    // Search filter
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase()))
      return false;
    // Tasks with deadlines are always visible
    if (t.deadline && t.status !== "done") return true;
    // "all" tab — show everything except done
    if ($activeTab === "all") return t.status !== "done";
    return t.status === $activeTab;
  });

  $: showAllDates = !currentDate;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $: taskGroups = (showAllDates
    ? groupTasksByDateAndProject(filteredTasks, $projects)
    : groupTasksByProject(filteredTasks, $projects)) as any[];
  $: totalCount = allTasksForDate.length;
  $: doneCount = allTasksForDate.filter((t) => t.status === "done").length;

  function groupTasksByProject(
    taskList: ITask[],
    projectList: IProject[]
  ): { project: IProject | null; tasks: ITask[] }[] {
    const groups = new Map<string, ITask[]>();
    const noProject: ITask[] = [];

    for (const task of taskList) {
      if (task.projectId) {
        const existing = groups.get(task.projectId) || [];
        existing.push(task);
        groups.set(task.projectId, existing);
      } else {
        noProject.push(task);
      }
    }

    const result: { project: IProject | null; tasks: ITask[] }[] = [];

    for (const [projectId, projectTasks] of groups) {
      const project = projectList.find((p) => p.id === projectId);
      if (project && !project.archived) {
        result.push({ project, tasks: projectTasks });
      } else {
        noProject.push(...projectTasks);
      }
    }

    if (noProject.length > 0) {
      result.unshift({ project: null, tasks: noProject });
    }

    return result;
  }

  function groupTasksByDateAndProject(
    taskList: ITask[],
    projectList: IProject[]
  ): { dateUID: string; dateLabel: string; groups: { project: IProject | null; tasks: ITask[] }[] }[] {
    const byDate = new Map<string, ITask[]>();
    for (const task of taskList) {
      const key = task.dateUID || "unassigned";
      const arr = byDate.get(key) || [];
      arr.push(task);
      byDate.set(key, arr);
    }

    const sortedDates = Array.from(byDate.keys()).sort((a, b) => {
      if (a === "unassigned") return 1;
      if (b === "unassigned") return -1;
      return a.localeCompare(b);
    });

    const result: { dateUID: string; dateLabel: string; groups: { project: IProject | null; tasks: ITask[] }[] }[] = [];

    for (const dateKey of sortedDates) {
      const dateTasks = byDate.get(dateKey)!;
      const label = dateKey === "unassigned" ? "Без даты" : formatDate(dateKey);
      const groups = groupTasksByProject(dateTasks, projectList);
      result.push({ dateUID: dateKey, dateLabel: label, groups });
    }

    return result;
  }

  function formatDate(dateUID: string): string {
    if (!dateUID) return "Дата не выбрана";
    const match = dateUID.match(/^(?:day|week|month)-(\d{4}-\d{2}-\d{2})/);
    if (match) {
      try {
        const m = window.moment(match[1], "YYYY-MM-DD", true);
        if (m.isValid()) {
          return m.format("D MMMM YYYY");
        }
        return match[1];
      } catch {
        return match[1];
      }
    }
    return dateUID;
  }

  function openCreateTask() {
    const modal = new TaskModal(
      appInstance,
      async (taskData) => {
        const task = addTask({
          ...taskData,
          completed: false,
          status: "todo",
          notePath: null,
          boundNotePath: taskData.boundNotePath || null,
          tags: [],
          sortOrder: allTasksForDate.length,
        } as Omit<ITask, "id" | "createdAt" | "updatedAt">);

        // Всегда создаём Task заметку в Tasks/ если включена синхронизация
        if (shouldSyncTaskToNote(task)) {
          const project = $projects.find((p) => p.id === task.projectId);
          const file = await createNoteTask(task, project, appInstance);
          if (file) {
            updateTask(task.id, { notePath: file.path });
          }
        }
      }
    );
    modal.open();
  }

  async function handleTaskDelete(task: ITask) {
    // Удаляем Task заметку из Tasks/, но не привязанную заметку
    if (task.notePath && task.notePath.startsWith($settings.tasksFolderPath + "/") && appInstance) {
      await deleteNoteTask(task.notePath, appInstance);
    }
    removeTask(task.id);
  }

  function toggleTaskStatus(task: ITask): "done" | "todo" {
    const newStatus = task.status === "done" ? "todo" : "done";
    updateTaskStatus(task.id, newStatus);
    if (newStatus === "todo") {
      resetTaskTimer(task.id);
    }
    return newStatus;
  }

  function handleRecurringNext(task: ITask): void {
    if (task.recurrence) {
      createNextRecurringInstance(task.id);
    }
  }

  async function handleTaskComplete(task: ITask) {
    const newStatus = toggleTaskStatus(task);

    if (newStatus === "done") {
      handleRecurringNext(task);
    }

    // Синхронизируем заметку при смене статуса
    const updatedTask = get(tasks).find((t) => t.id === task.id);
    if (updatedTask && appInstance) {
      await syncTaskToNote(updatedTask, appInstance);
    }
  }

  async function clearCompletedTasks() {
    if (!appInstance) return;

    const allTasksList = get(tasks);
    const completedTasks = allTasksList.filter((t) => t.completed);

    if (completedTasks.length === 0) {
      alert("Нет выполненных задач");
      return;
    }

    if (!confirm(`Удалить ${completedTasks.length} выполненных задач?`)) return;

    // Delete associated note files for all completed tasks with a notePath
    for (const task of completedTasks) {
      if (task.notePath) {
        const file = appInstance.vault.getAbstractFileByPath(task.notePath);
        if (file) {
          await appInstance.vault.delete(file);
        }
      }
      removeTask(task.id);
    }
  }

  function openProjectSettings() {
    const modal = new ProjectModal(appInstance);
    modal.open();
  }

  function toggleMenu() {
    showMenu = !showMenu;
  }

  function closeMenu() {
    showMenu = false;
  }

  function toggleSearch() {
    showSearch = !showSearch;
    if (!showSearch) {
      searchQuery = "";
    }
  }

  // Drag & Drop for project filter buttons
  let draggedProjectId: string | null = null;
  let dragOverProjectId: string | null = null;

  function onProjectDragStart(e: DragEvent, projectId: string) {
    draggedProjectId = projectId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", projectId);
    }
  }

  function onProjectDragOver(e: DragEvent, projectId: string) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    if (projectId !== draggedProjectId) {
      dragOverProjectId = projectId;
    }
  }

  function onProjectDragLeave() {
    dragOverProjectId = null;
  }

  function onProjectDrop(e: DragEvent, targetProjectId: string) {
    e.preventDefault();
    dragOverProjectId = null;

    if (!draggedProjectId || draggedProjectId === targetProjectId) {
      draggedProjectId = null;
      return;
    }

    const currentProjects = get(projects);
    const ids = currentProjects.map((p) => p.id);
    const fromIdx = ids.indexOf(draggedProjectId);
    const toIdx = ids.indexOf(targetProjectId);

    if (fromIdx === -1 || toIdx === -1) {
      draggedProjectId = null;
      return;
    }

    // Move the item
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, draggedProjectId);
    reorderProjects(ids);
    draggedProjectId = null;
  }

  function onProjectDragEnd() {
    draggedProjectId = null;
    dragOverProjectId = null;
  }

  function handleClearRecurring() {
    const allTasksList = get(tasks);
    const recurringParents = allTasksList.filter(
      (t) => t.recurrence && !t.isRecurringInstance
    );
    const recurringInstances = allTasksList.filter(
      (t) => t.isRecurringInstance
    );
    const total = recurringParents.length + recurringInstances.length;

    if (total === 0) {
      alert("Нет повторяющихся задач");
      return;
    }

    if (
      !confirm(
        `Удалить ${recurringParents.length} повторяющихся задач и ${recurringInstances.length} их экземпляров?`
      )
    )
      return;

    const result = clearAllRecurringTasks();
    alert(
      `Удалено: ${result.parentCount} задач с повторением и ${result.instanceCount} экземпляров`
    );
  }
</script>

<div
  class="task-tracker-panel"
  role="region"
  aria-label="Панель задач"
>
  <div
    class="task-tracker-header"
  >
    <div class="task-tracker-header-left">
      <span class="task-tracker-title">Задачи</span>
      {#if currentDate}
        <span class="task-tracker-date">{formatDate(currentDate)}</span>
      {/if}
    </div>
    <div class="task-tracker-header-right">
      {#if totalCount > 0}
        <span class="task-tracker-count">
          {doneCount}/{totalCount}
        </span>
      {/if}
      <!-- Desktop: kanban + search + add + dropdown -->
      {#if !isMobile}
        <KanbanTabs />
        <button
          class="task-tracker-btn icon-btn"
          class:active={showSearch}
          on:click|stopPropagation={toggleSearch}
          title={showSearch ? "Закрыть поиск" : "Поиск задач"}
        >
          &#128269;
        </button>
        <button
          class="task-tracker-btn add-btn"
          on:click|stopPropagation={openCreateTask}
          title="Добавить задачу"
        >
          +
        </button>
      {/if}
      <!-- Mobile: kanban + add + dropdown -->
      {#if isMobile}
        <KanbanTabs />
        <button
          class="task-tracker-btn add-btn"
          on:click|stopPropagation={openCreateTask}
          title="Добавить задачу"
        >
          +
        </button>
      {/if}
      <div class="task-tracker-menu-wrapper">
        <button
          class="task-tracker-btn"
          on:click|stopPropagation={toggleMenu}
          title="Ещё"
        >
          &#8942;
        </button>
        {#if showMenu}
          <div class="task-tracker-dropdown" on:click|stopPropagation role="menu">
            <button
              class="task-tracker-dropdown-item"
              role="menuitem"
              on:click|stopPropagation={() => { openProjectSettings(); closeMenu(); }}
            >
              📂 Проекты
            </button>
            <div class="task-tracker-dropdown-divider"></div>
            <button
              class="task-tracker-dropdown-item"
              role="menuitem"
              on:click|stopPropagation={() => { showTimeLogs = true; closeMenu(); }}
            >
              &#9201; Логи времени
            </button>
            <button
              class="task-tracker-dropdown-item"
              role="menuitem"
              on:click|stopPropagation={() => { clearCompletedTasks(); closeMenu(); }}
            >
              &#128465; Очистить выполненные
            </button>
            <button
              class="task-tracker-dropdown-item"
              role="menuitem"
              on:click|stopPropagation={() => { handleClearRecurring(); closeMenu(); }}
            >
              &#8634; Очистить повторяющиеся
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>

    {#if showSearch}
      <div class="task-tracker-search-bar">
        <input
          type="text"
          class="task-tracker-search-input"
          placeholder="Поиск задач..."
          bind:value={searchQuery}
          autofocus
        />
      </div>
    {/if}

    {#if $projects.filter((p) => !p.archived).length > 0}
      <div class="task-tracker-filter-bar">
        <button
          class="task-tracker-filter-btn"
          class:active={$taskFilter.projectId === null}
          on:click={() =>
            taskFilter.update((f) => ({ ...f, projectId: null }))}
        >
          Все
        </button>
        {#each $projects.filter((p) => !p.archived) as project (project.id)}
          <button
            class="task-tracker-filter-btn project-filter"
            class:active={$taskFilter.projectId === project.id}
            class:drag-over={dragOverProjectId === project.id}
            class:dragging={draggedProjectId === project.id}
            style={$taskFilter.projectId === project.id
              ? `background: ${project.color}; border-color: ${project.color}; color: #fff;`
              : ''}
            draggable="true"
            on:dragstart={(e) => onProjectDragStart(e, project.id)}
            on:dragover={(e) => onProjectDragOver(e, project.id)}
            on:dragleave={onProjectDragLeave}
            on:drop={(e) => onProjectDrop(e, project.id)}
            on:dragend={onProjectDragEnd}
            on:click={() =>
              taskFilter.update((f) => ({
                ...f,
                projectId:
                  f.projectId === project.id ? null : project.id,
              }))}
          >
            {#if project.icon}
              <span class="project-icon">{project.icon}</span>
            {:else}
              <span
                class="filter-dot"
                style="background-color: {project.color}"
              ></span>
            {/if}
            {project.name}
          </button>
        {/each}
      </div>
    {/if}

    <div class="task-tracker-list">
      {#if filteredTasks.length === 0}
        <div class="task-tracker-empty">
          <div class="empty-illustration">
            <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <!-- Clipboard body -->
              <rect x="25" y="15" width="55" height="70" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>
              <!-- Clipboard clip -->
              <rect x="38" y="8" width="28" height="12" rx="4" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>
              <circle cx="52" cy="14" r="2.5" fill="rgba(255,255,255,0.15)"/>
              <!-- Checkmark lines -->
              <rect x="35" y="32" width="34" height="5" rx="2.5" fill="rgba(255,255,255,0.06)"/>
              <rect x="35" y="43" width="34" height="5" rx="2.5" fill="rgba(255,255,255,0.06)"/>
              <rect x="35" y="54" width="34" height="5" rx="2.5" fill="rgba(255,255,255,0.06)"/>
              <!-- Checkmarks -->
              <path d="M33 34.5l2.5 2.5 5-5" stroke="rgba(130,200,170,0.7)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M33 45.5l2.5 2.5 5-5" stroke="rgba(130,200,170,0.7)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M33 56.5l2.5 2.5 5-5" stroke="rgba(130,200,170,0.7)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <!-- Plant -->
              <path d="M88 85 C88 72 78 65 82 55" stroke="rgba(130,170,130,0.5)" stroke-width="1.5" stroke-linecap="round" fill="none"/>
              <path d="M88 85 C88 72 98 65 94 55" stroke="rgba(130,170,130,0.5)" stroke-width="1.5" stroke-linecap="round" fill="none"/>
              <path d="M88 78 C85 70 80 68 82 60" stroke="rgba(130,170,130,0.4)" stroke-width="1.2" stroke-linecap="round" fill="none"/>
              <path d="M88 78 C91 70 96 68 94 60" stroke="rgba(130,170,130,0.4)" stroke-width="1.2" stroke-linecap="round" fill="none"/>
              <ellipse cx="88" cy="87" rx="8" ry="3" fill="rgba(130,170,130,0.15)"/>
            </svg>
          </div>
          {#if !currentDate && $tasks.length === 0}
            <div class="empty-title">Нет задач</div>
            <div class="empty-subtitle">Создайте первую задачу</div>
          {:else if !currentDate}
            <div class="empty-title">Нет задач в этом статусе</div>
          {:else if allTasksForDate.length === 0}
            <div class="empty-title">Нет задач на эту дату</div>
            <div class="empty-subtitle">Наслаждайтесь свободным временем</div>
          {:else}
            <div class="empty-title">Нет задач в этом статусе</div>
          {/if}
        </div>
      {:else if showAllDates}
        {#each taskGroups as dateGroup (dateGroup.dateUID)}
          <div class="task-date-group-header">
            <span class="date-group-label">{dateGroup.dateLabel}</span>
          </div>
          {#each dateGroup.groups as group (dateGroup.dateUID + "-" + (group.project?.id || "none"))}
            {#if group.project}
              <div class="task-group-header">
                {#if group.project.icon}
                  <span class="project-icon">{group.project.icon}</span>
                {:else}
                  <span
                    class="project-dot"
                    style="background-color: {group.project.color}"
                  ></span>
                {/if}
                <span class="group-name">{group.project.name}</span>
                <span class="group-count">{group.tasks.length}</span>
              </div>
            {:else}
              <div class="task-group-header">
                <span class="group-name">Без проекта</span>
                <span class="group-count">{group.tasks.length}</span>
              </div>
            {/if}

            {#each group.tasks as task (task.id)}
              <TaskItem
                {task}
                {appInstance}
                on:complete={(e) => handleTaskComplete(e.detail.task)}
                on:delete={(e) => handleTaskDelete(e.detail.task)}
              />
            {/each}
          {/each}
        {/each}
      {:else}
        {#each taskGroups as group (group.project?.id || "none")}
          {#if group.project}
            <div class="task-group-header">
              {#if group.project.icon}
                <span class="project-icon">{group.project.icon}</span>
              {:else}
                <span
                  class="project-dot"
                  style="background-color: {group.project.color}"
                ></span>
              {/if}
              <span class="group-name">{group.project.name}</span>
              <span class="group-count">{group.tasks.length}</span>
            </div>
          {:else}
            <div class="task-group-header">
              <span class="group-name">Без проекта</span>
              <span class="group-count">{group.tasks.length}</span>
            </div>
          {/if}

          {#each group.tasks as task (task.id)}
            <TaskItem
              {task}
              {appInstance}
              on:complete={(e) => handleTaskComplete(e.detail.task)}
              on:delete={(e) => handleTaskDelete(e.detail.task)}
            />
          {/each}
        {/each}
      {/if}
    </div>
</div>

{#if showTimeLogs}
  <TimeLogsModal onClose={() => (showTimeLogs = false)} />
{/if}
