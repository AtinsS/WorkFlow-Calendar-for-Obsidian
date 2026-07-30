<script lang="ts">
  import {
    financeData,
    getCurrentMonthKey,
    getMonthData,
    updateMonthData,
    getStoredMonthKeys,
    deleteMonthData,
    deleteMonthsBefore,
  } from "./storage";
  import type { FinanceCategory, FinanceMonthData, MonthGoal, SavingsCategory } from "./types";
  import { generateCategoryId, generateGoalId } from "./types";
  import { get } from "svelte/store";
  import {
    tasks,
    getEarningsForMonth,
    getExpectedEarningsForMonth,
  } from "../task-tracker/stores";
  import { financialAnalyticsData } from "./financialAnalyticsStorage";

  type DistributionIncomeSource = "plan" | "fact" | "manual";

  function inputVal(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  let monthKey = getCurrentMonthKey();
  let monthData: FinanceMonthData = {
    monthlyIncome: 0,
    lastMonthExpense: 0,
    mainAccountCategories: [],
    monthGoals: [],
    savingsCategories: [],
    distributionRules: [],
    updatedAt: "",
  };
  let incomeSource: DistributionIncomeSource = "fact";
  let manualIncome = 0;
  let editingRules = false;
  let editingGoalId: string | null = null;
  let editingMainCatId: string | null = null;
  let editingSavingsId: string | null = null;

  const MONTH_NAMES = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ];

  $: [displayYear, displayMonth] = monthKey.split("-").map(Number);
  $: displayMonthName = `${MONTH_NAMES[displayMonth - 1]} ${displayYear}`;

  function prevMonth(): void {
    const d = new Date(displayYear, displayMonth - 2, 1);
    monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function nextMonth(): void {
    const d = new Date(displayYear, displayMonth, 1);
    monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  // ── Load data from store when monthKey or financeData changes ──
  // Skip while user is actively editing to prevent input fields from resetting
  $: {
    $financeData;
    if (!editingMainCatId && !editingGoalId && !editingSavingsId) {
      const newData = getMonthData(monthKey);
      if (newData) {
        monthData = newData;
        incomeSource = normalizeIncomeSource(monthData.incomeSource);
        manualIncome = monthData.monthlyIncome;
      }
    }
  }

  // ── Sync income from tasks/analytics (only when not editing manually) ──
  // Guard: only sync after data has been loaded from disk and user is not in manual mode
  $: {
    const _tasks = $tasks;
    const _analytics = $financialAnalyticsData;
    // Use a microtask to avoid updating during the same tick as the store reload above
    if (incomeSource !== "manual" && monthData.updatedAt && monthKey) {
      const income = getIncomeForSource(incomeSource);
      if (income !== monthData.monthlyIncome || monthData.incomeSource !== incomeSource) {
        // Directly update the store without re-reading monthData
        financeData.update((current) => ({
          ...current,
          [monthKey]: {
            ...(current[monthKey] || {
              monthlyIncome: 0,
              lastMonthExpense: 0,
              mainAccountCategories: [],
              monthGoals: [],
              savingsCategories: [],
              distributionRules: [],
              updatedAt: "",
            }),
            monthlyIncome: income,
            incomeSource,
            updatedAt: new Date().toISOString(),
          },
        }));
      }
    }
  }

  $: mainTotal = monthData
    ? monthData.mainAccountCategories.reduce((sum, c) => sum + c.amount, 0)
    : 0;
  $: savingsTotal = monthData
    ? monthData.savingsCategories.reduce((sum, c) => sum + c.amount, 0)
    : 0;
  $: goalsTotal = monthData
    ? (monthData.monthGoals || []).reduce((sum, g) => sum + g.currentAmount, 0)
    : 0;
  $: balance = monthData
    ? monthData.monthlyIncome - mainTotal - goalsTotal
    : 0;

  // Previous month data for deltas
  $: prevMonthData = (() => {
    const d = new Date(displayYear, displayMonth - 2, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const all = $financeData || {};
    return all[key] || null;
  })();

  $: incomeDelta = prevMonthData ? monthData.monthlyIncome - prevMonthData.monthlyIncome : 0;
  $: expenseDelta = prevMonthData ? mainTotal - (prevMonthData.mainAccountCategories?.reduce((s, c) => s + c.amount, 0) || 0) : 0;
  $: balanceDelta = prevMonthData ? balance - ((prevMonthData.monthlyIncome || 0) - (prevMonthData.mainAccountCategories?.reduce((s, c) => s + c.amount, 0) || 0)) : 0;

  function normalizeIncomeSource(source: FinanceMonthData["incomeSource"]): DistributionIncomeSource {
    if (source === "manual") return "manual";
    if (source === "plan") return "plan";
    return "fact";
  }

  function isManualIncomeInMonth(dateStr: string, year: number, month: number): boolean {
    const match = dateStr?.match(/^(\d{4})-(\d{2})/);
    if (match) {
      return parseInt(match[1], 10) === year && parseInt(match[2], 10) === month;
    }
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return false;
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  }

  function getManualIncomeForMonth(year: number, month: number): number {
    return get(financialAnalyticsData).manualIncomeSources
      .filter((source) => isManualIncomeInMonth(source.date, year, month))
      .reduce((sum, source) => sum + source.amount, 0);
  }

  function getIncomeForSource(source: Exclude<DistributionIncomeSource, "manual">): number {
    const [year, month] = monthKey.split("-").map(Number);
    const manualIncomeForMonth = getManualIncomeForMonth(year, month);
    if (source === "plan") {
      return getExpectedEarningsForMonth(year, month) + manualIncomeForMonth;
    }
    return getEarningsForMonth(year, month) + manualIncomeForMonth;
  }

  function setIncomeSource(source: DistributionIncomeSource) {
    incomeSource = source;
    if (source === "manual") {
      updateMonthData(monthKey, {
        monthlyIncome: manualIncome,
        incomeSource: "manual",
      });
    } else {
      const income = getIncomeForSource(source);
      updateMonthData(monthKey, {
        monthlyIncome: income,
        incomeSource: source,
      });
    }
  }

  function updateManualIncome(value: string) {
    manualIncome = parseFloat(value.replace(/[^0-9.,]/g, "")) || 0;
    updateMonthData(monthKey, {
      monthlyIncome: manualIncome,
      incomeSource: "manual",
    });
    // Keep incomeSource in sync for the UI
    incomeSource = "manual";
  }

  // ── Main categories ──
  function addMainCategory() {
    const newCat: FinanceCategory = {
      id: generateCategoryId(),
      name: "Новая категория",
      icon: "📦",
      amount: 0,
      order: monthData.mainAccountCategories.length,
    };
    updateMonthData(monthKey, {
      mainAccountCategories: [...monthData.mainAccountCategories, newCat],
    });
  }

  function removeMainCategory(id: string) {
    updateMonthData(monthKey, {
      mainAccountCategories: monthData.mainAccountCategories.filter(c => c.id !== id),
    });
  }

  function updateMainCategory(id: string, changes: Partial<FinanceCategory>) {
    const updated = monthData.mainAccountCategories.map(c =>
      c.id === id ? { ...c, ...changes } : c
    );
    updateMonthData(monthKey, { mainAccountCategories: updated });
  }

  // ── Goals ──
  function addGoal() {
    const newGoal: MonthGoal = {
      id: generateGoalId(),
      icon: "🎯",
      name: "Новая цель",
      currentAmount: 0,
      targetAmount: 0,
    };
    updateMonthData(monthKey, {
      monthGoals: [...(monthData.monthGoals || []), newGoal],
    });
  }

  function removeGoal(id: string) {
    updateMonthData(monthKey, {
      monthGoals: (monthData.monthGoals || []).filter(g => g.id !== id),
    });
  }

  function updateGoal(id: string, changes: Partial<MonthGoal>) {
    const updated = (monthData.monthGoals || []).map(g =>
      g.id === id ? { ...g, ...changes } : g
    );
    updateMonthData(monthKey, { monthGoals: updated });
  }

  // ── Savings ──
  function addSavingsCategory() {
    const newCat: SavingsCategory = {
      id: generateCategoryId(),
      name: "Место куда отложить",
      icon: "👛",
      amount: 0,
      order: monthData.savingsCategories.length,
      percent: 0,
      completed: false,
    };
    updateMonthData(monthKey, {
      savingsCategories: [...monthData.savingsCategories, newCat],
    });
  }

  function removeSavingsCategory(id: string) {
    updateMonthData(monthKey, {
      savingsCategories: monthData.savingsCategories.filter(c => c.id !== id),
    });
  }

  function updateSavingsCategory(id: string, changes: Partial<SavingsCategory>) {
    const updated = monthData.savingsCategories.map(c =>
      c.id === id ? { ...c, ...changes } : c
    );
    updateMonthData(monthKey, { savingsCategories: updated });
  }

  // ── Rules ──
  let rulesText = "";

  function startEditRules(): void {
    rulesText = monthData.distributionRules.join("\n");
    editingRules = true;
  }

  function saveRules() {
    const rules = rulesText.split("\n").filter(r => r.trim());
    updateMonthData(monthKey, { distributionRules: rules });
    editingRules = false;
  }

  function formatMoney(amount: number): string {
    return amount.toLocaleString("ru-RU");
  }

  function formatDelta(amount: number): string {
    if (amount === 0) return "";
    const sign = amount > 0 ? "+" : "";
    return `${sign}${formatMoney(amount)} ₽ к прошлому месяцу`;
  }

  // ── Cleanup ──
  let showCleanup = false;
  $: storedKeys = $financeData ? getStoredMonthKeys() : [];
  $: oldKeys = storedKeys.filter(k => k < getCurrentMonthKey());

  let prevMonthKey: string | null = null;
  $: {
    const allData = $financeData || {};
    const keys = Object.keys(allData);
    const d = new Date(displayYear, displayMonth - 2, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    prevMonthKey = keys.includes(key) ? key : null;
  }

  function duplicatePrevMonth(): void {
    if (!prevMonthKey) return;
    const prev = getMonthData(prevMonthKey);
    const blankCat = (c: FinanceCategory): FinanceCategory => ({
      id: generateCategoryId(),
      name: c.name,
      icon: c.icon,
      amount: 0,
      order: c.order,
    });
    const blankGoal = (g: MonthGoal): MonthGoal => ({
      id: generateGoalId(),
      icon: g.icon,
      name: g.name,
      currentAmount: 0,
      targetAmount: g.targetAmount,
    });
    updateMonthData(monthKey, {
      mainAccountCategories: prev.mainAccountCategories.map(blankCat),
      monthGoals: (prev.monthGoals || []).map(blankGoal),
      savingsCategories: (prev.savingsCategories || []).map(c => ({
        ...blankCat(c),
        percent: c.percent,
        completed: false,
      } as SavingsCategory)),
      distributionRules: [...prev.distributionRules],
    });
  }

  function clearCurrentMonth(): void {
    if (!confirm(`Очистить данные за ${displayMonthName}?`)) return;
    updateMonthData(monthKey, {
      mainAccountCategories: [],
      savingsCategories: [],
      monthGoals: [],
      distributionRules: [],
      monthlyIncome: 0,
    });
  }

  function clearOldMonths(): void {
    if (oldKeys.length === 0) return;
    const count = deleteMonthsBefore(getCurrentMonthKey());
    alert(`Удалены данные за ${count} мес.`);
  }

  function clearAllData(): void {
    if (!confirm("Удалить ВСЕ данные финансов? Это необратимо.")) return;
    for (const k of storedKeys) deleteMonthData(k);
  }
</script>

<div class="finance-tracker">
  <!-- Month Navigator -->
  <div class="month-selector">
    <button class="month-nav-btn" on:click={prevMonth}>&#8249;</button>
    <select bind:value={monthKey} class="month-select">
      {#each Array.from({length: 12}, (_, i) => i + 1) as m}
        <option value="{displayYear}-{String(m).padStart(2, '0')}">
          {MONTH_NAMES[m - 1]} {displayYear}
        </option>
      {/each}
    </select>
    <button class="month-nav-btn" on:click={nextMonth}>&#8250;</button>
  </div>

  <h2>💰 Распределение финансовых средств</h2>

  {#if prevMonthKey}
    <button class="dup-btn" on:click={duplicatePrevMonth}>
      Дублировать траты с прошлого месяца
    </button>
  {/if}

  <!-- Блок 1: Общий баланс -->
  <div class="glass-card">
    <div class="glass-card-header">
      <span class="glass-icon">💎</span>
      <h3>Общий баланс</h3>
    </div>
    <div class="income-toggle">
      <button
        class="toggle-btn"
        class:active={incomeSource === "plan"}
        on:click={() => setIncomeSource("plan")}
      >Планы на месяц</button>
      <button
        class="toggle-btn"
        class:active={incomeSource === "fact"}
        on:click={() => setIncomeSource("fact")}
      >Факт</button>
      <button
        class="toggle-btn"
        class:active={incomeSource === "manual"}
        on:click={() => setIncomeSource("manual")}
      >Вручную</button>
    </div>
    <div class="balance-grid">
      <div class="balance-item">
        <span class="balance-label">Поступления</span>
        {#if incomeSource === "manual"}
          <input
            type="number"
            value={manualIncome}
            on:input={(e) => updateManualIncome(inputVal(e))}
            min="0"
            class="balance-input income-input"
          />
        {:else}
          <span class="balance-value income">{formatMoney(monthData.monthlyIncome)} ₽</span>
        {/if}
        {#if incomeDelta !== 0}
          <span class="balance-delta" class:delta-up={incomeDelta > 0} class:delta-down={incomeDelta < 0}>
            {formatDelta(incomeDelta)}
          </span>
        {/if}
      </div>
      <div class="balance-item">
        <span class="balance-label">Основные расходы</span>
        <span class="balance-value expense">{formatMoney(mainTotal)} ₽</span>
        {#if expenseDelta !== 0}
          <span class="balance-delta" class:delta-up={expenseDelta < 0} class:delta-down={expenseDelta > 0}>
            {formatDelta(-expenseDelta)}
          </span>
        {/if}
      </div>
      <div class="balance-item total">
        <span class="balance-label">Остаток</span>
        <span class="balance-value {balance >= 0 ? 'income' : 'expense'}">{formatMoney(balance)} ₽</span>
        {#if balanceDelta !== 0}
          <span class="balance-delta" class:delta-up={balanceDelta > 0} class:delta-down={balanceDelta < 0}>
            {formatDelta(balanceDelta)}
          </span>
        {/if}
      </div>
    </div>
  </div>

  <!-- Блок 2: Основной счёт -->
  <div class="glass-card">
    <div class="glass-card-header">
      <span class="glass-icon">🏦</span>
      <h3>Основной счёт</h3>
      <span class="glass-badge">{formatMoney(mainTotal)} ₽</span>
    </div>
    <div class="categories-list">
      {#each monthData.mainAccountCategories as cat (cat.id)}
        {#if editingMainCatId === cat.id}
          <div class="category-row editing">
            <input type="text" value={cat.icon} on:input={(e) => updateMainCategory(cat.id, { icon: inputVal(e) })} class="cat-edit-icon" maxlength="2" />
            <input type="text" value={cat.name} on:input={(e) => updateMainCategory(cat.id, { name: inputVal(e) })} class="cat-edit-name" />
            <input type="number" value={cat.amount} on:input={(e) => updateMainCategory(cat.id, { amount: parseFloat(inputVal(e)) || 0 })} min="0" class="cat-edit-amount" />
            <button class="goal-done-btn" on:click={() => editingMainCatId = null}>✓</button>
          </div>
        {:else}
          <div class="category-row" on:click={() => editingMainCatId = cat.id}>
            <span class="cat-icon-display">{cat.icon}</span>
            <span class="cat-name-display">{cat.name}</span>
            <span class="cat-amount-display">{formatMoney(cat.amount)} ₽</span>
            <button class="cat-delete" on:click|stopPropagation={() => removeMainCategory(cat.id)}>✕</button>
          </div>
        {/if}
      {/each}
    </div>
    <button class="glass-add-btn" on:click={addMainCategory}>+ Добавить</button>
  </div>

  <!-- Блок 3: Цели на месяц -->
  <div class="glass-card">
    <div class="glass-card-header">
      <span class="glass-icon">🎯</span>
      <h3>Цели на месяц</h3>
    </div>
    <div class="goals-list">
      {#each (monthData.monthGoals || []) as goal (goal.id)}
        {#if editingGoalId === goal.id}
          <div class="goal-row editing">
            <input type="text" value={goal.icon} on:input={(e) => updateGoal(goal.id, { icon: inputVal(e) })} class="goal-edit-icon" maxlength="2" />
            <div class="goal-info">
              <div class="goal-edit-row">
                <input type="text" value={goal.name} on:input={(e) => updateGoal(goal.id, { name: inputVal(e) })} class="goal-edit-name" placeholder="Название" />
                <input type="number" value={goal.currentAmount} on:input={(e) => updateGoal(goal.id, { currentAmount: parseFloat(inputVal(e)) || 0 })} min="0" class="goal-edit-amount" placeholder="Накоплено" />
                <span class="goal-edit-sep">/</span>
                <input type="number" value={goal.targetAmount} on:input={(e) => updateGoal(goal.id, { targetAmount: parseFloat(inputVal(e)) || 0 })} min="0" class="goal-edit-amount" placeholder="Цель" />
              </div>
            </div>
            <button class="goal-done-btn" on:click={() => editingGoalId = null}>✓</button>
          </div>
        {:else}
          <div class="goal-row" on:click={() => editingGoalId = goal.id}>
            <span class="goal-icon">{goal.icon}</span>
            <div class="goal-info">
              <div class="goal-header">
                <span class="goal-name">{goal.name}</span>
                <span class="goal-amounts">{formatMoney(goal.currentAmount)} ₽ / {formatMoney(goal.targetAmount)} ₽</span>
              </div>
              <div class="goal-progress-bar">
                <div class="goal-progress-fill" style="width: {goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0}%"></div>
              </div>
              <span class="goal-percent">{goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0}%</span>
            </div>
            <button class="cat-delete" on:click|stopPropagation={() => removeGoal(goal.id)}>✕</button>
          </div>
        {/if}
      {/each}
    </div>
    <button class="glass-add-btn" on:click={addGoal}>+ Добавить цель</button>
  </div>

  <!-- Блок 4: Куда отложить -->
  <div class="glass-card" class:over-budget={savingsTotal > balance}>
    <div class="glass-card-header">
      <span class="glass-icon">💰</span>
      <h3>Куда отложить</h3>
      <span class="glass-badge" class:badge-warn={savingsTotal > balance}>
        осталось {formatMoney(Math.max(0, balance - savingsTotal))} ₽
      </span>
    </div>
    <div class="categories-list">
      {#each monthData.savingsCategories as cat (cat.id)}
        {#if editingSavingsId === cat.id}
          <div class="category-row editing">
            <input type="text" value={cat.icon} on:input={(e) => updateSavingsCategory(cat.id, { icon: inputVal(e) })} class="cat-edit-icon" maxlength="2" />
            <input type="text" value={cat.name} on:input={(e) => updateSavingsCategory(cat.id, { name: inputVal(e) })} class="cat-edit-name" />
            <div class="savings-edit-fields">
              <div class="savings-field">
                <span class="savings-field-label">Сумма</span>
                <input type="number" value={cat.amount} on:input={(e) => { const amount = parseFloat(inputVal(e)) || 0; const percent = balance > 0 ? Math.round((amount / balance) * 100) : 0; updateSavingsCategory(cat.id, { amount, percent }); }} min="0" class="savings-field-input" />
                <span class="savings-field-unit">₽</span>
              </div>
              <div class="savings-field">
                <span class="savings-field-label">Процент</span>
                <input type="number" value={cat.percent} on:input={(e) => { const percent = parseFloat(inputVal(e)) || 0; const amount = Math.round(balance * percent / 100); updateSavingsCategory(cat.id, { amount, percent }); }} min="0" max="100" class="savings-field-input" />
                <span class="savings-field-unit">%</span>
              </div>
            </div>
            <button class="goal-done-btn" on:click={() => editingSavingsId = null}>✓</button>
          </div>
        {:else}
          <div class="category-row" on:click={() => editingSavingsId = cat.id}>
            <span class="cat-icon-display">{cat.icon}</span>
            <span class="cat-name-display">{cat.name}</span>
            <span class="cat-amount-display">{formatMoney(cat.amount)} ₽</span>
            <span class="cat-percent">{cat.percent}%</span>
            <button class="cat-delete" on:click|stopPropagation={() => removeSavingsCategory(cat.id)}>✕</button>
          </div>
        {/if}
      {/each}
    </div>
    <button class="glass-add-btn" on:click={addSavingsCategory}>+ Добавить</button>
    {#if savingsTotal > balance}
      <div class="glass-warning">
        ⚠️ Превышение бюджета на {formatMoney(savingsTotal - balance)} ₽
      </div>
    {/if}
  </div>

  <!-- Блок 5: Правила распределения -->
  <div class="glass-card">
    <div class="glass-card-header">
      <span class="glass-icon">📋</span>
      <h3>Правила распределения</h3>
    </div>
    {#if editingRules}
      <textarea
        class="glass-textarea rules"
        bind:value={rulesText}
        placeholder="Правила распределения..."
        rows="6"
      ></textarea>
      <div class="rules-actions">
        <button class="rules-save-btn" on:click={saveRules}>Сохранить</button>
        <button class="rules-cancel-btn" on:click={() => { editingRules = false; rulesText = monthData.distributionRules.join("\n"); }}>Отмена</button>
      </div>
    {:else}
      <div class="rules-display" on:click={startEditRules}>
        {#each monthData.distributionRules as rule, i}
          <div class="rule-item">
            <span class="rule-number">{i + 1}</span>
            <span class="rule-text">{rule}</span>
          </div>
        {/each}
        {#if monthData.distributionRules.length === 0}
          <div class="rules-empty">Нажмите, чтобы добавить правила</div>
        {/if}
        <div class="rules-edit-hint">✏️ Нажмите для редактирования</div>
      </div>
    {/if}
  </div>

  <!-- Блок 6: Управление данными -->
  <div class="glass-card cleanup-card">
    <button class="cleanup-toggle" on:click={() => showCleanup = !showCleanup}>
      <span class="glass-icon">🗑️</span>
      <span>Управление данными</span>
      <span class="cleanup-arrow" class:open={showCleanup}>&#8250;</span>
    </button>
    {#if showCleanup}
      <div class="cleanup-body">
        <div class="cleanup-info">
          Хранится месяцев: <strong>{storedKeys.length}</strong>
          {#if oldKeys.length > 0}
            <span class="cleanup-old">({oldKeys.length} устаревших)</span>
          {/if}
        </div>
        <div class="cleanup-actions">
          <button class="cleanup-btn" on:click={clearCurrentMonth}>Очистить текущий месяц</button>
          {#if oldKeys.length > 0}
            <button class="cleanup-btn warn" on:click={clearOldMonths}>Удалить {oldKeys.length} устаревших мес.</button>
          {/if}
          <button class="cleanup-btn danger" on:click={clearAllData}>Удалить всё</button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .finance-tracker {
    --fi-bg: transparent;
    --fi-surface: var(--mcp-glass-bg, rgba(35, 40, 55, 0.4));
    --fi-surface-hover: var(--mcp-glass-highlight, rgba(255, 255, 255, 0.02));
    --fi-border: var(--mcp-glass-border, rgba(255, 255, 255, 0.04));
    --fi-border-focus: var(--mcp-accent, rgba(95, 153, 225, 0.479));
    --fi-muted: var(--text-muted);
    --fi-text: var(--text-normal);
    --fi-accent: var(--interactive-accent);
    --fi-green: var(--mcp-success, rgba(80, 200, 160, 0.8));
    --fi-green-bg: rgba(80, 200, 160, 0.1);
    --fi-red: var(--mcp-danger, rgba(220, 150, 150, 0.8));
    --fi-red-bg: rgba(220, 150, 150, 0.1);
    --fi-amber: var(--mcp-warning, rgba(220, 190, 130, 0.8));
    --fi-amber-bg: rgba(220, 190, 130, 0.1);
    --fi-radius: var(--mcp-radius, 14px);
    --fi-radius-sm: var(--mcp-radius-sm, 10px);
    --fi-blur: var(--mcp-blur, blur(20px));
    --fi-shadow: var(--mcp-shadow, 0 8px 32px rgba(0, 0, 0, 0.15));
    --fi-shadow-glow: var(--mcp-shadow-glow, 0 0 40px rgba(80, 170, 210, 0.06));

    padding: 24px 16px 32px;
    height: 100%;
    overflow-y: auto;
    background: var(--fi-bg);
    color: var(--fi-text);
    max-width: 1200px;
    margin: 0 auto;
  }

  .finance-tracker h2 {
    margin: 0 0 22px;
    font-size: 20px;
    font-weight: 700;
    color: var(--fi-text);
    text-align: center;
    letter-spacing: -0.02em;
  }

  /* ── Month navigator ─────────────────────────────────── */
  .month-selector {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 16px;
  }

  .month-nav-btn {
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--fi-border);
    border-radius: var(--fi-radius-sm);
    background: var(--fi-surface);
    backdrop-filter: var(--fi-blur);
    -webkit-backdrop-filter: var(--fi-blur);
    color: var(--fi-muted);
    cursor: pointer;
    font-size: 18px;
    padding: 0;
    transition: all 0.2s ease;
  }

  .month-nav-btn:hover {
    background: var(--fi-surface-hover);
    color: var(--fi-text);
    border-color: var(--fi-accent);
    transform: translateY(-1px);
  }

  .month-display {
    min-width: 180px;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    color: var(--fi-text);
  }

  .month-select {
    border-radius: var(--fi-radius-sm);
    border: 1px solid var(--fi-border);
    background: var(--fi-surface);
    backdrop-filter: var(--fi-blur);
    -webkit-backdrop-filter: var(--fi-blur);
    color: var(--fi-text);
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
    min-width: 180px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .month-select:focus {
    border-color: var(--fi-accent);
    outline: none;
    box-shadow: 0 0 0 3px var(--mcp-accent-faint);
  }

  .month-select:hover {
    border-color: var(--fi-accent);
  }

  /* ── Duplicate button ────────────────────────────────── */
  .dup-btn {
    display: block;
    margin: 0 auto 20px;
    border: 1px solid var(--fi-border);
    border-radius: var(--fi-radius-sm);
    background: var(--fi-surface);
    backdrop-filter: var(--fi-blur);
    -webkit-backdrop-filter: var(--fi-blur);
    color: var(--fi-accent);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .dup-btn:hover {
    background: var(--fi-surface-hover);
    border-color: var(--fi-accent);
    transform: translateY(-1px);
  }

  /* ── Glass card ──────────────────────────────────────── */
  .glass-card {
    background: var(--fi-surface);
    backdrop-filter: var(--fi-blur);
    -webkit-backdrop-filter: var(--fi-blur);
    border: 1px solid var(--fi-border);
    border-radius: var(--fi-radius);
    padding: 20px;
    margin-bottom: 16px;
    box-shadow: var(--fi-shadow);
    transition: all 0.25s ease;
  }

  .glass-card:hover {
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: var(--fi-shadow-glow);
  }

  .glass-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--fi-border);
  }

  .glass-icon {
    font-size: 18px;
    opacity: 0.9;
  }

  .glass-card-header h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--fi-text);
    flex: 1;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.85;
  }

  .glass-badge {
    font-size: 13px;
    font-weight: 600;
    color: var(--fi-accent);
    background: var(--fi-surface-hover);
    padding: 4px 12px;
    border-radius: var(--fi-radius-sm);
    letter-spacing: -0.01em;
  }

  .glass-badge.badge-warn {
    color: var(--fi-red);
    background: var(--fi-red-bg);
  }

  /* ── Income toggle ───────────────────────────────────── */
  .income-toggle {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    background: var(--fi-surface-hover);
    border-radius: var(--fi-radius-sm);
    padding: 4px;
  }

  .toggle-btn {
    flex: 1;
    padding: 9px 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--fi-muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .toggle-btn.active {
    background: var(--fi-accent);
    color: var(--text-on-accent, #fff);
    box-shadow: 0 2px 8px var(--fi-accent);
  }

  .toggle-btn:hover:not(.active) {
    color: var(--fi-text);
    background: rgba(255, 255, 255, 0.04);
  }

  .income-input {
    color: var(--fi-green) !important;
    font-weight: 700 !important;
  }

  /* ── Balance grid ────────────────────────────────────── */
  .balance-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .balance-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 10px;
    background: var(--fi-surface-hover);
    border-radius: var(--fi-radius-sm);
    border: 1px solid var(--fi-border);
    transition: all 0.2s ease;
  }

  .balance-item:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .balance-item.total {
    border-color: rgba(255, 255, 255, 0.08);
    background: linear-gradient(135deg, rgba(80, 200, 160, 0.08), var(--mcp-accent-ultra-dim));
  }

  .balance-label {
    font-size: 10px;
    color: var(--fi-muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 8px;
    font-weight: 500;
  }

  .balance-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--fi-text);
    letter-spacing: -0.02em;
  }

  .balance-value.income { color: var(--fi-green); }
  .balance-value.expense { color: var(--fi-red); }

  .balance-delta {
    font-size: 10px;
    font-weight: 500;
    margin-top: 6px;
  }

  .delta-up { color: var(--fi-green); }
  .delta-down { color: var(--fi-red); }

  .balance-input {
    width: 100%;
    text-align: center;
    padding: 8px;
    border: 1px solid var(--fi-border);
    border-radius: var(--fi-radius-sm);
    background: var(--background-primary);
    color: var(--fi-text);
    font-size: 15px;
    font-weight: 600;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .balance-input:focus {
    border-color: var(--fi-accent);
    outline: none;
    box-shadow: 0 0 0 3px var(--mcp-accent-faint);
  }

  /* ── Categories list ─────────────────────────────────── */
  .categories-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .category-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--fi-surface-hover);
    border-radius: var(--fi-radius-sm);
    border: 1px solid var(--fi-border);
    transition: all 0.2s ease;
  }

  .category-row:hover {
    border-color: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
  }

  .cat-icon-display {
    font-size: 16px;
    width: 24px;
    text-align: center;
    flex-shrink: 0;
  }

  .cat-name-display {
    flex: 1;
    font-size: 13px;
    color: var(--fi-text);
  }

  .cat-amount-display {
    font-size: 13px;
    font-weight: 600;
    color: var(--fi-text);
    letter-spacing: -0.01em;
  }

  .cat-percent {
    font-size: 11px;
    font-weight: 600;
    color: var(--fi-muted);
    min-width: 36px;
    text-align: right;
  }

  .cat-check {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid var(--fi-green);
    background: transparent;
    color: var(--fi-green);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    transition: all 0.2s ease;
    flex-shrink: 0;
    opacity: 0.5;
  }

  .cat-check:hover {
    opacity: 1;
    transform: scale(1.1);
  }

  .cat-check.completed {
    background: var(--fi-green);
    border-color: var(--fi-green);
    color: #fff;
    opacity: 1;
  }

  .savings-edit-fields {
    display: flex;
    gap: 12px;
    flex: 1;
  }

  .savings-field {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
  }

  .savings-field-label {
    font-size: 10px;
    color: var(--fi-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    min-width: 50px;
  }

  .savings-field-input {
    width: 80px;
    padding: 6px 8px;
    border: 1px solid var(--fi-border);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--fi-text);
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    text-align: right;
    transition: all 0.2s ease;
  }

  .savings-field-input:focus {
    border-color: var(--fi-accent);
    outline: none;
    box-shadow: 0 0 0 2px var(--mcp-accent-faint);
  }

  .savings-field-unit {
    font-size: 12px;
    color: var(--fi-muted);
    font-weight: 500;
  }

  .cat-delete {
    background: none;
    border: none;
    color: var(--fi-muted);
    cursor: pointer;
    padding: 6px 8px;
    font-size: 12px;
    border-radius: var(--fi-radius-sm);
    opacity: 0.4;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .category-row:hover .cat-delete {
    opacity: 1;
  }

  .cat-delete:hover {
    color: var(--fi-red);
    background: var(--fi-red-bg);
  }

  /* ── Inline edit ─────────────────────────────────────── */
  .category-row.editing,
  .goal-row.editing {
    background: var(--background-primary);
    border-color: var(--fi-accent);
  }

  .cat-edit-icon,
  .goal-edit-icon {
    width: 38px;
    text-align: center;
    font-size: 16px;
    padding: 6px 4px;
    border: 1px solid var(--fi-border);
    border-radius: 8px;
    background: var(--fi-surface-hover);
    color: var(--fi-text);
  }

  .cat-edit-name,
  .goal-edit-name {
    flex: 1;
    padding: 7px 10px;
    border: 1px solid var(--fi-border);
    border-radius: 8px;
    background: var(--fi-surface-hover);
    color: var(--fi-text);
    font-size: 12.5px;
    font-family: inherit;
  }

  .cat-edit-amount,
  .goal-edit-amount {
    width: 100px;
    text-align: right;
    padding: 7px 10px;
    border: 1px solid var(--fi-border);
    border-radius: 8px;
    background: var(--fi-surface-hover);
    color: var(--fi-text);
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
  }

  .cat-edit-icon:focus,
  .cat-edit-name:focus,
  .cat-edit-amount:focus,
  .goal-edit-icon:focus,
  .goal-edit-name:focus,
  .goal-edit-amount:focus {
    border-color: var(--fi-accent);
    outline: none;
    box-shadow: 0 0 0 3px var(--mcp-accent-faint);
  }

  .goal-edit-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .goal-edit-sep {
    color: var(--fi-muted);
    font-size: 13px;
  }

  .goal-done-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--fi-green);
    background: var(--fi-green);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .goal-done-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 0 8px var(--fi-green);
  }

  /* ── Goals ───────────────────────────────────────────── */
  .goals-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .goal-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--fi-surface-hover);
    border-radius: var(--fi-radius-sm);
    border: 1px solid var(--fi-border);
    transition: all 0.2s ease;
  }

  .goal-row:hover {
    border-color: rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
  }

  .goal-icon {
    font-size: 18px;
    flex-shrink: 0;
  }

  .goal-info {
    flex: 1;
    min-width: 0;
  }

  .goal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }

  .goal-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--fi-text);
  }

  .goal-amounts {
    font-size: 11px;
    color: var(--fi-muted);
    white-space: nowrap;
  }

  .goal-progress-bar {
    width: 100%;
    height: 6px;
    background: var(--fi-border);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 4px;
  }

  .goal-progress-fill {
    height: 100%;
    background: var(--fi-accent);
    border-radius: 3px;
    transition: width 0.4s ease;
  }

  .goal-percent {
    font-size: 11px;
    color: var(--fi-muted);
  }

  /* ── Add button ──────────────────────────────────────── */
  .glass-add-btn {
    display: block;
    width: 100%;
    margin-top: 10px;
    padding: 9px;
    background: transparent;
    border: 1px dashed var(--fi-border);
    border-radius: var(--fi-radius-sm);
    color: var(--fi-muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .glass-add-btn:hover {
    border-color: var(--fi-accent);
    color: var(--fi-accent);
    background: var(--mcp-accent-ultra-dim);
    transform: translateY(-1px);
  }

  /* ── Rules ────────────────────────────────────────────── */
  .glass-textarea {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--fi-border);
    border-radius: var(--fi-radius-sm);
    background: var(--background-primary);
    color: var(--fi-text);
    font-size: 12.5px;
    font-family: inherit;
    resize: vertical;
    line-height: 1.6;
    transition: all 0.2s ease;
  }

  .glass-textarea:focus {
    border-color: var(--fi-accent);
    outline: none;
    box-shadow: 0 0 0 3px var(--mcp-accent-faint);
  }

  .glass-textarea.rules {
    white-space: pre-wrap;
    line-height: 1.8;
  }

  .rules-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  .rules-save-btn {
    flex: 1;
    padding: 8px 16px;
    border: none;
    border-radius: var(--fi-radius-sm);
    background: var(--fi-accent);
    color: var(--text-on-accent, #fff);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .rules-save-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px var(--fi-accent);
  }

  .rules-cancel-btn {
    padding: 8px 16px;
    border: 1px solid var(--fi-border);
    border-radius: var(--fi-radius-sm);
    background: transparent;
    color: var(--fi-muted);
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .rules-cancel-btn:hover {
    color: var(--fi-text);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .rules-display {
    cursor: pointer;
    padding: 4px 0;
    transition: opacity 0.2s ease;
  }

  .rules-display:hover {
    opacity: 0.8;
  }

  .rule-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 0;
  }

  .rule-number {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--fi-accent);
    color: var(--text-on-accent, #fff);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .rule-text {
    font-size: 12.5px;
    color: var(--fi-text);
    line-height: 1.5;
    padding-top: 2px;
  }

  .rules-empty {
    text-align: center;
    padding: 16px;
    color: var(--fi-muted);
    font-size: 12px;
  }

  .rules-edit-hint {
    text-align: center;
    padding: 10px 0 4px;
    color: var(--fi-muted);
    font-size: 11px;
    opacity: 0.6;
  }

  .rules-display:hover .rules-edit-hint {
    opacity: 1;
    color: var(--fi-accent);
  }

  /* ── Warning ─────────────────────────────────────────── */
  .glass-warning {
    margin-top: 10px;
    padding: 10px 14px;
    background: var(--fi-amber-bg);
    border: 1px solid rgba(220, 190, 130, 0.2);
    border-radius: var(--fi-radius-sm);
    color: var(--fi-amber);
    font-size: 12px;
    font-weight: 500;
  }

  .over-budget {
    border-color: rgba(220, 150, 150, 0.25);
  }

  /* ── Cleanup ─────────────────────────────────────────── */
  .cleanup-card {
    padding: 0;
    overflow: hidden;
  }

  .cleanup-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 14px 18px;
    background: none;
    border: none;
    color: var(--fi-muted);
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
    transition: color 0.2s ease;
  }

  .cleanup-toggle:hover {
    color: var(--fi-text);
  }

  .cleanup-arrow {
    margin-left: auto;
    font-size: 16px;
    transition: transform 0.2s ease;
  }

  .cleanup-arrow.open {
    transform: rotate(90deg);
  }

  .cleanup-body {
    padding: 0 18px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .cleanup-info {
    font-size: 12px;
    color: var(--fi-muted);
  }

  .cleanup-old {
    color: var(--fi-amber);
  }

  .cleanup-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cleanup-btn {
    padding: 9px 14px;
    border: 1px solid var(--fi-border);
    border-radius: var(--fi-radius-sm);
    background: var(--fi-surface-hover);
    color: var(--fi-text);
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
    text-align: left;
    transition: all 0.2s ease;
  }

  .cleanup-btn:hover {
    transform: translateY(-1px);
  }

  .cleanup-btn.warn {
    color: var(--fi-amber);
    border-color: rgba(220, 190, 130, 0.25);
  }

  .cleanup-btn.warn:hover {
    background: var(--fi-amber-bg);
  }

  .cleanup-btn.danger {
    color: var(--fi-red);
    border-color: rgba(220, 150, 150, 0.25);
  }

  .cleanup-btn.danger:hover {
    background: var(--fi-red-bg);
  }

  /* ── Mobile ──────────────────────────────────────────── */
  @media (max-width: 768px) {
    .finance-tracker {
      padding: 16px 12px 28px;
    }

    .balance-grid {
      grid-template-columns: 1fr;
    }

    .balance-value {
      font-size: 16px;
    }

    .goal-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
