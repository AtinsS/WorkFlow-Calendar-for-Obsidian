import { App, PluginSettingTab, Setting, TFolder, requestUrl } from "obsidian";
import { appHasDailyNotesPluginLoaded } from "obsidian-daily-notes-interface";
import type { ILocaleOverride } from "obsidian-calendar-ui";
import { get } from "svelte/store";

import { DEFAULT_WORDS_PER_DOT } from "src/constants";
import { FolderSuggestModal } from "./modals/FolderSuggestModal";

import type CalendarPlugin from "./main";

export interface ISettings {
  wordsPerDot: number;
  shouldConfirmBeforeCreate: boolean;

  // View mode
  calendarInMainView?: boolean;

  // Weekly Note settings
  showWeeklyNote: boolean;
  weeklyNoteFormat: string;
  weeklyNoteTemplate: string;
  weeklyNoteFolder: string;

  localeOverride: ILocaleOverride;

  // Task Tracker settings
  showTaskTracker: boolean;
  taskTrackerCollapsed: boolean;

  // Task-Note sync settings
  syncAllTasksToNotes: boolean;
  tasksFolderPath: string;
  autoCleanupThreshold: number;
  timeLogCleanupThreshold: number;

  // Habit Tracker settings
  showHabitTracker: boolean;
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

  showTaskTracker: true,
  taskTrackerCollapsed: false,

  syncAllTasksToNotes: false,
  tasksFolderPath: "Tasks",
  autoCleanupThreshold: 180,
  timeLogCleanupThreshold: 180,

  showHabitTracker: true,
  habitLogCleanupThreshold: 1000,

  syncToVault: false,

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

    this.containerEl.createEl("h3", {
      text: "Расположение",
    });
    this.addCalendarInMainViewSetting();
    this.addShowStatusBarSetting();
    this.addDtwShowOnAllPagesSetting();

    this.containerEl.createEl("h3", {
      text: "Панели",
    });
    this.addShowTaskTrackerSetting();
    this.addShowHabitTrackerSetting();

    this.containerEl.createEl("h3", {
      text: "Внешний вид",
    });
    this.addAccentColorSetting();
    this.addGlassBgColorSetting();

    this.containerEl.createEl("h3", {
      text: "Расписание — отображаемые элементы",
    });
    this.addScheduleDisplaySettings();

    this.containerEl.createEl("h3", {
      text: "Погода",
    });
    this.addWeatherSettings();

    this.containerEl.createEl("h3", {
      text: "Синхронизация",
    });
    this.addSyncToVaultSetting();
    this.addSyncAdvice();

    this.containerEl.createEl("h3", {
      text: "Синхронизация задач с заметками",
    });
    this.addTaskNoteSyncSettings();

    this.containerEl.createEl("h3", {
      text: "Уведомления",
    });
    this.addNotificationSettings();

    this.containerEl.createEl("h3", {
      text: "Рабочие задачи",
    });
    this.addWorkTaskSettings();

    this.addGitHubGistSettings();

    this.containerEl.createEl("h3", {
      text: "Панель навигации в заметках",
    });
    this.addNavPanelInstructions();

