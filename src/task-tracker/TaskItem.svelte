<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import type { App } from "obsidian";
  import type { ITask, TaskStatus } from "./types";
  import { updateTask, updateTaskStatus, removeTask, resetTaskTimer, projects, activeTab, calculateTaskEarnings, tasks, checklists, toggleChecklistItem, addChecklistItem, removeChecklistItem } from "./stores";
  import { get } from "svelte/store";
  import { getActiveTimer, formatDuration, formatEstimate } from "./TimerManager";
  import { TaskModal } from "./TaskModal";
  import { syncTaskToNote } from "./noteTasks";
  import { t } from "../i18n";

  export let task: ITask;
  export let appInstance: App;

  const dispatch = createEventDispatcher();

  // Checklist
  $: taskChecklistItems = $checklists.filter((c) => c.taskId === task.id).sort((a, b) => a.sortOrder - b.sortOrder);
  $: checklistDone = taskChecklistItems.filter((c) => c.checked).length;
  $: checklistTotal = taskChecklistItems.length;
  let showChecklist = false;
  let newChecklistTitle = "";
  let showDescription = false;

  function handleToggleChecklist(id: string) { toggleChecklistItem(id); }
  function handleAddChecklistItem() {
    const title = newChecklistTitle.trim();
    if (!title) return;
    addChecklistItem(task.id, title);
    newChecklistTitle = "";
  }
  function handleRemoveChecklistItem(id: string) { removeChecklistItem(id); }

  function openNote(e: MouseEvent) {
    e.preventDefault();
    if (task.boundNotePath && appInstance) {
      appInstance.workspace.openLinkText(task.boundNotePath, "", true);
    }
  }

  // Timer
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let timerDisplay = "";

  function updateTimerDisplay() {
    const elapsed = getActiveTimer(task.id);
    if (elapsed !== null && elapsed > 0) {
      timerDisplay = formatDuration(elapsed + (task.totalWorkTime || 0));
    } else {
      timerDisplay = "";
    }
  }

  onMount(() => { timerInterval = setInterval(updateTimerDisplay, 1000); updateTimerDisplay(); });
  onDestroy(() => { if (timerInterval) clearInterval(timerInterval); });

  // Computed
  $: hasDeadline = !!task.deadline;
  $: scheduledTimePassed = (() => {
    if (!task.scheduledTime || task.status === "done" || task.status === "paused" || task.status === "progress") return false;
    const today = window.moment?.().format("YYYY-MM-DD");
    if (!today) return false;
    const taskDate = task.dateUID?.match(/^day-(\d{4}-\d{2}-\d{2})/)?.[1];
    if (taskDate !== today) return false;
    const [h, m] = task.scheduledTime.split(":").map(Number);
    const now = new Date();
    return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
  })();

  $: deadlineOverdue = (() => {
    if (!task.deadline || task.status === "done") return false;
    const match = task.deadline.match(/(\d{4}-\d{2}-\d{2})/);
    if (!match) return false;
    const deadline = new Date(match[1]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return deadline < today;
  })();

  $: deadlineLabel = (() => {
    if (!task.deadline) return "";
    const match = task.deadline.match(/(\d{4}-\d{2}-\d{2})/);
    if (!match) return task.deadline;
    return new Date(match[1]).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  })();

  $: hasEstimate = !!task.estimatedTime;
  $: hasActual = !!(task.totalWorkTime && task.totalWorkTime > 0);
  $: estimateOver = hasEstimate && hasActual && task.totalWorkTime > task.estimatedTime;

  function quickStatus(status: TaskStatus) {
    updateTaskStatus(task.id, status);
    if (status === "todo") resetTaskTimer(task.id);
  }

  function handleEdit() {
    const modal = new TaskModal(appInstance, async (data) => {
      updateTask(task.id, data);
      const updatedTask = get(tasks).find((t) => t.id === task.id);
      if (updatedTask && appInstance) await syncTaskToNote(updatedTask, appInstance);
    }, task);
    modal.open();
  }

  async function handleDelete() {
    if (!confirm(get(t)("tasks.item.deleteConfirm"))) return;
    if (task.notePath && appInstance) {
      const { deleteNoteTask } = await import("./noteTasks");
      await deleteNoteTask(task.notePath, appInstance);
    }
    removeTask(task.id);
  }

  // Actions menu
  let showActionsMenu = false;
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
    menu.style.background = "var(--mcp-surface-2)";
    menu.style.border = "1px solid rgba(255,255,255,0.06)";
    menu.style.borderRadius = "10px";
    menu.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25)";
    menu.style.minWidth = "160px";
    menu.style.overflow = "hidden";
    menu.style.padding = "4px";
    menu.style.fontFamily = "var(--font-interface)";
    menu.style.fontSize = "13px";

    const translate = get(t);
    type MenuItem = { label: string; action?: () => void; danger?: boolean } | { divider: true };
    const items: MenuItem[] = [];

    if (task.status === "done") {
      items.push({ label: translate("tasks.item.returnToTodo"), action: () => { quickStatus("todo"); } });
      items.push({ label: translate("tasks.item.returnToWork"), action: () => { quickStatus("progress"); } });
      items.push({ divider: true });
      items.push({ label: translate("tasks.item.delete"), action: () => { handleDelete(); }, danger: true });
    } else {
      if (task.status !== "progress" && task.status !== "paused")
        items.push({ label: translate("tasks.item.toWork"), action: () => { quickStatus("progress"); } });
      if (task.status === "progress")
        items.push({ label: translate("tasks.item.toPause"), action: () => { quickStatus("paused"); } });
      if (task.status === "paused")
        items.push({ label: translate("tasks.item.continue"), action: () => { quickStatus("progress"); } });
      items.push({ label: translate("tasks.item.markDone"), action: () => { dispatch("complete", { task }); } });
      items.push({ divider: true });
      items.push({ label: translate("tasks.item.edit"), action: () => { handleEdit(); } });
      items.push({ label: translate("tasks.item.delete"), action: () => { handleDelete(); }, danger: true });
    }

    for (const item of items) {
      if ("divider" in item && item.divider) {
        const d = document.createElement("div");
        d.style.height = "1px";
        d.style.background = "rgba(255,255,255,0.06)";
        d.style.margin = "4px 8px";
        menu.appendChild(d);
      } else if ("label" in item) {
        const btn = document.createElement("button");
        btn.textContent = item.label;
        btn.style.width = "100%";
        btn.style.textAlign = "left";
        btn.style.padding = "8px 12px";
        btn.style.border = "none";
        btn.style.background = "none";
        btn.style.color = item.danger ? "var(--mcp-danger)" : "var(--mcp-text)";
        btn.style.cursor = "pointer";
        btn.style.borderRadius = "6px";
        btn.style.transition = "background 0.15s";
        btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(255,255,255,0.06)"; });
        btn.addEventListener("mouseleave", () => { btn.style.background = "none"; });
        btn.addEventListener("click", () => { item.action?.(); closeActionsMenu(); });
        menu.appendChild(btn);
      }
    }

    document.body.appendChild(el);
    document.body.appendChild(menu);
    actionsMenuEl = el;
  }

  function closeActionsMenu() {
    showActionsMenu = false;
    if (actionsMenuEl) {
      actionsMenuEl.remove();
      const menu = document.querySelector(".task-actions-menu");
      if (menu) menu.remove();
      actionsMenuEl = null;
    }
  }
