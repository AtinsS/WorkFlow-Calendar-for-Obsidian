import { App, TFile, TAbstractFile } from "obsidian";

// --- Constants ---
export const VAULT_DATA_DIR = "calendar-data";
const VAULT_DATA_FILE = "calendar-data.json"; // legacy single-file format
const META_FILE = `${VAULT_DATA_DIR}/meta.json`;
const BACKUP_SUFFIX = ".bak";

export const MODULES = [
  "taskTracker",
  "habitTracker",
  "finance",
  "financialAnalytics",
  "notifications",
] as const;

export type ModuleName = (typeof MODULES)[number];

// --- Interfaces ---

export interface VaultData {
  taskTracker?: Record<string, unknown>;
  habitTracker?: Record<string, unknown>;
  finance?: Record<string, unknown>;
  financialAnalytics?: Record<string, unknown>;
  notificationSync?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ModuleMeta {
  schemaVersion: number;
  checksums: Record<string, string>;
  lastUpdated: string;
}

export interface NotificationSyncSettings {
  overdueCheckEnabled: boolean;
  ntfyTopic: string;
}

// --- Helpers ---

function isTFile(file: TAbstractFile | null): file is TFile {
  return file instanceof TFile;
}

function moduleFilePath(module: ModuleName): string {
  return `${VAULT_DATA_DIR}/${module}.json`;
}

function backupFilePath(module: ModuleName): string {
  return `${VAULT_DATA_DIR}/${module}.json${BACKUP_SUFFIX}`;
}

/** Fast string hash (djb2 variant) — no crypto dependency needed. */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

// --- Per-module write queue ---
// Serializes writes within each module so concurrent calls don't conflict.
// Cross-module writes are independent and can run in parallel.
const moduleQueues: Map<string, Promise<void>> = new Map();

function enqueueModuleWrite(moduleName: string, fn: () => Promise<void>): Promise<void> {
  const current = moduleQueues.get(moduleName) || Promise.resolve();
  const next = current.then(fn, fn);
  moduleQueues.set(moduleName, next.catch((e) => {
    console.error(`[vaultStorage] Write failed for module "${moduleName}":`, e);
  }));
  return next;
}

// --- Read / Write primitives ---

async function readFileContent(app: App, path: string): Promise<string | null> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!isTFile(file)) return null;
  return app.vault.read(file);
}

async function writeFileContent(app: App, path: string, content: string): Promise<void> {
  const file = app.vault.getAbstractFileByPath(path);
  if (isTFile(file)) {
    await app.vault.modify(file, content);
  } else {
    await app.vault.create(path, content);
  }
}

// --- Module-level storage (new split-file format) ---

/**
 * Load a single module's data from its own file.
 * Falls back to .bak on parse error or missing file.
 */
export async function loadModuleData(
  app: App,
  moduleName: ModuleName
): Promise<Record<string, unknown>> {
  const primaryPath = moduleFilePath(moduleName);
  const backupPath = backupFilePath(moduleName);

  const data = await tryLoadJson(app, primaryPath);
  if (data !== null) {
    // Verify checksum if meta exists
    const meta = await loadMeta(app);
    if (meta && meta.checksums[moduleName]) {
      const expected = meta.checksums[moduleName];
      const actual = simpleHash(JSON.stringify(data, null, 2));
      if (expected !== actual) {
        console.warn(
          `[vaultStorage] Checksum mismatch for ${moduleName}, trying backup`
        );
        const backupData = await tryLoadJson(app, backupPath);
        if (backupData !== null) return backupData;
      }
    }
    return data;
  }

  // Primary failed — try backup
  const backupData = await tryLoadJson(app, backupPath);
  if (backupData !== null) {
    console.warn(`[vaultStorage] Primary missing/corrupt for ${moduleName}, using backup`);
    return backupData;
  }

  return {};
}

