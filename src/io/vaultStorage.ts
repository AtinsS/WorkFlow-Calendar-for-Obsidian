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
  [key: string]: unknown;
}

export interface ModuleMeta {
  schemaVersion: number;
  checksums: Record<string, string>;
  lastUpdated: string;
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
  moduleQueues.set(moduleName, next.catch((e: unknown) => {
    console.error(`[vaultStorage] Write failed for module "${moduleName}":`, e);
  }));
  return next;
}

// --- Read / Write primitives ---

async function readFileContent(app: App, path: string): Promise<string | null> {
  // Try vault API first (works when file cache is populated)
  const file = app.vault.getAbstractFileByPath(path);
  if (isTFile(file)) {
    const c = await app.vault.read(file);
    return c;
  }
  // Fallback: direct adapter read (bypasses vault cache — needed for Obsidian ≥1.13
  // where file cache may not be populated when plugin loads)
  try {
    const ex = await app.vault.adapter.exists(path);
    if (ex) {
      const c = await app.vault.adapter.read(path);
      return c;
    }
  } catch (e: unknown) {
    console.error(`[VS] readFileContent(${path}) adapter error:`, e);
  }
  return null;
}

async function writeFileContent(app: App, path: string, content: string): Promise<void> {
  // Try vault API first
  const file = app.vault.getAbstractFileByPath(path);
  if (isTFile(file)) {
    await app.vault.modify(file, content);
    return;
  }

  // Ensure parent directory exists
  const dir = path.substring(0, path.lastIndexOf("/"));
  if (dir) {
    try {
      await app.vault.createFolder(dir);
    } catch {
      // Folder already exists on disk or vault cache not populated (Obsidian ≥1.13)
    }
  }

  try {
    await app.vault.create(path, content);
  } catch {
    // Race condition or "File already exists" — try vault modify, then adapter fallback
    const existing = app.vault.getAbstractFileByPath(path);
    if (isTFile(existing)) {
      await app.vault.modify(existing, content);
    } else {
      // Direct adapter write (always overwrites, works even if vault cache is stale)
      await app.vault.adapter.write(path, content);
    }
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

  console.debug(`[VS] loadModule(${moduleName}): start`);
  const data = await tryLoadJson(app, primaryPath);
  console.debug(`[VS] loadModule(${moduleName}): primary=${data ? Object.keys(data).length + 'k' : 'null'}`);
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
  } catch (e: unknown) {
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

  // Check legacy file — use adapter.exists as fallback for Obsidian ≥1.13
  // where vault cache may not be populated yet
  const legacyFile = app.vault.getAbstractFileByPath(VAULT_DATA_FILE);
  const legacyExists = isTFile(legacyFile) || await app.vault.adapter.exists(VAULT_DATA_FILE);
  if (!legacyExists) {
    migrationDone = true;
    return;
  }

  // Check if new format already has data (partial migration)
  const dir = app.vault.getAbstractFileByPath(VAULT_DATA_DIR);
  const dirExists = !!dir || await app.vault.adapter.exists(VAULT_DATA_DIR);
  const moduleExists = !!app.vault.getAbstractFileByPath(moduleFilePath("taskTracker"))
    || await app.vault.adapter.exists(moduleFilePath("taskTracker"));
  if (dirExists || moduleExists) {
    // Directory or at least one module file exists — skip migration
    migrationDone = true;
    return;
  }

  try {
    const content = isTFile(legacyFile)
      ? await app.vault.read(legacyFile)
      : await app.vault.adapter.read(VAULT_DATA_FILE);
    const data = JSON.parse(content) as VaultData;

    // Map legacy keys to module file names
    const keyMap: Record<string, ModuleName> = {
      taskTracker: "taskTracker",
      habitTracker: "habitTracker",
      finance: "finance",
      financialAnalytics: "financialAnalytics",
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
    if (isTFile(legacyFile)) {
      await app.vault.rename(legacyFile, migratedPath);
    } else {
      // File not in vault cache — use adapter to rename
      const content = await app.vault.adapter.read(VAULT_DATA_FILE);
      await app.vault.adapter.write(migratedPath, content);
      await app.vault.adapter.remove(VAULT_DATA_FILE);
    }
    console.debug(`[vaultStorage] Migrated ${VAULT_DATA_FILE} → ${migratedPath}`);
  } catch (e: unknown) {
    console.error("[vaultStorage] Migration failed:", e);
  }

  migrationDone = true;
}

/**
 * One-time migration: move per-module JSON files from vault root to calendar-data/.
 * Handles the case where a previous version stored taskTracker.json / habitTracker.json
 * at the vault root instead of inside calendar-data/.
 */
export async function migrateRootModuleFiles(app: App): Promise<void> {
  const rootModules: ModuleName[] = ["taskTracker", "habitTracker"];

  for (const moduleName of rootModules) {
    const rootPath = `${moduleName}.json`;
    const targetPath = moduleFilePath(moduleName);

    // Skip if target already exists in calendar-data/
    const targetExists = !!app.vault.getAbstractFileByPath(targetPath)
      || await app.vault.adapter.exists(targetPath);
    if (targetExists) continue;

    // Check if root-level file exists
    const rootFile = app.vault.getAbstractFileByPath(rootPath);
    const rootExists = isTFile(rootFile) || await app.vault.adapter.exists(rootPath);
    if (!rootExists) continue;

    try {
      const content = isTFile(rootFile)
        ? await app.vault.read(rootFile)
        : await app.vault.adapter.read(rootPath);

      if (content) {
        await writeFileContent(app, targetPath, content);
        const data: Record<string, unknown> = JSON.parse(content) as Record<string, unknown>;
        await updateMeta(app, moduleName, simpleHash(JSON.stringify(data, null, 2)));
        console.debug(`[vaultStorage] Migrated ${rootPath} → ${targetPath}`);
      }
    } catch (e: unknown) {
      console.error(`[vaultStorage] Failed to migrate ${rootPath}:`, e);
    }
  }
}

// --- Legacy single-file API (kept for backward compat during migration) ---

export async function loadVaultData(app: App): Promise<VaultData> {
  try {
    const content = await readFileContent(app, VAULT_DATA_FILE);
    if (content === null || content === "") return {};
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
  await writeFileContent(app, VAULT_DATA_FILE, content);
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
      const merged: Record<string, unknown> = { ...existing, ...(value as Record<string, unknown>) };
      await saveModuleData(app, moduleName, merged);
    });
    return;
  }

  // Fallback for unknown keys — shouldn't happen in normal flow
  console.warn(`[vaultStorage] Unknown module key: ${key}, falling back to legacy`);
  await enqueueModuleWrite(key, async () => {
    const vaultData = await loadVaultData(app);
    vaultData[key] = value;
    await saveVaultData(app, vaultData);
  });
}

// --- Notification settings ---

export async function updateNotificationModuleData(
  app: App,
  updater: (existing: Record<string, unknown>) => Record<string, unknown>
): Promise<Record<string, unknown>> {
  let updated: Record<string, unknown> = {};
  await enqueueModuleWrite("notifications", async () => {
    const existing = await loadModuleData(app, "notifications");
    updated = updater(existing);
    await saveModuleData(app, "notifications", updated);
  });
  return updated;
}
