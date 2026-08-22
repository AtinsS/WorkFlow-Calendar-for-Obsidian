import "moment/locale/ru";
import { moment, App, Plugin, WorkspaceLeaf, MarkdownView, View } from "obsidian";
import type { Moment, WeekSpec } from "moment";
import { get } from "svelte/store";

const registeredMarkdownCodeBlocks = new Set<string>();



import {
  VIEW_TYPE_CALENDAR,
  VIEW_TYPE_TASKS,
  VIEW_TYPE_SCHEDULE,
  VIEW_TYPE_MOBILE_SCHEDULE,
  VIEW_TYPE_MOBILE_TASKS,
  VIEW_TYPE_HABIT_ANALYTICS,
  VIEW_TYPE_FINANCE,
  VIEW_TYPE_FINANCIAL_ANALYTICS,
} from "./constants";
import { settings } from "./ui/stores";
import { app as appStore } from "./stores/appStore";
import {
  CalendarSettingsTab,
  ISettings,
  applyAccentColor,
  applyGlassBgColor,
  applyAllColors,
} from "./settings";
import { TFile } from "obsidian";
import CalendarView from "./view";
import TaskView from "./views/TaskView";
import ScheduleView from "./views/ScheduleView";
import MobileScheduleView from "./views/MobileScheduleView";
import MobileTaskTrackerView from "./views/MobileTaskTrackerView";
import HabitAnalyticsView from "./views/HabitAnalyticsView";
import FinanceView from "./views/FinanceView";
import FinancialAnalyticsView from "./views/FinancialAnalyticsView";
import { initTaskStores, reloadTaskStores, immediateSave as immediateTaskSave } from "./task-tracker/stores";
import { cleanupTimers } from "./task-tracker/TimerManager";
import {
  setupNoteTaskSync,
  setupNoteRenameSync,
  setupNoteDeleteSync,
} from "./task-tracker/noteTasks";
import { initHabitStores, reloadHabitStores, immediateSave as immediateHabitSave } from "./habit-tracker/stores";
import { initFinanceStores, reloadFinanceStores, immediateFinanceSave } from "./finance/storage";
import { initFinancialAnalyticsStores, reloadFinancialAnalyticsStores, immediateAnalyticsSave } from "./finance/financialAnalyticsStorage";
import { initLocale, locale, tRaw } from "./i18n";
import CalendarNav from "./components/CalendarNav.svelte";
import DateTimeWeather from "./components/DateTimeWeather.svelte";
import Dashboard from "./dashboard/Dashboard.svelte";
import HelloView from "./components/HelloView.svelte";
import { NotificationService } from "./services/NotificationService";
import { initGistSync } from "./services/GistSyncService";
import { migrateFromSingleFile, migrateRootModuleFiles, VAULT_DATA_DIR } from "./io/vaultStorage";

declare global {
  interface Window {
    app: App;
    moment: () => Moment;
    _bundledLocaleWeekSpec: WeekSpec;
  }
}

export default class CalendarPlugin extends Plugin {
  public options: ISettings;
  private view: CalendarView;
  private ribbonIconsRegistered = false;
  private ribbonIcons: HTMLElement[] = [];
  private syncReloadTimer: ReturnType<typeof setTimeout> | null = null;
  public notificationService: NotificationService;
  private dtwPanel: DateTimeWeather | null = null;
  private dtwContainer: HTMLElement | null = null;

