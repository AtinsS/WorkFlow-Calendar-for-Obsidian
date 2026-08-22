/**
 * Full lifecycle tests for finance storage — save/load through vaultStorage.
 *
 * These tests mock the Obsidian vault to verify the actual data flow:
 *   updateMonthData() → debouncedSave() → loadModuleData() → saveModuleData()
 *   initFinanceStores() → loadFinanceData() → financeData.set()
 *
 * Uses split-file format: calendar-data/finance.json, calendar-data/analytics.json, etc.
 */
import { get } from "svelte/store";
import {
  financeData,
  getCurrentMonthKey,
  getMonthData,
  updateMonthData,
  initFinanceStores,
  reloadFinanceStores,
  getStoredMonthKeys,
  deleteMonthData,
  deleteMonthsBefore,
  addIncome,
  getMainAccountTotal,
  getSavingsTotal,
  getCurrentBalance,
  getMonthGoals,
} from "../storage";
import {
  financialAnalyticsData,
  initFinancialAnalyticsStores,
  reloadFinancialAnalyticsStores,
  addManualIncomeSource,
  updateManualIncomeSource,
  removeManualIncomeSource,
  getTotalManualIncome,
} from "../financialAnalyticsStorage";
import { TFile } from "obsidian";
import type CalendarPlugin from "../../main";

// ── Vault mock ───────────────────────────────────────────────
let vaultStore: Record<string, string> = {};

function createMockApp() {
  return {
    vault: {
      getAbstractFileByPath(path: string) {
        if (vaultStore[path] !== undefined) {
          // Must return a real TFile instance so `isTFile` (instanceof) passes
          const file = new TFile();
          Object.defineProperty(file, 'path', { value: path, writable: false });
          return file;
        }
        return null;
      },
      async read(file: { path: string }) {
        return vaultStore[file.path] ?? "";
      },
      async modify(_file: { path: string }, content: string) {
        vaultStore[_file.path] = content;
      },
      async create(path: string, content: string) {
        vaultStore[path] = content;
      },
      async createDir(_path: string) {
        // no-op — directories are implicit in vault mock
      },
    },
  } as unknown as App;
}

function createMockPlugin(): CalendarPlugin {
  return { app: createMockApp() } as unknown as CalendarPlugin;
}

// ── Helpers ──────────────────────────────────────────────────
async function flushDebounce(): Promise<void> {
  await new Promise((r) => setTimeout(r, 400));
}

/** Read parsed finance data from the split vault file. */
function getParsedFinanceVault(): Record<string, unknown> {
  const raw = vaultStore["calendar-data/finance.json"];
  if (!raw) return {};
  return JSON.parse(raw);
}

/** Read parsed analytics data from the split vault file. */
function getParsedAnalyticsVault(): Record<string, unknown> {
  const raw = vaultStore["calendar-data/financialAnalytics.json"];
  if (!raw) return {};
  return JSON.parse(raw);
}

/** Convenience: set finance vault data for tests. */
function setFinanceVault(data: Record<string, unknown>): void {
  vaultStore["calendar-data/finance.json"] = JSON.stringify(data);
}

/** Convenience: set tasks vault data for tests. */
function setTasksVault(data: Record<string, unknown>): void {
  vaultStore["calendar-data/tasks.json"] = JSON.stringify(data);
}

/** Convenience: set analytics vault data for tests. */
function setAnalyticsVault(data: Record<string, unknown>): void {
  vaultStore["calendar-data/financialAnalytics.json"] = JSON.stringify(data);
}

// ── Setup / Teardown ─────────────────────────────────────────
beforeEach(() => {
  vaultStore = {};
  financeData.set({});
  financialAnalyticsData.set({ manualIncomeSources: [], incomeCategories: [] });
});

