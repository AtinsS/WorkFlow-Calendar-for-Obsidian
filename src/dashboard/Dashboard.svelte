<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import moment from "moment";
  import type { App } from "obsidian";
  import { FileSuggestModal } from "../modals/FileSuggestModal";
  import type { DashboardData, DashboardCard } from "./types";
  import {
    loadDashboard,
    saveDashboard,
    addCard,
    updateCard,
    deleteCard,
    addLink,
    deleteLink,
    reorderCards,
  } from "./storage";
  import { tasks, projects, updateTaskStatus } from "../task-tracker/stores";
  import { habits, habitLogs, toggleHabitCompletion, getHabitProgressOnDate } from "../habit-tracker/stores";
  import { getCurrentMonthKey, financeData } from "../finance/storage";
  import { settings } from "../ui/stores";

  export let appInstance: App;
  export let filePath: string | undefined = undefined;

  let data: DashboardData = { cards: [] };
  let editingCard: DashboardCard | null = null;
  let editingCardTitle = "";
  let editingCardIcon = "";
  let showCardModal = false;

  let addingLinkToCardId: string | null = null;
  let newLinkLabel = "";
  let newLinkPath = "";
  let showLinkModal = false;

  let showAddCardModal = false;
  let newCardTitle = "";
  let newCardIcon = "📁";

  // Widget settings
  $: showTasksWidget = $settings.dashboardShowTasks !== false;
  $: showHabitsWidget = $settings.dashboardShowHabits !== false;
  $: showGoalsWidget = $settings.dashboardShowGoals !== false;

  // Widget expand state
  let tasksExpanded = false;
  let habitsExpanded = false;
  let goalsExpanded = false;

  // Drag & drop state
  let draggedCardId: string | null = null;
  let dragOverCardId: string | null = null;

  function onDragStart(e: DragEvent, cardId: string) {
    draggedCardId = cardId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", cardId);
    (e.target as HTMLElement).classList.add("dragging");
  }

  function onDragEnd(e: DragEvent) {
    (e.target as HTMLElement).classList.remove("dragging");
    draggedCardId = null;
    dragOverCardId = null;
  }

  function onDragOver(e: DragEvent, cardId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (cardId !== draggedCardId) {
      dragOverCardId = cardId;
    }
  }

  function onDragLeave() {
    dragOverCardId = null;
  }

  async function onDrop(e: DragEvent, targetCardId: string) {
    e.preventDefault();
    if (!draggedCardId || draggedCardId === targetCardId) return;

    const ids = data.cards.map(c => c.id);
    const fromIdx = ids.indexOf(draggedCardId);
    const toIdx = ids.indexOf(targetCardId);
    if (fromIdx === -1 || toIdx === -1) return;

    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, draggedCardId);

    await reorderCards(appInstance, ids, filePath);
    data = await loadDashboard(appInstance, filePath);
    draggedCardId = null;
    dragOverCardId = null;
  }

  // Tasks widget data
  $: todayStr = moment().format("YYYY-MM-DD");
  $: todayDateUID = `day-${moment().startOf("day").format()}`;
  $: todayAllTasks = $tasks
    .filter((t) => t.dateUID === todayDateUID)
    .sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (a.status !== "done" && b.status === "done") return -1;
      if (a.scheduledTime && b.scheduledTime) return a.scheduledTime.localeCompare(b.scheduledTime);
      if (a.scheduledTime) return -1;
      if (b.scheduledTime) return 1;
      return 0;
    });
  $: todayDone = todayAllTasks.filter((t) => t.status === "done").length;
  $: todayTotal = todayAllTasks.length;
  $: todayProgress = todayTotal > 0 ? Math.round((todayDone / todayTotal) * 100) : 0;

  // Habits widget data
  $: todayHabits = $habits
    .filter((h) => !h.archived)
    .map((h) => ({ ...h, progress: getHabitProgressOnDate(h.id, todayStr) }))
    .sort((a, b) => {
      if (a.progress === 2 && b.progress !== 2) return 1;
      if (a.progress !== 2 && b.progress === 2) return -1;
      return a.sortOrder - b.sortOrder;
    });
  $: habitDoneCount = todayHabits.filter((h) => h.progress === 2).length;
  $: habitTotalCount = todayHabits.length;

  // Goals widget data
  $: monthKey = getCurrentMonthKey();
  $: monthData = (() => {
    const allData = $financeData;
    if (!allData[monthKey]) return null;
    return allData[monthKey];
  })();
  $: monthGoals = monthData?.monthGoals || [];

  function cycleTaskStatus(task: { id: string; status: string }) {
    const order = ["todo", "progress", "done"];
    const idx = order.indexOf(task.status);
    const next = order[(idx + 1) % order.length];
    updateTaskStatus(task.id, next as any);
  }

  function statusIcon(s: string): string {
    return s === "progress" ? "◐" : s === "done" ? "✓" : "";
  }

  onMount(async () => {
    data = await loadDashboard(appInstance, filePath);
  });

  function openEditCard(card: DashboardCard) {
    editingCard = card;
    editingCardTitle = card.title;
    editingCardIcon = card.icon;
    showCardModal = true;
  }

  async function saveCardEdit() {
    if (!editingCard) return;
    await updateCard(appInstance, editingCard.id, {
      title: editingCardTitle,
      icon: editingCardIcon,
    }, filePath);
    data = await loadDashboard(appInstance, filePath);
    showCardModal = false;
    editingCard = null;
  }

  async function removeCard(cardId: string) {
    await deleteCard(appInstance, cardId, filePath);
    data = await loadDashboard(appInstance, filePath);
  }

  function openAddLink(cardId: string) {
    addingLinkToCardId = cardId;
    newLinkLabel = "";
    newLinkPath = "";
    showLinkModal = true;
  }

  async function saveNewLink() {
    if (!addingLinkToCardId || !newLinkLabel) return;
    await addLink(appInstance, addingLinkToCardId, newLinkLabel, newLinkPath, filePath);
    data = await loadDashboard(appInstance, filePath);
    showLinkModal = false;
    addingLinkToCardId = null;
  }

  async function removeLink(cardId: string, linkId: string) {
    await deleteLink(appInstance, cardId, linkId, filePath);
    data = await loadDashboard(appInstance, filePath);
  }

  async function createNewCard() {
    if (!newCardTitle) return;
    await addCard(appInstance, newCardTitle, newCardIcon, filePath);
    data = await loadDashboard(appInstance, filePath);
    showAddCardModal = false;
    newCardTitle = "";
    newCardIcon = "📁";
  }

  function openFilePicker() {
    new FileSuggestModal(appInstance, (filePath) => {
      newLinkPath = filePath;
      // Auto-fill label from filename if empty
      if (!newLinkLabel) {
        const parts = filePath.split("/");
        const name = parts[parts.length - 1].replace(/\.md$/, "");
        newLinkLabel = name;
      }
    }).open();
  }

  function handleLinkClick(e: MouseEvent, notePath: string) {
    e.preventDefault();
    if (notePath) {
      appInstance.workspace.openLinkText(notePath, "", true);
    }
  }

  function closeModal(e: MouseEvent, closeFn: () => void) {
    if ((e.target as HTMLElement).classList.contains("dash-popup-overlay")) {
      closeFn();
    }
  }
