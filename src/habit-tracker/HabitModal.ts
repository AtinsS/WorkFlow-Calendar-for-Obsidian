import { App, Modal, Setting } from "obsidian";

import type { IHabit } from "./types";

const DEFAULT_HABIT_COLORS = [
  "#ff6b6b", "#ffa502", "#ffd93d", "#6bcb77",
  "#4d96ff", "#9b59b6", "#e91e63", "#00b894",
  "#fd79a8", "#636e72",
];

export class HabitModal extends Modal {
  private habit: IHabit | null;
  private onSubmit: (habit: Partial<IHabit>) => void;

  private titleInput = "";
  private iconInput = "";
  private colorInput = DEFAULT_HABIT_COLORS[0];
  private frequencyInput: "daily" | "weekly" | "monthly" = "daily";
  private customDaysInput: number[] = [];
  private monthlyDayInput = 1;
  private targetCountInput = 1;

  constructor(
    app: App,
    onSubmit: (habit: Partial<IHabit>) => void,
    habit?: IHabit
  ) {
    super(app);
    this.onSubmit = onSubmit;
    this.habit = habit || null;

    if (this.habit) {
      this.titleInput = this.habit.title;
      this.iconInput = this.habit.icon;
      this.colorInput = this.habit.color;
      this.frequencyInput = this.habit.frequency as "daily" | "weekly" | "monthly";
      this.customDaysInput = this.habit.customDays || [];
      this.monthlyDayInput = this.habit.monthlyDay || 1;
      this.targetCountInput = this.habit.targetCount || 1;
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("task-tracker-modal");

    contentEl.createEl("h2", {
      text: this.habit ? "Редактировать привычку" : "Новая привычка",
    });

    new Setting(contentEl)
      .setName("Название")
      .addText((text) =>
        text
          .setPlaceholder("Название привычки")
          .setValue(this.titleInput)
          .onChange((value) => {
            this.titleInput = value;
          })
      );

    new Setting(contentEl)
      .setName("Иконка")
      .setDesc("Эмодзи или символ")
      .addText((text) =>
        text
          .setPlaceholder("💧")
          .setValue(this.iconInput)
          .onChange((value) => {
            this.iconInput = value;
          })
      );

    // Color picker
    const colorSetting = new Setting(contentEl).setName("Цвет");
    const colorGrid = colorSetting.settingEl.createDiv({
      cls: "task-tracker-color-grid",
    });

    for (const color of DEFAULT_HABIT_COLORS) {
      const swatch = colorGrid.createDiv({
        cls: `task-tracker-color-swatch ${color === this.colorInput ? "active" : ""}`,
      });
      swatch.style.backgroundColor = color;
      swatch.style.setProperty("--swatch-color", color);
      swatch.addEventListener("click", () => {
        this.colorInput = color;
        colorGrid
          .querySelectorAll(".task-tracker-color-swatch")
          .forEach((s) => s.removeClass("active"));
        swatch.addClass("active");
      });
    }

    new Setting(contentEl)
      .setName("Частота")
      .addDropdown((dropdown) => {
        dropdown.addOption("daily", "Ежедневно");
        dropdown.addOption("weekly", "Ежедневно (выбор дней)");
        dropdown.addOption("monthly", "Ежемесячно");
        dropdown.setValue(this.frequencyInput);
        dropdown.onChange((value) => {
          this.frequencyInput = value as "daily" | "weekly" | "monthly";
          this.updateFrequencySettingsVisibility();
        });
      });

    // Days of week — для frequency=weekly
    // Visual order: Mon-Sun, moment convention: 0=Sun,1=Mon,...,6=Sat
    this.customDaysSetting = new Setting(contentEl).setName("Дни недели");
    const dayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const dayIndices = [1, 2, 3, 4, 5, 6, 0];
    const daysContainer = this.customDaysSetting.settingEl.createDiv({
      cls: "task-tracker-recurrence-days",
    });
    for (let i = 0; i < 7; i++) {
      const momentIdx = dayIndices[i];
      const dayBtn = daysContainer.createEl("button", {
        text: dayLabels[i],
        cls: "task-tracker-recurrence-day-btn",
      });
      if (this.customDaysInput.includes(momentIdx)) {
        dayBtn.addClass("active");
      }
      dayBtn.addEventListener("click", () => {
        const idx = this.customDaysInput.indexOf(momentIdx);
        if (idx >= 0) {
          this.customDaysInput.splice(idx, 1);
          dayBtn.removeClass("active");
        } else {
          this.customDaysInput.push(momentIdx);
          this.customDaysInput.sort();
          dayBtn.addClass("active");
        }
      });
    }

    // Monthly day picker — для frequency=monthly
    this.monthlyDaySetting = new Setting(contentEl)
      .setName("День месяца")
      .setDesc("День месяца, когда выполнять привычку")
      .addText((text) => {
        text
          .setPlaceholder("1-31")
          .setValue(String(this.monthlyDayInput))
          .onChange((value) => {
            const v = parseInt(value) || 1;
            this.monthlyDayInput = Math.max(1, Math.min(31, v));
          });
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = "31";
        text.inputEl.style.maxWidth = "60px";
      });

    this.updateFrequencySettingsVisibility();

    const buttonsEl = contentEl.createDiv("task-tracker-modal-buttons");

    const cancelBtn = buttonsEl.createEl("button", { text: "Отмена" });
    cancelBtn.addEventListener("click", () => this.close());

    const submitBtn = buttonsEl.createEl("button", {
      text: this.habit ? "Сохранить" : "Создать",
      cls: "mod-cta",
    });
    submitBtn.addEventListener("click", () => this.handleSubmit());
  }

  private customDaysSetting: Setting;
  private monthlyDaySetting: Setting;

  private updateFrequencySettingsVisibility(): void {
    this.customDaysSetting.settingEl.style.display =
      this.frequencyInput === "weekly" ? "" : "none";
    this.monthlyDaySetting.settingEl.style.display =
      this.frequencyInput === "monthly" ? "" : "none";
  }

  private handleSubmit(): void {
    if (!this.titleInput.trim()) return;

    this.onSubmit({
      title: this.titleInput.trim(),
      icon: this.iconInput || "\u2728",
      color: this.colorInput,
      frequency: this.frequencyInput,
      customDays:
        this.frequencyInput === "weekly"
          ? [...this.customDaysInput]
          : undefined,
      monthlyDay:
        this.frequencyInput === "monthly"
          ? this.monthlyDayInput
          : undefined,
      targetCount: this.targetCountInput,
      archived: false,
    });

    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
