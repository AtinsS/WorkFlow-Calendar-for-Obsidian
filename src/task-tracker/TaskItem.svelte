<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import type { App } from "obsidian";
  import type { ITask, TaskStatus } from "./types";
  import { updateTask, updateTaskStatus, removeTask, resetTaskTimer, projects, activeTab, calculateTaskEarnings, tasks, checklists, toggleChecklistItem, addChecklistItem, removeChecklistItem } from "./stores";
  import { get } from "svelte/store";
  import { timerTick, getActiveTimer, formatDuration, formatEstimate } from "./TimerManager";
  import { TaskModal } from "./TaskModal";
  import { syncTaskToNote, shouldSyncTaskToNote } from "./noteTasks";

  export let task: ITask;
  export let appInstance: App;

  const dispatch = createEventDispatcher();

  // Checklist
  $: taskChecklistItems = $checklists
    .filter((c) => c.taskId === task.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  $: checklistDone = taskChecklistItems.filter((c) => c.checked).length;
  $: checklistTotal = taskChecklistItems.length;
  let showChecklist = false;
  let newChecklistTitle = "";

  function handleToggleChecklist(id: string) {
    toggleChecklistItem(id);
  }

  function handleAddChecklistItem() {
    const title = newChecklistTitle.trim();
    if (!title) return;
    addChecklistItem(task.id, title);
    newChecklistTitle = "";
  }

  function handleRemoveChecklistItem(id: string) {
    removeChecklistItem(id);
  }

  $: project = $projects.find((p) => p.id === task.projectId);
  $: projectColor = project?.color || "var(--text-muted)";

  // Timer display — include accumulated totalWorkTime from prior sessions
  $: elapsed = $timerTick && task.status === "progress" && task.timerStartedAt
    ? getActiveTimer(task.id)
    : null;
  $: timerDisplay = elapsed !== null
    ? formatDuration(elapsed + (task.totalWorkTime || 0))
    : null;

  // Estimate vs actual
  $: hasEstimate = !!task.estimatedTime;
  $: hasActual = !!task.totalWorkTime;
  $: estimateOver = hasEstimate && hasActual && task.totalWorkTime > task.estimatedTime * 60000;

  $: scheduledTimePassed = task.scheduledTime && task.dateUID ? isTimePassed(task.scheduledTime, task.dateUID) : false;

  // Deadline logic
  $: hasDeadline = !!task.deadline;
  $: deadlineOverdue = hasDeadline && task.status !== "done" ? isDeadlineOverdue(task.deadline, task.deadlineTime) : false;
  $: deadlineLabel = hasDeadline ? formatDeadlineLabel(task.deadline, task.deadlineTime) : "";

  function isTimePassed(time: string, dateUID: string): boolean {
    const [h, m] = time.split(":").map(Number);
    const now = new Date();
    const match = dateUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
    if (!match) {
      return now.getHours() > h || (now.getHours() === h && now.getMinutes() > m);
    }
    const taskDate = new Date(match[1] + "T00:00:00");
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (taskDate.getTime() < today.getTime()) return true;
    if (taskDate.getTime() > today.getTime()) return false;
    return now.getHours() > h || (now.getHours() === h && now.getMinutes() > m);
  }

  function isDeadlineOverdue(deadlineUID: string, deadlineTime?: string): boolean {
    if (!deadlineUID) return false;
    const match = deadlineUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
    if (!match) return false;
    const now = new Date();
    const deadlineDate = new Date(match[1] + "T00:00:00");
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (deadlineDate.getTime() < today.getTime()) return true;
    if (deadlineDate.getTime() > today.getTime()) return false;
    if (deadlineTime) {
      const [h, m] = deadlineTime.split(":").map(Number);
      return now.getHours() > h || (now.getHours() === h && now.getMinutes() > m);
    }
    return false;
  }

  function formatDeadlineLabel(deadlineUID: string, deadlineTime?: string): string {
    if (!deadlineUID) return "";
    const match = deadlineUID.match(/^day-(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return "";
    const [, year, month, day] = match;
    const now = new Date();
    const deadlineDate = new Date(`${year}-${month}-${day}T00:00:00`);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffMs = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / 86400000);
    let label = "";
    if (diffDays < 0) {
      label = `${Math.abs(diffDays)}д просрочено`;
    } else if (diffDays === 0) {
      label = "Сегодня";
    } else if (diffDays === 1) {
      label = "Завтра";
    } else {
      label = `${diffDays}д`;
    }
    if (deadlineTime) {
      label += ` ${deadlineTime}`;
    }
    return label;
  }

  const statusIcons: Record<TaskStatus, string> = {
    todo: "🟢",
    progress: "🔥",
    done: "✅",
    paused: "☕",
    all: "",
  };

  async function quickStatus(status: TaskStatus) {
    if (task.status === status) return;
    updateTaskStatus(task.id, status);
    if (status === "todo") {
      resetTaskTimer(task.id);
    }
    // Синхронизируем заметку при смене статуса
    if (appInstance) {
      const { tasks: tasksStore } = await import("./stores");
      const { get } = await import("svelte/store");
      const updatedTask = get(tasksStore).find((t) => t.id === task.id);
      if (updatedTask) {
        await syncTaskToNote(updatedTask, appInstance);
      }
    }
  }

  function handleEdit() {
    const modal = new TaskModal(
      appInstance,
      async (changes) => {
        console.log("[TaskItem] handleEdit changes:", changes);
        updateTask(task.id, changes);

        // Получаем обновлённую задачу из store
        const updatedTask = get(tasks).find((t) => t.id === task.id);
        console.log("[TaskItem] updatedTask:", updatedTask);
        if (!updatedTask || !appInstance) return;

        // Если нет Task заметки — создаём
        if (!updatedTask.notePath && shouldSyncTaskToNote(updatedTask)) {
          console.log("[TaskItem] Creating Task note...");
          const { createNoteTask } = await import("./noteTasks");
          const project = $projects.find((p) => p.id === updatedTask.projectId);
          const file = await createNoteTask(updatedTask, project, appInstance);
          if (file) {
            console.log("[TaskItem] Task note created:", file.path);
            updateTask(updatedTask.id, { notePath: file.path });
          }
        }

        // Синхронизируем Task заметку
        console.log("[TaskItem] Syncing to note...");
        await syncTaskToNote(updatedTask, appInstance);
        console.log("[TaskItem] Sync done");
      },
      task
    );
    modal.open();
  }

  function handleDelete() {
    dispatch("delete", { task });
  }

  function openNote() {
    // Приоритет: привязанная заметка > Task заметка
    const pathToOpen = task.boundNotePath || task.notePath;
    if (!pathToOpen) return;
    if (!appInstance) return;
    const file = appInstance.vault.getAbstractFileByPath(pathToOpen);
    if (file) {
      appInstance.workspace.openLinkText(pathToOpen, "", false);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (task.status !== "done") quickStatus("progress");
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      handleDelete();
    } else if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      if (task.status !== "done") handleEdit();
    }
  }

  function handleDragStart(event: DragEvent) {
    if (event.dataTransfer) {
      event.dataTransfer.setData("text/plain", task.id);
      event.dataTransfer.effectAllowed = "move";
    }
  }

  let showActionsMenu = false;
  let showDescription = false;
  let actionsMenuEl: HTMLDivElement | null = null;

  function toggleActionsMenu(e: MouseEvent) {
    e.stopPropagation();
    if (showActionsMenu) { closeActionsMenu(); return; }
    showActionsMenu = true;

    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();

    const el = document.createElement("div");
    el.className = "sch-ctx-overlay";
    el.addEventListener("click", closeActionsMenu);
    el.style.zIndex = "9998";

    const menu = document.createElement("div");
    menu.className = "task-actions-menu";
    menu.style.position = "fixed";
    menu.style.zIndex = "9999";
    menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.style.background = "var(--background-primary)";
    menu.style.border = "1px solid var(--background-modifier-border)";
    menu.style.borderRadius = "8px";
    menu.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    menu.style.minWidth = "160px";
    menu.style.overflow = "hidden";
    menu.style.padding = "4px";
    menu.style.fontFamily = "var(--font-interface)";
    menu.style.fontSize = "13px";

    type MenuItem = { label: string; action?: () => void; danger?: boolean } | { divider: true };
    const items: MenuItem[] = [];

    if (task.status === "done") {
      items.push({ label: "🔄 Вернуть в Сделать", action: () => { quickStatus("todo"); } });
      items.push({ label: "⏰ Вернуть в работу", action: () => { quickStatus("progress"); } });
      items.push({ divider: true });
      items.push({ label: "❌ Удалить", action: () => { handleDelete(); }, danger: true });
    } else {
      if (task.status !== "progress" && task.status !== "paused")
        items.push({ label: "⏰ В работу", action: () => { quickStatus("progress"); } });
      if (task.status === "progress")
        items.push({ label: "⏸ На паузу", action: () => { quickStatus("paused"); } });
      if (task.status === "paused")
        items.push({ label: "▶ Продолжить", action: () => { quickStatus("progress"); } });
      items.push({ label: "✅ Готово", action: () => { dispatch("complete", { task }); } });
      items.push({ divider: true });
      items.push({ label: "✏ Редактировать", action: () => { handleEdit(); } });
      items.push({ label: "❌ Удалить", action: () => { handleDelete(); }, danger: true });
    }

    for (const item of items) {
      if ("divider" in item && item.divider) {
        const d = document.createElement("div");
        d.style.height = "1px";
        d.style.background = "var(--background-modifier-border)";
        d.style.margin = "3px 8px";
        menu.appendChild(d);
      } else if ("label" in item) {
        const b = document.createElement("button");
        b.className = "task-actions-item" + (item.danger ? " danger" : "");
        b.textContent = item.label;
        b.style.cssText = "display:flex;width:100%;padding:8px 12px;font-size:13px;border:none;background:transparent;text-align:left;cursor:pointer;border-radius:4px;font-family:var(--font-interface);transition:background .12s;align-items:center;gap:6px";
        if (item.danger) b.style.color = "var(--text-error,#ef4444)";
        b.addEventListener("mouseenter", () => b.style.background = "var(--background-modifier-hover,rgba(255,255,255,.06))");
        b.addEventListener("mouseleave", () => b.style.background = "transparent");
        b.addEventListener("click", (ev) => { ev.stopPropagation(); closeActionsMenu(); item.action?.(); });
        menu.appendChild(b);
      }
    }

    el.appendChild(menu);
    document.body.appendChild(el);
    actionsMenuEl = el;

    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect();
      if (r.bottom > window.innerHeight) {
        menu.style.bottom = "auto";
        menu.style.top = `${rect.top - r.height - 4}px`;
      }
      if (r.left < 8) menu.style.left = "8px";
    });
  }

  function closeActionsMenu() {
    showActionsMenu = false;
    if (actionsMenuEl) { actionsMenuEl.remove(); actionsMenuEl = null; }
  }

  let descrPopupEl: HTMLDivElement | null = null;

  function toggleDescription(e: MouseEvent) {
    e.stopPropagation();
    if (showDescription) { closeDescription(); return; }
    if (!task.description) return;
    showDescription = true;

    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();

    const popup = document.createElement("div");
    popup.className = "sch-ctx-overlay";
    popup.style.zIndex = "9998";
    popup.addEventListener("click", closeDescription);

    const content = document.createElement("div");
    content.className = "task-descr-popup-body";
    content.textContent = task.description;
    content.style.cssText = "position:fixed;z-index:9999;min-width:180px;max-width:340px;max-height:200px;overflow-y:auto;background:var(--mcp-surface);border:1px solid var(--mcp-glass-border);border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.25);padding:8px 12px;font-size:12px;color:var(--mcp-text);white-space:pre-wrap;word-break:break-word;line-height:1.45;";
    content.style.left = `${rect.left}px`;
    content.style.top = `${rect.bottom + 6}px`;

    popup.appendChild(content);
    document.body.appendChild(popup);
    descrPopupEl = popup;

    requestAnimationFrame(() => {
      const cr = content.getBoundingClientRect();
      if (cr.bottom > window.innerHeight) {
        content.style.top = `${rect.top - cr.height - 6}px`;
      }
      if (cr.right > window.innerWidth) {
        content.style.left = `${Math.max(8, window.innerWidth - cr.width - 8)}px`;
      }
    });
  }

  function closeDescription() {
    showDescription = false;
    if (descrPopupEl) { descrPopupEl.remove(); descrPopupEl = null; }
  }

  function handleDescrKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      showDescription = false;
    }
  }

  function handleDescriptionClickOutside(e: MouseEvent) {
    if (!showDescription) return;
    const target = e.target as HTMLElement;
    if (!target.closest('.task-descr-wrapper')) {
      showDescription = false;
    }
  }

  onMount(() => {
    document.addEventListener("click", handleDescriptionClickOutside, true);
  });

  onDestroy(() => {
    document.removeEventListener("click", handleDescriptionClickOutside, true);
    if (actionsMenuEl) { actionsMenuEl.remove(); actionsMenuEl = null; }
    if (descrPopupEl) { descrPopupEl.remove(); descrPopupEl = null; }
  });