// ═══════════════════════════════════════════════════════════════
// 1. Initialization — does initFinanceStores load from vault?
// ═══════════════════════════════════════════════════════════════
describe("initFinanceStores — vault loading", () => {
  it("should load existing finance data from vault on init", async () => {
    setFinanceVault({
      "2026-07": {
        monthlyIncome: 135000,
        lastMonthExpense: 78000,
        mainAccountCategories: [
          { id: "fc-101", name: "Аренда", icon: "🏠", amount: 35000, order: 0 },
        ],
        monthGoals: [],
        savingsCategories: [],
        distributionRules: ["50% на обязательные"],
        updatedAt: "2026-07-01T00:00:00Z",
      },
    });

    const plugin = createMockPlugin();
    await initFinanceStores(plugin);
    await flushDebounce();

    const data = getMonthData("2026-07");
    expect(data.monthlyIncome).toBe(135000);
    expect(data.lastMonthExpense).toBe(78000);
    expect(data.mainAccountCategories).toHaveLength(1);
    expect(data.mainAccountCategories[0].name).toBe("Аренда");
    expect(data.distributionRules).toEqual(["50% на обязательные"]);
  });

  it("should NOT overwrite existing store data if vault has no finance key", async () => {
    // No finance file in vault — only tasks
    setTasksVault({ version: 6 });

    financeData.set({
      "2026-07": {
        monthlyIncome: 999,
        lastMonthExpense: 0,
        mainAccountCategories: [],
        monthGoals: [],
        savingsCategories: [],
        distributionRules: [],
        updatedAt: "",
      },
    });

    const plugin = createMockPlugin();
    await initFinanceStores(plugin);
    await flushDebounce();

    const store = get(financeData);
    expect(store["2026-07"]?.monthlyIncome).toBe(999);
  });

  it("should NOT crash if pluginInstance is null (no init)", async () => {
    expect(async () => await reloadFinanceStores()).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Saving — does updateMonthData write to vault?
// ═══════════════════════════════════════════════════════════════
describe("updateMonthData — vault saving", () => {
  it("should save finance data to vault after updateMonthData", async () => {
    setTasksVault({ version: 6 });

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    updateMonthData("2026-07", {
      monthlyIncome: 120000,
      mainAccountCategories: [
        { id: "fc-1", name: "Аренда", icon: "🏠", amount: 35000, order: 0 },
      ],
      distributionRules: ["50% на обязательные"],
    });

    await flushDebounce();

    const vault = getParsedFinanceVault();
    expect(vault).toBeDefined();
    expect(vault["2026-07"]).toBeDefined();
    expect(vault["2026-07"].monthlyIncome).toBe(120000);
    expect(vault["2026-07"].mainAccountCategories).toHaveLength(1);
    expect(vault["2026-07"].distributionRules).toEqual(["50% на обязательные"]);
  });

  it("should preserve taskTracker data when saving finance", async () => {
    setTasksVault({ version: 6, tasks: [{ id: "t-1" }] });

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    updateMonthData("2026-07", { monthlyIncome: 50000 });
    await flushDebounce();

    const tasksVault = JSON.parse(vaultStore["calendar-data/tasks.json"]);
    const financeVault = getParsedFinanceVault();
    expect(tasksVault.tasks).toHaveLength(1);
    expect(financeVault["2026-07"].monthlyIncome).toBe(50000);
  });

  it("should overwrite old vault data with current store on debouncedSave", async () => {
    setFinanceVault({
      "2026-06": {
        monthlyIncome: 99999,
        lastMonthExpense: 0,
        mainAccountCategories: [],
        monthGoals: [],
        savingsCategories: [],
        distributionRules: [],
        updatedAt: "old",
      },
    });

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    const before = getMonthData("2026-06");
    expect(before.monthlyIncome).toBe(99999);

    updateMonthData("2026-06", { monthlyIncome: 55000 });
    await flushDebounce();

    const vault = getParsedFinanceVault();
    expect(vault["2026-06"].monthlyIncome).toBe(55000);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Reload — does reloadFinanceStores pick up vault changes?
// ═══════════════════════════════════════════════════════════════
describe("reloadFinanceStores — external vault changes", () => {
  it("should reload data when vault is modified externally", async () => {
    setFinanceVault({
      "2026-07": {
        monthlyIncome: 100000,
        lastMonthExpense: 0,
        mainAccountCategories: [],
        monthGoals: [],
        savingsCategories: [],
        distributionRules: [],
        updatedAt: "2026-07-01",
      },
    });

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    expect(getMonthData("2026-07").monthlyIncome).toBe(100000);

    setFinanceVault({
      "2026-07": {
        monthlyIncome: 200000,
        lastMonthExpense: 0,
        mainAccountCategories: [],
        monthGoals: [],
        savingsCategories: [],
        distributionRules: [],
        updatedAt: "2026-07-02",
      },
    });

    reloadFinanceStores();
    await flushDebounce();

    const data = getMonthData("2026-07");
    expect(data.monthlyIncome).toBe(200000);
  });

  it("should handle reload when vault file is deleted", async () => {
    setFinanceVault({
      "2026-07": {
        monthlyIncome: 100000,
        lastMonthExpense: 0,
        mainAccountCategories: [],
        monthGoals: [],
        savingsCategories: [],
        distributionRules: [],
        updatedAt: "2026-07-01",
      },
    });

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    delete vaultStore["calendar-data/finance.json"];

    expect(() => reloadFinanceStores()).not.toThrow();
    await flushDebounce();
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Full round-trip — write, save, reload, verify
// ═══════════════════════════════════════════════════════════════
describe("Full round-trip — write → save → reload → verify", () => {
  it("should persist and reload all finance fields", async () => {
    setTasksVault({});

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    updateMonthData("2026-07", {
      monthlyIncome: 150000,
      lastMonthExpense: 80000,
      mainAccountCategories: [
        { id: "fc-1", name: "Аренда", icon: "🏠", amount: 35000, order: 0 },
        { id: "fc-2", name: "Продукты", icon: "🛒", amount: 18000, order: 1 },
      ],
      monthGoals: [
        { id: "mg-1", icon: "💰", name: "Отпуск", currentAmount: 25000, targetAmount: 80000 },
      ],
      savingsCategories: [
        { id: "sc-1", name: "Подушка", icon: "🛡️", amount: 200000, percent: 67, order: 0, completed: false },
      ],
      distributionRules: ["50% обязательные", "30% накопления", "20% личные"],
      incomeSource: "analytics",
    });

    await flushDebounce();

    const vault = getParsedFinanceVault();
    expect(vault["2026-07"].monthlyIncome).toBe(150000);
    expect(vault["2026-07"].mainAccountCategories).toHaveLength(2);
    expect(vault["2026-07"].monthGoals).toHaveLength(1);
    expect(vault["2026-07"].savingsCategories).toHaveLength(1);
    expect(vault["2026-07"].distributionRules).toHaveLength(3);

    financeData.set({});
    reloadFinanceStores();
    await flushDebounce();

    const reloaded = getMonthData("2026-07");
    expect(reloaded.monthlyIncome).toBe(150000);
    expect(reloaded.lastMonthExpense).toBe(80000);
    expect(reloaded.mainAccountCategories).toHaveLength(2);
    expect(reloaded.mainAccountCategories[0].name).toBe("Аренда");
    expect(reloaded.mainAccountCategories[1].name).toBe("Продукты");
    expect(reloaded.monthGoals).toHaveLength(1);
    expect(reloaded.monthGoals[0].name).toBe("Отпуск");
    expect(reloaded.monthGoals[0].currentAmount).toBe(25000);
    expect(reloaded.savingsCategories).toHaveLength(1);
    expect(reloaded.savingsCategories[0].name).toBe("Подушка");
    expect(reloaded.savingsCategories[0].percent).toBe(67);
    expect(reloaded.distributionRules).toEqual(["50% обязательные", "30% накопления", "20% личные"]);
  });

  it("should preserve taskTracker + habitTracker alongside finance", async () => {
    setTasksVault({ version: 6, tasks: [{ id: "t-1" }] });
    setFinanceVault({}); // empty finance

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    updateMonthData("2026-07", { monthlyIncome: 77777 });
    await flushDebounce();

    const tasksVault = JSON.parse(vaultStore["calendar-data/tasks.json"]);
    const financeVault = getParsedFinanceVault();
    expect(tasksVault.tasks).toHaveLength(1);
    expect(financeVault["2026-07"].monthlyIncome).toBe(77777);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Debounce — rapid updates should not lose data
// ═══════════════════════════════════════════════════════════════
describe("debouncedSave — rapid updates", () => {
  it("should save final state after rapid sequential updates", async () => {
    setTasksVault({});

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    updateMonthData("2026-07", { monthlyIncome: 10000 });
    updateMonthData("2026-07", { monthlyIncome: 20000 });
    updateMonthData("2026-07", { monthlyIncome: 30000 });
    updateMonthData("2026-07", { monthlyIncome: 40000 });
    updateMonthData("2026-07", { monthlyIncome: 50000 });

    await flushDebounce();

    const vault = getParsedFinanceVault();
    expect(vault["2026-07"].monthlyIncome).toBe(50000);
  });

  it("should save all accumulated fields after rapid field updates", async () => {
    setTasksVault({});

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    updateMonthData("2026-07", { monthlyIncome: 100000 });
    updateMonthData("2026-07", { lastMonthExpense: 60000 });
    updateMonthData("2026-07", {
      mainAccountCategories: [
        { id: "fc-1", name: "Тест", icon: "📦", amount: 5000, order: 0 },
      ],
    });
    updateMonthData("2026-07", { distributionRules: ["правило 1"] });

    await flushDebounce();

    const vault = getParsedFinanceVault();
    const f = vault["2026-07"];
    expect(f.monthlyIncome).toBe(100000);
    expect(f.lastMonthExpense).toBe(60000);
    expect(f.mainAccountCategories).toHaveLength(1);
    expect(f.distributionRules).toEqual(["правило 1"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Data integrity — deep copy, no mutation of store
// ═══════════════════════════════════════════════════════════════
describe("getMonthData — no store mutation", () => {
  it("should not mutate store data when reading", async () => {
    setTasksVault({});

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    updateMonthData("2026-07", {
      monthlyIncome: 100000,
      mainAccountCategories: [
        { id: "fc-1", name: "Оригинал", icon: "📦", amount: 5000, order: 0 },
      ],
      savingsCategories: [
        { id: "sc-1", name: "Фонд", icon: "💰", amount: 10000, percent: 0, order: 0, completed: false },
      ],
    });

    const data = getMonthData("2026-07");
    data.mainAccountCategories[0].name = "ИЗМЕНЕНО";
    data.savingsCategories[0].percent = 99;
    data.monthlyIncome = 999999;

    const storeData = get(financeData);
    expect(storeData["2026-07"].mainAccountCategories[0].name).toBe("Оригинал");
    expect(storeData["2026-07"].savingsCategories[0].percent).toBe(0);
    expect(storeData["2026-07"].monthlyIncome).toBe(100000);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. Computed helpers — do they reflect vault data?
// ═══════════════════════════════════════════════════════════════
describe("Computed helpers with vault data", () => {
  it("should compute correct totals from loaded data", async () => {
    setFinanceVault({
      "2026-07": {
        monthlyIncome: 150000,
        lastMonthExpense: 80000,
        mainAccountCategories: [
          { id: "fc-1", name: "Аренда", icon: "🏠", amount: 35000, order: 0 },
          { id: "fc-2", name: "Продукты", icon: "🛒", amount: 18000, order: 1 },
        ],
        monthGoals: [
          { id: "mg-1", icon: "💰", name: "Отпуск", currentAmount: 25000, targetAmount: 80000 },
        ],
        savingsCategories: [
          { id: "sc-1", name: "Подушка", icon: "🛡️", amount: 200000, percent: 67, order: 0, completed: false },
        ],
        distributionRules: [],
        updatedAt: "2026-07-01",
      },
    });

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    expect(getMainAccountTotal("2026-07")).toBe(53000);
    expect(getSavingsTotal("2026-07")).toBe(200000);
    expect(getCurrentBalance("2026-07")).toBe(70000);
    expect(getMonthGoals("2026-07")).toHaveLength(1);
    expect(getStoredMonthKeys()).toContain("2026-07");
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. addIncome — does it accumulate correctly?
// ═══════════════════════════════════════════════════════════════
describe("addIncome — accumulation and vault persistence", () => {
  it("should accumulate income and save to vault", async () => {
    setTasksVault({});

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    const monthKey = getCurrentMonthKey();
    addIncome(50000);
    await flushDebounce();

    let data = getMonthData(monthKey);
    expect(data.monthlyIncome).toBe(50000);

    addIncome(30000);
    await flushDebounce();

    data = getMonthData(monthKey);
    expect(data.monthlyIncome).toBe(80000);

    const vault = getParsedFinanceVault();
    expect(vault[monthKey].monthlyIncome).toBe(80000);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. Delete — does deletion persist to vault?
// ═══════════════════════════════════════════════════════════════
describe("Delete operations — vault persistence", () => {
  it("should remove month from vault after deleteMonthData", async () => {
    setTasksVault({});

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    updateMonthData("2026-06", { monthlyIncome: 100000 });
    updateMonthData("2026-07", { monthlyIncome: 200000 });
    await flushDebounce();

    deleteMonthData("2026-06");
    await flushDebounce();

    const vault = getParsedFinanceVault();
    expect(vault["2026-06"]).toBeUndefined();
    expect(vault["2026-07"]).toBeDefined();
    expect(vault["2026-07"].monthlyIncome).toBe(200000);
  });

  it("should remove old months from vault after deleteMonthsBefore", async () => {
    setTasksVault({});

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    updateMonthData("2026-05", { monthlyIncome: 1 });
    updateMonthData("2026-06", { monthlyIncome: 2 });
    updateMonthData("2026-07", { monthlyIncome: 3 });
    await flushDebounce();

    const count = deleteMonthsBefore("2026-07");
    await flushDebounce();

    expect(count).toBe(2);
    const vault = getParsedFinanceVault();
    expect(vault["2026-05"]).toBeUndefined();
    expect(vault["2026-06"]).toBeUndefined();
    expect(vault["2026-07"]).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. Financial Analytics — full lifecycle
// ═══════════════════════════════════════════════════════════════
describe("Financial Analytics — full lifecycle", () => {
  it("should init, load, save, and reload analytics data", async () => {
    setAnalyticsVault({
      manualIncomeSources: [
        { id: "mi-1", name: "Фриланс", amount: 45000, date: "2026-07-05", createdAt: 1000 },
      ],
    });

    const plugin = createMockPlugin();
    initFinancialAnalyticsStores(plugin);
    await flushDebounce();

    expect(getTotalManualIncome()).toBe(45000);
    const data = get(financialAnalyticsData);
    expect(data.manualIncomeSources[0].name).toBe("Фриланс");

    addManualIncomeSource({ name: "Консультации", amount: 15000, date: "2026-07-03", category: "Фриланс" });
    await flushDebounce();

    expect(getTotalManualIncome()).toBe(60000);

    const vault = getParsedAnalyticsVault();
    expect(vault.manualIncomeSources).toHaveLength(2);
    expect(vault.manualIncomeSources[1].name).toBe("Консультации");

    financialAnalyticsData.set({ manualIncomeSources: [], incomeCategories: [] });
    reloadFinancialAnalyticsStores();
    await flushDebounce();

    expect(getTotalManualIncome()).toBe(60000);
  });

  it("should update and remove sources, persisted to vault", async () => {
    setAnalyticsVault({
      manualIncomeSources: [
        { id: "mi-1", name: "Старый", amount: 10000, date: "2026-07-01", createdAt: 1000 },
      ],
    });

    const plugin = createMockPlugin();
    initFinancialAnalyticsStores(plugin);
    await flushDebounce();

    updateManualIncomeSource("mi-1", { name: "Новый", amount: 20000 });
    await flushDebounce();

    let vault = getParsedAnalyticsVault();
    expect(vault.manualIncomeSources[0].name).toBe("Новый");
    expect(vault.manualIncomeSources[0].amount).toBe(20000);

    removeManualIncomeSource("mi-1");
    await flushDebounce();

    vault = getParsedAnalyticsVault();
    expect(vault.manualIncomeSources).toHaveLength(0);
  });

  it("should add income source with category and persist it", async () => {
    setAnalyticsVault({ manualIncomeSources: [] });

    const plugin = createMockPlugin();
    initFinancialAnalyticsStores(plugin);
    await flushDebounce();

    addManualIncomeSource({ name: "Фриланс проект", amount: 50000, date: "2026-07-15", category: "Фриланс" });
    await flushDebounce();

    const vault = getParsedAnalyticsVault();
    expect(vault.manualIncomeSources).toHaveLength(1);
    expect(vault.manualIncomeSources[0].category).toBe("Фриланс");
  });

  it("should update category of income source", async () => {
    setAnalyticsVault({
      manualIncomeSources: [
        { id: "mi-1", name: "Доход", amount: 10000, date: "2026-07-01", category: "Подработка", createdAt: 1000 },
      ],
    });

    const plugin = createMockPlugin();
    initFinancialAnalyticsStores(plugin);
    await flushDebounce();

    updateManualIncomeSource("mi-1", { category: "Инвестиции" });
    await flushDebounce();

    const vault = getParsedAnalyticsVault();
    expect(vault.manualIncomeSources[0].category).toBe("Инвестиции");
  });

  it("should get income sources grouped by category", async () => {
    const { getManualIncomeByCategory } = await import("../financialAnalyticsStorage");
    financialAnalyticsData.set({
      manualIncomeSources: [
        { id: "mi-1", name: "Проект 1", amount: 30000, date: "2026-07-01", category: "Фриланс", createdAt: 1000 },
        { id: "mi-2", name: "Проект 2", amount: 20000, date: "2026-07-02", category: "Фриланс", createdAt: 1001 },
        { id: "mi-3", name: "Аренда", amount: 15000, date: "2026-07-03", category: "Аренда", createdAt: 1002 },
      ],
      incomeCategories: ["Фриланс", "Аренда"],
    });

    const grouped = getManualIncomeByCategory();
    expect(grouped.size).toBe(2);
    expect(grouped.get("Фриланс")).toHaveLength(2);
    expect(grouped.get("Аренда")).toHaveLength(1);
  });

  it("should add and remove income categories", async () => {
    const { addIncomeCategory, removeIncomeCategory, getIncomeCategories } = await import("../financialAnalyticsStorage");
    financialAnalyticsData.set({ manualIncomeSources: [], incomeCategories: [] });

    addIncomeCategory("Фриланс");
    addIncomeCategory("Подработка");
    expect(getIncomeCategories()).toContain("Фриланс");
    expect(getIncomeCategories()).toContain("Подработка");

    addIncomeCategory("Фриланс"); // duplicate should be ignored
    expect(getIncomeCategories().filter(c => c === "Фриланс")).toHaveLength(1);

    removeIncomeCategory("Подработка");
    expect(getIncomeCategories()).not.toContain("Подработка");
    expect(getIncomeCategories()).toContain("Фриланс");
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. Edge cases — empty vault, malformed data
// ═══════════════════════════════════════════════════════════════
describe("Edge cases", () => {
  it("should handle empty vault file gracefully", async () => {
    vaultStore["calendar-data/finance.json"] = "";

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    const data = getMonthData(getCurrentMonthKey());
    expect(data.monthlyIncome).toBe(0);
  });

  it("should handle corrupted JSON in vault gracefully", async () => {
    vaultStore["calendar-data/finance.json"] = "NOT JSON {{{";

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    const data = getMonthData(getCurrentMonthKey());
    expect(data.monthlyIncome).toBe(0);
  });

  it("should create vault file if it does not exist", async () => {
    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    updateMonthData("2026-07", { monthlyIncome: 100 });
    await flushDebounce();

    const vault = getParsedFinanceVault();
    expect(vault).toBeDefined();
    expect(vault["2026-07"].monthlyIncome).toBe(100);
  });

  it("should not lose data when loadVaultData returns {} (file deleted)", async () => {
    setTasksVault({});

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    updateMonthData("2026-07", { monthlyIncome: 100000 });
    await flushDebounce();

    delete vaultStore["calendar-data/finance.json"];

    expect(() => reloadFinanceStores()).not.toThrow();
    await flushDebounce();

    const store = get(financeData);
    expect(store["2026-07"]?.monthlyIncome).toBe(100000);
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. incomeSource field persistence
// ═══════════════════════════════════════════════════════════════
describe("incomeSource field", () => {
  it("should persist incomeSource through vault round-trip", async () => {
    setTasksVault({});

    const plugin = createMockPlugin();
    initFinanceStores(plugin);
    await flushDebounce();

    updateMonthData("2026-07", {
      monthlyIncome: 100000,
      incomeSource: "manual",
    });
    await flushDebounce();

    const vault = getParsedFinanceVault();
    expect(vault["2026-07"].incomeSource).toBe("manual");

    financeData.set({});
    reloadFinanceStores();
    await flushDebounce();

    const data = getMonthData("2026-07");
    expect(data.incomeSource).toBe("manual");
  });
});