  onunload(): void {
    // Destroy global DateTimeWeather panel
    if (this.dtwPanel) {
      this.dtwPanel.$destroy();
      this.dtwPanel = null;
    }
    if (this.dtwContainer) {
      this.dtwContainer.remove();
      this.dtwContainer = null;
    }

    // Flush pending debounced saves before teardown
    immediateTaskSave();
    immediateHabitSave();
    immediateFinanceSave();
    immediateAnalyticsSave();

    if (this.syncReloadTimer) window.clearTimeout(this.syncReloadTimer);
    this.notificationService?.stop();
    cleanupTimers();
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_CALENDAR)
      .forEach((leaf) => leaf.detach());
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_SCHEDULE)
      .forEach((leaf) => leaf.detach());
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_MOBILE_SCHEDULE)
      .forEach((leaf) => leaf.detach());
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_MOBILE_TASKS)
      .forEach((leaf) => leaf.detach());
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_HABIT_ANALYTICS)
      .forEach((leaf) => leaf.detach());
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_FINANCE)
      .forEach((leaf) => leaf.detach());
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_FINANCIAL_ANALYTICS)
      .forEach((leaf) => leaf.detach());

    registeredMarkdownCodeBlocks.clear();

    // Remove ribbon icons explicitly (hot-reload safety)
    for (const icon of this.ribbonIcons) {
      icon.remove();
    }
    this.ribbonIcons = [];
    document.querySelectorAll("[data-mcp-ribbon]").forEach(el => el.remove());
    this.ribbonIconsRegistered = false;
  }

  async onload(): Promise<void> {
    // Initialize locale from settings
    initLocale(this.options?.language || "system");

    // Set moment locale based on i18n locale
    const currentLocale = get(locale) || "ru";
    moment.locale(currentLocale);

    // Set the app store so components can access the Obsidian App instance
    appStore.set(this.app);

    this.register(
      settings.subscribe((value) => {
        this.options = value;
        this.notificationService?.restart();
        // Update locale when language setting changes
        if (value.language) {
          initLocale(value.language);
          moment.locale(get(locale) || "ru");
        }
      })
    );

    const safeRegisterView = (type: string, factory: (leaf: WorkspaceLeaf) => View) => {
      try {
        this.registerView(type, factory);
      } catch {
        // View type already registered (hot-reload / double-load) — safe to ignore
      }
    };

    const safeRegisterMarkdownCodeBlockProcessor = (
      lang: string,
      processor: (source: string, el: HTMLElement) => void
    ) => {
      if (registeredMarkdownCodeBlocks.has(lang)) {
        return;
      }
      try {
        this.registerMarkdownCodeBlockProcessor(lang, processor);
        registeredMarkdownCodeBlocks.add(lang);
      } catch {
        // Code block processor already registered (hot-reload / double-load) — safe to ignore
        registeredMarkdownCodeBlocks.add(lang);
      }
    };

    safeRegisterView(
      VIEW_TYPE_CALENDAR,
      (leaf: WorkspaceLeaf) => {
        this.view = new CalendarView(leaf, this);
        return this.view;
      }
    );

    safeRegisterView(
      VIEW_TYPE_TASKS,
      (leaf: WorkspaceLeaf) => new TaskView(leaf)
    );

    safeRegisterView(
      VIEW_TYPE_SCHEDULE,
      (leaf: WorkspaceLeaf) => new ScheduleView(leaf, this)
    );

    safeRegisterView(
      VIEW_TYPE_MOBILE_SCHEDULE,
      (leaf: WorkspaceLeaf) => new MobileScheduleView(leaf, this)
    );

    safeRegisterView(
      VIEW_TYPE_MOBILE_TASKS,
      (leaf: WorkspaceLeaf) => new MobileTaskTrackerView(leaf, this)
    );

    safeRegisterView(
      VIEW_TYPE_HABIT_ANALYTICS,
      (leaf: WorkspaceLeaf) => new HabitAnalyticsView(leaf, this)
    );

    safeRegisterView(
      VIEW_TYPE_FINANCE,
      (leaf: WorkspaceLeaf) => new FinanceView(leaf, this)
    );

    safeRegisterView(
      VIEW_TYPE_FINANCIAL_ANALYTICS,
      (leaf: WorkspaceLeaf) => new FinancialAnalyticsView(leaf, this)
    );

    this.addCommand({
      id: "show-calendar-view",
      name: "Open view",
      checkCallback: (checking: boolean) => {
        if (checking) {
          return (
            this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length === 0
          );
        }
        this.initLeaf();
      },
    });

    this.addCommand({
      id: "open-schedule-view",
      name: tRaw("main.commands.openSchedule"),
      callback: () => this.activateScheduleView(),
    });

    this.addCommand({
      id: "open-habit-analytics",
      name: tRaw("main.commands.openAnalytics"),
      callback: () => this.activateHabitAnalyticsView(),
    });

    this.addCommand({
      id: "open-finance-view",
      name: tRaw("main.commands.openFinance"),
      callback: () => this.activateFinanceView(),
    });

    // Remove orphaned ribbon icons from previous instance (hot-reload safety)
    document.querySelectorAll("[data-mcp-ribbon]").forEach(el => el.remove());

    if (!this.ribbonIconsRegistered) {
      const tasksIcon = this.addRibbonIcon("checkbox-glyph", tRaw("main.ribbon.tasks"), () => {
        this.activateTaskView();
      });
      tasksIcon.dataset.mcpRibbon = "true";
      this.ribbonIcons.push(tasksIcon);

      const calendarIcon = this.addRibbonIcon("calendar-with-checkmark", tRaw("main.ribbon.calendar"), () => {
        this.activateCalendarView();
      });
      calendarIcon.dataset.mcpRibbon = "true";
      this.ribbonIcons.push(calendarIcon);

      const analyticsIcon = this.addRibbonIcon("bar-chart", tRaw("main.ribbon.analytics"), () => {
        this.activateHabitAnalyticsView();
      });
      analyticsIcon.dataset.mcpRibbon = "true";
      this.ribbonIcons.push(analyticsIcon);

      const financeIcon = this.addRibbonIcon("coins", tRaw("main.ribbon.finance"), () => {
        this.activateFinanceView();
      });
      financeIcon.dataset.mcpRibbon = "true";
      this.ribbonIcons.push(financeIcon);

      this.ribbonIconsRegistered = true;
    }

    // Register calendar-nav code block processor
    safeRegisterMarkdownCodeBlockProcessor("calendar-nav", (source, el) => {
      const lines = source.split("\n").filter((l) => l.trim());
      const items = lines.map((line) => {
        const [key, ...rest] = line.split(":");
        return {
          key: key.trim(),
          label: rest.length > 0 ? rest.join(":").trim() : key.trim(),
        };
      });
      if (items.length === 0) return;

      // Defaults from plugin settings
      const opts = this.options;
      let btnColor = opts.navBtnColor || "";
      let btnBg = opts.navBtnBg || "";
      let btnRadius = opts.navBtnRadius || "";
      let btnSize = opts.navBtnSize || "";
      let accentColor = opts.navAccentColor || "";

      // Override with inline % style line
      const styleLine = lines[0]?.trim();
      if (styleLine?.startsWith("%")) {
        const styleParts = styleLine.slice(1).split(";");
        for (const part of styleParts) {
          const [k, v] = part.split(":").map((s) => s.trim());
          if (k === "color") btnColor = v;
          if (k === "bg") btnBg = v;
          if (k === "radius") btnRadius = v;
          if (k === "size") btnSize = v;
          if (k === "accent") accentColor = v;
        }
        items.shift();
      }

      new CalendarNav({
        target: el,
        props: {
          items,
          btnColor,
          btnBg,
          btnRadius,
          btnSize,
          accentColor,
          onNavigate: (viewKey: string) => {
            const viewMap: Record<string, () => Promise<void> | void> = {
              schedule: () => this.activateScheduleView(),
              tasks: () => this.activateTaskView(),
              finance: () => this.activateFinanceView(),
              analytics: () => this.activateHabitAnalyticsView(),
            };
            const action = viewMap[viewKey];
            if (action) action();
          },
        },
      });
    });

    // Register datetime-weather code block processor
    safeRegisterMarkdownCodeBlockProcessor("datetime-weather", (_source, el) => {
      new DateTimeWeather({ target: el });
    });

    // Register dashboard code block processor
    safeRegisterMarkdownCodeBlockProcessor("dashboard", (_source, el) => {
      const activeFile = this.app.workspace.getActiveFile();
      new Dashboard({ target: el, props: { appInstance: this.app, filePath: activeFile?.path } });
    });

    // Register hello code block processor
    safeRegisterMarkdownCodeBlockProcessor("hello", (_source, el) => {
      new HelloView({
        target: el,
        props: {
          userName: this.options.userName || "",
          onOpenTasks: () => this.activateTaskView(),
          onOpenAnalytics: () => this.activateHabitAnalyticsView(),
          onOpenFinance: () => this.activateFinanceView(),
          onOpenSchedule: () => this.activateScheduleView(),
        },
      });
    });

    // Right-click menu: insert blocks
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu) => {
        menu.addItem((item) => {
          item.setTitle(tRaw("main.contextMenu.insertDateTimeWeather"))
            .setIcon("calendar-range")
            .onClick(() => {
              const view = this.app.workspace.activeLeaf?.view;
              if (view && "editor" in view) {
                const editor = (view as MarkdownView).editor;
                const cursor = editor.getCursor();
                editor.replaceRange("```datetime-weather\n```", cursor);
                editor.setCursor({ line: cursor.line + 1, ch: 0 });
              }
            });
        });
        menu.addItem((item) => {
          item.setTitle(tRaw("main.contextMenu.insertDashboard"))
            .setIcon("layout-grid")
            .onClick(() => {
              const view = this.app.workspace.activeLeaf?.view;
              if (view && "editor" in view) {
                const editor = (view as MarkdownView).editor;
                const cursor = editor.getCursor();
                editor.replaceRange("```dashboard\n```", cursor);
                editor.setCursor({ line: cursor.line + 1, ch: 0 });
              }
            });
        });
        menu.addItem((item) => {
          item.setTitle(tRaw("main.contextMenu.insertHello"))
            .setIcon("hand")
            .onClick(() => {
              const view = this.app.workspace.activeLeaf?.view;
              if (view && "editor" in view) {
                const editor = (view as MarkdownView).editor;
                const cursor = editor.getCursor();
                editor.replaceRange("```hello\n```", cursor);
                editor.setCursor({ line: cursor.line + 1, ch: 0 });
              }
            });
        });
      })
    );

    await this.loadOptions();

    // Apply accent color from settings
    if (this.options.accentColor) {
      applyAccentColor(this.options.accentColor);
    }
    if (this.options.glassBgColor) {
      applyGlassBgColor(this.options.glassBgColor, this.options.glassOpacity);
    }
    applyAllColors(this.options);

    // Migrate legacy calendar-data.json to per-module files (one-time, idempotent)
    await migrateFromSingleFile(this.app);

    // Migrate root-level module files to calendar-data/ (one-time, idempotent)
    await migrateRootModuleFiles(this.app);

    // Initialize task tracker (must await to prevent empty data from overwriting vault)
    await initTaskStores(this);
    setupNoteTaskSync(this.app, this);
    setupNoteRenameSync(this.app, this);
    setupNoteDeleteSync(this.app, this);

    // Initialize habit tracker (must await to prevent empty data from overwriting vault)
    await initHabitStores(this);

    // Initialize finance tracker (must await to prevent race condition where empty data overwrites vault)
    await initFinanceStores(this);

    // Initialize financial analytics (must await to prevent data loss)
    await initFinancialAnalyticsStores(this);

    // Initialize GitHub Gist sync
    initGistSync(this);

    // Initialize notification service
    this.notificationService = new NotificationService(this);
    if (this.options.notificationsEnabled) {
      void this.notificationService.start();
    }

    // Watch for vault sync file changes (modify + create)
    const debouncedSyncReload = () => {
      if (this.syncReloadTimer) window.clearTimeout(this.syncReloadTimer);
      this.syncReloadTimer = window.setTimeout(async () => {
        reloadTaskStores(this);
        reloadHabitStores(this);
        await reloadFinanceStores();
        await reloadFinancialAnalyticsStores();
      }, 500);
    };

    const isInVaultDataDir = (file: TFile) =>
      file.path.startsWith(`${VAULT_DATA_DIR}/`) || file.path === "calendar-data.json";

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && isInVaultDataDir(file)) {
          debouncedSyncReload();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && isInVaultDataDir(file)) {
          debouncedSyncReload();
        }
      })
    );

    this.addSettingTab(new CalendarSettingsTab(this.app, this));

    if (this.app.workspace.layoutReady) {
      this.initLeaf();
      this.injectDateTimeWeather();
    } else {
      this.app.workspace.onLayoutReady(() => {
        this.initLeaf();
        this.injectDateTimeWeather();
      });
    }

    // Re-inject panel when active leaf changes (move to active view)
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        if (this.options.dtwShowOnAllPages) {
          this.moveDateTimeWeatherToActiveView();
        }
      })
    );
  }

  private injectDateTimeWeather(): void {
    if (!this.options.showStatusBar) {
      this.removeDateTimeWeather();
      return;
    }

    // If container still exists in DOM, don't re-inject
    if (this.dtwContainer && document.body.contains(this.dtwContainer)) return;

    // Clean up any orphaned dtw-bar elements from previous plugin loads
    document.querySelectorAll(".mcp-dtw-global").forEach((el) => el.remove());

    this.createDateTimeWeatherPanel();
  }

  private moveDateTimeWeatherToActiveView(): void {
    if (!this.options.showStatusBar) {
      this.removeDateTimeWeather();
      return;
    }

    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf) return;

    // Don't move to sidebar leaves — only main content area
    const isSidebar = activeLeaf.view.containerEl.closest(
      ".workspace-split.left-split, .workspace-split.right-split, .workspace-split.mod-left-split, .workspace-split.mod-right-split, .sidebar"
    );
    if (isSidebar) return;

    // Always destroy old panel first to prevent duplicates
    this.removeDateTimeWeather();
    // Also clean up any orphaned elements
    document.querySelectorAll(".mcp-dtw-global").forEach((el) => el.remove());

    this.createDateTimeWeatherPanel();
  }

  private createDateTimeWeatherPanel(): void {
    const mainSplit = this.app.workspace.containerEl.querySelector(
      ".workspace-split.mod-root"
    );
    if (!mainSplit) return;

    // Find the active leaf's view-header
    const activeLeaf = this.app.workspace.activeLeaf;
    let headerEl: Element | null = null;

    if (activeLeaf?.view?.containerEl) {
      headerEl = activeLeaf.view.containerEl.querySelector(".view-header");
    }

    // Fallback to first view-header if active leaf not found
    if (!headerEl) {
      headerEl = mainSplit.querySelector(".view-header");
    }

    if (!headerEl) return;

    this.dtwContainer = createDiv({ cls: "mcp-dtw-global" });
    // Prevent clicks on dtw-bar from triggering active-leaf-change
    this.dtwContainer.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    headerEl.parentElement?.insertBefore(this.dtwContainer, headerEl.nextSibling);

    this.dtwPanel = new DateTimeWeather({
      target: this.dtwContainer,
      props: {
        onOpenCalendar: () => this.activateCalendarView(),
        onOpenFinance: () => this.activateFinanceView(),
      },
    });
  }

  private removeDateTimeWeather(): void {
    if (this.dtwPanel) {
      this.dtwPanel.$destroy();
      this.dtwPanel = null;
    }
    if (this.dtwContainer) {
      this.dtwContainer.remove();
      this.dtwContainer = null;
    }
  }

  initLeaf(): void {
    // Open calendar in right sidebar
    const existingCalLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR);
    if (existingCalLeaves.length === 0) {
      this.app.workspace.getRightLeaf(false).setViewState({
        type: VIEW_TYPE_CALENDAR,
      });
    }

    // Task tracker is NOT auto-opened on startup — user opens it via ribbon icon or command
  }

  private async activateView(viewType: string): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(viewType);
    if (existing.length) {
      // Clean up duplicate leaves (keep only the first one)
      if (existing.length > 1) {
        existing.slice(1).forEach((leaf) => leaf.detach());
      }
      workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getLeaf("tab");
    if (leaf) {
      await leaf.setViewState({ type: viewType, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  async activateScheduleView(): Promise<void> {
    return this.activateView(VIEW_TYPE_SCHEDULE);
  }

  async activateMobileScheduleView(): Promise<void> {
    return this.activateView(VIEW_TYPE_MOBILE_SCHEDULE);
  }

  async activateMobileTasksView(): Promise<void> {
    return this.activateView(VIEW_TYPE_MOBILE_TASKS);
  }

  async activateHabitAnalyticsView(): Promise<void> {
    return this.activateView(VIEW_TYPE_HABIT_ANALYTICS);
  }

  async activateFinanceView(): Promise<void> {
    return this.activateView(VIEW_TYPE_FINANCE);
  }

  async activateCalendarView(): Promise<void> {
    return this.activateView(VIEW_TYPE_CALENDAR);
  }

  async activateTaskView(): Promise<void> {
    return this.activateView(VIEW_TYPE_TASKS);
  }

  async activateFinancialAnalyticsView(): Promise<void> {
    return this.activateView(VIEW_TYPE_FINANCIAL_ANALYTICS);
  }

  /**
   * Find the actual plugin directory path inside .obsidian/plugins/.
   * The folder name may differ from manifest.id (e.g. "WorkLife Calendar" vs "calendar-plugin-remastered").
   */
  private async findPluginDir(): Promise<string | null> {
    const configDir = this.app.vault.configDir || ".obsidian";
    const pluginsDir = `${configDir}/plugins`;
    try {
      const entries = await this.app.vault.adapter.list(pluginsDir);
      for (const dir of entries.folders) {
        try {
          const manifestPath = `${dir}/manifest.json`;
          if (await this.app.vault.adapter.exists(manifestPath)) {
            const raw: string = await this.app.vault.adapter.read(manifestPath);
            const manifest: { id?: string } = JSON.parse(raw) as { id?: string };
            if (manifest.id === this.manifest.id) {
              return dir;
            }
          }
        } catch {
          // skip broken manifest
        }
      }
    } catch {
      // list failed
    }
    return null;
  }

  /**
   * loadData with adapter fallback for Obsidian ≥1.13 where Plugin.loadData()
   * may return empty even when data.json exists on disk.
   */
  async loadDataSafe(): Promise<Record<string, unknown>> {
    let data: Record<string, unknown> | null = null;
    try {
      data = await this.loadData();
    } catch {
      // base loadData failed
    }
    if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
      try {
        // Find actual plugin dir (folder name may differ from manifest.id)
        const pluginDir = await this.findPluginDir();
        if (pluginDir) {
          const dataPath = `${pluginDir}/data.json`;
          if (await this.app.vault.adapter.exists(dataPath)) {
            const content: string = await this.app.vault.adapter.read(dataPath);
            if (content) data = JSON.parse(content) as Record<string, unknown>;
          }
        }
      } catch {
        // adapter fallback failed
      }
    }
    return data || {};
  }

  async loadOptions(): Promise<void> {
    const options = await this.loadDataSafe();
    const old = { ...this.options };
    settings.update((current) => {
      return {
        ...current,
        ...(options || {}),
      };
    });

    // Always save if data.json doesn't exist (first run / fresh install)
    // This ensures the file is created so settings persist across restarts.
    if (Object.keys(options).length === 0) {
      await this.saveData(this.options);
    } else if (JSON.stringify(old) !== JSON.stringify(this.options)) {
      await this.saveData(this.options);
    }
  }

  async writeOptions(changes: Partial<ISettings>): Promise<void> {
    settings.update((old) => ({ ...old, ...changes }));
    await this.saveData(this.options);
  }
}
