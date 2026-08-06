<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import type { App } from "obsidian";
  import moment from "moment";
  import { getDateUID } from "obsidian-daily-notes-interface";
  import type { ITask, IProject } from "./types";
  import {
    tasks, projects, selectedDate, activeTab, taskFilter,
    addTask, updateTask, updateTaskStatus, removeTask,
    createNextRecurringInstance, reorderProjects, clearAllRecurringTasks, resetTaskTimer,
  } from "./stores";
  import { createNoteTask, deleteNoteTask, shouldSyncTaskToNote, syncTaskToNote } from "./noteTasks";
  import { settings } from "../ui/stores";
  import TaskItem from "./TaskItem.svelte";
  import KanbanTabs from "./KanbanTabs.svelte";
  import TimeLogsModal from "./TimeLogsModal.svelte";
  import { TaskModal } from "./TaskModal";
  import { ProjectModal } from "./ProjectModal";

  export let appInstance: App;
  export let onOpenSchedule: (() => void) | undefined = undefined;

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
  let showProjectPicker = false;
  let searchQuery = "";
  let sortMode: "time" | "priority" = "time";

  $: currentDate = $selectedDate;
  $: allTasksForDate = currentDate
    ? $tasks.filter((t) => t.dateUID === currentDate)
    : $tasks;

  // Day navigation
  function prevDay() {
    if (!currentDate) return;
    const match = currentDate.match(/^day-(\d{4}-\d{2}-\d{2})/);
    if (!match) return;
    const m = moment(match[1]).subtract(1, "day");
    selectedDate.set(getDateUID(m, "day"));
  }
  function nextDay() {
    if (!currentDate) return;
    const match = currentDate.match(/^day-(\d{4}-\d{2}-\d{2})/);
    if (!match) return;
    const m = moment(match[1]).add(1, "day");
    selectedDate.set(getDateUID(m, "day"));
  }
  function goToday() {
    selectedDate.set(getDateUID(moment(), "day"));
  }

  $: filteredTasks = allTasksForDate.filter((t) => {
    if ($taskFilter.projectId && t.projectId !== $taskFilter.projectId) return false;
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (t.deadline && t.status !== "done") return true;
    if ($activeTab === "all") return t.status !== "done";
    return t.status === $activeTab;
  });

  $: showAllDates = !currentDate;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $: taskGroups = (showAllDates
    ? groupTasksByDateAndProject(filteredTasks, $projects)
    : groupTasksByProject(filteredTasks, $projects)) as any[];
  $: sortedDisplayTasks = sortMode === "priority"
    ? sortTasksByPriority(filteredTasks)
    : sortTasksChronologically(filteredTasks);
  $: totalCount = allTasksForDate.length;
  $: doneCount = allTasksForDate.filter((t) => t.status === "done").length;

  function groupTasksByProject(taskList: ITask[], projectList: IProject[]): { project: IProject | null; tasks: ITask[] }[] {
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
        result.push({ project, tasks: sortTasks(projectTasks) });
      } else {
        noProject.push(...projectTasks);
      }
    }
    if (noProject.length > 0) {
      result.unshift({ project: null, tasks: sortTasks(noProject) });
    }
    return result;
  }

  function sortTasks(taskList: ITask[]): ITask[] {
    return [...taskList].sort((a, b) => {
      if (a.status === "done" && b.status === "done") return (b.updatedAt || 0) - (a.updatedAt || 0);
      if (a.status === "done") return 1;
      if (b.status === "done") return -1;
      const aTime = a.scheduledTime || "";
      const bTime = b.scheduledTime || "";
      if (aTime && bTime) return aTime.localeCompare(bTime);
      if (aTime) return -1;
      if (bTime) return 1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  function sortTasksChronologically(taskList: ITask[]): ITask[] {
    return [...taskList].sort((a, b) => {
      // Выполненные задачи — в конец
      if (a.status === "done" && b.status === "done") return (b.updatedAt || 0) - (a.updatedAt || 0);
      if (a.status === "done") return 1;
      if (b.status === "done") return -1;
      // Сортировка по scheduledTime: от раннего к позднему
      const aTime = a.scheduledTime || "";
      const bTime = b.scheduledTime || "";
      if (aTime && bTime) return aTime.localeCompare(bTime);
      if (aTime) return -1;
      if (bTime) return 1;
      // Без времени — по sortOrder и дате создания
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

  function sortTasksByPriority(taskList: ITask[]): ITask[] {
    return [...taskList].sort((a, b) => {
      // Выполненные задачи — в конец
      if (a.status === "done" && b.status === "done") return (b.updatedAt || 0) - (a.updatedAt || 0);
      if (a.status === "done") return 1;
      if (b.status === "done") return -1;
      // Сначала по приоритету: high → medium → low
      const aPri = PRIORITY_ORDER[a.priority] ?? 3;
      const bPri = PRIORITY_ORDER[b.priority] ?? 3;
      if (aPri !== bPri) return aPri - bPri;
      // Одинаковый приоритет — по времени
      const aTime = a.scheduledTime || "";
      const bTime = b.scheduledTime || "";
      if (aTime && bTime) return aTime.localeCompare(bTime);
      if (aTime) return -1;
      if (bTime) return 1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  function toggleSortMode() {
    sortMode = sortMode === "time" ? "priority" : "time";
  }

  function groupTasksByDateAndProject(taskList: ITask[], projectList: IProject[]): { dateUID: string; dateLabel: string; groups: { project: IProject | null; tasks: ITask[] }[] }[] {
    const byDate = new Map<string, ITask[]>();
    for (const task of taskList) {
      const key = task.dateUID || "unassigned";
      const arr = byDate.get(key) || [];
      arr.push(task);
      byDate.set(key, arr);
    }
    const today = moment().format("YYYY-MM-DD");
    const todayUID = `day-${today}`;
    const sortedDates = Array.from(byDate.keys()).sort((a, b) => {
      if (a === "unassigned") return 1;
      if (b === "unassigned") return -1;
      if (a === todayUID) return -1;
      if (b === todayUID) return 1;
      const aDate = a.replace("day-", "");
      const bDate = b.replace("day-", "");
      const aIsFuture = aDate >= today;
      const bIsFuture = bDate >= today;
      if (aIsFuture && !bIsFuture) return -1;
      if (!aIsFuture && bIsFuture) return 1;
      if (aIsFuture && bIsFuture) return aDate.localeCompare(bDate);
      return bDate.localeCompare(aDate);
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
        if (m.isValid()) return m.format("D MMMM YYYY");
        return match[1];
      } catch { return match[1]; }
    }
    return dateUID;
  }

  function openCreateTask() {
    const modal = new TaskModal(appInstance, async (taskData) => {
      const task = addTask({
        ...taskData,
        completed: false,
        status: "todo",
        notePath: null,
        boundNotePath: taskData.boundNotePath || null,
        tags: [],
        sortOrder: allTasksForDate.length,
      } as Omit<ITask, "id" | "createdAt" | "updatedAt">);
      if (shouldSyncTaskToNote(task)) {
        const project = $projects.find((p) => p.id === task.projectId);
        const file = await createNoteTask(task, project, appInstance);
        if (file) updateTask(task.id, { notePath: file.path });
      }
    });
    modal.open();
  }

  async function handleTaskDelete(task: ITask) {
    if (task.notePath && task.notePath.startsWith($settings.tasksFolderPath + "/") && appInstance) {
      await deleteNoteTask(task.notePath, appInstance);
    }
    removeTask(task.id);
  }

  function toggleTaskStatus(task: ITask): "done" | "todo" {
    const newStatus = task.status === "done" ? "todo" : "done";
    updateTaskStatus(task.id, newStatus);
    if (newStatus === "todo") resetTaskTimer(task.id);
    return newStatus;
  }

  function handleRecurringNext(task: ITask): void {
    if (task.recurrence) createNextRecurringInstance(task.id);
  }

  async function handleTaskComplete(task: ITask) {
    const newStatus = toggleTaskStatus(task);
    if (newStatus === "done") handleRecurringNext(task);
    const updatedTask = get(tasks).find((t) => t.id === task.id);
    if (updatedTask && appInstance) await syncTaskToNote(updatedTask, appInstance);
  }

  async function clearCompletedTasks() {
    if (!appInstance) return;
    const allTasksList = get(tasks);
    const completedTasks = allTasksList.filter((t) => t.completed);
    if (completedTasks.length === 0) { alert("Нет выполненных задач"); return; }
    if (!confirm(`Удалить ${completedTasks.length} выполненных задач?`)) return;
    for (const task of completedTasks) {
      if (task.notePath) {
        const file = appInstance.vault.getAbstractFileByPath(task.notePath);
        if (file) await appInstance.vault.delete(file);
      }
      removeTask(task.id);
    }
  }

  function openProjectSettings() { new ProjectModal(appInstance).open(); }
  function toggleMenu() { showMenu = !showMenu; }
  function closeMenu() { showMenu = false; }
  function toggleSearch() { showSearch = !showSearch; if (!showSearch) searchQuery = ""; }

  function handleClearRecurring() {
    const allTasksList = get(tasks);
    const recurringParents = allTasksList.filter((t) => t.recurrence && !t.isRecurringInstance);
    const recurringInstances = allTasksList.filter((t) => t.isRecurringInstance);
    const total = recurringParents.length + recurringInstances.length;
    if (total === 0) { alert("Нет повторяющихся задач"); return; }
    if (!confirm(`Удалить ${recurringParents.length} повторяющихся задач и ${recurringInstances.length} их экземпляров?`)) return;
    const result = clearAllRecurringTasks();
    alert(`Удалено: ${result.parentCount} задач с повторением и ${result.instanceCount} экземпляров`);
  }
</script>

<div class="task-tracker-panel" role="region" aria-label="Панель задач">
  <!-- ═══════ MOBILE HEADER ═══════ -->
  {#if isMobile}
    <div class="task-tracker-mob-header">
      <button class="task-tracker-btn all-tasks-btn" class:active={!currentDate}
        on:click|stopPropagation={() => { currentDate ? selectedDate.set(null) : goToday(); }}
        title={currentDate ? "Все задачи" : "Сегодня"}>📋</button>
      <div class="task-tracker-mob-project-picker">
        <button class="task-tracker-mob-project-btn" on:click|stopPropagation={() => showProjectPicker = !showProjectPicker}>
          {#if $taskFilter.projectId}
            {@const proj = $projects.find(p => p.id === $taskFilter.projectId)}
            <span style="color: {proj?.color || 'var(--mcp-accent)'}">{proj?.icon || '📁'}</span>
            <span>{proj?.name || 'Проект'}</span>
          {:else}
            <span>📋</span>
            <span>Все</span>
          {/if}
          <span class="project-picker-arrow" class:rotated={showProjectPicker}>▾</span>
        </button>
        {#if showProjectPicker}
          <div class="task-tracker-mob-project-dropdown" on:click|stopPropagation>
            <button class="project-dropdown-item" class:active={$taskFilter.projectId === null}
              on:click={() => { taskFilter.update(f => ({ ...f, projectId: null })); showProjectPicker = false; }}>
              <span>📋</span> Все
            </button>
            {#each $projects.filter(p => !p.archived) as project (project.id)}
              <button class="project-dropdown-item" class:active={$taskFilter.projectId === project.id}
                on:click={() => { taskFilter.update(f => ({ ...f, projectId: f.projectId === project.id ? null : project.id })); showProjectPicker = false; }}>
                <span style="color: {project.color}">{project.icon || '📁'}</span> {project.name}
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <button class="task-tracker-btn icon-btn" class:active={showSearch}
        on:click|stopPropagation={toggleSearch} title="Поиск">🔍</button>
      <button class="task-tracker-btn sort-btn" class:active={sortMode === "priority"}
        on:click|stopPropagation={toggleSortMode}
        title={sortMode === "time" ? "По времени" : "По приоритету"}>
        {sortMode === "time" ? "🕐" : "🔺"}
      </button>
      <button class="task-tracker-btn add-btn" on:click|stopPropagation={openCreateTask}>+</button>
      <div class="task-tracker-menu-wrapper">
        <button class="task-tracker-btn" on:click|stopPropagation={toggleMenu} title="Ещё">⋮</button>
        {#if showMenu}
          <div class="task-tracker-dropdown" on:click|stopPropagation role="menu">
            <button class="task-tracker-dropdown-item" role="menuitem" on:click|stopPropagation={() => { onOpenSchedule?.(); closeMenu(); }}>📅 Расписание</button>
            <button class="task-tracker-dropdown-item" role="menuitem" on:click|stopPropagation={() => { openProjectSettings(); closeMenu(); }}>📂 Проекты</button>
            <button class="task-tracker-dropdown-item" role="menuitem" on:click|stopPropagation={() => { showTimeLogs = true; closeMenu(); }}>⏱ Логи времени</button>
            <button class="task-tracker-dropdown-item" role="menuitem" on:click|stopPropagation={() => { clearCompletedTasks(); closeMenu(); }}>🗑 Очистить выполненные</button>
          </div>
        {/if}
      </div>
    </div>
    <div class="task-tracker-mob-filters">
      <button class="mob-filter-btn" class:active={$activeTab === "all"} on:click={() => activeTab.set("all")}>Все</button>
      <button class="mob-filter-btn" class:active={$activeTab === "todo"} on:click={() => activeTab.set("todo")}>Сделать</button>
      <button class="mob-filter-btn" class:active={$activeTab === "progress"} on:click={() => activeTab.set("progress")}>В работе</button>
      <button class="mob-filter-btn" class:active={$activeTab === "paused"} on:click={() => activeTab.set("paused")}>На паузе</button>
      <button class="mob-filter-btn" class:active={$activeTab === "done"} on:click={() => activeTab.set("done")}>Готово</button>
    </div>
    <div class="task-tracker-mob-date">
      {#if currentDate}
        <button class="date-nav-btn" on:click={prevDay}>‹</button>
        <span class="task-tracker-date" on:click={goToday}>{formatDate(currentDate)}</span>
        <button class="date-nav-btn" on:click={nextDay}>›</button>
      {:else}
        <span class="task-tracker-date-all">Все задачи</span>
      {/if}
    </div>
  {/if}

  <!-- ═══════ DESKTOP HEADER ═══════ -->
  {#if !isMobile}
    <div class="task-tracker-header">
      <div class="task-tracker-header-left">
        <span class="task-tracker-title">Задачи</span>
        {#if currentDate}
          <div class="task-tracker-date-nav">
            <button class="date-nav-btn" on:click={prevDay} title="Предыдущий день">‹</button>
            <span class="task-tracker-date" on:click={goToday} title="Сегодня">{formatDate(currentDate)}</span>
            <button class="date-nav-btn" on:click={nextDay} title="Следующий день">›</button>
          </div>
        {:else}
          <span class="task-tracker-date-all">Все задачи</span>
        {/if}
      </div>
      <div class="task-tracker-header-right">
        {#if totalCount > 0}
          <span class="task-tracker-count">{doneCount}/{totalCount}</span>
        {/if}
        <button class="task-tracker-btn all-tasks-btn" class:active={!currentDate}
          on:click|stopPropagation={() => { currentDate ? selectedDate.set(null) : goToday(); }}
          title={currentDate ? "Все задачи" : "Сегодня"}>📋</button>
        <button class="task-tracker-btn schedule-btn" on:click|stopPropagation={() => onOpenSchedule?.()} title="Расписание">📅</button>
        <KanbanTabs />
        <button class="task-tracker-btn sort-btn" class:active={sortMode === "priority"}
          on:click|stopPropagation={toggleSortMode}
          title={sortMode === "time" ? "По времени" : "По приоритету"}>
          {sortMode === "time" ? "🕐" : "🔺"}
        </button>
        <button class="task-tracker-btn icon-btn" class:active={showSearch} on:click|stopPropagation={toggleSearch} title="Поиск">🔍</button>
        <button class="task-tracker-btn add-btn" on:click|stopPropagation={openCreateTask}>+</button>
        <div class="task-tracker-menu-wrapper">
          <button class="task-tracker-btn" on:click|stopPropagation={toggleMenu}>⋮</button>
          {#if showMenu}
            <div class="task-tracker-dropdown" on:click|stopPropagation role="menu">
              <button class="task-tracker-dropdown-item" role="menuitem" on:click|stopPropagation={() => { openProjectSettings(); closeMenu(); }}>📂 Проекты</button>
              <button class="task-tracker-dropdown-item" role="menuitem" on:click|stopPropagation={() => { showTimeLogs = true; closeMenu(); }}>⏱ Логи времени</button>
              <button class="task-tracker-dropdown-item" role="menuitem" on:click|stopPropagation={() => { clearCompletedTasks(); closeMenu(); }}>🗑 Очистить выполненные</button>
              <button class="task-tracker-dropdown-item" role="menuitem" on:click|stopPropagation={() => { handleClearRecurring(); closeMenu(); }}>🔄 Очистить повторяющиеся</button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if showSearch}
    <div class="task-tracker-search-bar">
      <input type="text" class="task-tracker-search-input" placeholder="Поиск задач..." bind:value={searchQuery} />
    </div>
  {/if}



  <div class="task-tracker-body">
    <div class="task-tracker-list">
      {#if filteredTasks.length === 0}
        <div class="task-tracker-empty">
          <div class="empty-title">Нет задач</div>
          <div class="empty-subtitle">Создайте первую задачу</div>
        </div>
      {:else if showAllDates}
        {#each taskGroups as dateGroup (dateGroup.dateUID)}
          <div class="task-date-group-header">
            <span class="date-group-label">{dateGroup.dateLabel}</span>
          </div>
          {#each dateGroup.groups as group (dateGroup.dateUID + "-" + (group.project?.id || "none"))}
            {#each group.tasks as task (task.id)}
              <TaskItem {task} {appInstance} on:complete={(e) => handleTaskComplete(e.detail.task)} on:delete={(e) => handleTaskDelete(e.detail.task)} />
            {/each}
          {/each}
        {/each}
      {:else}
        {#each sortedDisplayTasks as task (task.id)}
          <TaskItem {task} {appInstance} on:complete={(e) => handleTaskComplete(e.detail.task)} on:delete={(e) => handleTaskDelete(e.detail.task)} />
        {/each}
      {/if}
    </div>
  </div>
</div>

{#if showTimeLogs}
  <TimeLogsModal onClose={() => (showTimeLogs = false)} />
{/if}
