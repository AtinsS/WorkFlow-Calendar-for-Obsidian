<script lang="ts">
  import { slide } from "svelte/transition";
  import { tasks, projects } from "../task-tracker/stores";
  import { calculateTaskEarnings } from "../task-tracker/stores";
  import { formatDuration } from "../task-tracker/TimerManager";
  import {
    financialAnalyticsData,
    addManualIncomeSource,
    updateManualIncomeSource,
    removeManualIncomeSource,
    getTotalManualIncome,
    getIncomeCategories,
    addIncomeCategory,
    removeIncomeCategory,
  } from "./financialAnalyticsStorage";

  let filterTab: "all" | "done" | "todo" = "all";
  let showAddIncome = false;
  let newIncomeName = "";
  let newIncomeAmount = 0;
  let newIncomeDate = new Date().toISOString().split("T")[0];
  let newIncomeCategory = "";
  let collapsedProjects: Record<string, boolean> = {};
  let collapseVersion = 0;
  let categoryFilter: string = "all";
  let showManageCategories = false;
  let newCategoryName = "";

  // Edit state
  let editingSourceId: string | null = null;
  let editName = "";
  let editAmount = 0;
  let editDate = "";
  let editCategory = "";

  const now = new Date();
  let selectedYear = now.getFullYear();
  let selectedMonth = now.getMonth() + 1;

  const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

  $: allWorkTasks = $tasks.filter((t) => {
    if (!t.isWorkTask) return false;
    const match = t.dateUID.match(/^day-(\d{4})-(\d{2})/);
    if (!match) return false;
    return parseInt(match[1]) === selectedYear && parseInt(match[2]) === selectedMonth;
  });
  $: doneTasks = allWorkTasks.filter((t) => t.status === "done");
  $: todoTasks = allWorkTasks.filter((t) => t.status !== "done");

  $: filteredTasks =
    filterTab === "done"
      ? doneTasks
      : filterTab === "todo"
        ? todoTasks
        : allWorkTasks;

  $: totalTaskEarnings = allWorkTasks
    .filter((t) => t.status === "done")
    .reduce((sum, t) => sum + calculateTaskEarnings(t), 0);

  $: totalManualIncome = $financialAnalyticsData
    ? getTotalManualIncome()
    : 0;

  $: grandTotal = totalTaskEarnings + totalManualIncome;

  $: incomeCategories = $financialAnalyticsData?.incomeCategories || [];

  $: filteredManualSources = (() => {
    const sources = $financialAnalyticsData.manualIncomeSources;
    if (categoryFilter === "all") return sources;
    return sources.filter((s) => s.category === categoryFilter);
  })();

  interface ProjectGroup {
    projectId: string | null;
    projectName: string;
    projectColor: string;
    tasks: typeof filteredTasks;
    totalEarnings: number;
  }

  $: tasksByProject = groupTasksByProject(filteredTasks, $projects);

  function groupTasksByProject(taskList: typeof filteredTasks, allProjects: typeof $projects): ProjectGroup[] {
    const groups = new Map<string, ProjectGroup>();
    const noProjectKey = "__none__";

    for (const task of taskList) {
      const pKey = task.projectId || noProjectKey;
      if (!groups.has(pKey)) {
        const proj = task.projectId ? allProjects.find((p) => p.id === task.projectId) : null;
        groups.set(pKey, {
          projectId: task.projectId,
          projectName: proj?.name || "Без проекта",
          projectColor: proj?.color || "#647177",
          tasks: [],
          totalEarnings: 0,
        });
      }
      const group = groups.get(pKey);
      group.tasks.push(task);
      group.totalEarnings += calculateTaskEarnings(task);
    }

    const result = Array.from(groups.values());
    result.sort((a, b) => b.totalEarnings - a.totalEarnings);
    return result;
  }

  function toggleProject(projectId: string | null): void {
    const key = projectId || "__none__";
    collapsedProjects[key] = !collapsedProjects[key];
    collapseVersion++;
  }

  function isProjectCollapsed(projectId: string | null): boolean {
    const key = projectId || "__none__";
    if (!(key in collapsedProjects)) return true;
    return collapsedProjects[key];
  }

  function getTaskDate(task: any): string {
    const match = task.dateUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
    if (match) {
      const date = new Date(match[1]);
      return date.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
    return "—";
  }

  function getTaskWorkTime(task: any): string {
    if (task.totalWorkTime) {
      return formatDuration(task.totalWorkTime);
    }
    return "—";
  }

  function getTaskPaymentInfo(task: any): string {
    if (task.paymentType === "hour" && task.rate) {
      return `${task.rate} ₽/час`;
    }
    if (task.paymentType === "day" && task.rate) {
      return `${task.rate} ₽/день`;
    }
    return "—";
  }

  function addIncomeSource(): void {
    if (!newIncomeName.trim() || newIncomeAmount <= 0 || !newIncomeCategory) return;

    addManualIncomeSource({
      name: newIncomeName.trim(),
      amount: newIncomeAmount,
      date: newIncomeDate,
      category: newIncomeCategory,
    });

    newIncomeName = "";
    newIncomeAmount = 0;
    newIncomeDate = new Date().toISOString().split("T")[0];
    newIncomeCategory = "";
    showAddIncome = false;
  }

  function handleAddCategory(): void {
    if (!newCategoryName.trim()) return;
    addIncomeCategory(newCategoryName.trim());
    newCategoryName = "";
  }

  function handleRemoveCategory(cat: string): void {
    removeIncomeCategory(cat);
    if (categoryFilter === cat) categoryFilter = "all";
  }

  function deleteIncomeSource(id: string): void {
    if (confirm("Удалить источник дохода?")) {
      removeManualIncomeSource(id);
    }
  }

  function startEditSource(source: { id: string; name: string; amount: number; date: string; category: string }): void {
    editingSourceId = source.id;
    editName = source.name;
    editAmount = source.amount;
    editDate = source.date;
    editCategory = source.category || "Другое";
  }

  function saveEditSource(): void {
    if (!editingSourceId || !editName.trim()) return;
    updateManualIncomeSource(editingSourceId, {
      name: editName.trim(),
      amount: editAmount,
      date: editDate,
      category: editCategory,
    });
    editingSourceId = null;
  }

  function cancelEditSource(): void {
    editingSourceId = null;
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function formatMoney(amount: number): string {
    return amount.toLocaleString("ru-RU");
  }

  const STATUS_LABELS: Record<string, string> = {
    done: "Выполнено",
    progress: "В работе",
    todo: "Надо сделать",
    paused: "Приостановлено",
  };

  const STATUS_COLORS: Record<string, string> = {
    done: "var(--mcp-success)",
    progress: "var(--mcp-accent)",
    todo: "var(--mcp-text-muted)",
    paused: "var(--mcp-warning)",
  };
</script>

<div class="financial-analytics">
  <div class="fa-header">
    <h2>Финансовая аналитика</h2>
    <div class="fa-month-selector">
      <button class="fa-month-nav" on:click={() => {
        if (selectedMonth === 1) {
          selectedMonth = 12;
          selectedYear--;
        } else {
          selectedMonth--;
        }
      }}>◀</button>
      <select bind:value={selectedMonth} class="fa-month-select">
        {#each monthNames as name, i}
          <option value={i + 1}>{name} {selectedYear}</option>
        {/each}
      </select>
      <button class="fa-month-nav" on:click={() => {
        if (selectedMonth === 12) {
          selectedMonth = 1;
          selectedYear++;
        } else {
          selectedMonth++;
        }
      }}>▶</button>
    </div>
  </div>

  <!-- Summary Cards -->
  <div class="fa-summary">
    <div class="fa-summary-card">
      <span class="fa-summary-icon">Задачи</span>
      <span class="fa-summary-value">{formatMoney(totalTaskEarnings)} ₽</span>
      <span class="fa-summary-label">Из задач</span>
    </div>
    <div class="fa-summary-card">
      <span class="fa-summary-icon">Доп. доход</span>
      <span class="fa-summary-value">{formatMoney(totalManualIncome)} ₽</span>
      <span class="fa-summary-label">Доп. доход</span>
    </div>
    <div class="fa-summary-card total">
      <span class="fa-summary-icon">Итого</span>
      <span class="fa-summary-value">{formatMoney(grandTotal)} ₽</span>
      <span class="fa-summary-label">Итого</span>
    </div>
  </div>

  <!-- Tasks Section -->
  <div class="fa-section">
    <div class="fa-section-header">
      <h3>Задачи</h3>
      <div class="fa-tabs">
        <button
          class="fa-tab"
          class:active={filterTab === "all"}
          on:click={() => (filterTab = "all")}
        >
          Все ({allWorkTasks.length})
        </button>
        <button
          class="fa-tab"
          class:active={filterTab === "done"}
          on:click={() => (filterTab = "done")}
        >
          Выполнено ({doneTasks.length})
        </button>
        <button
          class="fa-tab"
          class:active={filterTab === "todo"}
          on:click={() => (filterTab = "todo")}
        >
          Надо сделать ({todoTasks.length})
        </button>
      </div>
    </div>

    {#if filteredTasks.length === 0}
      <div class="fa-empty">Нет задач для отображения</div>
    {:else}
      <div class="fa-project-groups">
        {#each tasksByProject as group (group.projectId || "__none__")}
          <div class="fa-project-group">
            <button
              class="fa-project-header"
              on:click={() => toggleProject(group.projectId)}
            >
              <span class="fa-project-chevron" class:collapsed={isProjectCollapsed(group.projectId)}>▶</span>
              <span
                class="fa-project-dot"
                style="background: {group.projectColor}"
              ></span>
              <span class="fa-project-name">{group.projectName}</span>
              <span class="fa-project-count">{group.tasks.length}</span>
              {#if group.totalEarnings > 0}
                <span class="fa-project-earnings">{formatMoney(group.totalEarnings)} ₽</span>
              {/if}
            </button>

            {#if collapseVersion >= 0 && !isProjectCollapsed(group.projectId)}
              <div class="fa-task-list" transition:slide={{ duration: 250, easing: t => t * (2 - t) }}>
                {#each group.tasks as task (task.id)}
                  <div class="fa-task-item" class:completed={task.status === "done"}>
                    <div class="fa-task-status">
                      <span
                        class="fa-status-dot"
                        style="background: {STATUS_COLORS[task.status] || STATUS_COLORS.todo}"
                      ></span>
                    </div>
                    <div class="fa-task-info">
                      <div class="fa-task-title">{task.title}</div>
                      <div class="fa-task-meta">
                        <span>{getTaskDate(task)}</span>
                        <span class="fa-meta-separator">·</span>
                        <span>{STATUS_LABELS[task.status] || task.status}</span>
                        {#if task.totalWorkTime}
                          <span class="fa-meta-separator">·</span>
                          <span>{getTaskWorkTime(task)}</span>
                        {/if}
                      </div>
                    </div>
                    <div class="fa-task-payment">
                      <div class="fa-task-rate">{getTaskPaymentInfo(task)}</div>
                      <div class="fa-task-earning">
                        {formatMoney(calculateTaskEarnings(task))} ₽
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Manual Income Section -->
  <div class="fa-section">
    <div class="fa-section-header">
      <h3>Дополнительные источники дохода</h3>
      <button class="fa-add-btn" on:click={() => (showAddIncome = !showAddIncome)}>
        {showAddIncome ? "Отмена" : "+ Добавить"}
      </button>
    </div>

    {#if showAddIncome}
      {#if incomeCategories.length === 0}
        <div class="fa-empty">Сначала добавьте хотя бы одну категорию ниже</div>
      {:else}
        <div class="fa-add-form">
          <input
            type="text"
            bind:value={newIncomeName}
            placeholder="Название источника"
            class="fa-input"
          />
          <input
            type="number"
            bind:value={newIncomeAmount}
            placeholder="Сумма"
            min="0"
            class="fa-input fa-input-amount"
          />
          <select bind:value={newIncomeCategory} class="fa-input fa-category-select">
            <option value="">Категория...</option>
            {#each incomeCategories as cat}
              <option value={cat}>{cat}</option>
            {/each}
          </select>
          <input
            type="date"
            bind:value={newIncomeDate}
            class="fa-input"
          />
          <button class="fa-submit-btn" on:click={addIncomeSource} disabled={!newIncomeCategory}>
            Добавить
          </button>
        </div>
      {/if}
    {/if}

    <!-- Category management -->
    <div class="fa-manage-categories">
      <div class="fa-manage-header">
        {#if incomeCategories.length === 0}
          Добавьте категории для источников дохода
        {:else}
          Категории ({incomeCategories.length})
          <button
            class="fa-cat-toggle-btn"
            on:click={() => showManageCategories = !showManageCategories}
          >{showManageCategories ? "Скрыть" : "Редактировать"}</button>
        {/if}
      </div>

      {#if incomeCategories.length === 0 || showManageCategories}
        <div class="fa-add-category-row">
          <input
            type="text"
            bind:value={newCategoryName}
            placeholder="Название категории"
            class="fa-input"
            on:keydown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
          />
          <button class="fa-submit-btn" on:click={handleAddCategory}>Добавить</button>
        </div>
        {#if incomeCategories.length > 0}
          <div class="fa-category-tags">
            {#each incomeCategories as cat}
              <span class="fa-category-tag">
                {cat}
                <button class="fa-tag-remove" on:click={() => handleRemoveCategory(cat)} title="Удалить категорию">✕</button>
              </span>
            {/each}
          </div>
        {/if}
      {/if}
    </div>

    <!-- Category filter -->
    {#if incomeCategories.length > 0 && $financialAnalyticsData.manualIncomeSources.length > 0}
      <div class="fa-category-filter">
        <button
          class="fa-cat-btn"
          class:active={categoryFilter === "all"}
          on:click={() => categoryFilter = "all"}
        >Все</button>
        {#each incomeCategories as cat}
          {#if $financialAnalyticsData.manualIncomeSources.some(s => s.category === cat)}
            <button
              class="fa-cat-btn"
              class:active={categoryFilter === cat}
              on:click={() => categoryFilter = cat}
            >{cat}</button>
          {/if}
        {/each}
      </div>
    {/if}

    {#if $financialAnalyticsData.manualIncomeSources.length === 0}
      <div class="fa-empty">Нет дополнительных источников дохода</div>
    {:else}
      <div class="fa-income-list">
        {#each filteredManualSources as source (source.id)}
          {#if editingSourceId === source.id}
            <div class="fa-income-item fa-income-editing">
              <div class="fa-edit-fields">
                <input type="text" bind:value={editName} placeholder="Название" class="fa-input fa-edit-name" />
                <input type="number" bind:value={editAmount} min="0" class="fa-input fa-edit-amount" />
                <select bind:value={editCategory} class="fa-input fa-edit-category">
                  {#each incomeCategories as cat}
                    <option value={cat}>{cat}</option>
                  {/each}
                </select>
                <input type="date" bind:value={editDate} class="fa-input fa-edit-date" />
              </div>
              <div class="fa-edit-actions">
                <button class="fa-save-btn" on:click={saveEditSource}>✓</button>
                <button class="fa-cancel-btn" on:click={cancelEditSource}>✕</button>
              </div>
            </div>
          {:else}
            <div class="fa-income-item">
              <div class="fa-income-info">
                <div class="fa-income-name">{source.name}</div>
                <div class="fa-income-meta">
                  <span class="fa-income-category">{source.category || "Другое"}</span>
                  <span class="fa-income-date">{formatDate(source.date)}</span>
                </div>
              </div>
              <div class="fa-income-right">
                <span class="fa-income-amount">{formatMoney(source.amount)} ₽</span>
                <button class="fa-edit-btn" on:click={() => startEditSource(source)} title="Редактировать">✎</button>
                <button class="fa-delete-btn" on:click={() => deleteIncomeSource(source.id)} title="Удалить">✕</button>
              </div>
            </div>
          {/if}
        {/each}
        {#if filteredManualSources.length === 0}
          <div class="fa-empty">Нет записей в этой категории</div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .financial-analytics {
    padding: 24px 16px 32px;
    height: 100%;
    overflow-y: auto;
    background: transparent;
    max-width: 1200px;
    margin: 0 auto;
  }

  .fa-header h2 {
    margin: 0 0 16px;
    font-size: 20px;
    font-weight: 700;
    text-align: center;
    letter-spacing: -0.02em;
  }

  .fa-header {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .fa-month-selector {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 24px;
  }

  .fa-month-nav {
    background: var(--mcp-glass-bg);
    border: 1px solid var(--mcp-glass-border);
    color: var(--mcp-text-muted);
    cursor: pointer;
    padding: 8px 12px;
    border-radius: var(--mcp-radius-sm);
    font-size: 12px;
    transition: all 0.2s ease;
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
  }

  .fa-month-nav:hover {
    color: var(--mcp-accent);
    border-color: var(--mcp-accent);
    transform: translateY(-1px);
  }

  .fa-month-select {
    border-radius: var(--mcp-radius-sm);
    border: 1px solid var(--mcp-glass-border);
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    color: var(--mcp-text);
    font-size: 13px;
    font-family: inherit;
    min-width: 160px;
    text-align: center;
    transition: all 0.2s ease;
  }

  .fa-month-select:focus {
    border-color: var(--mcp-accent);
    outline: none;
    box-shadow: 0 0 0 3px var(--mcp-accent-dim);
  }

  /* ── Summary Cards ──────────────────────────────────── */
  .fa-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-bottom: 28px;
  }

  .fa-summary-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px 14px;
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius);
    box-shadow: var(--mcp-shadow);
    transition: all 0.25s ease;
  }

  .fa-summary-card:hover {
    border-color: var(--mcp-accent);
    transform: translateY(-3px);
    box-shadow: var(--mcp-shadow-glow);
  }

  .fa-summary-card.total {
    background: linear-gradient(
      135deg,
      rgba(80, 200, 160, 0.15),
      var(--mcp-accent-faint)
    );
    border-color: rgba(80, 200, 160, 0.25);
  }

  .fa-summary-icon {
    font-size: 22px;
    margin-bottom: 10px;
    opacity: 0.85;
  }

  .fa-summary-value {
    font-size: 22px;
    font-weight: 700;
    color: var(--mcp-text);
    letter-spacing: -0.02em;
  }

  .fa-summary-card.total .fa-summary-value {
    color: var(--mcp-success);
  }

  .fa-summary-label {
    font-size: 10px;
    color: var(--mcp-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-top: 6px;
    font-weight: 500;
  }

  /* ── Section ────────────────────────────────────────── */
  .fa-section {
    margin-bottom: 24px;
    padding: 20px;
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius);
    box-shadow: var(--mcp-shadow);
  }

  .fa-section:last-child {
    margin-bottom: 0;
  }

  .fa-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 10px;
  }

  .fa-section-header h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--mcp-text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.85;
  }

  /* ── Tabs ───────────────────────────────────────────── */
  .fa-tabs {
    display: flex;
    gap: 4px;
    background: var(--mcp-glass-highlight);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
    padding: 4px;
  }

  .fa-tab {
    padding: 7px 14px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--mcp-text-muted);
    cursor: pointer;
    font-size: 11.5px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .fa-tab.active {
    background: var(--mcp-accent);
    color: var(--text-on-accent, #fff);
    box-shadow: 0 2px 8px var(--mcp-accent-dim);
  }

  .fa-tab:hover:not(.active) {
    background: var(--mcp-surface);
    color: var(--mcp-text);
  }

  /* ── Project Groups ─────────────────────────────────── */
  .fa-project-groups {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .fa-project-group {
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
    overflow: hidden;
  }

  .fa-project-header {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 12px 16px;
    background: var(--mcp-glass-highlight);
    border: none;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: background 0.3s ease;
  }

  .fa-project-header:hover {
    background: var(--mcp-surface);
  }

  .fa-project-chevron {
    font-size: 10px;
    color: var(--mcp-text-muted);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;
    width: 12px;
  }

  .fa-project-chevron.collapsed {
    transform: rotate(0deg);
  }

  .fa-project-chevron:not(.collapsed) {
    transform: rotate(180deg);
  }

  .fa-project-dot {
    display: block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .fa-project-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--mcp-text);
  }

  .fa-project-count {
    font-size: 11px;
    color: var(--mcp-text-muted);
    margin-left: auto;
  }

  .fa-project-earnings {
    font-size: 13px;
    font-weight: 700;
    color: var(--mcp-success);
  }

  /* ── Task List ──────────────────────────────────────── */
  .fa-task-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .fa-task-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px 12px 42px;
    background: var(--mcp-glass-bg);
    border-top: 1px solid var(--mcp-glass-border);
    transition: all 0.3s ease;
  }

  .fa-task-item:hover {
    background: var(--mcp-glass-highlight);
  }

  .fa-task-item.completed {
    opacity: 0.7;
  }

  .fa-task-item.completed .fa-task-title {
    text-decoration: line-through;
    color: var(--mcp-text-muted);
  }

  .fa-task-status {
    flex-shrink: 0;
  }

  .fa-status-dot {
    display: block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    box-shadow: 0 0 6px currentColor;
  }

  .fa-task-info {
    flex: 1;
    min-width: 0;
  }

  .fa-task-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--mcp-text);
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .fa-task-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--mcp-text-muted);
  }

  .fa-meta-separator {
    opacity: 0.4;
  }

  .fa-task-payment {
    flex-shrink: 0;
    text-align: right;
  }

  .fa-task-rate {
    font-size: 11px;
    color: var(--mcp-text-muted);
    margin-bottom: 2px;
  }

  .fa-task-earning {
    font-size: 14px;
    font-weight: 700;
    color: var(--mcp-success);
  }

  /* ── Income Section ─────────────────────────────────── */
  .fa-add-btn {
    padding: 8px 16px;
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
    background: var(--mcp-glass-bg);
    backdrop-filter: var(--mcp-blur);
    -webkit-backdrop-filter: var(--mcp-blur);
    color: var(--mcp-accent);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .fa-add-btn:hover {
    background: var(--mcp-accent);
    border-color: var(--mcp-accent);
    color: var(--text-on-accent, #fff);
    transform: translateY(-1px);
  }

  .fa-add-form {
    display: grid;
    grid-template-columns: 1fr 120px 140px 140px auto;
    gap: 10px;
    margin-bottom: 14px;
    padding: 16px;
    background: var(--mcp-glass-highlight);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
  }

  .fa-input {
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
    background: var(--background-primary);
    color: var(--mcp-text);
    font-size: 12.5px;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .fa-input:focus {
    border-color: var(--mcp-accent);
    outline: none;
    box-shadow: 0 0 0 3px var(--mcp-accent-dim);
  }

  .fa-input-amount {
    text-align: right;
  }

  .fa-submit-btn {
    padding: 10px 18px;
    border: none;
    border-radius: var(--mcp-radius-sm);
    background: var(--mcp-accent);
    color: var(--text-on-accent, #fff);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .fa-submit-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px var(--mcp-accent-dim);
  }

  .fa-submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .fa-income-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .fa-income-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    background: var(--mcp-glass-highlight);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
    transition: all 0.2s ease;
  }

  .fa-income-item:hover {
    border-color: var(--mcp-accent);
    transform: translateY(-1px);
  }

  .fa-income-info {
    flex: 1;
  }

  .fa-income-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--mcp-text);
    margin-bottom: 4px;
  }

  .fa-income-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .fa-income-category {
    font-size: 10px;
    font-weight: 600;
    color: var(--mcp-accent);
    background: var(--mcp-accent-dim, rgba(95, 153, 225, 0.15));
    padding: 2px 8px;
    border-radius: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .fa-income-date {
    font-size: 11px;
    color: var(--mcp-text-muted);
  }

  .fa-income-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .fa-edit-btn {
    background: none;
    border: none;
    color: var(--mcp-text-muted);
    cursor: pointer;
    padding: 6px 10px;
    font-size: 13px;
    border-radius: var(--mcp-radius-sm);
    opacity: 0.4;
    transition: all 0.2s ease;
  }

  .fa-income-item:hover .fa-edit-btn {
    opacity: 1;
  }

  .fa-edit-btn:hover {
    color: var(--mcp-accent);
    background: var(--mcp-accent-dim);
  }

  .fa-income-editing {
    background: var(--mcp-glass-highlight);
    border-color: var(--mcp-accent);
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .fa-edit-fields {
    display: grid;
    grid-template-columns: 1fr 100px 120px 130px;
    gap: 8px;
  }

  .fa-edit-fields .fa-input {
    padding: 8px 10px;
  }

  .fa-edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .fa-save-btn, .fa-cancel-btn {
    padding: 6px 14px;
    border: none;
    border-radius: var(--mcp-radius-sm);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .fa-save-btn {
    background: var(--mcp-success);
    color: #fff;
  }

  .fa-save-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px var(--mcp-success-dim);
  }

  .fa-cancel-btn {
    background: transparent;
    border: 1px solid var(--mcp-glass-border);
    color: var(--mcp-text-muted);
  }

  .fa-cancel-btn:hover {
    border-color: var(--mcp-danger);
    color: var(--mcp-danger);
  }

  /* ── Category Filter ─────────────────────────────────── */
  .fa-category-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 14px;
  }

  .fa-cat-btn {
    padding: 5px 12px;
    border: 1px solid var(--mcp-glass-border);
    border-radius: 16px;
    background: transparent;
    color: var(--mcp-text-muted);
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .fa-cat-btn:hover {
    border-color: var(--mcp-accent);
    color: var(--mcp-accent);
  }

  .fa-cat-btn.active {
    background: var(--mcp-accent);
    color: var(--text-on-accent, #fff);
    border-color: var(--mcp-accent);
  }

  .fa-cat-manage-btn {
    padding: 5px 10px;
    border: 1px solid var(--mcp-glass-border);
    border-radius: 16px;
    background: transparent;
    color: var(--mcp-text-muted);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s ease;
  }

  .fa-cat-manage-btn:hover {
    border-color: var(--mcp-accent);
    color: var(--mcp-accent);
  }

  .fa-manage-categories {
    margin-bottom: 14px;
    padding: 14px;
    background: var(--mcp-glass-highlight);
    border: 1px solid var(--mcp-glass-border);
    border-radius: var(--mcp-radius-sm);
  }

  .fa-manage-header {
    font-size: 12px;
    font-weight: 600;
    color: var(--mcp-text);
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .fa-cat-toggle-btn {
    background: none;
    border: none;
    color: var(--mcp-accent);
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .fa-cat-toggle-btn:hover {
    background: var(--mcp-accent-dim);
  }

  .fa-add-category-row {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }

  .fa-add-category-row .fa-input {
    flex: 1;
  }

  .fa-category-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .fa-category-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--mcp-glass-bg);
    border: 1px solid var(--mcp-glass-border);
    border-radius: 12px;
    font-size: 11px;
    color: var(--mcp-text);
  }

  .fa-tag-remove {
    background: none;
    border: none;
    color: var(--mcp-text-muted);
    cursor: pointer;
    padding: 0 2px;
    font-size: 10px;
    opacity: 0.5;
    transition: all 0.2s ease;
  }

  .fa-tag-remove:hover {
    opacity: 1;
    color: var(--mcp-danger);
  }

  .fa-category-select {
    min-width: 120px;
  }

  .fa-income-amount {
    font-size: 17px;
    font-weight: 700;
    color: var(--mcp-success);
  }

  .fa-delete-btn {
    background: none;
    border: none;
    color: var(--mcp-text-muted);
    cursor: pointer;
    padding: 6px 10px;
    font-size: 12px;
    border-radius: var(--mcp-radius-sm);
    opacity: 0.4;
    transition: all 0.2s ease;
  }

  .fa-income-item:hover .fa-delete-btn {
    opacity: 1;
  }

  .fa-delete-btn:hover {
    color: var(--mcp-danger);
    background: var(--mcp-danger-dim);
  }

  /* ── Empty State ────────────────────────────────────── */
  .fa-empty {
    text-align: center;
    padding: 32px 16px;
    color: var(--mcp-text-muted);
    font-size: 13px;
  }

  /* ── Mobile ─────────────────────────────────────────── */
  @media (max-width: 768px) {
    .financial-analytics {
      padding: 16px 10px 24px;
    }

    .fa-summary {
      grid-template-columns: 1fr;
      gap: 10px;
      margin-bottom: 20px;
    }

    .fa-summary-card {
      padding: 14px 12px;
    }

    .fa-summary-value {
      font-size: 18px;
    }

    .fa-add-form {
      grid-template-columns: 1fr;
      gap: 8px;
      padding: 12px;
    }

    .fa-edit-fields {
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .fa-task-item {
      flex-wrap: wrap;
      padding-left: 16px;
      gap: 8px;
    }

    .fa-task-payment {
      width: 100%;
      text-align: left;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--mcp-glass-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .fa-task-earning {
      font-size: 14px;
    }

    .fa-project-header {
      flex-wrap: wrap;
      gap: 6px;
      padding: 10px 12px;
    }

    .fa-section {
      padding: 14px;
      margin-bottom: 16px;
    }

    .fa-section-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .fa-tabs {
      width: 100%;
    }

    .fa-tab {
      flex: 1;
      text-align: center;
      padding: 8px 6px;
      font-size: 11px;
    }

    .fa-month-selector {
      gap: 6px;
      margin-bottom: 16px;
    }

    .fa-month-select {
      min-width: 130px;
      font-size: 12px;
    }

    .fa-income-item {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      padding: 12px;
    }

    .fa-income-right {
      width: 100%;
      justify-content: space-between;
    }

    .fa-add-category-row {
      flex-direction: column;
    }

    .fa-category-filter {
      gap: 4px;
    }

    .fa-cat-btn {
      padding: 6px 10px;
      font-size: 10px;
    }
  }

  @media (max-width: 480px) {
    .fa-edit-fields {
      grid-template-columns: 1fr;
    }

    .fa-summary-icon {
      font-size: 18px;
    }

    .fa-summary-value {
      font-size: 16px;
    }

    .fa-header h2 {
      font-size: 17px;
    }
  }
</style>