async function tryLoadJson(app: App, path: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFileContent(app, path);
    if (content === null || content === "") return null;
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Save a module's data with backup and checksum.
 */
export async function saveModuleData(
  app: App,
  moduleName: ModuleName,
  data: Record<string, unknown>
): Promise<void> {
  const primaryPath = moduleFilePath(moduleName);
  const backupPath = backupFilePath(moduleName);
  const content = JSON.stringify(data, null, 2);

  // Create backup of current file before overwriting
  const existingContent = await readFileContent(app, primaryPath);
  if (existingContent !== null && existingContent !== "") {
    await writeFileContent(app, backupPath, existingContent).catch((e) =>
      console.error(`[vaultStorage] Failed to create backup for ${moduleName}:`, e)
    );
  }

  // Write primary
  await writeFileContent(app, primaryPath, content);

  // Update checksum in meta
  const checksum = simpleHash(content);
  await updateMeta(app, moduleName, checksum);
}

// --- Meta file ---

async function loadMeta(app: App): Promise<ModuleMeta | null> {
  try {
    const content = await readFileContent(app, META_FILE);
    if (content === null) return null;
    return JSON.parse(content) as ModuleMeta;
  } catch {
    return null;
  }
}

async function updateMeta(app: App, moduleName: string, checksum: string): Promise<void> {
  try {
    const meta = (await loadMeta(app)) || {
      schemaVersion: 1,
      checksums: {},
      lastUpdated: new Date().toISOString(),
    };
    meta.checksums[moduleName] = checksum;
    meta.lastUpdated = new Date().toISOString();
    const content = JSON.stringify(meta, null, 2);
    await writeFileContent(app, META_FILE, content);
  } catch (e) {
    console.error("[vaultStorage] Failed to update meta:", e);
  }
}

// --- Migration from legacy single-file format ---

let migrationDone = false;

/**
 * One-time migration: split legacy calendar-data.json into per-module files.
 * Safe to call multiple times — idempotent (skips if dir already has files).
 */
export async function migrateFromSingleFile(app: App): Promise<void> {
  if (migrationDone) return;

  const legacyFile = app.vault.getAbstractFileByPath(VAULT_DATA_FILE);
  if (!isTFile(legacyFile)) {
    migrationDone = true;
    return;
  }

  // Check if new format already has data (partial migration)
  const dir = app.vault.getAbstractFileByPath(VAULT_DATA_DIR);
  if (isTFile(dir) || (!isTFile(dir) && app.vault.getAbstractFileByPath(moduleFilePath("taskTracker")))) {
    // Directory or at least one module file exists — skip migration
    migrationDone = true;
    return;
  }

  try {
    const content = await app.vault.read(legacyFile);
    const data = JSON.parse(content) as VaultData;

    // Map legacy keys to module file names
    const keyMap: Record<string, ModuleName> = {
      taskTracker: "taskTracker",
      habitTracker: "habitTracker",
      finance: "finance",
      financialAnalytics: "financialAnalytics",
      notificationSync: "notifications",
    };

    for (const [key, moduleName] of Object.entries(keyMap)) {
      if (data[key] !== undefined) {
        const moduleContent = JSON.stringify(data[key], null, 2);
        await writeFileContent(app, moduleFilePath(moduleName), moduleContent);
        await updateMeta(app, moduleName, simpleHash(moduleContent));
      }
    }

    // Rename legacy file to .migrated (keep for safety)
    const migratedPath = `${VAULT_DATA_FILE}.migrated`;
    await app.vault.rename(legacyFile, migratedPath);
    console.log(`[vaultStorage] Migrated ${VAULT_DATA_FILE} → ${migratedPath}`);
  } catch (e) {
    console.error("[vaultStorage] Migration failed:", e);
  }

  migrationDone = true;
}

// --- Legacy single-file API (kept for backward compat during migration) ---

export async function loadVaultData(app: App): Promise<VaultData> {
  try {
    const file = app.vault.getAbstractFileByPath(VAULT_DATA_FILE);
    if (!isTFile(file)) {
      return {};
    }

    const content = await app.vault.read(file);
    return JSON.parse(content) as VaultData;
  } catch {
    return {};
  }
}

export async function saveVaultData(
  app: App,
  data: VaultData
): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  const file = app.vault.getAbstractFileByPath(VAULT_DATA_FILE);

  if (isTFile(file)) {
    await app.vault.modify(file, content);
  } else {
    await app.vault.create(VAULT_DATA_FILE, content);
  }
}

/**
 * Atomic read-modify-write for a single key.
 * Delegates to saveModuleData for new format.
 */
export async function saveVaultKey(
  app: App,
  key: string,
  value: unknown
): Promise<void> {
  const moduleName = key as ModuleName;
  if (MODULES.includes(moduleName)) {
    await enqueueModuleWrite(moduleName, async () => {
      const existing = await loadModuleData(app, moduleName);
      const merged = { ...existing, ...value as Record<string, unknown> };
      await saveModuleData(app, moduleName, merged);
    });
    return;
  }

  // Fallback for unknown keys — shouldn't happen in normal flow
  console.warn(`[vaultStorage] Unknown module key: ${key}, falling back to legacy`);
  await enqueueModuleWrite(key, async () => {
    const vaultData = await loadVaultData(app);
    vaultData[key] = value as Record<string, unknown>;
    await saveVaultData(app, vaultData);
  });
}

// --- Notification settings ---

export async function saveNotificationSyncSettings(
  app: App,
  settings: NotificationSyncSettings
): Promise<void> {
  await enqueueModuleWrite("notifications", async () => {
    const existing = await loadModuleData(app, "notifications");
    const merged = { ...existing, ...settings };
    await saveModuleData(app, "notifications", merged);
  });
}

/**
 * Sync notification settings to vault on plugin load.
 * This ensures the latest settings are always available
 * for GitHub Actions workflows.
 */
export async function syncNotificationSettingsOnLoad(app: App, options: {
  syncToVault: boolean;
  overdueCheckEnabled: boolean;
  ntfyTopic: string;
}): Promise<void> {
  if (!options.syncToVault) return;
  await saveNotificationSyncSettings(app, {
    overdueCheckEnabled: options.overdueCheckEnabled,
    ntfyTopic: options.ntfyTopic,
  });
}
