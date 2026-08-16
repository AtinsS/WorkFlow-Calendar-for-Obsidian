import { App, PluginSettingTab, Setting, TFolder, TextComponent, requestUrl } from "obsidian";
import { generateId } from "./utils/id";
import { appHasDailyNotesPluginLoaded } from "obsidian-daily-notes-interface";
import type { ILocaleOverride } from "obsidian-calendar-ui";
import { get } from "svelte/store";

import { DEFAULT_WORDS_PER_DOT } from "src/constants";
import { FolderSuggestModal } from "./modals/FolderSuggestModal";
import {
  clearNotificationHistory,
  loadNotificationDiagnostics,
  recordNotificationEvent,
} from "./services/notificationTelemetry";

import type CalendarPlugin from "./main";

export interface ISettings {
  wordsPerDot: number;
  shouldConfirmBeforeCreate: boolean;

  // Weekly Note settings
  showWeeklyNote: boolean;
  weeklyNoteFormat: string;
  weeklyNoteTemplate: string;
  weeklyNoteFolder: string;

  localeOverride: ILocaleOverride;

  // Task Tracker settings
  taskTrackerCollapsed: boolean;
  showTaskTracker?: boolean; // show/hide task tracker in sidebar
  showSchedule?: boolean; // show/hide schedule view

  // Dashboard widget settings
  dashboardShowTasks?: boolean;
  dashboardShowHabits?: boolean;
  dashboardShowGoals?: boolean;

  // Hello view settings
  userName?: string;
  helloShowTasksBtn?: boolean;
  helloShowAnalyticsBtn?: boolean;
  helloShowFinanceBtn?: boolean;
  helloShowScheduleBtn?: boolean;

  // Task-Note sync settings
  syncAllTasksToNotes: boolean;
  tasksFolderPath: string;
  autoCleanupThreshold: number;
  timeLogCleanupThreshold: number;

  // Habit Tracker settings
  habitLogCleanupThreshold: number;

  // Sync settings
  syncToVault: boolean;

  // Notification settings
  notificationsEnabled: boolean;
  reminderMinutesBefore: number;
  checkIntervalMs: number;
  notifyReminders: boolean;
  notifyOverdue: boolean;
  notifyEstimateExceeded: boolean;
  notifyDeadlines: boolean;

  // ntfy.sh settings
  ntfyEnabled: boolean;
  ntfyTopic: string;

  // GitHub Actions notification settings
  overdueCheckEnabled: boolean;

  // Work task settings
  defaultPaymentType: "hour" | "day";
  defaultRate: number;

  // GitHub Actions test settings
  vaultRepo?: string;
  workflowToken?: string;

  // GitHub Gist sync settings
  githubToken?: string;
  gistId?: string;
  gistUrl?: string;
  gistRawUrl?: string;
  gistAutoSync?: boolean;

  // Appearance
  accentColor?: string;
  glassBgColor?: string;
  glassOpacity?: number;

  // Color settings
  bgColor?: string;
  surfaceColor?: string;
  surface2Color?: string;
  surfaceHoverColor?: string;
  successColor?: string;
  dangerColor?: string;
  warningColor?: string;
  amberColor?: string;
  glassBorderColor?: string;
  glassHighlightColor?: string;
  textColor?: string;
  textMutedColor?: string;
  textFaintColor?: string;

  // Schedule display settings
  scheduleShowTime: boolean;
  scheduleShowStatus: boolean;
  scheduleShowPriority: boolean;
  scheduleShowWorkBadge: boolean;
  scheduleShowNoteBadge: boolean;
  scheduleShowDeadline: boolean;
  scheduleShowOverdue: boolean;
  scheduleShowDescription: boolean;
  scheduleShowNowIndicator: boolean;
  scheduleShowDeadlineEvents: boolean;

  // Weather settings
  weatherEnabled: boolean;
  weatherLatitude: number;
  weatherLongitude: number;

  // Status bar
  showStatusBar: boolean;
  dtwShowOnAllPages: boolean;

  // SingularityApp sync settings
  singularityToken?: string;
  singularityAutoSync?: boolean;
  singularitySyncInterval?: number; // minutes, default 5
  singularitySyncDirection?: "both" | "push" | "pull";
  singularitySyncDryRun?: boolean; // log actions without making API calls
  singularitySyncExcludeTags?: string; // comma-separated tags to exclude from sync
  singularityLastSync?: number; // epoch ms
  singularityProjectMap?: Record<string, string>; // localProjectId -> singularityProjectId

  // Nav panel button style
  navBtnColor?: string;
  navBtnBg?: string;
  navBtnRadius?: string;
  navBtnSize?: string;
  navAccentColor?: string;
}

export const defaultSettings = Object.freeze({
  shouldConfirmBeforeCreate: true,

  wordsPerDot: DEFAULT_WORDS_PER_DOT,

  calendarInMainView: false,

  showWeeklyNote: false,
  weeklyNoteFormat: "",
  weeklyNoteTemplate: "",
  weeklyNoteFolder: "",

  localeOverride: "system-default",

  dashboardShowTasks: true,
  dashboardShowHabits: true,
  dashboardShowGoals: true,
  helloShowTasksBtn: true,
  helloShowAnalyticsBtn: true,
  helloShowFinanceBtn: true,
  helloShowScheduleBtn: true,

  taskTrackerCollapsed: false,
  showTaskTracker: true,
  showSchedule: true,

  syncAllTasksToNotes: false,
  tasksFolderPath: "Tasks",
  autoCleanupThreshold: 180,
  timeLogCleanupThreshold: 180,

  habitLogCleanupThreshold: 1000,

  syncToVault: true,

  notificationsEnabled: false,
  reminderMinutesBefore: 5,
  checkIntervalMs: 60000,
  notifyReminders: true,
  notifyOverdue: true,
  notifyEstimateExceeded: true,
  notifyDeadlines: true,

  ntfyEnabled: false,
  ntfyTopic: "",

  overdueCheckEnabled: false,

  defaultPaymentType: "hour" as "hour" | "day",
  defaultRate: 0,

  accentColor: "#5f99e1",
  glassBgColor: "#1e2332",
  glassOpacity: 55,

  // Color defaults
  bgColor: "#0E0F13",
  surfaceColor: "#171A21",
  surface2Color: "#1E222B",
  surfaceHoverColor: "#252A36",
  successColor: "#3DD68C",
  dangerColor: "#F06565",
  warningColor: "#F5A623",
  amberColor: "#F5A623",
  glassBorderColor: "rgba(255, 255, 255, 0.06)",
  glassHighlightColor: "rgba(255, 255, 255, 0.02)",
  textColor: "#E8ECF0",
  textMutedColor: "#b7b8bb",
  textFaintColor: "#3A3F4B",

  scheduleShowTime: true,
  scheduleShowStatus: true,
  scheduleShowPriority: true,
  scheduleShowWorkBadge: true,
  scheduleShowNoteBadge: true,
  scheduleShowDeadline: true,
  scheduleShowOverdue: true,
  scheduleShowDescription: true,
  scheduleShowNowIndicator: true,
  scheduleShowDeadlineEvents: true,

  weatherEnabled: false,
  weatherLatitude: 55.75,
  weatherLongitude: 37.62,

  showStatusBar: true,
  dtwShowOnAllPages: false,

  singularityAutoSync: false,
  singularitySyncInterval: 5,
  singularitySyncDirection: "both" as "both" | "push" | "pull",
  singularitySyncDryRun: false,
  singularitySyncExcludeTags: "",
  singularityProjectMap: {},

  navBtnColor: "",
  navBtnBg: "",
  navBtnRadius: "",
  navBtnSize: "",
  navAccentColor: "",
});

export function applyAccentColor(hex: string): void {
  const root = document.documentElement;
  // Parse hex to rgb
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  root.style.setProperty("--mcp-accent", `rgba(${r}, ${g}, ${b}, 0.55)`);
  root.style.setProperty("--mcp-accent-dim", `rgba(${r}, ${g}, ${b}, 0.10)`);
  root.style.setProperty("--mcp-accent-faint", `rgba(${r}, ${g}, ${b}, 0.15)`);
  root.style.setProperty(
    "--mcp-accent-ultra-dim",
    `rgba(${r}, ${g}, ${b}, 0.08)`,
  );
  root.style.setProperty("--mcp-accent-hover", `rgba(${r}, ${g}, ${b}, 0.18)`);
  root.style.setProperty("--mcp-accent-glow", `rgba(${r}, ${g}, ${b}, 0.18)`);

  // Also set Obsidian's --interactive-accent so finance/analytics views follow the color
  root.style.setProperty(
    "--interactive-accent",
    `rgba(${r}, ${g}, ${b}, 0.55)`,
  );
  root.style.setProperty("--text-on-accent", "#fff");
  root.style.setProperty("--text-accent", `rgba(${r}, ${g}, ${b}, 0.9)`);

  // Calendar nav arrows and title
  root.style.setProperty("--color-arrow", `rgba(${r}, ${g}, ${b}, 0.7)`);
  root.style.setProperty("--color-text-title", `rgba(${r}, ${g}, ${b}, 0.9)`);
}

