import { App, PluginSettingTab, Setting, TFolder, TextComponent, requestUrl } from "obsidian";
import { generateId } from "./utils/id";
import { appHasDailyNotesPluginLoaded } from "obsidian-daily-notes-interface";
import type { ILocaleOverride } from "obsidian-calendar-ui";
import { get } from "svelte/store";

import { DEFAULT_WORDS_PER_DOT } from "src/constants";
import { FolderSuggestModal } from "./modals/FolderSuggestModal";

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

  // Hello view settings
  userName?: string;
  helloShowHabits?: boolean;
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

  helloShowHabits: true,
  helloShowTasksBtn: true,
  helloShowAnalyticsBtn: true,
  helloShowFinanceBtn: true,
  helloShowScheduleBtn: true,

  taskTrackerCollapsed: false,

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
      .setName("Показывать привычки в приветствии")
      .setDesc("Отображать карточку привычек на сегодня в блоке приветствия")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.helloShowHabits !== false);
        toggle.onChange(async (value) => {
          await this.plugin.writeOptions({ helloShowHabits: value });
        });
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
            try {
              await requestUrl({
                url: `https://ntfy.sh/${topic}`,
                method: "POST",
                body: "Тестовое уведомление из WorkLife Calendar",
              });
              alert(`Тестовое уведомление отправлено в ${topic}`);
            } catch (e) {
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
        2. Настройте git push в репозиторий (Obsidian Git или вручную)<br>
        3. Создайте токен: GitHub → Settings → Credentials → Personal access tokens (классический) с правами <code>repo</code> + <code>actions:write</code><br>
        4. Вставьте токен в поле ниже
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

    new Setting(container)
      .setName("Vault репозиторий")
      .setDesc("GitHub репозиторий с vault (формат: owner/repo)")
      .addText((text) => {
        text
          .setPlaceholder("AtinsS/ObsidianVaultRaven")
          .setValue(this.plugin.options.vaultRepo || "")
          .onChange(async (value) => {
            await this.plugin.writeOptions({ vaultRepo: value });
          });
        text.inputEl.style.maxWidth = "300px";
      });

    new Setting(container)
      .setName("GitHub токен для Actions")
      .setDesc(
        "Personal access token с правами repo/public_repo + actions:write",
      )
      .addText((text) => {
        text
          .setPlaceholder("ghp_...")
          .setValue(this.plugin.options.workflowToken || "")
          .onChange(async (value) => {
            await this.plugin.writeOptions({ workflowToken: value });
          });
        text.inputEl.type = "password";
        text.inputEl.style.maxWidth = "300px";
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
