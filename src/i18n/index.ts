import { derived, writable, get } from "svelte/store";
import { ru } from "./ru";
import { en } from "./en";

export type Locale = "ru" | "en";
export type Translations = typeof ru;

const translations: Record<Locale, Translations> = { ru, en };

export const locale = writable<Locale>("ru");

/** Resolve nested key like "tasks.panel.title" from an object */
function getNestedValue(obj: any, path: string): string | string[] | undefined {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Reactive translation store for use in Svelte components.
 * Usage: import { t } from "../i18n";  then  $t("key.path")
 */
function createT() {
  return derived(locale, ($locale) => {
    const dict = translations[$locale] || translations.ru;
    return (key: string, params?: Record<string, string | number>): string => {
      let value = getNestedValue(dict, key);
      if (value === undefined) {
        // Fallback to Russian
        value = getNestedValue(translations.ru, key);
      }
      if (value === undefined) {
        return key; // Return key itself as last resort
      }
      if (Array.isArray(value)) {
        return value.join(", ");
      }
      if (params) {
        return Object.entries(params).reduce(
          (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
          value as string
        );
      }
      return value as string;
    };
  });
}

export const t = createT();

/**
 * Reactive array translation store for use in Svelte components.
 * Usage: import { tArray } from "../i18n";  then  $tArray("common.weekdays.short")
 */
function createTArray() {
  return derived(locale, ($locale) => {
    const dict = translations[$locale] || translations.ru;
    return (key: string): string[] => {
      const value = getNestedValue(dict, key);
      if (Array.isArray(value)) return value;
      const fallback = getNestedValue(translations.ru, key);
      if (Array.isArray(fallback)) return fallback;
      return [];
    };
  });
}

export const tArray = createTArray();

/**
 * Non-reactive translation for use outside Svelte components (main.ts, services, etc.).
 * Must be called after locale is set.
 */
export function tRaw(key: string, params?: Record<string, string | number>): string {
  const $locale = get(locale);
  const dict = translations[$locale] || translations.ru;
  let value = getNestedValue(dict, key);
  if (value === undefined) {
    value = getNestedValue(translations.ru, key);
  }
  if (value === undefined) return key;
  if (Array.isArray(value)) return value.join(", ");
  if (params) {
    return Object.entries(params).reduce(
      (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
      value as string
    );
  }
  return value as string;
}

/**
 * Non-reactive array translation for use outside Svelte components.
 */
export function tArrayRaw(key: string): string[] {
  const $locale = get(locale);
  const dict = translations[$locale] || translations.ru;
  const value = getNestedValue(dict, key);
  if (Array.isArray(value)) return value;
  const fallback = getNestedValue(translations.ru, key);
  if (Array.isArray(fallback)) return fallback;
  return [];
}

/**
 * Set locale and persist to settings.
 */
export function setLocale(newLocale: Locale): void {
  locale.set(newLocale);
}

/**
 * Detect system locale. Returns "ru" if system language is Russian, else "en".
 */
export function detectSystemLocale(): Locale {
  const lang = navigator.language || (navigator as any).userLanguage || "en";
  return lang.startsWith("ru") ? "ru" : "en";
}

/**
 * Initialize locale from settings value.
 */
export function initLocale(setting: "ru" | "en" | "system"): void {
  if (setting === "system") {
    setLocale(detectSystemLocale());
  } else {
    setLocale(setting);
  }
}