</script>

<div class="task-item" class:completed={task.status === "done"} data-status={task.status} draggable="true" role="listitem" aria-label={task.title} style="--task-color: {task.projectId ? ($projects.find(p => p.id === task.projectId)?.color || 'var(--mcp-accent)') : 'var(--mcp-accent)'}" on:dragstart>
  <div class="task-item-row-main">
    <button class="task-status-btn status-{task.status}" disabled={task.status === "done"} on:click|stopPropagation={() => { if (task.status !== "done") quickStatus("done"); }}>
      {#if task.status === "todo"}
        <svg class="check-hover" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5L5 9l4.5-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      {:else if task.status === "progress"}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v4l3 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.5" opacity="0.4"/></svg>
      {:else if task.status === "done"}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5L5 9l4.5-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      {:else if task.status === "paused"}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="3" y="2.5" width="2" height="7" rx="1" fill="currentColor"/><rect x="7" y="2.5" width="2" height="7" rx="1" fill="currentColor"/></svg>
      {/if}
    </button>

    {#if task.boundNotePath}
      <a class="task-title note-link" class:strikethrough={task.status === "done"} href={task.boundNotePath} on:click|preventDefault={openNote}>{task.title}</a>
    {:else}
      <span class="task-title" class:strikethrough={task.status === "done"}>{task.title}</span>
    {/if}

    {#if task.description}
      <button class="task-descr-toggle" on:click|stopPropagation={() => showDescription = !showDescription} title={showDescription ? $t("tasks.item.hide") : $t("tasks.item.description")}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.2"/><line x1="3" y1="4" x2="9" y2="4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="3" y1="6.5" x2="7.5" y2="6.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      </button>
    {/if}

    {#if task.priority === "high"}
      <span class="task-priority high">!</span>
    {:else if task.priority === "medium"}
      <span class="task-priority medium">~</span>
    {/if}

    <button class="checklist-toggle" on:click|stopPropagation={() => showChecklist = !showChecklist} title={$t("tasks.item.checklist")}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 6l1.5 1.5L8.5 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      {#if checklistTotal > 0}{checklistDone}/{checklistTotal}{:else}+{/if}
    </button>

    <div class="task-actions-dropdown">
      <button class="task-actions-toggle" on:click={toggleActionsMenu}>⋮</button>
    </div>
  </div>

  {#if showDescription && task.description}
    <div class="wf-task-description">{task.description}</div>
  {/if}

  <div class="task-item-row-meta">
    {#if $activeTab === "all" && task.status !== "done"}
      <span class="task-status-badge status-badge-{task.status}">
        {#if task.status === "todo"}{$t("tasks.tabs.todo")}{:else if task.status === "progress"}{$t("tasks.item.progress")}{:else if task.status === "paused"}{$t("tasks.item.paused")}{/if}
      </span>
    {/if}

    {#if task.isWorkTask}
      <span class="task-work-badge">{$t("tasks.item.workBadge")}</span>
    {/if}

    {#if task.recurrence}
      <span class="task-recurring-icon" title={$t("tasks.item.recurring")}>🔄</span>
    {/if}

    {#if task.scheduledTime}
      {#if task.status === "done"}
        <span class="task-scheduled done">{$t("tasks.item.done")}</span>
      {:else}
        <span class="task-scheduled {scheduledTimePassed ? 'passed' : ''}">
          {scheduledTimePassed ? "⚠" : "🕐"} {task.scheduledTime}{#if task.endTime} — {task.endTime}{/if}
        </span>
      {/if}
    {/if}

    {#if hasDeadline && task.status !== "done"}
      <span class="task-deadline {deadlineOverdue ? 'overdue' : ''}">⏰ {deadlineLabel}</span>
    {/if}

    {#if timerDisplay}
      <span class="task-timer">⏱ {timerDisplay}</span>
    {:else if hasEstimate && !hasActual}
      <span class="task-estimate">⏱ {formatEstimate(task.estimatedTime)}</span>
    {:else if task.status === "done" && hasEstimate && hasActual}
      <span class="task-estimate-compare {estimateOver ? 'over' : 'under'}">
        ⏱ {formatEstimate(task.estimatedTime)} → ✓ {formatDuration(task.totalWorkTime)}
      </span>
    {:else if hasActual}
      <span class="task-timer total">⏱ {formatDuration(task.totalWorkTime)}</span>
    {/if}
  </div>

  {#if showChecklist}
    <div class="checklist-section">
      {#each taskChecklistItems as item (item.id)}
        <div class="checklist-item" class:checked={item.checked}>
          <input type="checkbox" checked={item.checked} on:change={() => handleToggleChecklist(item.id)} on:click|stopPropagation />
          <span class="checklist-title">{item.title}</span>
          <button class="checklist-remove" on:click|stopPropagation={() => handleRemoveChecklistItem(item.id)} title={$t("common.delete")}>✕</button>
        </div>
      {/each}
      <div class="checklist-add">
        <input type="text" placeholder={$t("tasks.item.checkistNew")} bind:value={newChecklistTitle} on:keydown|stopPropagation={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddChecklistItem(); } }} on:click|stopPropagation />
        <button on:click|stopPropagation={handleAddChecklistItem}>+</button>
      </div>
    </div>
  {/if}
</div>