export function applyGlassBgColor(hex: string, opacity?: number): void {
  const root = document.documentElement;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const alpha = opacity != null ? opacity / 100 : 0.55;

  root.style.setProperty("--mcp-glass-bg", `rgba(${r}, ${g}, ${b}, ${alpha})`);
  root.style.setProperty(
    "--mcp-glass-highlight",
    `rgba(${r + 5}, ${g + 5}, ${b + 5}, ${Math.max(0.01, alpha * 0.05)})`,
  );
}

export function applyAllColors(options: ISettings): void {
  const root = document.documentElement;

  const setIfHas = (cssVar: string, value?: string) => {
    if (value) root.style.setProperty(cssVar, value);
  };

  setIfHas("--mcp-bg", options.bgColor);
  setIfHas("--mcp-surface", options.surfaceColor);
  setIfHas("--mcp-surface-2", options.surface2Color);
  setIfHas("--mcp-surface-hover", options.surfaceHoverColor);
  setIfHas("--mcp-success", options.successColor);
  setIfHas("--mcp-danger", options.dangerColor);
  setIfHas("--mcp-warning", options.warningColor);
  setIfHas("--mcp-amber", options.amberColor);
  setIfHas("--mcp-text", options.textColor);
  setIfHas("--mcp-text-muted", options.textMutedColor);
  setIfHas("--mcp-text-faint", options.textFaintColor);

  if (options.glassBorderColor) {
    root.style.setProperty("--mcp-glass-border", options.glassBorderColor);
  }
  if (options.glassHighlightColor) {
    root.style.setProperty("--mcp-glass-highlight", options.glassHighlightColor);
  }
}

export function appHasPeriodicNotesPluginLoaded(): boolean {
  // Undocumented periodic-notes plugin API
  const appWithPlugins = window.app as unknown as {
    plugins: {
      getPlugin: (id: string) => {
        settings?: { weekly?: { enabled?: boolean } };
      };
    };
  };
  const periodicNotes = appWithPlugins.plugins.getPlugin("periodic-notes");
  return periodicNotes && periodicNotes.settings?.weekly?.enabled;
}

export class CalendarSettingsTab extends PluginSettingTab {
  private plugin: CalendarPlugin;
  private activeTab = "general";
  private ntfyTopicText: TextComponent | null = null;

