import { writable, get } from "svelte/store";
import type CalendarPlugin from "../main";
import { loadModuleData, saveModuleData } from "../io/vaultStorage";

export interface ManualIncomeSource {
  id: string;
  name: string;
  amount: number;
  date: string;
  category: string;
  createdAt: number;
}

export interface IFinancialAnalyticsData {
  manualIncomeSources: ManualIncomeSource[];
  incomeCategories: string[];
}

export const financialAnalyticsData = writable<IFinancialAnalyticsData>({
  manualIncomeSources: [],
  incomeCategories: [],
});

let pluginInstance: CalendarPlugin | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let loaded = false;
let storeIsDirty = false;
let isSaving = false;

export async function initFinancialAnalyticsStores(plugin: CalendarPlugin): Promise<void> {
  pluginInstance = plugin;
  // Always load from vault on init — ignore dirty/saving state
  await loadFinancialAnalyticsDataFromVault();
}

export async function reloadFinancialAnalyticsStores(): Promise<void> {
  await loadFinancialAnalyticsData();
}

async function loadFinancialAnalyticsData(): Promise<void> {
  if (!pluginInstance) return;

  // Skip reload if there are unsaved local edits or a write is in-flight
  if (storeIsDirty || isSaving) {
    loaded = true;
    return;
  }

  await loadFinancialAnalyticsDataFromVault();
}

async function loadFinancialAnalyticsDataFromVault(): Promise<void> {
  if (!pluginInstance) return;

  // Always uses vaultStorage (split-file format)
  const moduleData = await loadModuleData(pluginInstance.app, "financialAnalytics");
  if (moduleData && Object.keys(moduleData).length > 0) {
    const savedData = moduleData as unknown as IFinancialAnalyticsData;
    // Ensure incomeCategories always exists (migration from old format)
    financialAnalyticsData.set({
      manualIncomeSources: savedData.manualIncomeSources || [],
      incomeCategories: savedData.incomeCategories || [],
    });
  }
  loaded = true;
}

async function debouncedSave(): Promise<void> {
  if (!loaded) return;
  storeIsDirty = true;
  if (saveTimeout) window.clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(async () => {
    if (!pluginInstance) return;
    isSaving = true;
    try {
      await saveModuleData(pluginInstance.app, "financialAnalytics", get(financialAnalyticsData) as unknown as Record<string, unknown>);
    } finally {
      isSaving = false;
      storeIsDirty = false;
    }
  }, 300);
}

export async function immediateAnalyticsSave(): Promise<void> {
  if (!loaded || !pluginInstance) return;
  if (saveTimeout) {
    window.clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  isSaving = true;
  try {
    await saveModuleData(pluginInstance.app, "financialAnalytics", get(financialAnalyticsData) as unknown as Record<string, unknown>);
  } finally {
    isSaving = false;
    storeIsDirty = false;
  }
}

let idCounter = 0;

export function generateIncomeSourceId(): string {
  return `fis-${Date.now()}-${++idCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

export function addManualIncomeSource(source: Omit<ManualIncomeSource, "id" | "createdAt">): void {
  const newSource: ManualIncomeSource = {
    ...source,
    id: generateIncomeSourceId(),
    createdAt: Date.now(),
  };
  financialAnalyticsData.update((current) => ({
    ...current,
    manualIncomeSources: [...current.manualIncomeSources, newSource],
  }));
  debouncedSave();
}

export function updateManualIncomeSource(id: string, changes: Partial<ManualIncomeSource>): void {
  financialAnalyticsData.update((current) => ({
    ...current,
    manualIncomeSources: current.manualIncomeSources.map((s) =>
      s.id === id ? { ...s, ...changes } : s
    ),
  }));
  debouncedSave();
}

export function removeManualIncomeSource(id: string): void {
  financialAnalyticsData.update((current) => ({
    ...current,
    manualIncomeSources: current.manualIncomeSources.filter((s) => s.id !== id),
  }));
  debouncedSave();
}

export function getTotalManualIncome(): number {
  const data = get(financialAnalyticsData);
  return data.manualIncomeSources.reduce((sum, s) => sum + s.amount, 0);
}

export function getManualIncomeForMonth(year: number, month: number): number {
  const data = get(financialAnalyticsData);
  return data.manualIncomeSources
    .filter((source) => {
      const match = source.date.match(/^(\d{4})-(\d{2})/);
      if (match) {
        return parseInt(match[1], 10) === year && parseInt(match[2], 10) === month;
      }
      return false;
    })
    .reduce((sum, s) => sum + s.amount, 0);
}

export function getIncomeCategories(): string[] {
  const data = get(financialAnalyticsData);
  return data.incomeCategories || [];
}

export function addIncomeCategory(category: string): void {
  const trimmed = category.trim();
  if (!trimmed) return;
  financialAnalyticsData.update((current) => {
    const cats = current.incomeCategories || [];
    if (cats.includes(trimmed)) return current;
    return { ...current, incomeCategories: [...cats, trimmed] };
  });
  // Save immediately so categories persist without delay
  void immediateAnalyticsSave();
}

export function removeIncomeCategory(category: string): void {
  financialAnalyticsData.update((current) => {
    const cats = current.incomeCategories || [];
    return { ...current, incomeCategories: cats.filter((c) => c !== category) };
  });
  // Save immediately so categories persist without delay
  void immediateAnalyticsSave();
}

export function getManualIncomeByCategory(): Map<string, ManualIncomeSource[]> {
  const data = get(financialAnalyticsData);
  const map = new Map<string, ManualIncomeSource[]>();
  for (const source of data.manualIncomeSources) {
    const cat = source.category || "Другое";
    const list = map.get(cat);
    if (list) list.push(source);
    else map.set(cat, [source]);
  }
  return map;
}