    this.containerEl.createEl("h3", {
      text: "Стиль кнопок навигации",
    });
    this.addNavBtnStyleSettings();
  }

  addCalendarInMainViewSetting(): void {
    new Setting(this.containerEl)
      .setName("Календарь в основной вкладке")
      .setDesc(
        "Отображать календарь по центру основного окна вместо правого сайдбара. Требуется перезапуск для применения.",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.calendarInMainView);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ calendarInMainView: value });
        });
      });
  }

  addShowStatusBarSetting(): void {
    new Setting(this.containerEl)
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

  addDtwShowOnAllPagesSetting(): void {
    new Setting(this.containerEl)
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

  addShowTaskTrackerSetting(): void {
    new Setting(this.containerEl)
      .setName("Показывать трекер задач")
      .setDesc("Отображать панель трекера задач под календарём")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.showTaskTracker);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ showTaskTracker: value });
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

  addShowHabitTrackerSetting(): void {
    new Setting(this.containerEl)
      .setName("Показывать трекер привычек")
      .setDesc("Отображать панель трекера привычек под календарём")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.showHabitTracker);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ showHabitTracker: value });
        });
      });

    new Setting(this.containerEl)
      .setName("Лимит логов привычек")
      .setDesc(
        "Максимальное количество записей логов привычек. При превышении старые записи удаляются автоматически.",
      )
      .addText((text) => {
        text
          .setPlaceholder("1000")
          .setValue(
            String(this.plugin.options.habitLogCleanupThreshold || 1000),
          )
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 50) {
              await this.plugin.writeOptions({ habitLogCleanupThreshold: num });
            }
          });
        text.inputEl.type = "number";
        text.inputEl.min = "50";
        text.inputEl.max = "10000";
        text.inputEl.style.maxWidth = "100px";
      });
  }

  addScheduleDisplaySettings(): void {
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
      new Setting(this.containerEl)
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

  addWeatherSettings(): void {
    const opts = this.plugin.options;

    new Setting(this.containerEl)
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

    new Setting(this.containerEl)
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

    new Setting(this.containerEl)
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

  addAccentColorSetting(): void {
    const currentColor = this.plugin.options.accentColor || "#5f99e1";

    const setting = new Setting(this.containerEl)
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

  addGlassBgColorSetting(): void {
    const currentColor = this.plugin.options.glassBgColor || "#1e2332";
    const currentOpacity = this.plugin.options.glassOpacity ?? 55;

    const setting = new Setting(this.containerEl)
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

    new Setting(this.containerEl)
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

  addSyncToVaultSetting(): void {
    new Setting(this.containerEl)
      .setName("Синхронизация в корень хранилища")
      .setDesc(
        "Сохранять данные в папку calendar-data/ в корне хранилища вместо папки плагина. Позволяет синхронизировать задачи и привычки через Obsidian Sync, iCloud или Git.",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.syncToVault);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ syncToVault: value });
        });
      });
  }

  addSyncAdvice(): void {
    const desc = document.createElement("div");
    desc.addClass("setting-item-description");
    desc.style.marginTop = "8px";
    desc.innerHTML = `
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Remotely Save:</b> В настройках плагина добавьте папку <code>calendar-data/</code> в список синхронизируемых файлов (Include Files).
      </p>
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>Obsidian Sync:</b> Включите синхронизацию файлов — папка <code>calendar-data/</code> будет синхронизирована автоматически.
      </p>
      <p style="margin: 4px 0; font-size: 12px; color: var(--text-faint);">
        <b>iCloud / Google Drive:</b> Убедитесь, что хранилище синхронизируется полностью.
      </p>
    `;
    this.containerEl.appendChild(desc);
  }

  addTaskNoteSyncSettings(): void {
    new Setting(this.containerEl)
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

    new Setting(this.containerEl)
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

    new Setting(this.containerEl)
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

    new Setting(this.containerEl)
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
    this.containerEl.appendChild(formatInfo);
  }

  addNotificationSettings(): void {
    new Setting(this.containerEl)
      .setName("Включить уведомления")
      .setDesc("Показывать уведомления о запланированных задачах")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notificationsEnabled);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ notificationsEnabled: value });
        });
      });

    new Setting(this.containerEl)
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

    new Setting(this.containerEl)
      .setName("Типы уведомлений")
      .setDesc("Выберите, какие типы уведомлений включить");

    new Setting(this.containerEl)
      .setName("Напоминания")
      .setDesc("Напоминание за N минут до запланированного времени")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyReminders);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ notifyReminders: value });
        });
      });

    new Setting(this.containerEl)
      .setName("Просроченные задачи")
      .setDesc("Уведомление, когда задача становится просроченной")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyOverdue);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ notifyOverdue: value });
        });
      });

    new Setting(this.containerEl)
      .setName("Превышение лимита времени")
      .setDesc("Уведомление, когда время работы превышает оценку")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyEstimateExceeded);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ notifyEstimateExceeded: value });
        });
      });

    new Setting(this.containerEl)
      .setName("Дедлайны")
      .setDesc("Уведомления о дедлайнах (завтра, сегодня, истёк)")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.notifyDeadlines);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ notifyDeadlines: value });
        });
      });

    new Setting(this.containerEl)
      .setName("Отправлять в ntfy.sh")
      .setDesc("Дублировать уведомления на смартфон через ntfy.sh")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.options.ntfyEnabled);
        toggle.onChange(async (value) => {
          this.plugin.writeOptions({ ntfyEnabled: value });
          this.syncNotificationSettingsToVault();
        });
      });

    new Setting(this.containerEl)
      .setName("Topic для ntfy.sh")
      .setDesc("Имя топика для получения уведомлений в приложении ntfy")
      .addText((text) => {
        text
          .setPlaceholder("Calendar_Remastered")
          .setValue(this.plugin.options.ntfyTopic)
          .onChange(async (value) => {
            await this.plugin.writeOptions({ ntfyTopic: value });
            await this.syncNotificationSettingsToVault({ ntfyTopic: value });
          });
        text.inputEl.style.maxWidth = "250px";
      });

    new Setting(this.containerEl)
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
                body: "Тестовое уведомление из Calendar Remastered",
              });
              alert(`Тестовое уведомление отправлено в ${topic}`);
            } catch (e) {
              alert(`Ошибка отправки: ${e}`);
            }
          }),
      );

    this.containerEl.createEl("h4", {
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
    this.containerEl.appendChild(ghDesc);

    new Setting(this.containerEl)
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

    new Setting(this.containerEl)
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

    new Setting(this.containerEl)
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
    if (!this.plugin.options.syncToVault) return;
    const { saveNotificationSyncSettings } = await import("./io/vaultStorage");
    const payload = {
      overdueCheckEnabled: overrides?.overdueCheckEnabled ?? this.plugin.options.overdueCheckEnabled,
      ntfyTopic: overrides?.ntfyTopic ?? this.plugin.options.ntfyTopic,
    };
    await saveNotificationSyncSettings(this.app, payload);
  }

  addWorkTaskSettings(): void {
    new Setting(this.containerEl)
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

    new Setting(this.containerEl)
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

  addGitHubGistSettings(): void {
    this.containerEl.createEl("h3", {
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
    this.containerEl.appendChild(desc);

    new Setting(this.containerEl)
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

    new Setting(this.containerEl)
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

    new Setting(this.containerEl)
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
    this.containerEl
      .querySelector(".setting-item:last-child")
      ?.appendChild(statusDesc);

    if (this.plugin.options.gistRawUrl) {
      new Setting(this.containerEl)
        .setName("URL календаря")
        .setDesc("Добавьте этот URL в Google Calendar или другой календарь")
        .addText((text) => {
          text.setValue(this.plugin.options.gistRawUrl || "").setDisabled(true);
          text.inputEl.style.maxWidth = "500px";
        });
    }
  }

  addNavPanelInstructions(): void {
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

    new Setting(this.containerEl)
      .setName("Инструкция по панели навигации")
      .setDesc(desc);
  }

  addNavBtnStyleSettings(): void {
    new Setting(this.containerEl)
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

    new Setting(this.containerEl)
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

    new Setting(this.containerEl)
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

    new Setting(this.containerEl)
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

    new Setting(this.containerEl)
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