</script>

<div
  class="task-item"
  class:completed={task.status === "done"}
  class:is-note-task={!!task.isNoteTask}
  data-status={task.status}
  draggable="true"
  on:dragstart={handleDragStart}
  on:keydown={handleKeydown}
  tabindex="0"
  role="listitem"
  style="--task-color: {projectColor}"
  aria-label={task.title}
>
  <div class="task-item-row-main">
    <span
      class="task-project-dot"
      style="background-color: {projectColor}"
    ></span>

    {#if task.isNoteTask && task.notePath}
      <button
        class="note-icon"
        on:click|stopPropagation={openNote}
        title="Открыть заметку-задачу"
        aria-label="Открыть заметку"
      >
        📝
      </button>
    {:else}
      <button
        class="task-status-btn status-{task.status}"
        disabled={task.status === "done"}
        on:click|stopPropagation={() => {
          if (task.status === "done") return;
          else if (task.status === "progress") quickStatus("done");
          else if (task.status === "paused") quickStatus("done");
          else quickStatus("done");
        }}
        title={task.status === 'done' ? 'Готово (только удаление)' : task.status === 'todo' ? 'Сделать' : task.status === 'progress' ? 'В работе' : 'На паузе'}
        aria-label="Изменить статус"
      >
        {statusIcons[task.status]}
      </button>
    {/if}

    {#if task.boundNotePath}
      <a
        class="task-title note-link"
        class:strikethrough={task.status === "done"}
        href={task.boundNotePath}
        on:click|preventDefault={openNote}
        title="Открыть привязанную заметку: {task.boundNotePath}"
      >
        {task.title}
      </a>
    {:else}
      <span class="task-title" class:strikethrough={task.status === "done"}>
        {task.title}
      </span>
    {/if}

    {#if task.description}
      <div class="task-descr-wrapper">
        <button
          class="task-descr-toggle"
          on:click={toggleDescription}
          title={showDescription ? "Скрыть описание" : "Показать описание"}
          aria-label="Описание задачи"
          aria-expanded={showDescription}
        >
          &#128196;
        </button>
      </div>
    {/if}

    {#if task.recurrence}
      <span class="task-recurring-icon" title="Повторяющаяся задача">&#8635;</span>
    {/if}

    {#if task.priority === "high"}
      <span class="task-priority high" aria-label="Высокий приоритет">!</span>
    {:else if task.priority === "medium"}
      <span class="task-priority medium" aria-label="Средний приоритет">~</span>
    {/if}

    <div class="task-actions-dropdown">
      <button
        class="task-actions-toggle"
        on:click={toggleActionsMenu}
        aria-label="Действия"
      >
        &#8942;
      </button>
    </div>
  </div>

  <div class="task-item-row-meta">
    {#if $activeTab === "all" && task.status !== "done"}
      <span class="task-status-badge status-badge-{task.status}">
        {task.status === "todo" ? "Сделать" : task.status === "progress" ? "В работе" : "На паузе"}
      </span>
    {/if}

    {#if task.scheduledTime && task.status !== "progress" && task.status !== "paused"}
      {#if task.status === "done"}
        <span class="task-scheduled done" title="Готово">
          &#10003; Готово
        </span>
      {:else}
        <span class="task-scheduled {scheduledTimePassed ? 'passed' : ''}" title={scheduledTimePassed ? "Время прошло" : "Запланировано"}>
          {scheduledTimePassed ? "\u26A0" : "\uD83D\uDD52"} {task.scheduledTime}
        </span>
      {/if}
    {/if}

    {#if hasDeadline && task.status !== "done"}
      <span
        class="task-deadline {deadlineOverdue ? 'overdue' : ''}"
        title={deadlineOverdue ? "Дедлайн просрочен" : "Дедлайн"}
      >
        &#9200; {deadlineLabel}
      </span>
    {/if}

    {#if task.status === "paused"}
      <span class="task-work-paused" title="Работа на паузе">
        &#9208; Работа на паузе
      </span>
      {#if hasActual}
        <span class="task-timer total" title="Общее время">
          &#9201; {formatDuration(task.totalWorkTime)}
        </span>
      {/if}
    {:else if timerDisplay}
      <span class="task-timer" title="Текущее время">
        &#9201; {timerDisplay}
      </span>
    {:else if hasEstimate && !hasActual}
      <span class="task-estimate" title="План">
        &#9201; {formatEstimate(task.estimatedTime)}
      </span>
    {:else if task.status === "done" && hasEstimate && hasActual}
      <span
        class="task-estimate-compare {estimateOver ? 'over' : 'under'}"
        title="План → Факт"
      >
        &#9201; {formatEstimate(task.estimatedTime)} → &#10003; {formatDuration(task.totalWorkTime)}
      </span>
    {:else if hasActual}
      <span class="task-timer total" title="Общее время">
        &#9201; {formatDuration(task.totalWorkTime)}
      </span>
    {/if}

    {#if task.isWorkTask}
      <span class="task-work-badge" title="Рабочая задача">
        &#128188; Рабочая
        {#if task.rate && task.status === "done"}
          <span class="task-work-earnings">
            {calculateTaskEarnings(task)} ₽
          </span>
        {/if}
      </span>
    {/if}

    <button
      class="checklist-toggle"
      on:click|stopPropagation={() => showChecklist = !showChecklist}
      title="Чек-лист"
    >
      {#if checklistTotal > 0}
        ☑ {checklistDone}/{checklistTotal}
      {:else}
        ☑ +
      {/if}
    </button>
  </div>

  {#if showChecklist}
    <div class="checklist-section">
      {#each taskChecklistItems as item (item.id)}
        <div class="checklist-item" class:checked={item.checked}>
          <input
            type="checkbox"
            checked={item.checked}
            on:change={() => handleToggleChecklist(item.id)}
            on:click|stopPropagation
          />
          <span class="checklist-title">{item.title}</span>
          <button
            class="checklist-remove"
            on:click|stopPropagation={() => handleRemoveChecklistItem(item.id)}
            title="Удалить"
          >×</button>
        </div>
      {/each}
      <div class="checklist-add">
        <input
          type="text"
          placeholder="Новый пункт..."
          bind:value={newChecklistTitle}
          on:keydown={(e) => e.key === "Enter" && handleAddChecklistItem()}
          on:click|stopPropagation
        />
        <button on:click|stopPropagation={handleAddChecklistItem}>+</button>
      </div>
    </div>
  {/if}

</div>