  constructor(app: App, plugin: CalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

    // Coffee banner
    const coffeeBanner = this.containerEl.createDiv({
      cls: "settings-coffee-banner",
    });
    const coffeeTitle = coffeeBanner.createEl("h3", {
      cls: "settings-coffee-title",
    });
    coffeeTitle.textContent = "☕ Купить автору кофе";
    const coffeeDesc = coffeeBanner.createEl("p", {
      cls: "settings-coffee-desc",
    });
    coffeeDesc.textContent =
      "Если плагин оказался полезен — угостите автора кофе!";
    const coffeeBtn = coffeeBanner.createEl("a", {
      cls: "settings-coffee-btn",
      text: "Поддержать",
      href: "https://pay.cloudtips.ru/p/cbaa3c81",
    });
    coffeeBtn.setAttribute("target", "_blank");
    coffeeBtn.setAttribute("rel", "noopener");

    if (!appHasDailyNotesPluginLoaded()) {
      this.containerEl.createDiv("settings-banner", (banner) => {
        banner.createEl("h3", {
          text: "⚠️ Плагин Daily Notes не включён",
        });
        banner.createEl("p", {
          cls: "setting-item-description",
          text: "Календарь лучше всего работает в связке с плагинами Daily Notes или Periodic Notes (доступны в каталоге плагинов).",
        });
      });
    }

    // Tab bar
    const tabBar = this.containerEl.createDiv({ cls: "settings-tab-bar" });
    const tabs: { key: string; label: string }[] = [
      { key: "general", label: "Общее" },
      { key: "colors", label: "Цвета" },
      { key: "schedule", label: "Расписание" },
      { key: "sync", label: "Синхронизация" },
      { key: "notifications", label: "Уведомления" },
      { key: "work", label: "Рабочие" },
      { key: "nav", label: "Навигация" },
    ];

    const tabButtons: Record<string, HTMLButtonElement> = {};
    const tabContainers: Record<string, HTMLDivElement> = {};

    for (const tab of tabs) {
      const btn = tabBar.createEl("button", {
        cls: "settings-tab-btn",
        text: tab.label,
      });
      tabButtons[tab.key] = btn;
      btn.addEventListener("click", () => this.switchTab(tab.key));
    }

    // Tab content containers
    for (const tab of tabs) {
      const container = this.containerEl.createDiv({
        cls: "settings-tab-content",
      });
      container.style.display = tab.key === this.activeTab ? "" : "none";
      tabContainers[tab.key] = container;
    }

    // Highlight active tab
    tabButtons[this.activeTab]?.addClass("active");

    // General tab
    const general = tabContainers["general"];
    this.addShowStatusBarSetting(general);
    this.addDtwShowOnAllPagesSetting(general);
    this.addUserNameSetting(general);

    general.createEl("h4", { text: "Виджеты дашборда" });

    new Setting(general)
      .setName("Виджет задач на сегодня")
      .setDesc("Показывать количество задач и прогресс-бар в дашборде")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.dashboardShowTasks !== false);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ dashboardShowTasks: value });
        });
      });

    new Setting(general)
      .setName("Виджет привычек")
      .setDesc("Показывать streak и выполненные привычки в дашборде")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.dashboardShowHabits !== false);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ dashboardShowHabits: value });
        });
      });

    new Setting(general)
      .setName("Виджет целей")
      .setDesc("Показывать цели месяца в дашборде")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.dashboardShowGoals !== false);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ dashboardShowGoals: value });
        });
      });



    // Colors tab
    const colors = tabContainers["colors"];
    colors.createEl("h3", { text: "Внешний вид" });
    this.addAccentColorSetting(colors);
    this.addGlassBgColorSetting(colors);
    this.addColorSettings(colors);

    // Schedule tab
    const schedule = tabContainers["schedule"];
    schedule.createEl("h3", { text: "Отображаемые элементы" });
    this.addScheduleDisplaySettings(schedule);
    schedule.createEl("h3", { text: "Погода" });
    this.addWeatherSettings(schedule);

    // Sync tab
    const sync = tabContainers["sync"];
    sync.createEl("h3", { text: "Синхронизация задач с заметками" });
    this.addTaskNoteSyncSettings(sync);
    this.addGitHubGistSettings(sync);
    this.addSingularitySettings(sync);

    // Notifications tab
    const notif = tabContainers["notifications"];
    this.addNotificationSettings(notif);

    // Work tab
    const work = tabContainers["work"];
    this.addWorkTaskSettings(work);

    // Nav tab
    const nav = tabContainers["nav"];
    nav.createEl("h3", { text: "Панель навигации в заметках" });
    this.addNavPanelInstructions(nav);
    nav.createEl("h3", { text: "Стиль кнопок" });
    this.addNavBtnStyleSettings(nav);

    // Store references for switchTab
    this._tabButtons = tabButtons;
    this._tabContainers = tabContainers;
  }

  private _tabButtons: Record<string, HTMLButtonElement> = {};
  private _tabContainers: Record<string, HTMLDivElement> = {};

  private switchTab(key: string): void {
    this.activeTab = key;
    for (const [k, btn] of Object.entries(this._tabButtons)) {
      btn.toggleClass("active", k === key);
    }
    for (const [k, container] of Object.entries(this._tabContainers)) {
      container.style.display = k === key ? "" : "none";
    }
  }

  addUserNameSetting(container: HTMLElement): void {
    new Setting(container)
      .setName("Ваше имя")
      .setDesc("Имя будет отображаться в приветствии")
      .addText((text) => {
        text
          .setPlaceholder("Введите имя...")
          .setValue(this.plugin.options.userName || "")
          .onChange(async (value) => {
            await this.plugin.writeOptions({ userName: value });
          });
        text.inputEl.style.maxWidth = "250px";
      });

    new Setting(container)
      .setName("Кнопки навигации в приветствии")
      .setDesc("Выберите, какие кнопки отображать в приветствии");

    new Setting(container)
      .setName("Кнопка «Задачи»")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.helloShowTasksBtn !== false);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ helloShowTasksBtn: value });
        });
      });

    new Setting(container)
      .setName("Кнопка «Аналитика»")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.helloShowAnalyticsBtn !== false);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ helloShowAnalyticsBtn: value });
        });
      });

    new Setting(container)
      .setName("Кнопка «Финансы»")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.helloShowFinanceBtn !== false);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ helloShowFinanceBtn: value });
        });
      });

    new Setting(container)
      .setName("Кнопка «Расписание»")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.helloShowScheduleBtn !== false);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ helloShowScheduleBtn: value });
        });
      });

    // Instructions for adding hello block
    const helloInstructions = container.createDiv({ cls: "settings-banner" });
    helloInstructions.createEl("h4", { text: "👋 Приветствие" });
    helloInstructions.createEl("p", {
      text: "Чтобы добавить приветствие с виджетом привычек, создайте блок кода в любой заметке:",
    });
    const codeBlock = helloInstructions.createEl("pre");
    codeBlock.createEl("code", { text: "```hello\n```" });
    codeBlock.style.cssText = "background: var(--background-secondary); padding: 8px 12px; border-radius: 6px; font-size: 13px; margin: 8px 0;";
    helloInstructions.createEl("p", {
      text: "Или вставьте через правое меню: ПКМ → Вставить приветствие",
    });
  }

  addShowStatusBarSetting(container: HTMLElement): void {
    new Setting(container)
      .setName("Панель информации")
      .setDesc(
        "Отображать панель с датой, временем, погодой и задачами под вкладками",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.showStatusBar);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ showStatusBar: value });
          // Toggle visibility in real-time
          const el = document.querySelector(".mcp-dtw-global");
          if (el) (el as HTMLElement).style.display = value ? "" : "none";
        });
      });
  }

  addDtwShowOnAllPagesSetting(container: HTMLElement): void {
    new Setting(container)
      .setName("Панель на всех страницах")
      .setDesc(
        "Показывать панель информации на каждой открытой вкладке (иначе — только на первой)",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.dtwShowOnAllPages);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ dtwShowOnAllPages: value });
        });
      });
  }

  private getVaultFolders(): string[] {
    const folders: string[] = [];
    const root = this.app.vault.getRoot();
    const walk = (folder: TFolder) => {
      for (const child of folder.children || []) {
        if (child instanceof TFolder) {
          folders.push(child.path);
          walk(child);
        }
      }
    };
    walk(root);
    return folders.sort();
  }

  addScheduleDisplaySettings(container: HTMLElement): void {
    const opts = this.plugin.options;
    const items: { key: string; name: string; desc: string }[] = [
      {
        key: "scheduleShowTime",
        name: "Время",
        desc: "Отображать запланированное время задачи",
      },
      {
        key: "scheduleShowStatus",
        name: "Статус",
        desc: "Бейдж статуса (В работе / На паузе / Готово)",
      },
      {
        key: "scheduleShowPriority",
        name: "Приоритет",
        desc: "Иконка приоритета (! высокий, ~ средний)",
      },
      {
        key: "scheduleShowWorkBadge",
        name: "Рабочая задача",
        desc: "Бейдж рабочей задачи",
      },
      {
        key: "scheduleShowNoteBadge",
        name: "Привязанная заметка",
        desc: "Иконка привязанной заметки",
      },
      {
        key: "scheduleShowDeadline",
        name: "Дедлайн",
        desc: "Отображать дедлайн (полупрозрачный бейдж)",
      },
      {
        key: "scheduleShowOverdue",
        name: "Просрочено",
        desc: "Показывать время просрочки",
      },
      {
        key: "scheduleShowDescription",
        name: "Описание",
        desc: "Краткое описание задачи под заголовком",
      },
      {
        key: "scheduleShowNowIndicator",
        name: "Текущее время",
        desc: "Индикатор текущего времени в расписании",
      },
      {
        key: "scheduleShowDeadlineEvents",
        name: "Дедлайн-задачи",
        desc: "Отдельные задачи-дедлайны в расписании (красные полупрозрачные)",
      },
    ];
    for (const item of items) {
      new Setting(container)
        .setName(item.name)
        .setDesc(item.desc)
        .addToggle((toggle) => {
          toggle.setValue(opts[item.key as keyof typeof opts] as boolean);
          toggle.onChange(async (value) => {
            await this.plugin.writeOptions({ [item.key]: value });
          });
        });
    }
  }

  addWeatherSettings(container: HTMLElement): void {
    const opts = this.plugin.options;

    new Setting(container)
      .setName("Показывать погоду")
      .setDesc(
        "Отображать прогноз погоды в заголовках дней недели (Open-Meteo)",
      )
      .addToggle((toggle) => {
        toggle.setValue(opts.weatherEnabled);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ weatherEnabled: value });
        });
      });

    new Setting(container)
      .setName("Широта")
      .setDesc("Широта вашего местоположения (например: 55.75 для Москвы)")
      .addText((text) => {
        text
          .setPlaceholder("55.75")
          .setValue(String(opts.weatherLatitude ?? 55.75))
          .onChange(async (value) => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= -90 && num <= 90) {
              await this.plugin.writeOptions({ weatherLatitude: num });
            }
          });
        text.inputEl.type = "number";
        text.inputEl.min = "-90";
        text.inputEl.max = "90";
        text.inputEl.step = "0.01";
        text.inputEl.style.maxWidth = "120px";
      });

    new Setting(container)
      .setName("Долгота")
      .setDesc("Долгота вашего местоположения (например: 37.62 для Москвы)")
      .addText((text) => {
        text
          .setPlaceholder("37.62")
          .setValue(String(opts.weatherLongitude ?? 37.62))
          .onChange(async (value) => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= -180 && num <= 180) {
              await this.plugin.writeOptions({ weatherLongitude: num });
            }
          });
        text.inputEl.type = "number";
        text.inputEl.min = "-180";
        text.inputEl.max = "180";
        text.inputEl.step = "0.01";
        text.inputEl.style.maxWidth = "120px";
      });

    // Weather animation previews
    this.addWeatherPreviews(container);
  }

  private addWeatherPreviews(container: HTMLElement): void {
    const wrapper = container.createDiv({ cls: "weather-previews" });
    wrapper.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;";

    const styles = document.createElement("style");
    styles.textContent = `
      .wp-card {
        position:relative;overflow:hidden;border-radius:10px;
        width:110px;height:100px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;gap:4px;
        border:1px solid var(--background-modifier-border);
      }
      .wp-label { font-size:10px;color:var(--text-muted);font-weight:600;z-index:1; }
      .wp-emoji { font-size:28px;z-index:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3)); }

      /* Sun */
      .wp-sun { background:linear-gradient(180deg,rgba(255,183,77,0.08) 0%,transparent 100%); }
      .wp-sun-obj { position:absolute;top:6px;right:6px;width:50px;height:50px;animation:wp-sun-p 3s ease-in-out infinite; }
      .wp-sun-core { position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:radial-gradient(circle,rgba(255,214,0,0.3) 0%,rgba(255,183,77,0.1) 60%,transparent 100%);box-shadow:0 0 20px rgba(255,214,0,0.15); }
      .wp-sun-ray { position:absolute;top:50%;left:50%;width:1px;height:18px;background:linear-gradient(180deg,rgba(255,214,0,0.2),transparent);transform-origin:center top;border-radius:1px; }
      @keyframes wp-sun-p { 0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.08);opacity:1} }

      /* Clouds */
      .wp-clouds { background:linear-gradient(180deg,rgba(100,130,180,0.06) 0%,transparent 100%); }
      .wp-cloud { position:absolute;left:-80px;width:80px;height:28px;background:radial-gradient(ellipse at center,rgba(200,210,220,0.25) 0%,transparent 70%);border-radius:50%;animation:wp-cd 12s linear infinite; }
      @keyframes wp-cd { 0%{transform:translateX(-80px)}100%{transform:translateX(200px)} }

      /* Gloom */
      .wp-gloom { background:linear-gradient(180deg,rgba(40,40,55,0.15) 0%,rgba(50,50,60,0.08) 100%); }

      /* Rain */
      .wp-rain { background:linear-gradient(180deg,rgba(60,80,120,0.08) 0%,transparent 100%); }
      .wp-drop { position:absolute;top:-10px;width:1.5px;height:10px;background:linear-gradient(180deg,transparent,rgba(120,180,255,0.35));border-radius:0 0 2px 2px;animation:wp-rf linear infinite; }
      @keyframes wp-rf { 0%{transform:translateY(-10px);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translateY(120px);opacity:0} }

      /* Storm */
      .wp-storm { background:linear-gradient(180deg,rgba(30,30,50,0.12) 0%,transparent 100%);animation:wp-sf 3s ease-in-out infinite; }
      .wp-drop.h { width:2px;height:14px;background:linear-gradient(180deg,transparent,rgba(120,180,255,0.5)); }
      @keyframes wp-sf { 0%,93%,100%{opacity:1}94%{opacity:.8} }
    `;
    wrapper.appendChild(styles);

    const cards = [
      { cls: "wp-sun", emoji: "☀️", label: "Солнечно", code: "0,1", anim: "sun" },
      { cls: "wp-clouds", emoji: "⛅", label: "Облачно", code: "2", anim: "clouds" },
      { cls: "wp-gloom", emoji: "☁️", label: "Пасмурно", code: "3", anim: "gloom" },
      { cls: "wp-rain", emoji: "🌧️", label: "Дождь", code: "51–67", anim: "rain" },
      { cls: "wp-storm", emoji: "⛈️", label: "Гроза", code: "95–99", anim: "storm" },
    ];

    for (const c of cards) {
      const card = wrapper.createDiv({ cls: `wp-card ${c.cls}` });

      if (c.anim === "sun") {
        const sun = card.createDiv({ cls: "wp-sun-obj" });
        sun.createDiv({ cls: "wp-sun-core" });
        for (let i = 0; i < 8; i++) {
          const ray = sun.createDiv({ cls: "wp-sun-ray" });
          ray.style.transform = `rotate(${i * 45}deg)`;
        }
      }
      if (c.anim === "clouds") {
        for (let i = 0; i < 3; i++) {
          const cl = card.createDiv({ cls: "wp-cloud" });
          cl.style.top = `${15 + i * 25}%`;
          cl.style.animationDelay = `${i * 3}s`;
          cl.style.opacity = String(0.15 + Math.random() * 0.15);
        }
      }
      if (c.anim === "gloom") {
        card.createDiv().style.cssText = "position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(180deg,rgba(50,50,60,0.12) 0%,rgba(60,60,70,0.06) 100%);";
      }
      if (c.anim === "rain") {
        for (let i = 0; i < 20; i++) {
          const d = card.createDiv({ cls: "wp-drop" });
          d.style.left = `${Math.random() * 100}%`;
          d.style.animationDelay = `${Math.random() * 2}s`;
          d.style.animationDuration = `${0.4 + Math.random() * 0.4}s`;
        }
      }
      if (c.anim === "storm") {
        for (let i = 0; i < 30; i++) {
          const d = card.createDiv({ cls: "wp-drop h" });
          d.style.left = `${Math.random() * 100}%`;
          d.style.animationDelay = `${Math.random() * 1.5}s`;
          d.style.animationDuration = `${0.3 + Math.random() * 0.3}s`;
        }
      }

      const emoji = card.createDiv({ cls: "wp-emoji" });
      emoji.textContent = c.emoji;
      const label = card.createDiv({ cls: "wp-label" });
      label.textContent = `${c.label} (${c.code})`;
    }
  }

  addAccentColorSetting(container: HTMLElement): void {
    const currentColor = this.plugin.options.accentColor || "#5f99e1";

    const setting = new Setting(container)
      .setName("Акцентный цвет")
      .setDesc("Основной цвет подсветки кнопок, выделений и активных элементов")
      .addColorPicker((picker) => {
        picker.setValue(currentColor).onChange(async (value) => {
          await this.plugin.writeOptions({ accentColor: value });
          applyAccentColor(value);
        });
      });

    // Add a reset button
    setting.addButton((btn) =>
      btn
        .setButtonText("Сбросить")
        .setTooltip("Вернуть цвет по умолчанию")
        .onClick(async () => {
          const defaultColor = "#5f99e1";
          await this.plugin.writeOptions({ accentColor: defaultColor });
          applyAccentColor(defaultColor);
          this.display();
        }),
    );
  }

  addGlassBgColorSetting(container: HTMLElement): void {
    const currentColor = this.plugin.options.glassBgColor || "#1e2332";
    const currentOpacity = this.plugin.options.glassOpacity ?? 55;

    const setting = new Setting(container)
      .setName("Фон стеклянных панелей")
      .setDesc("Цвет фона панелей задач, привычек, расписания и модальных окон")
      .addColorPicker((picker) => {
        picker.setValue(currentColor).onChange(async (value) => {
          await this.plugin.writeOptions({ glassBgColor: value });
          applyGlassBgColor(value, this.plugin.options.glassOpacity);
        });
      });

    setting.addButton((btn) =>
      btn
        .setButtonText("Сбросить")
        .setTooltip("Вернуть цвет по умолчанию")
        .onClick(async () => {
          const defaultColor = "#1e2332";
          await this.plugin.writeOptions({
            glassBgColor: defaultColor,
            glassOpacity: 55,
          });
          applyGlassBgColor(defaultColor, 55);
          this.display();
        }),
    );

    new Setting(container)
      .setName("Прозрачность панелей")
      .setDesc(`Непрозрачность фона стеклянных панелей: ${currentOpacity}%`)
      .addSlider((slider) => {
        slider
          .setLimits(0, 100, 5)
          .setValue(currentOpacity)
          .setDynamicTooltip()
          .onChange(async (value) => {
            await this.plugin.writeOptions({ glassOpacity: value });
            applyGlassBgColor(
              this.plugin.options.glassBgColor || "#1e2332",
              value,
            );
            // Update description with current value
            slider.sliderEl
              .closest(".setting-item")
              ?.querySelector(".setting-item-description")
              ?.setText(`Непрозрачность фона стеклянных панелей: ${value}%`);
          });
      });
  }

  addColorSettings(container: HTMLElement): void {
    container.createEl("h3", { text: "Цвета интерфейса" });

    // Main colors
    container.createEl("h4", { text: "Основные цвета" });

    this.addColorPickerSetting(
      container,
      "Цвет фона",
      "Основной цвет фона приложения",
      "bgColor",
      "#0E0F13"
    );

    this.addColorPickerSetting(
      container,
      "Цвет поверхности",
      "Цвет панелей и карточек",
      "surfaceColor",
      "#171A21"
    );

    this.addColorPickerSetting(
      container,
      "Цвет поверхности 2",
      "Вторичный цвет поверхностей",
      "surface2Color",
      "#1E222B"
    );

    this.addColorPickerSetting(
      container,
      "Цвет при наведении",
      "Цвет при наведении на элементы",
      "surfaceHoverColor",
      "#252A36"
    );

    // Semantic colors
    container.createEl("h4", { text: "Семантические цвета" });

    this.addColorPickerSetting(
      container,
      "Цвет успеха",
      "Для завершённых задач и положительных действий",
      "successColor",
      "#3DD68C"
    );

    this.addColorPickerSetting(
      container,
      "Цвет опасности",
      "Для просроченных задач и ошибок",
      "dangerColor",
      "#F06565"
    );

    this.addColorPickerSetting(
      container,
      "Цвет предупреждений",
      "Для предупреждений и важных уведомлений",
      "warningColor",
      "#F5A623"
    );

    this.addColorPickerSetting(
      container,
      "Цвет янтаря",
      "Для дедлайнов и особых выделений",
      "amberColor",
      "#F5A623"
    );

    // Text colors
    container.createEl("h4", { text: "Цвета текста" });

    this.addColorPickerSetting(
      container,
      "Основной текст",
      "Цвет основного текста",
      "textColor",
      "#E8ECF0"
    );

    this.addColorPickerSetting(
      container,
      "Приглушённый текст",
      "Цвет вторичного текста",
      "textMutedColor",
      "#b7b8bb"
    );

    this.addColorPickerSetting(
      container,
      "Тусклый текст",
      "Цвет менее важного текста",
      "textFaintColor",
      "#3A3F4B"
    );

    // Glass panel colors
    container.createEl("h4", { text: "Стеклянные панели" });

    this.addColorPickerSetting(
      container,
      "Граница панелей",
      "Цвет границ стеклянных панелей",
      "glassBorderColor",
      "rgba(255, 255, 255, 0.06)"
    );

    this.addColorPickerSetting(
      container,
      "Подсветка панелей",
      "Цвет подсветки стеклянных панелей",
      "glassHighlightColor",
      "rgba(255, 255, 255, 0.02)"
    );

    // Reset all button
    new Setting(container)
      .setName("Сбросить все цвета")
      .setDesc("Вернуть все цвета к значениям по умолчанию")
      .addButton((btn) =>
        btn
          .setButtonText("Сбросить все")
          .setWarning()
          .onClick(async () => {
            await this.plugin.writeOptions({
              bgColor: "#0E0F13",
              surfaceColor: "#171A21",
              surface2Color: "#1E222B",
              surfaceHoverColor: "#252A36",
              successColor: "#3DD68C",
              dangerColor: "#F06565",
              warningColor: "#F5A623",
              amberColor: "#F5A623",
              glassBorderColor: "rgba(255, 255, 255, 0.06)",
              glassHighlightColor: "rgba(255, 255, 255, 0.02)",
              textColor: "#E8ECF0",
              textMutedColor: "#b7b8bb",
              textFaintColor: "#3A3F4B",
            });
            this.display();
          }),
      );
  }

  private addColorPickerSetting(
    container: HTMLElement,
    name: string,
    desc: string,
    key: string,
    defaultValue: string
  ): void {
    const currentColor = (this.plugin.options as any)[key] || defaultValue;

    new Setting(container)
      .setName(name)
      .setDesc(desc)
      .addColorPicker((picker) => {
        picker.setValue(currentColor).onChange(async (value) => {
          await this.plugin.writeOptions({ [key]: value } as any);
          applyAllColors(this.plugin.options);
        });
      })
      .addButton((btn) =>
        btn
          .setButtonText("Сбросить")
          .setTooltip("Вернуть цвет по умолчанию")
          .onClick(async () => {
            await this.plugin.writeOptions({ [key]: defaultValue } as any);
            applyAllColors(this.plugin.options);
            this.display();
          })
      );
  }

  addTaskNoteSyncSettings(container: HTMLElement): void {
    new Setting(container)
      .setName("Создавать Task заметку для каждой задачи")
      .setDesc(
        "При создании задачи автоматически создавать .md файл в папке Tasks/ в формате Tasks плагина.",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.syncAllTasksToNotes);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ syncAllTasksToNotes: value });
        });
      })
      .addButton((btn) =>
        btn
          .setButtonText("Создать заметки для всех задач")
          .setTooltip("Создать Task заметки для задач, у которых их ещё нет")
          .onClick(async () => {
            const { tasks } = await import("./task-tracker/stores");
            const { get } = await import("svelte/store");
            const { createNoteTask, shouldSyncTaskToNote } =
              await import("./task-tracker/noteTasks");

            const allTasks = get(tasks);
            const tasksFolderPath =
              this.plugin.options.tasksFolderPath || "Tasks";
            let created = 0;

            for (const task of allTasks) {
              // Пропускаем задачи у которых уже есть Task заметка
              if (
                task.notePath &&
                task.notePath.startsWith(tasksFolderPath + "/")
              ) {
                continue;
              }

              if (shouldSyncTaskToNote(task)) {
                try {
                  const { projects } = await import("./task-tracker/stores");
                  const { get: getS } = await import("svelte/store");
                  const project = getS(projects).find(
                    (p) => p.id === task.projectId,
                  );
                  const file = await createNoteTask(task, project, this.app);
                  if (file) {
                    const { updateTask } =
                      await import("./task-tracker/stores");
                    updateTask(task.id, { notePath: file.path });
                    created++;
                  }
                } catch (error) {
                  console.error(
                    `[Settings] Failed to create note for task ${task.id}:`,
                    error,
                  );
                }
              }
            }

            alert(`Создано ${created} Task заметок`);
          }),
      );

    new Setting(container)
      .setName("Папка для задач")
      .setDesc("Папка, где будут храниться .md файлы задач")
      .addDropdown((dropdown) => {
        const folders = this.getVaultFolders();
        folders.forEach((folder) => {
          dropdown.addOption(folder, folder);
        });
        dropdown.addOption("__custom", "Другая...");
        const current = this.plugin.options.tasksFolderPath || "Tasks";
        if (!folders.includes(current)) {
          dropdown.addOption(current, current);
        }
        dropdown.setValue(current);
        dropdown.onChange(async (value) => {
          if (value === "__custom") {
            const modal = new FolderSuggestModal(this.app, async (folder) => {
              this.plugin.writeOptions({ tasksFolderPath: folder });
              this.display();
            });
            modal.open();
          } else {
            this.plugin.writeOptions({ tasksFolderPath: value });
          }
        });
      });

    new Setting(container)
      .setName("Лимит выполненных задач")
      .setDesc(
        "Максимальное количество выполненных задач. При превышении старые задачи и их заметки удаляются автоматически.",
      )
      .addText((text) => {
        text
          .setPlaceholder("1000")
          .setValue(String(this.plugin.options.autoCleanupThreshold || 1000))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 10) {
              await this.plugin.writeOptions({ autoCleanupThreshold: num });
            }
          });
        text.inputEl.type = "number";
        text.inputEl.min = "10";
        text.inputEl.max = "10000";
        text.inputEl.style.maxWidth = "100px";
      });

    new Setting(container)
      .setName("Лимит логов времени")
      .setDesc(
        "Максимальное количество записей логов времени. При превышении старые логи удаляются автоматически.",
      )
      .addText((text) => {
        text
          .setPlaceholder("1000")
          .setValue(String(this.plugin.options.timeLogCleanupThreshold || 1000))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 10) {
              await this.plugin.writeOptions({ timeLogCleanupThreshold: num });
            }
          });
        text.inputEl.type = "number";
        text.inputEl.min = "10";
        text.inputEl.max = "10000";
        text.inputEl.style.maxWidth = "100px";
      });

    // Информация о формате
    const formatInfo = document.createElement("div");
    formatInfo.addClass("setting-item-description");
    formatInfo.style.marginTop = "8px";
    formatInfo.innerHTML = `
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Формат заметки:</b>
      </p>
      <pre style="background: var(--background-secondary); padding: 8px; border-radius: 4px; font-size: 11px; overflow-x: auto; margin: 4px 0;"><code>---
task_id: abc123
title: Купить молоко
status: todo
date: day-2024-10-25
priority: medium
---

- [ ] Купить молоко 📅 2024-10-25 🛫 14:30 ⏫</code></pre>
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Статусы:</b> - [ ] todo, - [/] progress, - [-] paused, - [x] done
      </p>
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Эмодзи:</b> 📅 дата, 🛫 время, ⏰ дедлайн, 🔁 повторение, ⏫/⬇️ приоритет
      </p>
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Автоочистка:</b> при достижении лимита старые выполненные задачи и их заметки удаляются автоматически.
      </p>
    `;
    container.appendChild(formatInfo);
  }

  addNotificationSettings(container: HTMLElement): void {
    new Setting(container)
      .setName("Включить уведомления")
      .setDesc("Показывать уведомления о запланированных задачах")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notificationsEnabled);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ notificationsEnabled: value });
          this.plugin.notificationService?.restart();
        });
      });

    new Setting(container)
      .setName("Напоминание за (минут)")
      .setDesc(
        "За сколько минут до запланированного времени показывать напоминание",
      )
      .addDropdown((dropdown) => {
        dropdown.addOption("1", "1 минута");
        dropdown.addOption("5", "5 минут");
        dropdown.addOption("10", "10 минут");
        dropdown.addOption("15", "15 минут");
        dropdown.addOption("30", "30 минут");
        dropdown.addOption("60", "1 час");
        dropdown.setValue(String(this.plugin.options.reminderMinutesBefore));
        dropdown.onChange(async (value) => {
          this.plugin.writeOptions({ reminderMinutesBefore: parseInt(value) });
        });
      });

    new Setting(container)
      .setName("Типы уведомлений")
      .setDesc("Выберите, какие типы уведомлений включить");

    new Setting(container)
      .setName("Напоминания")
      .setDesc("Напоминание за N минут до запланированного времени")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyReminders);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ notifyReminders: value });
        });
      });

    new Setting(container)
      .setName("Просроченные задачи")
      .setDesc("Уведомление, когда задача становится просроченной")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyOverdue);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ notifyOverdue: value });
        });
      });

    new Setting(container)
      .setName("Превышение лимита времени")
      .setDesc("Уведомление, когда время работы превышает оценку")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyEstimateExceeded);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ notifyEstimateExceeded: value });
        });
      });

    new Setting(container)
      .setName("Дедлайны")
      .setDesc("Уведомления о дедлайнах (завтра, сегодня, истёк)")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyDeadlines);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ notifyDeadlines: value });
        });
      });

    new Setting(container)
      .setName("Отправлять в ntfy.sh")
      .setDesc("Дублировать уведомления на смартфон через ntfy.sh")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.ntfyEnabled);
        toggle.onChange(async (value) => {
          // Auto-generate UUID topic on first enable if empty
          if (value && !this.plugin.options.ntfyTopic) {
            const uuid = generateId();
            await this.plugin.writeOptions({ ntfyEnabled: value, ntfyTopic: uuid });
            this.ntfyTopicText?.setValue(uuid);
          } else {
            await this.plugin.writeOptions({ ntfyEnabled: value });
          }
          this.syncNotificationSettingsToVault();
          this.plugin.notificationService?.restart();
        });
      });

    new Setting(container)
      .setName("Topic для ntfy.sh")
      .setDesc("Имя топика для получения уведомлений в приложении ntfy")
      .addText((text) => {
        this.ntfyTopicText = text;
        text
          .setPlaceholder("a7f9b2c4-8e1d-4f3a-9c5b-2d6e8f0a1b3c")
          .setValue(this.plugin.options.ntfyTopic)
          .onChange(async (value) => {
            await this.plugin.writeOptions({ ntfyTopic: value });
            await this.syncNotificationSettingsToVault({ ntfyTopic: value });
          });
        text.inputEl.style.maxWidth = "250px";
      });

    new Setting(container)
      .setName("Тест ntfy.sh")
      .setDesc("Отправить тестовое уведомление на указанный топик")
      .addButton((btn) =>
        btn
          .setButtonText("Отправить тест")
          .setWarning()
          .onClick(async () => {
            const topic = this.plugin.options.ntfyTopic;
            const body = "Тестовое уведомление из WorkLife Calendar";
            if (!topic) {
              await recordNotificationEvent(this.app, {
                channel: "ntfy",
                status: "failed",
                title: "Тест ntfy.sh",
                body,
                source: "settings-test",
                error: "ntfy.sh topic is empty",
              });
              alert("Topic для ntfy.sh пустой.");
              return;
            }
            try {
              const response = await requestUrl({
                url: `https://ntfy.sh/${encodeURIComponent(topic)}`,
                method: "POST",
                body,
              });
              if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP ${response.status}`);
              }
              await recordNotificationEvent(this.app, {
                channel: "ntfy",
                status: "sent",
                title: "Тест ntfy.sh",
                body,
                source: "settings-test",
                topic,
              });
              alert(`Тестовое уведомление отправлено в ${topic}`);
            } catch (e) {
              await recordNotificationEvent(this.app, {
                channel: "ntfy",
                status: "failed",
                title: "Тест ntfy.sh",
                body,
                source: "settings-test",
                topic,
                error: e instanceof Error ? e.message : String(e),
              });
              alert(`Ошибка отправки: ${e}`);
            }
          }),
      );

    container.createEl("h4", {
      text: "GitHub Actions",
    });

    const ghDesc = document.createElement("div");
    ghDesc.addClass("setting-item-description");
    ghDesc.style.marginBottom = "8px";
    ghDesc.innerHTML = `
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        Уведомления отправляются через GitHub Actions, когда компьютер выключен.
      </p>
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Требования:</b><br>
        1. Включите <b>Синхронизацию в корень хранилища</b> выше<br>
        2. Скопируйте workflow из <code>examples/workflows/overdue-check.yml</code> в <code>.github/workflows/</code> вашего vault-репозитория<br>
        3. Добавьте topic как секрет <code>NTFY_TOPIC</code> в GitHub Actions или оставьте topic в <code>calendar-data/notifications.json</code><br>
        4. Настройте git push в репозиторий (Obsidian Git или вручную)
      </p>
    `;
    container.appendChild(ghDesc);

    new Setting(container)
      .setName("Проверка просроченных (GitHub Actions)")
      .setDesc(
        "Проверять просроченные задачи и дедлайны каждые 30 мин, когда компьютер выключен",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.overdueCheckEnabled);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ overdueCheckEnabled: value });
          await this.syncNotificationSettingsToVault({ overdueCheckEnabled: value });
        });
      });

    this.addNotificationDiagnostics(container);
  }

  private addNotificationDiagnostics(container: HTMLElement): void {
    container.createEl("h4", { text: "Диагностика и журнал" });

    const panel = container.createDiv({ cls: "notification-diagnostics-panel" });
    panel.style.cssText =
      "border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 12px; margin: 8px 0 18px; background: var(--background-secondary);";

    const render = async () => {
      panel.empty();
      const diagnostics = await loadNotificationDiagnostics(this.app);
      const permission = "Notification" in window
        ? Notification.permission
        : "unavailable";

      const toolbar = panel.createDiv();
      toolbar.style.cssText =
        "display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;";
      toolbar.createEl("div", {
        text: "Состояние каналов",
        cls: "setting-item-name",
      });
      const actions = toolbar.createDiv();
      actions.style.cssText = "display: flex; gap: 6px; flex-wrap: wrap;";
      const refreshBtn = actions.createEl("button", { text: "Обновить" });
      refreshBtn.addClass("mod-cta");
      refreshBtn.addEventListener("click", () => void render());
      const clearBtn = actions.createEl("button", { text: "Очистить журнал" });
      clearBtn.addEventListener("click", async () => {
        await clearNotificationHistory(this.app);
        await render();
      });

      const grid = panel.createDiv();
      grid.style.cssText =
        "display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; margin-bottom: 14px;";

      const addMetric = (label: string, value: string, tone: "ok" | "warn" | "bad" | "muted") => {
        const item = grid.createDiv();
        item.style.cssText =
          "border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 10px; background: var(--background-primary); min-height: 70px;";
        item.createDiv({
          text: label,
          cls: "setting-item-description",
        }).style.cssText = "font-size: 11px; margin-bottom: 6px;";
        const valueEl = item.createDiv({ text: value });
        const color =
          tone === "ok"
            ? "var(--text-success, #3dd68c)"
            : tone === "bad"
              ? "var(--text-error, #f06565)"
              : tone === "warn"
                ? "var(--text-warning, #f5a623)"
                : "var(--text-muted)";
        valueEl.style.cssText = `font-size: 13px; font-weight: 600; color: ${color}; word-break: break-word;`;
      };

      addMetric(
        "Локальные уведомления",
        `${this.plugin.options.notificationsEnabled ? "включены" : "выключены"} · ${this.formatNotificationPermission(permission)}`,
        this.plugin.options.notificationsEnabled && permission === "granted" ? "ok" : "warn"
      );
      addMetric(
        "ntfy.sh",
        this.plugin.options.ntfyEnabled
          ? this.plugin.options.ntfyTopic || diagnostics.ntfyTopic
            ? `включён · ${this.plugin.options.ntfyTopic || diagnostics.ntfyTopic}`
            : "включён, но topic пустой"
          : "выключен",
        this.plugin.options.ntfyEnabled
          ? (this.plugin.options.ntfyTopic || diagnostics.ntfyTopic ? "ok" : "bad")
          : "muted"
      );
      addMetric(
        "GitHub Actions",
        this.plugin.options.overdueCheckEnabled
          ? diagnostics.lastGithubActionStatus || "ожидает запуска"
          : "выключены",
        this.plugin.options.overdueCheckEnabled
          ? diagnostics.lastGithubActionStatus === "failed" ? "bad" : "ok"
          : "muted"
      );
      addMetric(
        "Последняя проверка",
        this.formatTelemetryDate(diagnostics.lastGithubActionCheck || diagnostics.lastOverdueCheck),
        diagnostics.lastGithubActionCheck || diagnostics.lastOverdueCheck ? "ok" : "muted"
      );

      const details = panel.createDiv();
      details.style.cssText =
        "display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; margin-bottom: 14px;";
      const addDetail = (label: string, value: string) => {
        const row = details.createDiv();
        row.style.cssText =
          "display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 8px; background: var(--background-primary); border: 1px solid var(--background-modifier-border);";
        row.createDiv({ text: label }).style.cssText =
          "font-size: 11px; color: var(--text-muted);";
        row.createDiv({ text: value }).style.cssText =
          "font-size: 12px; color: var(--text-normal); word-break: break-word;";
      };

      addDetail("Последний ntfy", `${this.formatTelemetryDate(diagnostics.lastNtfyAt)} · ${diagnostics.lastNtfyStatus || "—"}`);
      addDetail("Ошибка ntfy", diagnostics.lastNtfyError || "—");
      addDetail("Сообщение GitHub Actions", diagnostics.lastGithubActionMessage || "—");
      addDetail("Ошибка GitHub Actions", diagnostics.lastGithubActionError || "—");

      panel.createEl("div", {
        text: "История уведомлений",
        cls: "setting-item-name",
      }).style.cssText = "margin: 8px 0;";

      const historyWrap = panel.createDiv();
      historyWrap.style.cssText =
        "display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow: auto;";

      if (diagnostics.history.length === 0) {
        historyWrap.createDiv({
          text: "Журнал пока пуст. Отправьте тест ntfy.sh или дождитесь первого уведомления.",
          cls: "setting-item-description",
        }).style.cssText = "padding: 8px 2px;";
        return;
      }

      for (const entry of diagnostics.history.slice(0, 12)) {
        const row = historyWrap.createDiv();
        row.style.cssText =
          "display: grid; grid-template-columns: minmax(90px, 120px) 1fr auto; gap: 8px; align-items: start; border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 8px 10px; background: var(--background-primary);";
        row.createDiv({
          text: this.formatTelemetryDate(entry.createdAt),
        }).style.cssText = "font-size: 11px; color: var(--text-muted);";

        const content = row.createDiv();
        content.createDiv({ text: entry.title }).style.cssText =
          "font-size: 12px; font-weight: 600; color: var(--text-normal); margin-bottom: 2px;";
        content.createDiv({ text: entry.body }).style.cssText =
          "font-size: 12px; color: var(--text-muted); white-space: pre-wrap; word-break: break-word;";
        if (entry.error) {
          content.createDiv({ text: entry.error }).style.cssText =
            "font-size: 11px; color: var(--text-error, #f06565); margin-top: 3px;";
        }

        const badge = row.createDiv({ text: `${entry.channel} · ${entry.status}` });
        const badgeColor = entry.status === "sent"
          ? "var(--text-success, #3dd68c)"
          : entry.status === "failed"
            ? "var(--text-error, #f06565)"
            : "var(--text-muted)";
        badge.style.cssText =
          `font-size: 11px; color: ${badgeColor}; white-space: nowrap;`;
      }
    };

    void render();
  }

  private formatNotificationPermission(permission: string): string {
    if (permission === "granted") return "разрешены браузером";
    if (permission === "denied") return "запрещены браузером";
    if (permission === "default") return "нужно разрешение браузера";
    return "браузерные уведомления недоступны";
  }

  private formatTelemetryDate(value?: string): string {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  private async syncNotificationSettingsToVault(overrides?: { overdueCheckEnabled?: boolean; ntfyTopic?: string }): Promise<void> {
    const { saveNotificationSyncSettings } = await import("./io/vaultStorage");
    const payload = {
      overdueCheckEnabled: overrides?.overdueCheckEnabled ?? this.plugin.options.overdueCheckEnabled,
      ntfyTopic: overrides?.ntfyTopic ?? this.plugin.options.ntfyTopic,
    };
    await saveNotificationSyncSettings(this.app, payload);
  }

  addWorkTaskSettings(container: HTMLElement): void {
    new Setting(container)
      .setName("Тип оплаты по умолчанию")
      .setDesc("Тип оплаты для новых рабочих задач")
      .addDropdown((dropdown) => {
        dropdown.addOption("hour", "Оплата в час");
        dropdown.addOption("day", "Оплата в день");
        dropdown.setValue(this.plugin.options.defaultPaymentType);
        dropdown.onChange(async (value) => {
          this.plugin.writeOptions({
            defaultPaymentType: value as "hour" | "day",
          });
        });
      });

    new Setting(container)
      .setName("Ставка по умолчанию")
      .setDesc("Ставка для новых рабочих задач (в рублях)")
      .addText((text) => {
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.options.defaultRate || ""))
          .onChange(async (value) => {
            this.plugin.writeOptions({ defaultRate: parseFloat(value) || 0 });
          });
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.style.maxWidth = "120px";
      });
  }

  addGitHubGistSettings(container: HTMLElement): void {
    container.createEl("h3", {
      text: "GitHub Gist — синхронизация календаря",
    });

    const desc = document.createElement("div");
    desc.addClass("setting-item-description");
    desc.style.marginBottom = "8px";
    desc.innerHTML = `
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        Публикуйте календарь задач в GitHub Gist как .ics файл.
        Подпишитесь на него в Google Calendar или любом другом календаре.
      </p>
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Как получить токен:</b><br>
        1. GitHub → Settings → Credentials<br>
        2. Personal access tokens → Tokens (classic)<br>
        3. Generate new token → галочки: <code>gist</code><br>
        4. Скопируйте токен и вставьте ниже
      </p>
    `;
    container.appendChild(desc);

    new Setting(container)
      .setName("GitHub токен для Gist")
      .setDesc("Personal access token с правами gist")
      .addText((text) => {
        text
          .setPlaceholder("ghp_...")
          .setValue(this.plugin.options.githubToken || "")
          .onChange(async (value) => {
            await this.plugin.writeOptions({ githubToken: value });
          });
        text.inputEl.type = "password";
        text.inputEl.style.maxWidth = "300px";
      });

    new Setting(container)
      .setName("Синхронизировать с Gist")
      .setDesc("Экспортировать задачи в .ics файл на GitHub Gist")
      .addButton((btn) =>
        btn
          .setButtonText("Синхронизировать")
          .setCta()
          .onClick(async () => {
            const { syncToGist, gistSyncStatus, connectGist } =
              await import("./services/GistSyncService");
            const token = this.plugin.options.githubToken;

            if (!token) {
              alert("Сначала введите GitHub токен выше.");
              return;
            }

            // Check token permissions first
            const connectResult = await connectGist(token);
            if (connectResult.warning) {
              alert(connectResult.warning);
              return;
            }
            if (!connectResult.success) {
              alert(`Ошибка: ${connectResult.error}`);
              return;
            }

            const result = await syncToGist();
            if (result.success) {
              const status = get(gistSyncStatus);
              // Re-render settings to show the URL field
              this.display();
              alert(
                `Синхронизация завершена!\n\nURL для подписки:\n${status.rawUrl}\n\n Скопируйте URL и добавьте его в Ваш календарь`,
              );
            } else {
              alert(`Ошибка: ${result.error}`);
            }
          }),
      );

    new Setting(container)
      .setName("Автоматическая синхронизация")
      .setDesc(
        "Автоматически обновлять Gist при изменении задач (debounce 5 сек)",
      )
      .addToggle((toggle) => {
        toggle.setValue(!!this.plugin.options.gistAutoSync);
        toggle.onChange(async (value) => {
          const { setAutoSync } = await import("./services/GistSyncService");
          await this.plugin.writeOptions({ gistAutoSync: value });
          setAutoSync(value);
          if (value) {
            // Show status
            const statusEl = document.getElementById("gist-auto-sync-status");
            if (statusEl)
              statusEl.textContent = "✓ Автосинхронизация включена.";
          }
        });
      });

    // Auto-sync status indicator
    const statusDesc = document.createElement("div");
    statusDesc.id = "gist-auto-sync-status";
    statusDesc.style.cssText =
      "font-size: 11px; color: var(--text-faint); margin-top: 4px; padding: 4px 0;";
    statusDesc.textContent = this.plugin.options.gistAutoSync
      ? "✓ Автосинхронизация включена."
      : "Выключена. Включите для автоматического обновления календаря.";
    container
      .querySelector(".setting-item:last-child")
      ?.appendChild(statusDesc);

    if (this.plugin.options.gistRawUrl) {
      new Setting(container)
        .setName("URL календаря")
        .setDesc("Добавьте этот URL в Google Calendar или другой календарь")
        .addText((text) => {
          text.setValue(this.plugin.options.gistRawUrl || "").setDisabled(true);
          text.inputEl.style.maxWidth = "500px";
        });
    }
  }

  addSingularitySettings(container: HTMLElement): void {
    container.createEl("h3", { text: "SingularityApp" });

    const desc = document.createElement("div");
    desc.addClass("setting-item-description");
    desc.style.marginBottom = "8px";
    desc.innerHTML = `
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        Двусторонняя синхронизация задач с SingularityApp. Требуется подписка Pro или Elite.
      </p>
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Как получить токен:</b><br>
        1. <a href="https://me.singularity-app.com" target="_blank" rel="noopener">Личный кабинет SingularityApp</a><br>
        2. Перейдите на экран «Доступ к API»<br>
        3. Создайте токен с правами на задачи и проекты<br>
        4. Скопируйте токен и вставьте ниже
      </p>
    `;
    container.appendChild(desc);

    // Token field
    new Setting(container)
      .setName("API токен")
      .setDesc("Токен доступа SingularityApp API")
      .addText((text) => {
        text
          .setPlaceholder("Вставьте токен...")
          .setValue(this.plugin.options.singularityToken || "")
          .onChange(async (value) => {
            await this.plugin.writeOptions({ singularityToken: value });
          });
        text.inputEl.type = "password";
        text.inputEl.style.maxWidth = "300px";
      })
      .addButton((btn) =>
        btn
          .setButtonText("Проверить")
          .onClick(async () => {
            const token = this.plugin.options.singularityToken;
            if (!token) {
              alert("Введите токен выше.");
              return;
            }
            const { testConnection } = await import("./services/SingularitySyncService");
            const result = await testConnection(token);
            if (result.success) {
              alert("Токен действителен! Подключение установлено.");
            } else {
              alert(`Ошибка: ${result.error}`);
            }
          }),
      );

    // Auto-sync toggle
    new Setting(container)
      .setName("Автосинхронизация")
      .setDesc("Автоматически синхронизировать задачи с SingularityApp")
      .addToggle((toggle) => {
        toggle.setValue(!!this.plugin.options.singularityAutoSync);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ singularityAutoSync: value });
        });
      });

    // Sync interval
    new Setting(container)
      .setName("Интервал синхронизации")
      .setDesc("Как часто проверять обновления из SingularityApp (в минутах)")
      .addDropdown((dropdown) => {
        dropdown.addOption("1", "1 минута");
        dropdown.addOption("2", "2 минуты");
        dropdown.addOption("5", "5 минут");
        dropdown.addOption("10", "10 минут");
        dropdown.addOption("15", "15 минут");
        dropdown.addOption("30", "30 минут");
        dropdown.setValue(String(this.plugin.options.singularitySyncInterval || 5));
        dropdown.onChange(async (value) => {
          await this.plugin.writeOptions({ singularitySyncInterval: parseInt(value) });
        });
      });

    // Sync direction
    new Setting(container)
      .setName("Направление синхронизации")
      .setDesc("Откуда и куда синхронизировать задачи")
      .addDropdown((dropdown) => {
        dropdown.addOption("both", "Оба направления");
        dropdown.addOption("push", "Только отправка (Obsidian → SingularityApp)");
        dropdown.addOption("pull", "Только получение (SingularityApp → Obsidian)");
        dropdown.setValue(this.plugin.options.singularitySyncDirection || "both");
        dropdown.onChange(async (value) => {
          await this.plugin.writeOptions({
            singularitySyncDirection: value as "both" | "push" | "pull",
          });
        });
      });

    new Setting(container)
      .setName("Тестовый режим (dry run)")
      .setDesc("Логировать все действия синхронизации без реальных API вызовов")
      .addToggle((toggle) => {
        toggle.setValue(!!this.plugin.options.singularitySyncDryRun);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ singularitySyncDryRun: value });
        });
      });

    new Setting(container)
      .setName("Исключить теги")
      .setDesc("Задачи с этими тегами не будут синхронизированы (через запятую, например: GC,nd,no-sync)")
      .addText((text) => {
        text
          .setPlaceholder("GC,nd")
          .setValue(this.plugin.options.singularitySyncExcludeTags || "")
          .onChange(async (value) => {
            await this.plugin.writeOptions({ singularitySyncExcludeTags: value });
          });
        text.inputEl.style.maxWidth = "300px";
      });

    // Last sync info
    const lastSync = this.plugin.options.singularityLastSync
      ? new Date(this.plugin.options.singularityLastSync).toLocaleString("ru-RU")
      : "—";
    new Setting(container)
      .setName("Последняя синхронизация")
      .setDesc(lastSync)
      .setDisabled(true);

    // Action buttons
    new Setting(container)
      .setName("Синхронизировать сейчас")
      .setDesc("Запустить полную синхронизацию немедленно")
      .addButton((btn) =>
        btn
          .setButtonText("Синхронизировать")
          .setCta()
          .onClick(async () => {
            const token = this.plugin.options.singularityToken;
            if (!token) {
              alert("Сначала введите токен выше.");
              return;
            }
            btn.setButtonText("Синхронизация...");
            btn.setDisabled(true);
            try {
              const { fullSync } = await import("./services/SingularitySyncService");
              await fullSync();
              alert("Синхронизация завершена!");
              this.display(); // refresh last sync time
            } catch (e) {
              alert(`Ошибка: ${e instanceof Error ? e.message : e}`);
            } finally {
              btn.setButtonText("Синхронизировать");
              btn.setDisabled(false);
            }
          }),
      );

    new Setting(container)
      .setName("Синхронизировать проекты")
      .setDesc("Сопоставить локальные проекты с SingularityApp, создать недостающие, синхронизировать цвета")
      .addButton((btn) =>
        btn
          .setButtonText("Синхронизировать")
          .onClick(async () => {
            const token = this.plugin.options.singularityToken;
            if (!token) {
              alert("Сначала введите токен выше.");
              return;
            }
            btn.setButtonText("Синхронизация...");
            btn.setDisabled(true);
            try {
              const { syncProjects } = await import("./services/SingularitySyncService");
              const result = await syncProjects();
              alert(
                `Проекты синхронизированы!\n\n` +
                `Создано удалённо: ${result.created}\n` +
                `Сопоставлено: ${result.mapped}\n` +
                `Загружено из SingularityApp: ${result.pulled}`
              );
              this.display();
            } catch (e) {
              alert(`Ошибка: ${e instanceof Error ? e.message : e}`);
            } finally {
              btn.setButtonText("Синхронизировать");
              btn.setDisabled(false);
            }
          }),
      );

    new Setting(container)
      .setName("Сбросить синхронизацию")
      .setDesc("Удалить все связи между локальными и удалёнными задачами")
      .addButton((btn) =>
        btn
          .setButtonText("Сбросить")
          .setWarning()
          .onClick(async () => {
            if (!confirm("Это удалит все связи задач. Локальные задачи останутся, но связь с SingularityApp будет потеряна. Продолжить?")) {
              return;
            }
            try {
              const { resetSyncMap } = await import("./services/SingularitySyncService");
              await resetSyncMap();
              alert("Связи сброшены.");
            } catch (e) {
              alert(`Ошибка: ${e instanceof Error ? e.message : e}`);
            }
          }),
      );
  }

  addNavPanelInstructions(container: HTMLElement): void {
    const desc = document.createDocumentFragment();

    const p1 = document.createElement("p");
    p1.textContent =
      "Вставьте блок кода в любую заметку для создания панели быстрой навигации:";
    desc.appendChild(p1);

    const code = document.createElement("pre");
    code.style.cssText =
      "background: var(--background-secondary); padding: 12px; border-radius: 8px; font-size: 12px; overflow-x: auto; white-space: pre;";
    code.textContent =
      "```calendar-nav\nschedule:Расписание\ntasks:Задачи\nfinance:Финансы\nanalytics:Аналитика\n```";
    desc.appendChild(code);

    const p2 = document.createElement("p");
    p2.style.marginTop = "8px";
    p2.textContent = "Доступные ключи: schedule, tasks, finance, analytics";
    desc.appendChild(p2);

    const p3 = document.createElement("p");
    p3.style.marginTop = "4px";
    p3.textContent = "Кастомизация стиля (первая строка начинается с %):";
    desc.appendChild(p3);

    const code2 = document.createElement("pre");
    code2.style.cssText =
      "background: var(--background-secondary); padding: 12px; border-radius: 8px; font-size: 12px; overflow-x: auto; white-space: pre;";
    code2.textContent =
      "```calendar-nav\n%color:#fff;bg:#333;border-radius:20px;size:14px;accent:#5f99e1\nschedule:Расписание\n```";
    desc.appendChild(code2);

    const p4 = document.createElement("p");
    p4.style.marginTop = "8px";
    p4.textContent =
      "Параметры стиля: color (текст), bg (фон), radius (скругление), size (размер шрифта), accent (цвет при наведении)";
    desc.appendChild(p4);

    new Setting(container)
      .setName("Инструкция по панели навигации")
      .setDesc(desc);
  }

  addNavBtnStyleSettings(container: HTMLElement): void {
    new Setting(container)
      .setName("Цвет текста кнопок")
      .setDesc("Цвет текста на кнопках навигации (hex, например #ffffff)")
      .addText((text) => {
        text
          .setPlaceholder("#ffffff")
          .setValue(this.plugin.options.navBtnColor || "")
          .onChange(async (value) => {
            await this.plugin.writeOptions({ navBtnColor: value });
          });
        text.inputEl.style.maxWidth = "120px";
      });

    new Setting(container)
      .setName("Фон кнопок")
      .setDesc("Цвет фона кнопок (hex, например #333333)")
      .addText((text) => {
        text
          .setPlaceholder("#333333")
          .setValue(this.plugin.options.navBtnBg || "")
          .onChange(async (value) => {
            await this.plugin.writeOptions({ navBtnBg: value });
          });
        text.inputEl.style.maxWidth = "120px";
      });

    new Setting(container)
      .setName("Скругление кнопок")
      .setDesc("Радиус скругления (например 12px, 50%)")
      .addText((text) => {
        text
          .setPlaceholder("12px")
          .setValue(this.plugin.options.navBtnRadius || "")
          .onChange(async (value) => {
            await this.plugin.writeOptions({ navBtnRadius: value });
          });
        text.inputEl.style.maxWidth = "120px";
      });

    new Setting(container)
      .setName("Размер шрифта кнопок")
      .setDesc("Размер шрифта (например 13px)")
      .addText((text) => {
        text
          .setPlaceholder("13px")
          .setValue(this.plugin.options.navBtnSize || "")
          .onChange(async (value) => {
            await this.plugin.writeOptions({ navBtnSize: value });
          });
        text.inputEl.style.maxWidth = "120px";
      });

    new Setting(container)
      .setName("Цвет акцента при наведении")
      .setDesc("Цвет границы при hover (hex, например #5f99e1)")
      .addText((text) => {
        text
          .setPlaceholder("#5f99e1")
          .setValue(this.plugin.options.navAccentColor || "")
          .onChange(async (value) => {
            await this.plugin.writeOptions({ navAccentColor: value });
          });
        text.inputEl.style.maxWidth = "120px";
      });
  }
}