</script>

<div class="dashboard">
  <!-- Widgets row -->
  <div class="dashboard__widgets">
    <!-- Tasks widget -->
    {#if showTasksWidget && todayTotal > 0}
      <div class="dash-widget-wrap">
        <button class="dash-widget dash-widget--tasks" class:expanded={tasksExpanded} on:click={() => tasksExpanded = !tasksExpanded}>
          <span class="dash-widget__icon">✅</span>
          <span class="dash-widget__label">Задачи</span>
          <div class="dash-widget__bar"><div class="dash-widget__bar-fill" style="width:{todayProgress}%"></div></div>
          <span class="dash-widget__count">{todayDone}/{todayTotal}</span>
          <span class="dash-widget__chevron" class:open={tasksExpanded}>›</span>
        </button>
        {#if tasksExpanded}
          <div class="dash-widget__dropdown">
            {#each todayAllTasks as task (task.id)}
              {@const project = $projects.find(p => p.id === task.projectId)}
              <button class="dash-task" class:done={task.status === "done"} on:click|stopPropagation={() => cycleTaskStatus(task)}>
                <span class="dash-task-check" class:checked={task.status === "done"} class:in-progress={task.status === "progress"}>{statusIcon(task.status)}</span>
                <span class="dash-task-title" class:strike={task.status === "done"}>{task.title}</span>
                {#if task.scheduledTime}<span class="dash-task-time">{task.scheduledTime}</span>{/if}
                {#if project}<span class="dash-task-project" style="color:{project.color}">{project.icon || "📁"}</span>{/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Habits widget -->
    {#if showHabitsWidget && habitTotalCount > 0}
      <div class="dash-widget-wrap">
        <button class="dash-widget dash-widget--habits" class:expanded={habitsExpanded} on:click={() => habitsExpanded = !habitsExpanded}>
          <span class="dash-widget__icon">🔥</span>
          <span class="dash-widget__label">Привычки</span>
          <div class="dash-widget__bar"><div class="dash-widget__bar-fill" style="width:{habitTotalCount > 0 ? Math.round(habitDoneCount / habitTotalCount * 100) : 0}%"></div></div>
          <span class="dash-widget__count">{habitDoneCount}/{habitTotalCount}</span>
          <span class="dash-widget__chevron" class:open={habitsExpanded}>›</span>
        </button>
        {#if habitsExpanded}
          <div class="dash-widget__dropdown">
            {#each todayHabits as habit (habit.id)}
              <button class="dash-habit" class:done={habit.progress === 2} style="--hc:{habit.color}" on:click|stopPropagation={() => toggleHabitCompletion(habit.id, todayStr, habit.targetCount || 1)}>
                <span class="dash-habit-check" class:checked={habit.progress === 2} class:half={habit.progress === 1}>
                  {#if habit.progress === 2}<svg class="dash-check-svg" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="2" fill="none"/></svg>
                  {:else if habit.progress === 1}<span style="font-size:10px">½</span>{/if}
                </span>
                <span class="dash-habit-icon">{habit.icon}</span>
                <span class="dash-habit-name" class:strike={habit.progress === 2}>{habit.title}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Goals widget -->
    {#if showGoalsWidget && monthGoals.length > 0}
      <div class="dash-widget-wrap">
        <button class="dash-widget dash-widget--goals" class:expanded={goalsExpanded} on:click={() => goalsExpanded = !goalsExpanded}>
          <span class="dash-widget__icon">🎯</span>
          <span class="dash-widget__label">Цель месяца</span>
          {#if monthGoals.length === 1}
            {@const g = monthGoals[0]}
            <div class="dash-widget__bar"><div class="dash-widget__bar-fill goal-fill" style="width:{g.targetAmount > 0 ? Math.min(100, Math.round(g.currentAmount / g.targetAmount * 100)) : 0}%"></div></div>
            <span class="dash-widget__count">{g.currentAmount.toLocaleString("ru-RU")}/{g.targetAmount.toLocaleString("ru-RU")} ₽</span>
          {:else}
            <span class="dash-widget__count">{monthGoals.length} целей</span>
            <span class="dash-widget__chevron" class:open={goalsExpanded}>›</span>
          {/if}
        </button>
        {#if goalsExpanded && monthGoals.length > 1}
          <div class="dash-widget__dropdown">
            {#each monthGoals as goal (goal.id)}
              <div class="dash-goal">
                <span class="dash-goal-icon">{goal.icon}</span>
                <span class="dash-goal-name">{goal.name}</span>
                <div class="dash-goal-bar"><div class="dash-goal-bar-fill" style="width:{goal.targetAmount > 0 ? Math.min(100, Math.round(goal.currentAmount / goal.targetAmount * 100)) : 0}%"></div></div>
                <span class="dash-goal-amt">{goal.currentAmount.toLocaleString("ru-RU")}/{goal.targetAmount.toLocaleString("ru-RU")} ₽</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="dashboard__grid">
    {#each data.cards as card, i (card.id)}
      <div
        class="dashboard-card"
        class:drag-over={dragOverCardId === card.id}
        style="--card-index: {i}"
        draggable="true"
        on:dragstart={(e) => onDragStart(e, card.id)}
        on:dragend={onDragEnd}
        on:dragover={(e) => onDragOver(e, card.id)}
        on:dragleave={onDragLeave}
        on:drop={(e) => onDrop(e, card.id)}
      >
        <div class="dashboard-card__header">
          <h3 class="dashboard-card__title">
            <span class="dashboard-card__drag-handle">⠿</span>
            <span>{card.icon} {card.title}</span>
          </h3>
          <div class="dashboard-card__actions">
            <button
              class="dash-btn dash-btn--icon"
              title="Добавить ссылку"
              on:click={() => openAddLink(card.id)}
            >+</button>
            <button
              class="dash-btn dash-btn--icon"
              title="Редактировать карточку"
              on:click={() => openEditCard(card)}
            >✎</button>
            <button
              class="dash-btn dash-btn--icon dash-btn--danger"
              title="Удалить карточку"
              on:click={() => removeCard(card.id)}
            >✕</button>
          </div>
        </div>
        <div class="dashboard-card__links">
          {#each card.links as link (link.id)}
            <a
              href={link.notePath}
              class="internal-link dashboard-card__item"
              on:click={(e) => handleLinkClick(e, link.notePath)}
            >
              <span class="dash-link-label">{link.label}</span>
              <button
                class="dash-btn dash-btn--sm dash-btn--danger"
                title="Удалить ссылку"
                on:click|stopPropagation|preventDefault={() => removeLink(card.id, link.id)}
              >✕</button>
            </a>
          {/each}
          {#if card.links.length === 0}
            <div class="dashboard-card__empty">Нет ссылок</div>
          {/if}
        </div>
      </div>
    {/each}

    <!-- Add card button -->
    <button class="dashboard-card dashboard-card--add" on:click={() => { showAddCardModal = true; newCardTitle = ""; newCardIcon = "📁"; }}>
      <span class="dashboard-card__add-icon">+</span>
      <span class="dashboard-card__add-text">Добавить карточку</span>
    </button>
  </div>
</div>

<!-- Edit card modal -->
{#if showCardModal}
  <div class="dash-popup-overlay" on:click={(e) => closeModal(e, () => { showCardModal = false; editingCard = null; })}>
    <div class="dash-popup">
      <h3 class="dash-popup__title">Редактировать карточку</h3>
      <label class="dash-popup__label">
        Иконка
        <input class="dash-popup__input" type="text" bind:value={editingCardIcon} maxlength="4" />
      </label>
      <label class="dash-popup__label">
        Название
        <input class="dash-popup__input" type="text" bind:value={editingCardTitle} placeholder="Название карточки" />
      </label>
      <div class="dash-popup__actions">
        <button class="dash-btn dash-btn--cancel" on:click={() => { showCardModal = false; editingCard = null; }}>Отмена</button>
        <button class="dash-btn dash-btn--save" on:click={saveCardEdit}>Сохранить</button>
      </div>
    </div>
  </div>
{/if}

<!-- Add link modal -->
{#if showLinkModal}
  <div class="dash-popup-overlay" on:click={(e) => closeModal(e, () => { showLinkModal = false; addingLinkToCardId = null; })}>
    <div class="dash-popup">
      <h3 class="dash-popup__title">Добавить ссылку</h3>
      <label class="dash-popup__label">
        Название
        <input class="dash-popup__input" type="text" bind:value={newLinkLabel} placeholder="Название ссылки" />
      </label>
      <label class="dash-popup__label">
        Путь к заметке
        <div class="dash-popup__input-row">
          <input class="dash-popup__input" type="text" bind:value={newLinkPath} placeholder="Папка/Заметка" />
          <button class="dash-btn dash-btn--browse" title="Выбрать заметку" on:click={openFilePicker}>...</button>
        </div>
      </label>
      <div class="dash-popup__actions">
        <button class="dash-btn dash-btn--cancel" on:click={() => { showLinkModal = false; addingLinkToCardId = null; }}>Отмена</button>
        <button class="dash-btn dash-btn--save" on:click={saveNewLink}>Добавить</button>
      </div>
    </div>
  </div>
{/if}

<!-- Add card modal -->
{#if showAddCardModal}
  <div class="dash-popup-overlay" on:click={(e) => closeModal(e, () => { showAddCardModal = false; })}>
    <div class="dash-popup">
      <h3 class="dash-popup__title">Новая карточка</h3>
      <label class="dash-popup__label">
        Иконка
        <input class="dash-popup__input" type="text" bind:value={newCardIcon} maxlength="4" />
      </label>
      <label class="dash-popup__label">
        Название
        <input class="dash-popup__input" type="text" bind:value={newCardTitle} placeholder="Название карточки" />
      </label>
      <div class="dash-popup__actions">
        <button class="dash-btn dash-btn--cancel" on:click={() => { showAddCardModal = false; }}>Отмена</button>
        <button class="dash-btn dash-btn--save" on:click={createNewCard}>Создать</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Widgets */
  .dashboard__widgets { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }

  .dash-widget-wrap { display: flex; flex-direction: column; flex: 1; min-width: 200px; }

  .dash-widget {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 16px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    cursor: pointer; font-family: inherit; color: inherit;
    transition: all 0.15s ease; text-align: left; width: 100%;
  }
  .dash-widget:hover { border-color: var(--background-modifier-border-hover, rgba(255,255,255,0.12)); }
  .dash-widget.expanded { border-radius: 12px 12px 0 0; border-color: var(--background-modifier-border-hover, rgba(255,255,255,0.12)); }

  .dash-widget__icon { font-size: 20px; flex-shrink: 0; }
  .dash-widget__label { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; color: var(--text-normal); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .dash-widget__bar { width: 60px; height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; flex-shrink: 0; }
  .dash-widget__bar-fill { height: 100%; background: var(--interactive-accent); border-radius: 2px; transition: width 0.4s ease; }
  .dash-widget__bar-fill.goal-fill { background: linear-gradient(90deg, var(--interactive-accent), #3dd68c); }

  .dash-widget__count { font-size: 12px; font-weight: 700; color: var(--text-muted); flex-shrink: 0; white-space: nowrap; }
  .dash-widget__chevron { font-size: 18px; color: var(--text-muted); transition: transform 0.2s ease; flex-shrink: 0; }
  .dash-widget__chevron.open { transform: rotate(90deg); }

  .dash-widget__dropdown {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-top: none;
    border-radius: 0 0 12px 12px;
    padding: 6px 10px 10px;
    display: flex; flex-direction: column; gap: 2px;
    animation: dd-open 0.15s ease;
  }
  @keyframes dd-open { from { opacity: 0; } to { opacity: 1; } }

  /* Task rows */
  .dash-task {
    display: flex; align-items: center; gap: 10px;
    padding: 7px 8px; background: transparent; border: 1px solid transparent;
    border-radius: 8px; cursor: pointer; transition: all 0.15s ease;
    width: 100%; text-align: left; color: var(--text-normal); font-family: inherit; font-size: 13px;
  }
  .dash-task:hover { background: rgba(255,255,255,0.03); }
  .dash-task.done { opacity: 0.5; }

  .dash-task-check {
    width: 18px; height: 18px; border-radius: 4px;
    border: 2px solid rgba(255,255,255,0.12); background: transparent;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: all 0.2s ease; color: transparent; font-size: 11px;
  }
  .dash-task-check.checked { background: var(--interactive-accent); border-color: var(--interactive-accent); color: #fff; }
  .dash-task-check.in-progress { border-color: var(--interactive-accent); color: var(--interactive-accent); }

  .dash-task-title { flex: 1; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .dash-task-title.strike { text-decoration: line-through; color: var(--text-muted); }
  .dash-task-time { font-size: 11px; font-weight: 600; color: var(--text-muted); background: rgba(255,255,255,0.04); padding: 2px 6px; border-radius: 5px; flex-shrink: 0; }
  .dash-task-project { font-size: 13px; flex-shrink: 0; }

  /* Habit rows */
  .dash-habit {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 8px; background: transparent; border: 1px solid transparent;
    border-radius: 8px; cursor: pointer; transition: all 0.15s ease;
    width: 100%; text-align: left; color: var(--text-normal); font-family: inherit; font-size: 13px;
  }
  .dash-habit:hover { background: rgba(255,255,255,0.03); }
  .dash-habit.done { opacity: 0.5; }

  .dash-habit-check {
    width: 18px; height: 18px; border-radius: 4px;
    border: 2px solid rgba(255,255,255,0.1); background: transparent;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: all 0.2s ease; color: transparent;
  }
  .dash-habit-check.checked { background: var(--hc, #3DD68C); border-color: var(--hc, #3DD68C); color: #fff; }
  .dash-habit-check.half { border-color: var(--hc, #F5A623); color: var(--hc, #F5A623); }
  .dash-check-svg { width: 10px; height: 10px; }
  .dash-habit-icon { font-size: 14px; flex-shrink: 0; line-height: 1; }
  .dash-habit-name { flex: 1; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .dash-habit-name.strike { text-decoration: line-through; color: var(--text-muted); }

  /* Goal rows */
  .dash-goal { display: flex; align-items: center; gap: 8px; padding: 7px 8px; font-size: 13px; }
  .dash-goal-icon { font-size: 14px; flex-shrink: 0; }
  .dash-goal-name { flex: 1; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .dash-goal-bar { width: 60px; height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; flex-shrink: 0; }
  .dash-goal-bar-fill { height: 100%; background: linear-gradient(90deg, var(--interactive-accent), #3dd68c); border-radius: 2px; transition: width 0.4s ease; }
  .dash-goal-amt { font-size: 11px; color: var(--text-muted); flex-shrink: 0; white-space: nowrap; }

  /* Card drag & drop */
  .dashboard-card[draggable="true"] {
    cursor: grab;
    transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
  }

  .dashboard-card[draggable="true"]:active {
    cursor: grabbing;
  }

  .dashboard-card.dragging {
    opacity: 0.4;
    transform: scale(0.98);
  }

  .dashboard-card.drag-over {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb, 124, 92, 252), 0.3);
    transform: translateY(-2px);
  }

  .dashboard-card__drag-handle {
    cursor: grab;
    color: var(--text-muted);
    opacity: 0.4;
    font-size: 14px;
    margin-right: 4px;
    user-select: none;
    transition: opacity 0.15s ease;
  }

  .dashboard-card:hover .dashboard-card__drag-handle {
    opacity: 0.8;
  }

  .dashboard-card__drag-handle:active {
    cursor: grabbing;
  }

  /* Card actions */
  .dashboard-card__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .dashboard-card__actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .dashboard-card:hover .dashboard-card__actions {
    opacity: 1;
  }

  @media (max-width: 768px) {
    .dashboard-card__actions {
      opacity: 1;
    }
  }

  .dash-btn {
    cursor: pointer;
    border: none;
    background: transparent;
    color: var(--text-muted);
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1;
    transition: background 0.15s, color 0.15s;
  }

  .dash-btn--icon {
    min-width: 24px;
    min-height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dash-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .dash-btn--danger:hover {
    background: var(--background-modifier-error);
    color: var(--text-error);
  }

  .dash-btn--sm {
    padding: 2px 6px;
    font-size: 11px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .dashboard-card__item:hover .dash-btn--sm {
    opacity: 1;
  }

  @media (max-width: 768px) {
    .dash-btn--sm {
      opacity: 0.6;
    }
  }

  .dash-link-label {
    flex: 1;
  }

  .dashboard-card__empty {
    text-align: center;
    color: var(--text-faint);
    font-size: 13px;
    padding: 16px 0;
  }

  /* Add card button */
  .dashboard-card--add {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 160px;
    border: 2px dashed var(--background-modifier-border);
    background: transparent;
    cursor: pointer;
    opacity: 1;
    transform: none;
    animation: none;
  }

  .dashboard-card--add:hover {
    border-color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 5%, transparent);
  }

  .dashboard-card__add-icon {
    font-size: 28px;
    color: var(--text-faint);
    transition: color 0.2s;
  }

  .dashboard-card--add:hover .dashboard-card__add-icon {
    color: var(--interactive-accent);
  }

  .dashboard-card__add-text {
    font-size: 13px;
    color: var(--text-faint);
  }

  .dashboard-card--add:hover .dashboard-card__add-text {
    color: var(--interactive-accent);
  }

  /* Modal */
  .dash-popup-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dash-popup {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    padding: 24px;
    min-width: 320px;
    max-width: 420px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  }

  .dash-popup__title {
    margin: 0 0 16px;
    font-size: 16px;
    font-weight: 600;
  }

  .dash-popup__label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
  }

  .dash-popup__input {
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-normal);
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }

  .dash-popup__input:focus {
    border-color: var(--interactive-accent);
  }

  .dash-popup__input-row {
    display: flex;
    gap: 6px;
    align-items: stretch;
  }

  .dash-popup__input-row .dash-popup__input {
    flex: 1;
    min-width: 0;
  }

  .dash-btn--browse {
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
  }

  .dash-btn--browse:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .dash-popup__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  .dash-btn--cancel {
    padding: 6px 14px;
    border-radius: 8px;
  }

  .dash-btn--save {
    padding: 6px 14px;
    border-radius: 8px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .dash-btn--save:hover {
    opacity: 0.9;
  }

  @media (max-width: 480px) {
    .dash-popup {
      min-width: 0;
      width: calc(100vw - 32px);
      padding: 18px;
    }

    .dash-popup__input {
      padding: 10px 12px;
      font-size: 16px;
    }

    .dash-popup__input-row {
      flex-direction: column;
    }

    .dash-btn--browse {
      align-self: flex-end;
    }

    .dashboard-card__links {
      gap: 6px;
    }

    .dashboard-card__item {
      padding: 10px 12px;
      font-size: 13px;
    }

    .dashboard-card--add {
      min-height: 120px;
    }
  }
</style>
