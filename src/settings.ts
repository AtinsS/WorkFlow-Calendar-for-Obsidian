import { App, PluginSettingTab, Setting, TFolder, Notice, TextComponent } from "obsidian";
import { appHasDailyNotesPluginLoaded } from "obsidian-daily-notes-interface";
import type { ILocaleOverride } from "obsidian-calendar-ui";
import { get } from "svelte/store";

import { DEFAULT_WORDS_PER_DOT } from "src/constants";
import { FolderSuggestModal } from "./modals/FolderSuggestModal";
import {
  clearNotificationHistory,
  loadNotificationDiagnostics,
} from "./services/notificationTelemetry";

import type CalendarPlugin from "./main";
import { fetchWeekWeather, getWeatherAttribution, type WeatherProvider } from "./services/weatherService";
import { initLocale, tRaw } from "./i18n";

export interface ISettings {
  wordsPerDot: number;
  shouldConfirmBeforeCreate: boolean;

  // Language & locale
  language: "ru" | "en" | "system";
  startOfWeek: "monday" | "sunday" | "system";

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

  // Work task settings
  defaultPaymentType: "hour" | "day";
  defaultRate: number;

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
  weatherProvider?: string; // WeatherProvider: 'open-meteo' | 'openweathermap' | 'weatherapi' | 'visual-crossing'
  weatherApiKey?: string;

  // Status bar
  showStatusBar: boolean;
  dtwShowOnAllPages: boolean;

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

  language: "system" as const,
  startOfWeek: "system" as const,

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

  defaultPaymentType: "hour" as const,
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
    new Setting(coffeeBanner)
      .setName(tRaw("settings.general.supportTitle"))
      .setHeading();
    const coffeeDesc = coffeeBanner.createEl("p", {
      cls: "settings-coffee-desc",
    });
    coffeeDesc.textContent = tRaw("settings.general.supportDesc");
    const coffeeBtn = coffeeBanner.createEl("a", {
      cls: "settings-coffee-btn",
      text: tRaw("settings.general.supportBtn"),
      href: "https://boosty.to/atins/donate",
    });
    coffeeBtn.setAttribute("target", "_blank");
    coffeeBtn.setAttribute("rel", "noopener");

    if (!appHasDailyNotesPluginLoaded()) {
      const banner = this.containerEl.createDiv({ cls: "settings-banner" });
      new Setting(banner)
        .setName(tRaw("settings.general.dailyNotesWarning"))
        .setHeading();
      banner.createEl("p", {
        cls: "setting-item-description",
        text: tRaw("settings.general.dailyNotesWarningDesc"),
      });
    }

    // Tab bar
    const tabBar = this.containerEl.createDiv({ cls: "settings-tab-bar" });
    const tabs: { key: string; label: string }[] = [
      { key: "general", label: tRaw("settings.tabs.general") },
      { key: "dashboard", label: tRaw("settings.tabs.dashboard") },
      { key: "schedule", label: tRaw("settings.tabs.schedule") },
      { key: "weather", label: tRaw("settings.tabs.weather") },
      { key: "appearance", label: tRaw("settings.tabs.appearance") },
      { key: "sync", label: tRaw("settings.tabs.sync") },
      { key: "notifications", label: tRaw("settings.tabs.notifications") },
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

    // Language setting
    new Setting(general)
      .setName(tRaw("settings.general.languageLabel"))
      .setDesc(tRaw("settings.general.languageDesc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("system", tRaw("settings.general.languageSystem"));
        dropdown.addOption("ru", tRaw("settings.general.languageRu"));
        dropdown.addOption("en", tRaw("settings.general.languageEn"));
        dropdown.setValue(this.plugin.options.language || "system");
        dropdown.onChange(async (value: "ru" | "en" | "system") => {
          await await this.plugin.writeOptions({ language: value });
          initLocale(value);
          // Re-render settings to reflect new language
          this.display();
          new Notice(tRaw("settings.language.restartNotice"));
        });
      });

    // Start of week setting
    new Setting(general)
      .setName(tRaw("settings.general.startOfWeekLabel"))
      .setDesc(tRaw("settings.general.startOfWeekDesc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("system", tRaw("settings.general.startOfWeekSystem"));
        dropdown.addOption("monday", tRaw("settings.general.startOfWeekMonday"));
        dropdown.addOption("sunday", tRaw("settings.general.startOfWeekSunday"));
        dropdown.setValue(this.plugin.options.startOfWeek || "system");
        dropdown.onChange(async (value: "monday" | "sunday" | "system") => {
          await await this.plugin.writeOptions({ startOfWeek: value });
        });
      });

    this.addUserNameSetting(general);
    this.addShowStatusBarSetting(general);
    this.addDtwShowOnAllPagesSetting(general);
    this.addWorkTaskSettings(general);

    // Dashboard tab
    const dashboard = tabContainers["dashboard"];
    new Setting(dashboard).setName(tRaw("settings.dashboard.sectionWidgets")).setHeading();
    new Setting(dashboard)
      .setName(tRaw("settings.dashboard.showTasks"))
      .setDesc(tRaw("settings.dashboard.showTasksDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.dashboardShowTasks !== false);
        toggle.onChange(async (value) => {
          await await this.plugin.writeOptions({ dashboardShowTasks: value });
        });
      });
    new Setting(dashboard)
      .setName(tRaw("settings.dashboard.showHabits"))
      .setDesc(tRaw("settings.dashboard.showHabitsDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.dashboardShowHabits !== false);
        toggle.onChange(async (value) => {
          await await this.plugin.writeOptions({ dashboardShowHabits: value });
        });
      });
    new Setting(dashboard)
      .setName(tRaw("settings.dashboard.showGoals"))
      .setDesc(tRaw("settings.dashboard.showGoalsDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.dashboardShowGoals !== false);
        toggle.onChange(async (value) => {
          await await this.plugin.writeOptions({ dashboardShowGoals: value });
        });
      });
    new Setting(dashboard).setName(tRaw("settings.dashboard.sectionHello")).setHeading();
    this.addHelloButtonSettings(dashboard);

    // Schedule tab
    const schedule = tabContainers["schedule"];
    new Setting(schedule).setName(tRaw("settings.schedule.sectionDisplay")).setHeading();
    this.addScheduleDisplaySettings(schedule);

    // Weather tab
    const weather = tabContainers["weather"];
    this.addWeatherSettings(weather);

    // Appearance tab
    const appearance = tabContainers["appearance"];
    new Setting(appearance).setName(tRaw("settings.appearance.sectionColors")).setHeading();
    this.addAccentColorSetting(appearance);
    this.addGlassBgColorSetting(appearance);
    this.addColorSettings(appearance);
    new Setting(appearance).setName(tRaw("settings.appearance.sectionNav")).setHeading();
    this.addNavPanelInstructions(appearance);
    new Setting(appearance).setName(tRaw("settings.appearance.sectionNavStyle")).setHeading();
    this.addNavBtnStyleSettings(appearance);

    // Sync tab
    const sync = tabContainers["sync"];
    new Setting(sync).setName(tRaw("settings.sync.sectionTaskNote")).setHeading();
    this.addTaskNoteSyncSettings(sync);
    this.addGitHubGistSettings(sync);

    // Notifications tab
    const notif = tabContainers["notifications"];
    this.addNotificationSettings(notif);

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
      .setName(tRaw("settings.general.userName"))
      .setDesc(tRaw("settings.general.userNameDesc"))
      .addText((text) => {
        text
          .setPlaceholder(tRaw("settings.general.userNamePlaceholder"))
          .setValue(this.plugin.options.userName || "")
          .onChange(async (value) => {
            await await this.plugin.writeOptions({ userName: value });
          });
        text.inputEl.addClass("mcp-input-lg");
      });
  }

