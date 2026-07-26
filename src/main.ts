import moment from "moment";
import type { Moment, WeekSpec } from "moment";
import { App, Plugin, WorkspaceLeaf } from "obsidian";

import {
  VIEW_TYPE_CALENDAR,
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
  appHasPeriodicNotesPluginLoaded,
  CalendarSettingsTab,
  ISettings,
  applyAccentColor,
  applyGlassBgColor,
} from "./settings";
import { TFile } from "obsidian";
import CalendarView from "./view";
import ScheduleView from "./views/ScheduleView";
import MobileScheduleView from "./views/MobileScheduleView";
import MobileTaskTrackerView from "./views/MobileTaskTrackerView";
import HabitAnalyticsView from "./views/HabitAnalyticsView";
import FinanceView from "./views/FinanceView";
import FinancialAnalyticsView from "./views/FinancialAnalyticsView";
import { initTaskStores, reloadTaskStores, immediateSave as immediateTaskSave } from "./task-tracker/stores";
import { cleanupTimers } from "./task-tracker/TimerManager";
import { setSyncEnabled as setTaskSync } from "./task-tracker/storage";
import {
  setupNoteTaskSync,
  setupNoteRenameSync,
  setupNoteDeleteSync,
} from "./task-tracker/noteTasks";
import { initHabitStores, reloadHabitStores, immediateSave as immediateHabitSave } from "./habit-tracker/stores";
import { setSyncEnabled as setHabitSync } from "./habit-tracker/storage";
import { initFinanceStores, reloadFinanceStores, immediateFinanceSave } from "./finance/storage";
import { initFinancialAnalyticsStores, reloadFinancialAnalyticsStores, immediateAnalyticsSave } from "./finance/financialAnalyticsStorage";
import CalendarNav from "./components/CalendarNav.svelte";
import DateTimeWeather from "./components/DateTimeWeather.svelte";
import Dashboard from "./dashboard/Dashboard.svelte";
import { NotificationService } from "./services/NotificationService";
import { initGistSync } from "./services/GistSyncService";
import { syncNotificationSettingsOnLoad, migrateFromSingleFile, VAULT_DATA_DIR } from "./io/vaultStorage";

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
  private syncReloadTimer: ReturnType<typeof setTimeout> | null = null;
  private notificationService: NotificationService;
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

    if (this.syncReloadTimer) clearTimeout(this.syncReloadTimer);
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
  }

  async onload(): Promise<void> {
    // Set Russian locale for month names
    moment.locale("ru");

    // Set the app store so components can access the Obsidian App instance
    appStore.set(this.app);

    this.register(
      settings.subscribe((value) => {
        this.options = value;
        setTaskSync(!!value.syncToVault);
        setHabitSync(!!value.syncToVault);

        this.notificationService?.restart();
      })
    );

    this.registerView(
      VIEW_TYPE_CALENDAR,
      (leaf: WorkspaceLeaf) => (this.view = new CalendarView(leaf, this))
    );

    this.registerView(
      VIEW_TYPE_SCHEDULE,
      (leaf: WorkspaceLeaf) => new ScheduleView(leaf, this)
    );

    this.registerView(
      VIEW_TYPE_MOBILE_SCHEDULE,
      (leaf: WorkspaceLeaf) => new MobileScheduleView(leaf, this)
    );

    this.registerView(
      VIEW_TYPE_MOBILE_TASKS,
      (leaf: WorkspaceLeaf) => new MobileTaskTrackerView(leaf, this)
    );

    this.registerView(
      VIEW_TYPE_HABIT_ANALYTICS,
      (leaf: WorkspaceLeaf) => new HabitAnalyticsView(leaf, this)
    );

    this.registerView(
      VIEW_TYPE_FINANCE,
      (leaf: WorkspaceLeaf) => new FinanceView(leaf, this)
    );

    this.registerView(
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
      id: "open-weekly-note",
      name: "Open Weekly Note",
      checkCallback: (checking) => {
        if (checking) {
          return !appHasPeriodicNotesPluginLoaded();
        }
        if (this.view) this.view.selectDateForWeek(moment());
      },
    });

    this.addCommand({
      id: "reveal-active-note",
      name: "Reveal active note",
      callback: () => {
        if (this.view) this.view.revealActiveNote();
      },
    });

    this.addCommand({
      id: "open-schedule-view",
      name: "Открыть расписание",
      callback: () => this.activateScheduleView(),
    });

    this.addCommand({
      id: "open-habit-analytics",
      name: "Открыть аналитику",
      callback: () => this.activateHabitAnalyticsView(),
    });

    this.addCommand({
      id: "open-finance-view",
      name: "Открыть распределение финансов",
      callback: () => this.activateFinanceView(),
    });

    this.addCommand({
      id: "open-analytics",
      name: "Открыть аналитику",
      callback: () => this.activateHabitAnalyticsView(),
    });

    this.addRibbonIcon("calendar-range", "Расписание", () => {
      this.activateScheduleView();
    });

    this.addRibbonIcon("calendar-with-checkmark", "Календарь", () => {
      this.initLeaf();
    });

    this.addRibbonIcon("bar-chart", "Аналитика", () => {
      this.activateHabitAnalyticsView();
    });

    this.addRibbonIcon("coins", "Финансы", () => {
      this.activateFinanceView();
    });

    // Register calendar-nav code block processor
    this.registerMarkdownCodeBlockProcessor("calendar-nav", (source, el) => {
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
              tasks: () => this.initLeaf(),
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
    this.registerMarkdownCodeBlockProcessor("datetime-weather", (_source, el) => {
      new DateTimeWeather({ target: el });
    });

    // Register dashboard code block processor
    this.registerMarkdownCodeBlockProcessor("dashboard", (_source, el) => {
      new Dashboard({ target: el, props: { appInstance: this.app } });
    });

    // Right-click menu: insert blocks
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu) => {
        menu.addItem((item) => {
          item.setTitle("Вставить блок даты, времени и погоды")
            .setIcon("calendar-range")
            .onClick(() => {
              const view = this.app.workspace.activeLeaf?.view;
              if (view && "editor" in view) {
                const editor = (view as any).editor;
                const cursor = editor.getCursor();
                editor.replaceRange("```datetime-weather\n```", cursor);
                editor.setCursor({ line: cursor.line + 1, ch: 0 });
              }
            });
        });
        menu.addItem((item) => {
          item.setTitle("Вставить дашборд")
            .setIcon("layout-grid")
            .onClick(() => {
              const view = this.app.workspace.activeLeaf?.view;
              if (view && "editor" in view) {
                const editor = (view as any).editor;
                const cursor = editor.getCursor();
                editor.replaceRange("```dashboard\n```", cursor);
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

    // Sync notification settings to vault on load so GitHub Actions always has current data.
    // MUST await before initTaskStores — otherwise this async write reads stale vault
    // data and overwrites the entire calendar-data.json before stores finish loading.
    await syncNotificationSettingsOnLoad(this.app, {
      syncToVault: !!this.options.syncToVault,
      overdueCheckEnabled: !!this.options.overdueCheckEnabled,
      ntfyTopic: this.options.ntfyTopic,
    }).catch((e) => console.warn("[Calendar] Failed to sync notification settings to vault:", e));

    // Migrate legacy calendar-data.json to per-module files (one-time, idempotent)
    await migrateFromSingleFile(this.app);

    // Initialize task tracker
    initTaskStores(this);
    setupNoteTaskSync(this.app, this);
    setupNoteRenameSync(this.app, this);
    setupNoteDeleteSync(this.app, this);

    // Initialize habit tracker
    initHabitStores(this);

    // Initialize finance tracker (must await to prevent race condition where empty data overwrites vault)
    await initFinanceStores(this);

    // Initialize financial analytics (must await to prevent data loss)
    await initFinancialAnalyticsStores(this);

    // Initialize GitHub Gist sync
    initGistSync(this);

    // Initialize notification service
    this.notificationService = new NotificationService(this);
    if (this.options.notificationsEnabled) {
      this.notificationService.start();
    }

    // Watch for vault sync file changes (modify + create)
    const debouncedSyncReload = () => {
      if (this.syncReloadTimer) clearTimeout(this.syncReloadTimer);
      this.syncReloadTimer = setTimeout(async () => {
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

    // Destroy old panel if it exists
    this.removeDateTimeWeather();
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

    this.dtwContainer = document.createElement("div");
    this.dtwContainer.addClass("mcp-dtw-global");
    // Prevent clicks on dtw-bar from triggering active-leaf-change
    this.dtwContainer.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    headerEl.parentElement?.insertBefore(this.dtwContainer, headerEl.nextSibling);

    this.dtwPanel = new DateTimeWeather({ target: this.dtwContainer });
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
    if (this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length) {
      return;
    }
    // On mobile, open calendar in the main content area (right sidebar is hidden by default)
    const isMobile = this.app.workspace.containerEl.innerWidth <= 768;
    if (isMobile || this.options?.calendarInMainView) {
      const leaf = this.app.workspace.getLeaf("tab");
      leaf.setViewState({ type: VIEW_TYPE_CALENDAR });
    } else {
      this.app.workspace.getRightLeaf(false).setViewState({
        type: VIEW_TYPE_CALENDAR,
      });
    }
  }

  private async activateView(viewType: string): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(viewType);
    if (existing.length) {
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

  async activateFinancialAnalyticsView(): Promise<void> {
    return this.activateView(VIEW_TYPE_FINANCIAL_ANALYTICS);
  }

  async loadOptions(): Promise<void> {
    const options = await this.loadData();
    const old = { ...this.options };
    settings.update((current) => {
      return {
        ...current,
        ...(options || {}),
      };
    });

    if (JSON.stringify(old) !== JSON.stringify(this.options)) {
      await this.saveData(this.options);
    }
  }

  async writeOptions(changes: Partial<ISettings>): Promise<void> {
    settings.update((old) => ({ ...old, ...changes }));
    await this.saveData(this.options);
  }
}
