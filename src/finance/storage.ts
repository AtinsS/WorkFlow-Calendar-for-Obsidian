import { writable, get } from "svelte/store";
import type CalendarPlugin from "../main";
import type { IFinanceData, FinanceMonthData, MonthGoal } from "./types";
import { createEmptyMonthData, generateGoalId } from "./types";
import { loadModuleData, saveModuleData } from "../io/vaultStorage";

export const financeData = writable<IFinanceData>({});

let pluginInstance: CalendarPlugin = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let loaded = false;
let storeIsDirty = false; // true when store has unsaved local edits
let isSaving = false; // true while a write to vault is in-flight

export async function initFinanceStores(plugin: CalendarPlugin): Promise<void> {
  pluginInstance = plugin;
  // Always load from vault on init — ignore dirty/saving state
  await loadFinanceDataFromVault();
}

export async function reloadFinanceStores(): Promise<void> {
  await loadFinanceData();
}

async function loadFinanceData(): Promise<void> {
  if (!pluginInstance) return;

  // Skip reload if there are unsaved local edits or a write is in-flight —
  // otherwise the vault sync would overwrite the user's pending changes.
  if (storeIsDirty || isSaving) {
    loaded = true;
    return;
  }

  await loadFinanceDataFromVault();
}

async function loadFinanceDataFromVault(): Promise<void> {
  if (!pluginInstance) return;

  // Finance always uses vaultStorage (split-file format)
  const moduleData = await loadModuleData(pluginInstance.app, "finance");
  if (moduleData && Object.keys(moduleData).length > 0) {
    financeData.set(moduleData as IFinanceData);
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
      await saveModuleData(pluginInstance.app, "finance", get(financeData) as unknown as Record<string, unknown>);
    } finally {
      isSaving = false;
      storeIsDirty = false;
    }
  }, 300);
}

export async function immediateFinanceSave(): Promise<void> {
  if (!loaded || !pluginInstance) return;
  if (saveTimeout) {
    window.clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  isSaving = true;
  try {
    await saveModuleData(pluginInstance.app, "finance", get(financeData) as unknown as Record<string, unknown>);
  } finally {
    isSaving = false;
    storeIsDirty = false;
  }
}

export function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthData(monthKey: string): FinanceMonthData {
  const allData = get(financeData);
  if (!allData[monthKey]) {
    return createEmptyMonthData();
  }
  const raw = allData[monthKey];

  // Deep copy to avoid mutating store data
  const data: FinanceMonthData = {
    ...raw,
    mainAccountCategories: raw.mainAccountCategories.map((c) => ({ ...c })),
    monthGoals: (raw.monthGoals || []).map((g) => ({ ...g })),
    savingsCategories: (raw.savingsCategories || []).map((c) => ({ ...c })),
    distributionRules: [...raw.distributionRules],
  };

  // Migration: convert old string[] monthGoals to MonthGoal[]
  if (Array.isArray(data.monthGoals) && data.monthGoals.length > 0 && typeof data.monthGoals[0] === "string") {
    data.monthGoals = (data.monthGoals as unknown as string[]).map((g: string) => ({
      id: generateGoalId(),
      icon: "🎯",
      name: typeof g === "string" ? g : "Цель",
      currentAmount: 0,
      targetAmount: 0,
    }));
  }

  // Migration: ensure savingsCategories have percent and completed
  if (data.savingsCategories) {
    data.savingsCategories = data.savingsCategories.map((c) => ({
      ...c,
      percent: c.percent ?? 0,
      completed: c.completed ?? false,
    }));
  }

  return data;
}

export function updateMonthData(monthKey: string, changes: Partial<FinanceMonthData>): void {
  financeData.update((current) => ({
    ...current,
    [monthKey]: {
      ...(current[monthKey] || createEmptyMonthData()),
      ...changes,
      updatedAt: new Date().toISOString(),
    },
  }));
  debouncedSave();
}

export function addIncome(amount: number): void {
  const monthKey = getCurrentMonthKey();
  const data = getMonthData(monthKey);
  updateMonthData(monthKey, { monthlyIncome: data.monthlyIncome + amount });
}

export function getMainAccountTotal(monthKey: string): number {
  const data = getMonthData(monthKey);
  return data.mainAccountCategories.reduce((sum, c) => sum + c.amount, 0);
}

export function getSavingsTotal(monthKey: string): number {
  const data = getMonthData(monthKey);
  return data.savingsCategories.reduce((sum, c) => sum + c.amount, 0);
}

export function getCurrentBalance(monthKey: string): number {
  const data = getMonthData(monthKey);
  return data.monthlyIncome - data.lastMonthExpense;
}

export function getMonthGoals(monthKey: string): MonthGoal[] {
  const data = getMonthData(monthKey);
  return data.monthGoals || [];
}

export function getStoredMonthKeys(): string[] {
  return Object.keys(get(financeData)).sort();
}

export function deleteMonthData(monthKey: string): void {
  financeData.update((current) => {
    const next = { ...current };
    delete next[monthKey];
    return next;
  });
  debouncedSave();
}

export function deleteMonthsBefore(cutoffKey: string): number {
  const all = get(financeData);
  const keys = Object.keys(all).filter((k) => k < cutoffKey);
  if (keys.length === 0) return 0;
  financeData.update((current) => {
    const next = { ...current };
    for (const k of keys) delete next[k];
    return next;
  });
  debouncedSave();
  return keys.length;
}