  addHelloButtonSettings(container: HTMLElement): void {
    new Setting(container)
      .setName(tRaw("settings.general.sectionHello"))
      .setDesc(tRaw("settings.general.sectionHelloDesc"));

    new Setting(container)
      .setName(tRaw("settings.general.showTasksBtn"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.helloShowTasksBtn !== false);
        toggle.onChange(async (value) => {
          await await this.plugin.writeOptions({ helloShowTasksBtn: value });
        });
      });

    new Setting(container)
      .setName(tRaw("settings.general.showAnalyticsBtn"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.helloShowAnalyticsBtn !== false);
        toggle.onChange(async (value) => {
          await await this.plugin.writeOptions({ helloShowAnalyticsBtn: value });
        });
      });

    new Setting(container)
      .setName(tRaw("settings.general.showFinanceBtn"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.helloShowFinanceBtn !== false);
        toggle.onChange(async (value) => {
          await await this.plugin.writeOptions({ helloShowFinanceBtn: value });
        });
      });

    new Setting(container)
      .setName(tRaw("settings.general.showScheduleBtn"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.helloShowScheduleBtn !== false);
        toggle.onChange(async (value) => {
          await await this.plugin.writeOptions({ helloShowScheduleBtn: value });
        });
      });

    // Instructions for adding hello block
    const helloInstructions = container.createDiv({ cls: "settings-banner" });
    new Setting(helloInstructions).setName(tRaw("settings.general.helloBlockTitle")).setHeading();
    helloInstructions.createEl("p", {
      text: tRaw("settings.general.helloBlockDesc"),
    });
    const codeBlock = helloInstructions.createEl("pre");
    codeBlock.createEl("code", { text: "```hello\n```" });
    codeBlock.addClass("mcp-code-block");
    helloInstructions.createEl("p", {
      text: tRaw("settings.general.helloBlockHint"),
    });
  }

  addShowStatusBarSetting(container: HTMLElement): void {
    new Setting(container)
      .setName(tRaw("settings.general.statusBar"))
      .setDesc(tRaw("settings.general.statusBarDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.showStatusBar);
        toggle.onChange(async (value) => {
          await await this.plugin.writeOptions({ showStatusBar: value });
          // Toggle visibility in real-time
          const el = document.querySelector(".mcp-dtw-global");
          if (el) (el as HTMLElement).style.display = value ? "" : "none";
        });
      });
  }

  addDtwShowOnAllPagesSetting(container: HTMLElement): void {
    new Setting(container)
      .setName(tRaw("settings.general.statusBarAllPages"))
      .setDesc(tRaw("settings.general.statusBarAllPagesDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.dtwShowOnAllPages);
        toggle.onChange(async (value) => {
          await await this.plugin.writeOptions({ dtwShowOnAllPages: value });
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
        name: tRaw("settings.schedule.showTime"),
        desc: tRaw("settings.schedule.showTimeDesc"),
      },
      {
        key: "scheduleShowStatus",
        name: tRaw("settings.schedule.showStatus"),
        desc: tRaw("settings.schedule.showStatusDesc"),
      },
      {
        key: "scheduleShowPriority",
        name: tRaw("settings.schedule.showPriority"),
        desc: tRaw("settings.schedule.showPriorityDesc"),
      },
      {
        key: "scheduleShowWorkBadge",
        name: tRaw("settings.schedule.showWorkBadge"),
        desc: tRaw("settings.schedule.showWorkBadgeDesc"),
      },
      {
        key: "scheduleShowNoteBadge",
        name: tRaw("settings.schedule.showNoteBadge"),
        desc: tRaw("settings.schedule.showNoteBadgeDesc"),
      },
      {
        key: "scheduleShowDeadline",
        name: tRaw("settings.schedule.showDeadline"),
        desc: tRaw("settings.schedule.showDeadlineDesc"),
      },
      {
        key: "scheduleShowOverdue",
        name: tRaw("settings.schedule.showOverdue"),
        desc: tRaw("settings.schedule.showOverdueDesc"),
      },
      {
        key: "scheduleShowDescription",
        name: tRaw("settings.schedule.showDescription"),
        desc: tRaw("settings.schedule.showDescriptionDesc"),
      },
      {
        key: "scheduleShowNowIndicator",
        name: tRaw("settings.schedule.showNowIndicator"),
        desc: tRaw("settings.schedule.showNowIndicatorDesc"),
      },
      {
        key: "scheduleShowDeadlineEvents",
        name: tRaw("settings.schedule.showDeadlineEvents"),
        desc: tRaw("settings.schedule.showDeadlineEventsDesc"),
      },
    ];
    for (const item of items) {
      new Setting(container)
        .setName(item.name)
        .setDesc(item.desc)
        .addToggle((toggle) => {
          toggle.setValue(opts[item.key as keyof typeof opts] as boolean);
          toggle.onChange(async (value) => {
            await await this.plugin.writeOptions({ [item.key]: value });
          });
        });
    }
  }

  addWeatherSettings(container: HTMLElement): void {
    const opts = this.plugin.options;

    new Setting(container)
      .setName(tRaw("settings.weather.showWeather"))
      .setDesc(tRaw("settings.weather.showWeatherDesc"))
      .addToggle((toggle) => {
        toggle.setValue(opts.weatherEnabled);
        toggle.onChange(async (value) => {
          await await this.plugin.writeOptions({ weatherEnabled: value });
        });
      });

    new Setting(container)
      .setName(tRaw("settings.weather.provider"))
      .setDesc(tRaw("settings.weather.providerDesc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("open-meteo", tRaw("settings.weather.providerOpenMeteo"));
        dropdown.addOption("openweathermap", tRaw("settings.weather.providerOpenWeatherMap"));
        dropdown.addOption("weatherapi", tRaw("settings.weather.providerWeatherAPI"));
        dropdown.addOption("visual-crossing", tRaw("settings.weather.providerVisualCrossing"));
        dropdown.setValue(opts.weatherProvider || "open-meteo");
        dropdown.onChange(async (value) => {
          await await this.plugin.writeOptions({ weatherProvider: value });
          this.display(); // refresh to show/hide API key field
        });
      });

    const provider = (opts.weatherProvider || "open-meteo") as WeatherProvider;
    const needsKey = provider !== "open-meteo";

    // Attribution notice
    const attribution = getWeatherAttribution(provider);
    if (attribution) {
      const attrEl = container.createDiv();
      attrEl.addClass("mcp-weather-attr");
      attrEl.textContent = attribution;
    }

    // WeatherAPI disclaimer (required by their TOS)
    if (provider === "weatherapi") {
      const disclaimerEl = container.createDiv();
      disclaimerEl.addClass("mcp-weather-disclaimer");
      disclaimerEl.textContent = tRaw("settings.weather.disclaimer");
    }

    if (needsKey) {
      const providerNames: Record<string, string> = {
        "openweathermap": "OpenWeatherMap (openweathermap.org)",
        "weatherapi": "WeatherAPI (weatherapi.com)",
        "visual-crossing": "Visual Crossing (visualcrossing.com)",
      };
      new Setting(container)
        .setName(tRaw("settings.weather.apiKey"))
        .setDesc(tRaw("settings.weather.apiKeyDesc", { provider: providerNames[provider] || provider }))
        .addText((text) => {
          text
            .setPlaceholder(tRaw("settings.weather.apiKeyPlaceholder"))
            .setValue(opts.weatherApiKey || "")
            .onChange(async (value) => {
              await await this.plugin.writeOptions({ weatherApiKey: value });
            });
          text.inputEl.type = "password";
          text.inputEl.addClass("mcp-input-xl");
        });
    }

    new Setting(container)
      .setName(tRaw("settings.weather.latitude"))
      .setDesc(tRaw("settings.weather.latitudeDesc"))
      .addText((text) => {
        text
          .setPlaceholder("55.75")
          .setValue(String(opts.weatherLatitude ?? 55.75))
          .onChange(async (value) => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= -90 && num <= 90) {
              await await this.plugin.writeOptions({ weatherLatitude: num });
            }
          });
        text.inputEl.type = "number";
        text.inputEl.min = "-90";
        text.inputEl.max = "90";
        text.inputEl.step = "0.01";
        text.inputEl.addClass("mcp-input-md");
      });

    new Setting(container)
      .setName(tRaw("settings.weather.longitude"))
      .setDesc(tRaw("settings.weather.longitudeDesc"))
      .addText((text) => {
        text
          .setPlaceholder("37.62")
          .setValue(String(opts.weatherLongitude ?? 37.62))
          .onChange(async (value) => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= -180 && num <= 180) {
              await await this.plugin.writeOptions({ weatherLongitude: num });
            }
          });
        text.inputEl.type = "number";
        text.inputEl.min = "-180";
        text.inputEl.max = "180";
        text.inputEl.step = "0.01";
        text.inputEl.addClass("mcp-input-md");
      });

    // Test & confirm buttons
    const btnRow = container.createDiv();
    btnRow.addClass("mcp-btn-row");

    const testBtn = btnRow.createEl("button", { text: tRaw("settings.weather.checkConnection") });
    testBtn.addClass("mcp-btn");
    testBtn.addEventListener("click", async () => {
      testBtn.disabled = true;
      testBtn.textContent = tRaw("settings.weather.checking");
      testBtn.removeClass("mcp-color-success", "mcp-color-danger");
      const current = this.plugin.options;
      const lat = current.weatherLatitude ?? 55.75;
      const lon = current.weatherLongitude ?? 37.62;
      const prov = (current.weatherProvider || "open-meteo") as WeatherProvider;
      const key = current.weatherApiKey;
      const today = new Date().toISOString().slice(0, 10);
      try {
        const days = await fetchWeekWeather(lat, lon, today, today, prov, key, { skipCache: true, throwOnError: true });
        if (days.length > 0) {
          testBtn.textContent = `✓ ${days[0].icon} ${days[0].tempMin}..${days[0].tempMax}° ${days[0].label}`;
          testBtn.addClass("mcp-color-success");
        } else {
          testBtn.textContent = tRaw("settings.weather.noData");
          testBtn.addClass("mcp-color-danger");
        }
      } catch (e: unknown) {
        testBtn.textContent = `✗ ${e instanceof Error ? e.message : tRaw("settings.weather.connectionError")}`;
        testBtn.addClass("mcp-color-danger");
      }
      window.setTimeout(() => {
        testBtn.disabled = false;
        testBtn.removeClass("mcp-color-success", "mcp-color-danger");
        testBtn.textContent = tRaw("settings.weather.checkConnection");
      }, 5000);
    });

    const confirmBtn = btnRow.createEl("button", { text: tRaw("settings.weather.applyProvider") });
    confirmBtn.addClass("mcp-btn", "mcp-btn-primary");
    confirmBtn.addEventListener("click", async () => {
      await await this.plugin.writeOptions({ weatherProvider: provider });
      confirmBtn.textContent = tRaw("settings.weather.applied");
      window.setTimeout(() => { confirmBtn.textContent = tRaw("settings.weather.applyProvider"); }, 2000);
    });

    // Weather animation previews
    this.addWeatherPreviews(container);
  }

  private addWeatherPreviews(container: HTMLElement): void {
    const wrapper = container.createDiv({ cls: "weather-previews" });

    const cards = [
      { cls: "wp-sun", emoji: "☀️", label: tRaw("weather.preview.sunny"), code: "0,1", anim: "sun" },
      { cls: "wp-clouds", emoji: "⛅", label: tRaw("weather.preview.cloudy"), code: "2", anim: "clouds" },
      { cls: "wp-gloom", emoji: "☁️", label: tRaw("weather.preview.overcast"), code: "3", anim: "gloom" },
      { cls: "wp-fog", emoji: "🌫️", label: tRaw("weather.preview.fog"), code: "45,48", anim: "fog" },
      { cls: "wp-rain", emoji: "🌧️", label: tRaw("weather.preview.rain"), code: "51–67", anim: "rain" },
      { cls: "wp-snow", emoji: "🌨️", label: tRaw("weather.preview.snow"), code: "71–77,85", anim: "snow" },
      { cls: "wp-storm", emoji: "⛈️", label: tRaw("weather.preview.storm"), code: "95–99", anim: "storm" },
    ];

    for (const c of cards) {
      const card = wrapper.createDiv({ cls: `wp-card ${c.cls}` });

      if (c.anim === "sun") {
        const sun = card.createDiv({ cls: "wp-sun-obj" });
        sun.createDiv({ cls: "wp-sun-core" });
        for (let i = 0; i < 8; i++) {
          const ray = sun.createDiv({ cls: "wp-sun-ray" });
          ray.style.setProperty("--wp-rotate", `${i * 45}deg`);
        }
      }
      if (c.anim === "clouds") {
        for (let i = 0; i < 3; i++) {
          const cl = card.createDiv({ cls: "wp-cloud" });
          cl.style.setProperty("--wp-top", `${15 + i * 25}%`);
          cl.style.setProperty("--wp-delay", `${i * 3}s`);
          cl.style.setProperty("--wp-opacity", String(0.15 + Math.random() * 0.15));
        }
      }
      if (c.anim === "gloom") {
        card.createDiv({ cls: "wp-gloom-overlay" });
      }
      if (c.anim === "fog") {
        for (let i = 0; i < 4; i++) {
          const fl = card.createDiv({ cls: "wp-fog-layer" });
          fl.style.setProperty("--wp-top", `${10 + i * 20}%`);
          fl.style.setProperty("--wp-delay", `${i * 2}s`);
          fl.style.setProperty("--wp-duration", `${10 + i * 3}s`);
          fl.style.setProperty("--wp-opacity", String(0.15 + i * 0.08));
        }
      }
      if (c.anim === "rain") {
        for (let i = 0; i < 20; i++) {
          const d = card.createDiv({ cls: "wp-drop" });
          d.style.setProperty("--wp-left", `${Math.random() * 100}%`);
          d.style.setProperty("--wp-delay", `${Math.random() * 2}s`);
          d.style.setProperty("--wp-duration", `${0.4 + Math.random() * 0.4}s`);
        }
      }
      if (c.anim === "storm") {
        for (let i = 0; i < 30; i++) {
          const d = card.createDiv({ cls: "wp-drop h" });
          d.style.setProperty("--wp-left", `${Math.random() * 100}%`);
          d.style.setProperty("--wp-delay", `${Math.random() * 1.5}s`);
          d.style.setProperty("--wp-duration", `${0.3 + Math.random() * 0.3}s`);
        }
      }
      if (c.anim === "snow") {
        for (let i = 0; i < 25; i++) {
          const s = card.createDiv({ cls: "wp-snowflake" });
          s.textContent = "*";
          s.style.setProperty("--wp-left", `${Math.random() * 100}%`);
          s.style.setProperty("--wp-delay", `${Math.random() * 4}s`);
          s.style.setProperty("--wp-duration", `${2 + Math.random() * 3}s`);
          s.style.setProperty("--wp-size", `${8 + Math.random() * 8}px`);
          s.style.setProperty("--wp-opacity", String(0.4 + Math.random() * 0.4));
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
      .setName(tRaw("settings.appearance.accentColor"))
      .setDesc(tRaw("settings.appearance.accentColorDesc"))
      .addColorPicker((picker) => {
        picker.setValue(currentColor).onChange(async (value) => {
          await await this.plugin.writeOptions({ accentColor: value });
          applyAccentColor(value);
        });
      });

    // Add a reset button
    setting.addButton((btn) =>
      btn
        .setButtonText(tRaw("common.reset"))
        .setTooltip(tRaw("settings.appearance.resetColors"))
        .onClick(async () => {
          const defaultColor = "#5f99e1";
          await await this.plugin.writeOptions({ accentColor: defaultColor });
          applyAccentColor(defaultColor);
          this.display();
        }),
    );
  }

  addGlassBgColorSetting(container: HTMLElement): void {
    const currentColor = this.plugin.options.glassBgColor || "#1e2332";
    const currentOpacity = this.plugin.options.glassOpacity ?? 55;

    const setting = new Setting(container)
      .setName(tRaw("settings.appearance.glassBgColor"))
      .setDesc(tRaw("settings.appearance.glassBgColorDesc"))
      .addColorPicker((picker) => {
        picker.setValue(currentColor).onChange(async (value) => {
          await await this.plugin.writeOptions({ glassBgColor: value });
          applyGlassBgColor(value, this.plugin.options.glassOpacity);
        });
      });

    setting.addButton((btn) =>
      btn
        .setButtonText(tRaw("common.reset"))
        .setTooltip(tRaw("settings.appearance.resetColors"))
        .onClick(async () => {
          const defaultColor = "#1e2332";
          await await this.plugin.writeOptions({
            glassBgColor: defaultColor,
            glassOpacity: 55,
          });
          applyGlassBgColor(defaultColor, 55);
          this.display();
        }),
    );

    new Setting(container)
      .setName(tRaw("settings.appearance.glassOpacity"))
      .setDesc(tRaw("settings.appearance.glassOpacityDesc", { value: currentOpacity }))
      .addSlider((slider) => {
        slider
          .setLimits(0, 100, 5)
          .setValue(currentOpacity)
          .setDynamicTooltip()
          .onChange(async (value) => {
            await await this.plugin.writeOptions({ glassOpacity: value });
            applyGlassBgColor(
              this.plugin.options.glassBgColor || "#1e2332",
              value,
            );
            // Update description with current value
            slider.sliderEl
              .closest(".setting-item")
              ?.querySelector(".setting-item-description")
              ?.setText(tRaw("settings.appearance.glassOpacityDesc", { value }));
          });
      });
  }

  addColorSettings(container: HTMLElement): void {
    new Setting(container).setName(tRaw("settings.appearance.sectionInterfaceColors")).setHeading();

    // Main colors
    new Setting(container).setName(tRaw("settings.appearance.sectionMainColors")).setHeading();

    this.addColorPickerSetting(
      container,
      tRaw("settings.appearance.bgColor"),
      tRaw("settings.appearance.bgColorDesc"),
      "bgColor",
      "#0E0F13"
    );

    this.addColorPickerSetting(
      container,
      tRaw("settings.appearance.surfaceColor"),
      tRaw("settings.appearance.surfaceColorDesc"),
      "surfaceColor",
      "#171A21"
    );

    this.addColorPickerSetting(
      container,
      tRaw("settings.appearance.surface2Color"),
      tRaw("settings.appearance.surface2ColorDesc"),
      "surface2Color",
      "#1E222B"
    );

    this.addColorPickerSetting(
      container,
      tRaw("settings.appearance.surfaceHoverColor"),
      tRaw("settings.appearance.surfaceHoverColorDesc"),
      "surfaceHoverColor",
      "#252A36"
    );

    // Semantic colors
    new Setting(container).setName(tRaw("settings.appearance.sectionSemanticColors")).setHeading();

    this.addColorPickerSetting(
      container,
      tRaw("settings.appearance.successColor"),
      tRaw("settings.appearance.successColorDesc"),
      "successColor",
      "#3DD68C"
    );

    this.addColorPickerSetting(
      container,
      tRaw("settings.appearance.dangerColor"),
      tRaw("settings.appearance.dangerColorDesc"),
      "dangerColor",
      "#F06565"
    );

    this.addColorPickerSetting(
      container,
      tRaw("settings.appearance.warningColor"),
      tRaw("settings.appearance.warningColorDesc"),
      "warningColor",
      "#F5A623"
    );

    this.addColorPickerSetting(
      container,
      tRaw("settings.appearance.amberColor"),
      tRaw("settings.appearance.amberColorDesc"),
      "amberColor",
      "#F5A623"
    );

    // Text colors
    new Setting(container).setName(tRaw("settings.appearance.sectionTextColors")).setHeading();

    this.addColorPickerSetting(
      container,
      tRaw("settings.appearance.textColor"),
      tRaw("settings.appearance.textColorDesc"),
      "textColor",
      "#E8ECF0"
    );

    this.addColorPickerSetting(
      container,
      tRaw("settings.appearance.textMutedColor"),
      tRaw("settings.appearance.textMutedColorDesc"),
      "textMutedColor",
      "#b7b8bb"
    );

    this.addColorPickerSetting(
      container,
      tRaw("settings.appearance.textFaintColor"),
      tRaw("settings.appearance.textFaintColorDesc"),
      "textFaintColor",
      "#3A3F4B"
    );

    // Glass panel colors
    new Setting(container).setName(tRaw("settings.appearance.sectionGlass")).setHeading();

    this.addColorPickerSetting(
      container,
      tRaw("settings.appearance.glassBorderColor"),
      tRaw("settings.appearance.glassBorderColorDesc"),
      "glassBorderColor",
      "rgba(255, 255, 255, 0.06)"
    );

    this.addColorPickerSetting(
      container,
      tRaw("settings.appearance.glassHighlightColor"),
      tRaw("settings.appearance.glassHighlightColorDesc"),
      "glassHighlightColor",
      "rgba(255, 255, 255, 0.02)"
    );

    // Reset all button
    new Setting(container)
      .setName(tRaw("settings.appearance.resetAllColors"))
      .setDesc(tRaw("settings.appearance.resetAllColorsDesc"))
      .addButton((btn) =>
        btn
          .setButtonText(tRaw("settings.appearance.resetAllColors"))
          .setWarning()
          .onClick(async () => {
            await await this.plugin.writeOptions({
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
    const currentColor = (this.plugin.options as Record<string, string | undefined>)[key] || defaultValue;

    new Setting(container)
      .setName(name)
      .setDesc(desc)
      .addColorPicker((picker) => {
        picker.setValue(currentColor).onChange(async (value) => {
          await this.plugin.writeOptions({ [key]: value } as Partial<ISettings>);
          applyAllColors(this.plugin.options);
        });
      })
      .addButton((btn) =>
        btn
          .setButtonText(tRaw("common.reset"))
          .setTooltip(tRaw("settings.appearance.resetColors"))
          .onClick(async () => {
            await this.plugin.writeOptions({ [key]: defaultValue } as Partial<ISettings>);
            applyAllColors(this.plugin.options);
            this.display();
          })
      );
  }

  addTaskNoteSyncSettings(container: HTMLElement): void {
    new Setting(container)
      .setName(tRaw("settings.general.syncAllTasksToNotes"))
      .setDesc(
        tRaw("settings.general.syncAllTasksToNotesDesc"),
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.syncAllTasksToNotes);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ syncAllTasksToNotes: value });
        });
      })
      .addButton((btn) =>
        btn
          .setButtonText(tRaw("settings.general.createAllNotes"))
          .setTooltip(tRaw("settings.general.createAllNotesTooltip"))
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

            new Notice(tRaw("settings.general.createdNotes", { count: created }));
          }),
      );

    new Setting(container)
      .setName(tRaw("settings.general.tasksFolderPath"))
      .setDesc(tRaw("settings.general.tasksFolderPathDesc"))
      .addDropdown((dropdown) => {
        const folders = this.getVaultFolders();
        folders.forEach((folder) => {
          dropdown.addOption(folder, folder);
        });
        dropdown.addOption("__custom", tRaw("settings.sync.otherFolder"));
        const current = this.plugin.options.tasksFolderPath || "Tasks";
        if (!folders.includes(current)) {
          dropdown.addOption(current, current);
        }
        dropdown.setValue(current);
        dropdown.onChange(async (value) => {
          if (value === "__custom") {
            const modal = new FolderSuggestModal(this.app, async (folder) => {
              await this.plugin.writeOptions({ tasksFolderPath: folder });
              this.display();
            });
            modal.open();
          } else {
            await this.plugin.writeOptions({ tasksFolderPath: value });
          }
        });
      });

    new Setting(container)
      .setName(tRaw("settings.general.autoCleanupThreshold"))
      .setDesc(
        tRaw("settings.general.autoCleanupThresholdDesc"),
      )
      .addText((text) => {
        text
          .setPlaceholder("1000")
          .setValue(String(this.plugin.options.autoCleanupThreshold || 1000))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 10) {
              await await this.plugin.writeOptions({ autoCleanupThreshold: num });
            }
          });
        text.inputEl.type = "number";
        text.inputEl.min = "10";
        text.inputEl.max = "10000";
        text.inputEl.addClass("mcp-input-sm");
      });

    new Setting(container)
      .setName(tRaw("settings.general.timeLogCleanupThreshold"))
      .setDesc(
        tRaw("settings.general.timeLogCleanupThresholdDesc"),
      )
      .addText((text) => {
        text
          .setPlaceholder("1000")
          .setValue(String(this.plugin.options.timeLogCleanupThreshold || 1000))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 10) {
              await await this.plugin.writeOptions({ timeLogCleanupThreshold: num });
            }
          });
        text.inputEl.type = "number";
        text.inputEl.min = "10";
        text.inputEl.max = "10000";
        text.inputEl.addClass("mcp-input-sm");
      });

    // Информация о формате
    const formatInfo = container.createDiv({ cls: "setting-item-description mcp-format-info" });

    const p1 = formatInfo.createEl("p", { cls: "mcp-format-label" });
    p1.createEl("b", { text: tRaw("settings.general.formatNote") });

    const pre = formatInfo.createEl("pre", { cls: "mcp-format-code" });
    pre.createEl("code", {
      text: `---
task_id: abc123
title: ${tRaw("settings.general.exampleTaskTitle")}
status: todo
date: day-2024-10-25
priority: medium
---

- [ ] ${tRaw("settings.general.exampleTaskTitle")} 📅 2024-10-25 🛫 14:30 ⏫`,
    });

    const p2 = formatInfo.createEl("p", { cls: "mcp-format-label" });
    p2.createEl("b", { text: tRaw("settings.general.formatStatuses") });

    const p3 = formatInfo.createEl("p", { cls: "mcp-format-label" });
    p3.createEl("b", { text: tRaw("settings.general.formatEmoji") });

    const p4 = formatInfo.createEl("p", { cls: "mcp-format-label" });
    p4.createEl("b", { text: tRaw("settings.general.formatCleanup") });
  }

  addWorkTaskSettings(container: HTMLElement): void {
    new Setting(container)
      .setName(tRaw("settings.general.defaultPaymentType"))
      .setDesc(tRaw("settings.general.defaultPaymentTypeDesc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("hour", tRaw("settings.general.paymentTypeHour"));
        dropdown.addOption("day", tRaw("settings.general.paymentTypeDay"));
        dropdown.setValue(this.plugin.options.defaultPaymentType);
        dropdown.onChange(async (value) => {
          await this.plugin.writeOptions({
            defaultPaymentType: value as "hour" | "day",
          });
        });
      });

    new Setting(container)
      .setName(tRaw("settings.general.defaultRate"))
      .setDesc(tRaw("settings.general.defaultRateDesc"))
      .addText((text) => {
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.options.defaultRate || ""))
          .onChange(async (value) => {
            await this.plugin.writeOptions({ defaultRate: parseFloat(value) || 0 });
          });
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.addClass("mcp-input-md");
      });
  }

  addGitHubGistSettings(container: HTMLElement): void {
    new Setting(container).setName(tRaw("settings.sync.sectionGithubGist")).setHeading();

    const desc = container.createDiv({ cls: "setting-item-description mcp-format-info" });

    const gistP1 = desc.createEl("p", { cls: "mcp-format-label" });
    gistP1.textContent = `${tRaw("settings.sync.gistDesc1")} ${tRaw("settings.sync.gistDesc2")}`;

    const gistP2 = desc.createEl("p", { cls: "mcp-format-label" });
    const gistB = gistP2.createEl("b");
    gistB.textContent = tRaw("settings.sync.gistHowTo");
    gistP2.createEl("br");
    gistP2.appendText("1. GitHub → Settings → Credentials");
    gistP2.createEl("br");
    gistP2.appendText("2. Personal access tokens → Tokens (classic)");
    gistP2.createEl("br");
    gistP2.appendText(`3. ${tRaw("settings.sync.gistHowToStep1")}`);
    gistP2.createEl("br");
    gistP2.appendText(`4. ${tRaw("settings.sync.gistHowToStep2")}`);

    new Setting(container)
      .setName(tRaw("settings.sync.githubToken"))
      .setDesc(tRaw("settings.sync.githubTokenDesc"))
      .addText((text) => {
        text
          .setPlaceholder("ghp_...")
          .setValue(this.plugin.options.githubToken || "")
          .onChange(async (value) => {
            await await this.plugin.writeOptions({ githubToken: value });
          });
        text.inputEl.type = "password";
        text.inputEl.addClass("mcp-input-xl");
      });

    new Setting(container)
      .setName(tRaw("settings.sync.gistSyncBtn"))
      .setDesc(tRaw("settings.sync.gistSyncBtnDesc"))
      .addButton((btn) =>
        btn
          .setButtonText(tRaw("settings.sync.gistSync"))
          .setCta()
          .onClick(async () => {
            const { syncToGist, gistSyncStatus, connectGist } =
              await import("./services/GistSyncService");
            const token = this.plugin.options.githubToken;

            if (!token) {
              new Notice(tRaw("settings.sync.gistTokenRequired"));
              return;
            }

            // Check token permissions first
            const connectResult = await connectGist(token);
            if (connectResult.warning) {
              new Notice(connectResult.warning);
              return;
            }
            if (!connectResult.success) {
              new Notice(tRaw("settings.general.errorPrefix", { error: connectResult.error }));
              return;
            }

            const result = await syncToGist();
            if (result.success) {
              const status = get(gistSyncStatus);
              // Re-render settings to show the URL field
              this.display();
              new Notice(
                tRaw("settings.sync.gistSyncComplete", { url: status.rawUrl }),
              );
            } else {
              new Notice(tRaw("settings.general.errorPrefix", { error: result.error }));
            }
          }),
      );

    new Setting(container)
      .setName(tRaw("settings.sync.gistAutoSync"))
      .setDesc(
        tRaw("settings.sync.gistAutoSyncDesc"),
      )
      .addToggle((toggle) => {
        toggle.setValue(!!this.plugin.options.gistAutoSync);
        toggle.onChange(async (value) => {
          const { setAutoSync } = await import("./services/GistSyncService");
          await await this.plugin.writeOptions({ gistAutoSync: value });
          setAutoSync(value);
          if (value) {
            // Show status
            const statusEl = document.getElementById("gist-auto-sync-status");
            if (statusEl)
              statusEl.textContent = tRaw("settings.sync.gistAutoSyncOn");
          }
        });
      });

    // Auto-sync status indicator
    const statusDesc = createDiv({ cls: "mcp-gist-sync-status" });
    statusDesc.id = "gist-auto-sync-status";
    statusDesc.textContent = this.plugin.options.gistAutoSync
      ? tRaw("settings.sync.gistAutoSyncOn")
      : tRaw("settings.sync.gistAutoSyncOff");
    container
      .querySelector(".setting-item:last-child")
      ?.appendChild(statusDesc);

    if (this.plugin.options.gistRawUrl) {
      new Setting(container)
        .setName(tRaw("settings.sync.gistCalendarUrl"))
        .setDesc(tRaw("settings.sync.gistCalendarUrlDesc"))
        .addText((text) => {
          text.setValue(this.plugin.options.gistRawUrl || "").setDisabled(true);
          text.inputEl.addClass("mcp-input-full");
        });
    }
  }

  addNotificationSettings(container: HTMLElement): void {
    new Setting(container)
      .setName(tRaw("settings.notifications.enabled"))
      .setDesc(tRaw("settings.notifications.enabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notificationsEnabled);
        toggle.onChange(async (value) => {
          await await this.plugin.writeOptions({ notificationsEnabled: value });
          this.plugin.notificationService?.restart();
        });
      });

    new Setting(container)
      .setName(tRaw("settings.notifications.reminderMinutes"))
      .setDesc(tRaw("settings.notifications.reminderMinutesDesc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("1", tRaw("settings.sync.intervalMinutes", { n: 1 }));
        dropdown.addOption("5", tRaw("settings.sync.intervalMinutes", { n: 5 }));
        dropdown.addOption("10", tRaw("settings.sync.intervalMinutes", { n: 10 }));
        dropdown.addOption("15", tRaw("settings.sync.intervalMinutes", { n: 15 }));
        dropdown.addOption("30", tRaw("settings.sync.intervalMinutes", { n: 30 }));
        dropdown.addOption("60", tRaw("settings.sync.intervalHour"));
        dropdown.setValue(String(this.plugin.options.reminderMinutesBefore));
        dropdown.onChange(async (value) => {
          await this.plugin.writeOptions({ reminderMinutesBefore: parseInt(value) });
        });
      });

    new Setting(container)
      .setName(tRaw("settings.notifications.typesTitle"))
      .setDesc(tRaw("settings.notifications.typesDesc"));

    new Setting(container)
      .setName(tRaw("settings.notifications.notifyReminders"))
      .setDesc(tRaw("settings.notifications.notifyRemindersDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyReminders);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ notifyReminders: value });
        });
      });

    new Setting(container)
      .setName(tRaw("settings.notifications.notifyOverdue"))
      .setDesc(tRaw("settings.notifications.notifyOverdueDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyOverdue);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ notifyOverdue: value });
        });
      });

    new Setting(container)
      .setName(tRaw("settings.notifications.notifyEstimateExceeded"))
      .setDesc(tRaw("settings.notifications.notifyEstimateExceededDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyEstimateExceeded);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ notifyEstimateExceeded: value });
        });
      });

    new Setting(container)
      .setName(tRaw("settings.notifications.notifyDeadlines"))
      .setDesc(tRaw("settings.notifications.notifyDeadlinesDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyDeadlines);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ notifyDeadlines: value });
        });
      });

    new Setting(container)
      .setName(tRaw("settings.notifications.ntfyEnabled"))
      .setDesc(tRaw("settings.notifications.ntfyEnabledDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.ntfyEnabled);
        toggle.onChange(async (value) => {
          if (value && !this.plugin.options.ntfyTopic) {
            const uuid = crypto.randomUUID();
            await await this.plugin.writeOptions({ ntfyEnabled: value, ntfyTopic: uuid });
            this.ntfyTopicText?.setValue(uuid);
          } else {
            await await this.plugin.writeOptions({ ntfyEnabled: value });
          }
          this.plugin.notificationService?.restart();
        });
      });

    new Setting(container)
      .setName(tRaw("settings.notifications.ntfyTopic"))
      .setDesc(tRaw("settings.notifications.ntfyTopicDesc"))
      .addText((text) => {
        this.ntfyTopicText = text;
        text
          .setPlaceholder("a7f9b2c4-8e1d-4f3a-9c5b-2d6e8f0a1b3c")
          .setValue(this.plugin.options.ntfyTopic)
          .onChange(async (value) => {
            await await this.plugin.writeOptions({ ntfyTopic: value });
          });
        text.inputEl.addClass("mcp-input-lg");
      });

    this.addNotificationDiagnostics(container);
  }

  private addNotificationDiagnostics(container: HTMLElement): void {
    new Setting(container).setName(tRaw("settings.notifications.sectionDiagnostics")).setHeading();

    const panel = container.createDiv({ cls: "mcp-notif-panel" });

    const render = async () => {
      panel.empty();
      const diagnostics = await loadNotificationDiagnostics(this.app);
      const permission = "Notification" in window
        ? Notification.permission
        : "unavailable";

      const toolbar = panel.createDiv({ cls: "mcp-notif-toolbar" });
      toolbar.createEl("div", {
        text: tRaw("settings.notifications.diagnosticsChannels"),
        cls: "setting-item-name",
      });
      const actions = toolbar.createDiv({ cls: "mcp-notif-actions" });
      const refreshBtn = actions.createEl("button", { text: tRaw("settings.notifications.diagnosticsRefresh") });
      refreshBtn.addClass("mod-cta");
      refreshBtn.addEventListener("click", () => void render());
      const clearBtn = actions.createEl("button", { text: tRaw("settings.notifications.diagnosticsClear") });
      clearBtn.addEventListener("click", async () => {
        await clearNotificationHistory(this.app);
        await render();
      });

      const grid = panel.createDiv({ cls: "mcp-notif-grid" });

      const addMetric = (label: string, value: string, tone: "ok" | "warn" | "bad" | "muted") => {
        const item = grid.createDiv({ cls: "mcp-notif-metric" });
        item.createDiv({
          text: label,
          cls: "setting-item-description mcp-notif-metric-label",
        });
        const toneClass = `mcp-notif-metric-${tone}`;
        item.createDiv({ text: value, cls: `mcp-notif-metric-value ${toneClass}` });
      };

      addMetric(
        tRaw("settings.notifications.diagnosticsLocal"),
        `${this.plugin.options.notificationsEnabled ? tRaw("common.enabled") : tRaw("common.disabled")} · ${this.formatNotificationPermission(permission)}`,
        this.plugin.options.notificationsEnabled && permission === "granted" ? "ok" : "warn"
      );

      panel.createEl("div", {
        text: tRaw("settings.notifications.diagnosticsHistory"),
        cls: "setting-item-name mcp-notif-history-heading",
      });

      const historyWrap = panel.createDiv({ cls: "mcp-notif-history" });

      if (diagnostics.history.length === 0) {
        historyWrap.createDiv({
          text: tRaw("settings.notifications.diagnosticsEmpty"),
          cls: "setting-item-description mcp-notif-history-empty",
        });
        return;
      }

      for (const entry of diagnostics.history.slice(0, 12)) {
        const row = historyWrap.createDiv({ cls: "mcp-notif-history-row" });
        row.createDiv({
          text: this.formatTelemetryDate(entry.createdAt),
          cls: "mcp-notif-history-date",
        });

        const content = row.createDiv();
        content.createDiv({ text: entry.title, cls: "mcp-notif-history-title" });
        content.createDiv({ text: entry.body, cls: "mcp-notif-history-body" });
        if (entry.error) {
          content.createDiv({ text: entry.error, cls: "mcp-notif-history-error" });
        }

        const badgeClass = entry.status === "sent"
          ? "mcp-notif-badge-sent"
          : entry.status === "failed"
            ? "mcp-notif-badge-failed"
            : "mcp-notif-badge-muted";
        row.createDiv({ text: `${entry.channel} · ${entry.status}`, cls: `mcp-notif-history-badge ${badgeClass}` });
      }
    };

    void render();
  }

  private formatNotificationPermission(permission: string): string {
    if (permission === "granted") return tRaw("settings.notifications.permissionAllowed");
    if (permission === "denied") return tRaw("settings.notifications.permissionDenied");
    if (permission === "default") return tRaw("settings.notifications.permissionNeeded");
    return tRaw("settings.notifications.permissionUnavailable");
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

  addNavPanelInstructions(container: HTMLElement): void {
    const wrapper = container.createDiv({ cls: "mcp-nav-instructions" });

    wrapper.createEl("p", { text: tRaw("settings.appearance.navInstructions1") });

    wrapper.createEl("pre", {
      text: "```calendar-nav\nschedule:" + tRaw("hello.navSchedule") + "\ntasks:" + tRaw("hello.navTasks") + "\nfinance:" + tRaw("hello.navFinance") + "\nanalytics:" + tRaw("hello.navAnalytics") + "\n```",
    });

    wrapper.createEl("p", { text: tRaw("settings.appearance.navInstructions2") });
    wrapper.createEl("p", { text: tRaw("settings.appearance.navInstructions3") });

    wrapper.createEl("pre", {
      text: "```calendar-nav\n%color:#fff;bg:#333;border-radius:20px;size:14px;accent:#5f99e1\nschedule:" + tRaw("hello.navSchedule") + "\n```",
    });

    wrapper.createEl("p", { text: tRaw("settings.appearance.navInstructions4") });

    new Setting(container)
      .setName(tRaw("settings.appearance.navInstructionsTitle"))
      .setDesc(wrapper);
  }

  addNavBtnStyleSettings(container: HTMLElement): void {
    new Setting(container)
      .setName(tRaw("settings.appearance.navBtnColor"))
      .setDesc(tRaw("settings.appearance.navBtnColorDesc"))
      .addText((text) => {
        text
          .setPlaceholder("#ffffff")
          .setValue(this.plugin.options.navBtnColor || "")
          .onChange(async (value) => {
            await await this.plugin.writeOptions({ navBtnColor: value });
          });
        text.inputEl.addClass("mcp-input-md");
      });

    new Setting(container)
      .setName(tRaw("settings.appearance.navBtnBg"))
      .setDesc(tRaw("settings.appearance.navBtnBgDesc"))
      .addText((text) => {
        text
          .setPlaceholder("#333333")
          .setValue(this.plugin.options.navBtnBg || "")
          .onChange(async (value) => {
            await await this.plugin.writeOptions({ navBtnBg: value });
          });
        text.inputEl.addClass("mcp-input-md");
      });

    new Setting(container)
      .setName(tRaw("settings.appearance.navBtnRadius"))
      .setDesc(tRaw("settings.appearance.navBtnRadiusDesc"))
      .addText((text) => {
        text
          .setPlaceholder("12px")
          .setValue(this.plugin.options.navBtnRadius || "")
          .onChange(async (value) => {
            await await this.plugin.writeOptions({ navBtnRadius: value });
          });
        text.inputEl.addClass("mcp-input-md");
      });

    new Setting(container)
      .setName(tRaw("settings.appearance.navBtnSize"))
      .setDesc(tRaw("settings.appearance.navBtnSizeDesc"))
      .addText((text) => {
        text
          .setPlaceholder("13px")
          .setValue(this.plugin.options.navBtnSize || "")
          .onChange(async (value) => {
            await await this.plugin.writeOptions({ navBtnSize: value });
          });
        text.inputEl.addClass("mcp-input-md");
      });

    new Setting(container)
      .setName(tRaw("settings.appearance.navAccentColor"))
      .setDesc(tRaw("settings.appearance.navAccentColorDesc"))
      .addText((text) => {
        text
          .setPlaceholder("#5f99e1")
          .setValue(this.plugin.options.navAccentColor || "")
          .onChange(async (value) => {
            await await this.plugin.writeOptions({ navAccentColor: value });
          });
        text.inputEl.addClass("mcp-input-md");
      });
  }
}
