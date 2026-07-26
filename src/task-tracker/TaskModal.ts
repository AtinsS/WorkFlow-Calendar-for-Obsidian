import { App, Modal } from "obsidian";
import { get } from "svelte/store";
import { getDateUID } from "obsidian-daily-notes-interface";

import type { ITask, RecurrenceConfig } from "./types";
import { projects, selectedDate } from "./stores";
import { settings } from "../ui/stores";
import { FileSuggestModal } from "../modals/FileSuggestModal";
import { FolderSuggestModal } from "../modals/FolderSuggestModal";

export class TaskModal extends Modal {
  private task: ITask | null;
  private onSubmit: (task: Partial<ITask>) => void;

  private titleInput = "";
  private descriptionInput = "";
  private projectId: string | null = null;
  private dateUID = "";
  private dateValue = "";
  private priority: "low" | "medium" | "high" = "medium";
  private notePathInput = "";
  private recurrenceType: "none" | "daily" | "weekly" | "monthly" = "none";
  private recurrenceInterval = 1;
  private recurrenceDaysOfWeek: number[] = [];
  private recurrenceUntilDateUID = "";
  private recurrenceUntilDateValue = "";
  private estimatedTimeHours = "0";
  private estimatedTimeMinutes = "30";
  private scheduledTime = "";
  private isWorkTask = false;
  private paymentType: "hour" | "day" = "hour";
  private rate = "";
  private overtimeStart = "";
  private overtimeMultiplier = "";
  private deadlineDateUID = "";
  private deadlineDateValue = "";
  private deadlineTime = "";
  private titleInputEl: HTMLInputElement | null = null;
  private descriptionInputEl: HTMLTextAreaElement | null = null;
  private descCounterEl: HTMLSpanElement | null = null;

  private advancedBody: HTMLDivElement | null = null;
  private estHoursEl: HTMLInputElement | null = null;
  private estMinsEl: HTMLInputElement | null = null;
  private recurrenceSubEl: HTMLDivElement | null = null;
  private workTaskSubEl: HTMLDivElement | null = null;

  private updateDescCounter(): void {
    if (!this.descCounterEl) return;
    const len = (this.descriptionInput || "").length;
    this.descCounterEl.textContent = len > 0 ? `Макс. 100 символов (${len}/100)` : "";
    this.descCounterEl.style.color = len > 100 ? "var(--text-error, #ef4436)" : "";
  }

  constructor(
    app: App,
    onSubmit: (task: Partial<ITask>) => void,
    task?: ITask,
    initialDate?: string,
    initialTime?: string,
    initialEstimatedTime?: number
  ) {
    super(app);
    this.onSubmit = onSubmit;
    this.task = task || null;

    if (this.task) {
      this.titleInput = this.task.title;
      this.descriptionInput = this.task.description || "";
      this.projectId = this.task.projectId;
      this.dateUID = this.task.dateUID;
      this.dateValue = this.extractDateValue(this.task.dateUID);
      this.priority = this.task.priority;
      this.notePathInput = this.task.boundNotePath || "";
      if (this.task.recurrence) {
        this.recurrenceType = this.task.recurrence.type;
        this.recurrenceInterval = this.task.recurrence.interval || 1;
        this.recurrenceDaysOfWeek = this.task.recurrence.daysOfWeek || [];
        if (this.task.recurrence.until) {
          this.recurrenceUntilDateUID = this.task.recurrence.until;
          this.recurrenceUntilDateValue = this.extractDateValue(this.task.recurrence.until);
        }
      }
      if (this.task.estimatedTime) {
        const totalMin = this.task.estimatedTime;
        this.estimatedTimeHours = String(Math.floor(totalMin / 60));
        this.estimatedTimeMinutes = String(totalMin % 60);
      }
      if (this.task.scheduledTime) this.scheduledTime = this.task.scheduledTime;
      if (this.task.isWorkTask) {
        this.isWorkTask = this.task.isWorkTask;
        this.paymentType = this.task.paymentType || "hour";
        this.rate = this.task.rate ? String(this.task.rate) : "";
        if (this.task.overtimeStart) this.overtimeStart = String(this.task.overtimeStart);
        if (this.task.overtimeMultiplier) this.overtimeMultiplier = String(this.task.overtimeMultiplier);
      }
      if (this.task.deadline) {
        this.deadlineDateUID = this.task.deadline;
        this.deadlineDateValue = this.extractDateValue(this.task.deadline);
      }
      if (this.task.deadlineTime) this.deadlineTime = this.task.deadlineTime;
    } else {
      if (initialDate) {
        this.dateValue = initialDate;
        const m = window.moment(initialDate, "YYYY-MM-DD", true);
        if (m.isValid()) this.dateUID = getDateUID(m, "day");
      } else {
        this.dateUID = get(selectedDate) || "";
        this.dateValue = this.extractDateValue(this.dateUID);
      }
      if (initialTime) this.scheduledTime = initialTime;
      if (initialEstimatedTime && initialEstimatedTime > 0) {
        this.estimatedTimeHours = String(Math.floor(initialEstimatedTime / 60));
        this.estimatedTimeMinutes = String(initialEstimatedTime % 60);
      }
      const cs = get(settings);
      this.paymentType = cs.defaultPaymentType || "hour";
      this.rate = cs.defaultRate ? String(cs.defaultRate) : "";
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("tm");

    // ── Header ──
    const header = contentEl.createDiv({ cls: "tm-header" });
    header.createEl("h2", { text: this.task ? "Редактировать задачу" : "Новая задача", cls: "tm-title" });


    // ═══ 1. Название ═══
    const titleWrap = contentEl.createDiv({ cls: "tm-field" });
    titleWrap.createEl("label", { text: "Название *", cls: "tm-label" });
    this.titleInputEl = titleWrap.createEl("input", {
      type: "text", cls: "tm-input", placeholder: "Введите название задачи...",
      value: this.titleInput,
    });
    this.titleInputEl.addEventListener("input", () => { this.titleInput = this.titleInputEl?.value ?? ""; });

    // ═══ 2. Описание ═══
    const descWrap = contentEl.createDiv({ cls: "tm-field" });
    descWrap.createEl("label", { text: "Описание", cls: "tm-label" });
    this.descriptionInputEl = descWrap.createEl("textarea", {
      cls: "tm-textarea", placeholder: "Добавьте описание задачи (необязательно)",
    }) as HTMLTextAreaElement;
    this.descriptionInputEl.value = this.descriptionInput;
    this.descriptionInputEl.rows = 3;
    this.descCounterEl = descWrap.createEl("span", { cls: "tm-char-counter" });
    this.updateDescCounter();
    this.descriptionInputEl.addEventListener("input", () => {
      this.descriptionInput = this.descriptionInputEl?.value ?? "";
      this.updateDescCounter();
    });

    // ═══ 3. Проект + Приоритет (в одну строку) ═══
    const projPriRow = contentEl.createDiv({ cls: "tm-row-2" });

    // Проект
    const projWrap = projPriRow.createDiv({ cls: "tm-field tm-half" });
    projWrap.createEl("label", { text: "Проект", cls: "tm-label" });
    const projSelect = projWrap.createEl("select", { cls: "tm-select" });
    projSelect.createEl("option", { value: "", text: "Без проекта" });
    for (const p of get(projects)) {
      const opt = projSelect.createEl("option", { value: p.id, text: `${p.icon} ${p.name}` });
      if (p.id === this.projectId) opt.selected = true;
    }
    projSelect.addEventListener("change", () => { this.projectId = projSelect.value || null; });

    // Приоритет
    const priWrap = projPriRow.createDiv({ cls: "tm-field tm-half" });
    priWrap.createEl("label", { text: "Приоритет", cls: "tm-label" });
    const priRow = priWrap.createDiv({ cls: "tm-pri-btns" });
    const priDefs: Array<{ v: string; l: string; c: string }> = [
      { v: "low", l: "Низкий", c: "#4caf50" },
      { v: "medium", l: "Средний", c: "#ff9800" },
      { v: "high", l: "Высокий", c: "#f44336" },
    ];
    for (const p of priDefs) {
      const btn = priRow.createEl("button", { cls: "tm-pri-btn" + (this.priority === p.v ? " active" : "") });
      btn.createSpan({ cls: "tm-pri-dot" }).style.background = p.c;
      btn.createSpan({ text: p.l });
      btn.addEventListener("click", () => {
        this.priority = p.v as any;
        priRow.querySelectorAll(".tm-pri-btn").forEach((b) => b.removeClass("active"));
        btn.addClass("active");
      });
    }

    // ═══ 4. Планирование: Дата + Время ═══
    const planHeader = contentEl.createDiv({ cls: "tm-section-header" });
    planHeader.createEl("span", { text: "📅", cls: "tm-section-icon" });
    planHeader.createEl("span", { text: "Планирование", cls: "tm-section-title" });

    const dateRow = contentEl.createDiv({ cls: "tm-row-2" });

    // Дата
    const dateWrap = dateRow.createDiv({ cls: "tm-field tm-half" });
    dateWrap.createEl("label", { text: "Дата", cls: "tm-label" });
    const dateInput = dateWrap.createEl("input", {
      type: "date", cls: "tm-input", value: this.dateValue,
    });
    dateInput.addEventListener("change", () => {
      this.dateValue = dateInput.value;
      if (this.dateValue) {
        const m = window.moment(this.dateValue, "YYYY-MM-DD", true);
        if (m.isValid()) this.dateUID = getDateUID(m, "day");
      } else { this.dateUID = ""; }
    });

    // Время
    const timeWrap = dateRow.createDiv({ cls: "tm-field tm-half" });
    timeWrap.createEl("label", { text: "Время", cls: "tm-label" });
    const timeInput = timeWrap.createEl("input", {
      type: "time", cls: "tm-input", value: this.scheduledTime,
    });
    timeInput.addEventListener("change", () => { this.scheduledTime = timeInput.value; });

    // ═══ 5. Длительность ═══
    const durWrap = contentEl.createDiv({ cls: "tm-field" });
    durWrap.createEl("label", { text: "Длительность (ожидаемое время)", cls: "tm-label" });
    const durRow = durWrap.createDiv({ cls: "tm-dur-row" });
    durRow.createEl("span", { text: "🕐", cls: "tm-dur-icon" });

    this.estHoursEl = durRow.createEl("input", {
      type: "number", cls: "tm-dur-input", value: this.estimatedTimeHours, attr: { min: "0", max: "24" },
    }) as HTMLInputElement;
    this.estHoursEl.addEventListener("change", () => { this.estimatedTimeHours = this.estHoursEl?.value ?? "0"; });

    durRow.createEl("span", { text: " ч ", cls: "tm-dur-sep" });

    this.estMinsEl = durRow.createEl("input", {
      type: "number", cls: "tm-dur-input", value: this.estimatedTimeMinutes, attr: { min: "0", max: "59" },
    }) as HTMLInputElement;
    this.estMinsEl.addEventListener("change", () => { this.estimatedTimeMinutes = this.estMinsEl?.value ?? "0"; });

    durRow.createEl("span", { text: " мин", cls: "tm-dur-sep" });

    const decBtn = durRow.createEl("button", { text: "−", cls: "tm-dur-btn" });
    const incBtn = durRow.createEl("button", { text: "+", cls: "tm-dur-btn" });

    decBtn.addEventListener("click", () => {
      const mins = (parseInt(this.estimatedTimeHours) || 0) * 60 + (parseInt(this.estimatedTimeMinutes) || 0);
      const newMins = Math.max(0, mins - 15);
      this.estimatedTimeHours = String(Math.floor(newMins / 60));
      this.estimatedTimeMinutes = String(newMins % 60);
      if (this.estHoursEl) this.estHoursEl.value = this.estimatedTimeHours;
      if (this.estMinsEl) this.estMinsEl.value = this.estimatedTimeMinutes;
    });

    incBtn.addEventListener("click", () => {
      const mins = (parseInt(this.estimatedTimeHours) || 0) * 60 + (parseInt(this.estimatedTimeMinutes) || 0);
      const newMins = Math.min(24 * 60, mins + 15);
      this.estimatedTimeHours = String(Math.floor(newMins / 60));
      this.estimatedTimeMinutes = String(newMins % 60);
      if (this.estHoursEl) this.estHoursEl.value = this.estimatedTimeHours;
      if (this.estMinsEl) this.estMinsEl.value = this.estimatedTimeMinutes;
    });

    // ═══ 6. Дополнительные параметры ═══
    const advWrap = contentEl.createDiv({ cls: "tm-advanced" });
    const advToggle = advWrap.createDiv({ cls: "tm-adv-toggle" });
    advToggle.createEl("span", { text: "▾", cls: "tm-adv-chevron" });
    advToggle.createEl("span", { text: "Дополнительные параметры", cls: "tm-adv-label" });
    this.advancedBody = advWrap.createDiv({ cls: "tm-adv-body" });
    this.advancedBody.style.display = "none";

    advToggle.addEventListener("click", () => {
      const show = this.advancedBody!.style.display === "none";
      this.advancedBody!.style.display = show ? "" : "none";
      advToggle.querySelector(".tm-adv-chevron")!.textContent = show ? "▾" : "▸";
    });

    // --- Дедлайн ---
    const dlRow = this.advancedBody.createDiv({ cls: "tm-adv-row" });
    const dlLabel = dlRow.createDiv({ cls: "tm-adv-label-item" });
    dlLabel.createEl("span", { text: "📅" });
    dlLabel.createEl("span", { text: "Дедлайн" });
    const dlInput = dlRow.createEl("input", {
      type: "date", cls: "tm-input tm-adv-input", value: this.deadlineDateValue,
    });
    dlInput.addEventListener("change", () => {
      this.deadlineDateValue = dlInput.value;
      if (this.deadlineDateValue) {
        const m = window.moment(this.deadlineDateValue, "YYYY-MM-DD", true);
        if (m.isValid()) this.deadlineDateUID = getDateUID(m, "day");
      } else { this.deadlineDateUID = ""; }
    });

    // --- Повторение ---
    const recRow = this.advancedBody.createDiv({ cls: "tm-adv-row" });
    const recLabel = recRow.createDiv({ cls: "tm-adv-label-item" });
    recLabel.createEl("span", { text: "🔄" });
    recLabel.createEl("span", { text: "Повторение" });
    const recSelect = recRow.createEl("select", { cls: "tm-select tm-adv-input" });
    recSelect.createEl("option", { value: "none", text: "Нет" });
    recSelect.createEl("option", { value: "daily", text: "Ежедневно" });
    recSelect.createEl("option", { value: "weekly", text: "Еженедельно" });
    recSelect.createEl("option", { value: "monthly", text: "Ежемесячно" });
    recSelect.value = this.recurrenceType;
    recSelect.addEventListener("change", () => {
      this.recurrenceType = recSelect.value as any;
      this.updateRecurrenceSubFields();
    });

    // Sub-fields for recurrence
    this.recurrenceSubEl = this.advancedBody.createDiv({ cls: "tm-adv-sub" });

    // Интервал
    const intRow = this.recurrenceSubEl.createDiv({ cls: "tm-adv-row" });
    const intLabel = intRow.createDiv({ cls: "tm-adv-label-item" });
    intLabel.createEl("span", { text: "Интервал" });
    const intInput = intRow.createEl("input", {
      type: "number", cls: "tm-input tm-adv-input", value: String(this.recurrenceInterval), attr: { min: "1" },
    }) as HTMLInputElement;
    intInput.style.maxWidth = "80px";
    intInput.addEventListener("input", () => { this.recurrenceInterval = Math.max(1, parseInt(intInput.value) || 1); });

    // Дни недели
    const daysRow = this.recurrenceSubEl.createDiv({ cls: "tm-adv-row tm-adv-row-days" });
    const daysLabel = daysRow.createDiv({ cls: "tm-adv-label-item" });
    daysLabel.createEl("span", { text: "Дни" });
    const daysContainer = daysRow.createDiv({ cls: "tm-days-btns" });
    const dayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const dayIndices = [1, 2, 3, 4, 5, 6, 0];
    for (let i = 0; i < 7; i++) {
      const momentIdx = dayIndices[i];
      const dayBtn = daysContainer.createEl("button", { text: dayLabels[i], cls: "tm-day-btn" });
      if (this.recurrenceDaysOfWeek.includes(momentIdx)) dayBtn.addClass("active");
      dayBtn.addEventListener("click", () => {
        const idx = this.recurrenceDaysOfWeek.indexOf(momentIdx);
        if (idx >= 0) { this.recurrenceDaysOfWeek.splice(idx, 1); dayBtn.removeClass("active"); }
        else { this.recurrenceDaysOfWeek.push(momentIdx); this.recurrenceDaysOfWeek.sort(); dayBtn.addClass("active"); }
      });
    }

    // Повторять до
    const untilRow = this.recurrenceSubEl.createDiv({ cls: "tm-adv-row" });
    const untilLabel = untilRow.createDiv({ cls: "tm-adv-label-item" });
    untilLabel.createEl("span", { text: "Повторять до" });
    const untilInput = untilRow.createEl("input", {
      type: "date", cls: "tm-input tm-adv-input", value: this.recurrenceUntilDateValue,
    });
    untilInput.addEventListener("change", () => {
      this.recurrenceUntilDateValue = untilInput.value;
      if (this.recurrenceUntilDateValue) {
        const m = window.moment(this.recurrenceUntilDateValue, "YYYY-MM-DD", true);
        if (m.isValid()) this.recurrenceUntilDateUID = getDateUID(m, "day");
      } else { this.recurrenceUntilDateUID = ""; }
    });

    this.updateRecurrenceSubFields();

    // --- Связать с заметкой ---
    const noteRow = this.advancedBody.createDiv({ cls: "tm-adv-row" });
    const noteLabel = noteRow.createDiv({ cls: "tm-adv-label-item" });
    noteLabel.createEl("span", { text: "🔗" });
    noteLabel.createEl("span", { text: "Связать с заметкой" });
    const noteInput = noteRow.createEl("input", {
      type: "text", cls: "tm-input tm-adv-input", placeholder: "Путь к заметке...",
      value: this.notePathInput,
    });
    noteInput.addEventListener("input", () => { this.notePathInput = noteInput.value; });
    const noteBtn = noteRow.createEl("button", { text: "...", cls: "tm-adv-file-btn" });
    noteBtn.addEventListener("click", () => {
      new FileSuggestModal(this.app, (filePath) => {
        this.notePathInput = filePath;
        noteInput.value = filePath;
      }).open();
    });
    const createNoteBtn = noteRow.createEl("button", { text: "+", cls: "tm-adv-file-btn" });
    createNoteBtn.setAttribute("title", "Создать новую заметку");
    createNoteBtn.addEventListener("click", () => {
      new FolderSuggestModal(this.app, async (folder) => {
        const title = this.titleInput.trim() || "Заметка";
        const filename = title.replace(/[\\/:*?"<>|]/g, "_") + ".md";
        const path = `${folder}/${filename}`;
        const parts = path.split("/");
        if (parts.length > 1) {
          const folderPath = parts.slice(0, -1).join("/");
          if (!this.app.vault.getAbstractFileByPath(folderPath)) {
            await this.app.vault.createFolder(folderPath);
          }
        }
        let file = this.app.vault.getAbstractFileByPath(path);
        if (!file) {
          file = await this.app.vault.create(path, "");
        }
        this.notePathInput = path;
        noteInput.value = path;
      }).open();
    });

    // --- Рабочая задача ---
    const workRow = this.advancedBody.createDiv({ cls: "tm-adv-row tm-adv-row-toggle" });
    const workLabelWrap = workRow.createDiv({ cls: "tm-adv-label-item" });
    workLabelWrap.createEl("span", { text: "💎" });
    const workLabel = workLabelWrap.createEl("span");
    workLabel.createEl("span", { text: "Учитывать в рабочем времени" });
    workLabel.createEl("br");
    workLabel.createEl("span", { text: "Задача будет учитываться в статистике и планировании", cls: "tm-adv-sublabel" });
    const workToggle = workRow.createEl("label", { cls: "tm-toggle" });
    const workCheckbox = workToggle.createEl("input", { type: "checkbox", cls: "tm-toggle-input" }) as HTMLInputElement;
    workCheckbox.checked = this.isWorkTask;
    workToggle.createEl("span", { cls: "tm-toggle-slider" });
    workCheckbox.addEventListener("change", () => { this.isWorkTask = workCheckbox.checked; this.updateWorkTaskSettings(); });

    // --- Work task sub-fields (raw DOM — no Setting class) ---
    this.workTaskSubEl = this.advancedBody.createDiv({ cls: "tm-adv-sub" });

    // Тип оплаты
    const payRow = this.workTaskSubEl.createDiv({ cls: "tm-adv-row" });
    const payLabel = payRow.createDiv({ cls: "tm-adv-label-item" });
    payLabel.createEl("span", { text: "Тип оплаты" });
    const paySelect = payRow.createEl("select", { cls: "tm-select tm-adv-input" });
    paySelect.createEl("option", { value: "hour", text: "В час" });
    paySelect.createEl("option", { value: "day", text: "В день" });
    paySelect.value = this.paymentType;
    paySelect.addEventListener("change", () => { this.paymentType = paySelect.value as any; this.updateWorkTaskSubFields(); });

    // Ставка
    const rateRow = this.workTaskSubEl.createDiv({ cls: "tm-adv-row" });
    const rateLabel = rateRow.createDiv({ cls: "tm-adv-label-item" });
    rateLabel.createEl("span", { text: "Ставка (₽)" });
    const rateInput = rateRow.createEl("input", {
      type: "number", cls: "tm-input tm-adv-input", value: this.rate, placeholder: "0", attr: { min: "0" },
    }) as HTMLInputElement;
    rateInput.style.maxWidth = "120px";
    rateInput.addEventListener("input", () => { this.rate = rateInput.value.replace(/[^0-9.,]/g, ""); });

    // Переработки с
    const otStartRow = this.workTaskSubEl.createDiv({ cls: "tm-adv-row" });
    const otStartLabel = otStartRow.createDiv({ cls: "tm-adv-label-item" });
    otStartLabel.createEl("span", { text: "Переработки с (час)" });
    const otStartInput = otStartRow.createEl("input", {
      type: "number", cls: "tm-input tm-adv-input", value: this.overtimeStart, placeholder: "8", attr: { min: "1", max: "24" },
    }) as HTMLInputElement;
    otStartInput.style.maxWidth = "60px";
    otStartInput.addEventListener("input", () => { this.overtimeStart = otStartInput.value.replace(/[^0-9]/g, ""); });

    // Множитель
    const otMulRow = this.workTaskSubEl.createDiv({ cls: "tm-adv-row" });
    const otMulLabel = otMulRow.createDiv({ cls: "tm-adv-label-item" });
    otMulLabel.createEl("span", { text: "Множитель" });
    const otMulInput = otMulRow.createEl("input", {
      type: "number", cls: "tm-input tm-adv-input", value: this.overtimeMultiplier, placeholder: "1.5", attr: { min: "1", max: "10", step: "0.1" },
    }) as HTMLInputElement;
    otMulInput.style.maxWidth = "80px";
    otMulInput.addEventListener("input", () => { this.overtimeMultiplier = otMulInput.value.replace(/[^0-9.,]/g, ""); });

    this.updateRecurrenceSubFields();
    this.updateWorkTaskSettings();

    // ═══ Footer ═══
    const footer = contentEl.createDiv({ cls: "tm-footer" });
    const cancelBtn = footer.createEl("button", { text: "Отмена", cls: "tm-btn tm-cancel" });
    cancelBtn.addEventListener("click", () => this.close());
    const submitBtn = footer.createEl("button", { cls: "tm-btn tm-submit" });
    submitBtn.createEl("span", { text: "✓" });
    submitBtn.createEl("span", { text: this.task ? "Сохранить" : "Создать задачу" });
    submitBtn.addEventListener("click", () => this.handleSubmit());
  }

  private updateRecurrenceSubFields(): void {
    if (!this.recurrenceSubEl) return;
    const show = this.recurrenceType !== "none";
    this.recurrenceSubEl.style.display = show ? "" : "none";

    // Interval only for monthly
    const intervalRow = this.recurrenceSubEl.children[0] as HTMLElement;
    if (intervalRow) intervalRow.style.display = this.recurrenceType === "monthly" ? "" : "none";

    // Days only for weekly
    const daysRow = this.recurrenceSubEl.children[1] as HTMLElement;
    if (daysRow) daysRow.style.display = this.recurrenceType === "weekly" ? "" : "none";
  }

  private updateWorkTaskSettings(): void {
    this.updateWorkTaskSubFields();
  }

  private updateWorkTaskSubFields(): void {
    if (!this.workTaskSubEl) return;
    const show = this.isWorkTask;
    const showOvertime = show && this.paymentType === "hour";
    this.workTaskSubEl.style.display = show ? "" : "none";
    // Overtime fields are children 2 and 3
    const otStartRow = this.workTaskSubEl.children[2] as HTMLElement;
    const otMulRow = this.workTaskSubEl.children[3] as HTMLElement;
    if (otStartRow) otStartRow.style.display = showOvertime ? "" : "none";
    if (otMulRow) otMulRow.style.display = showOvertime ? "" : "none";
  }

  private handleSubmit(): void {
    if (this.titleInputEl) this.titleInput = this.titleInputEl.value;
    if (this.descriptionInputEl) this.descriptionInput = this.descriptionInputEl.value;

    if (!this.titleInput.trim()) return;

    const desc = (this.descriptionInput || "").trim();
    if (desc.length > 100) {
      if (this.descCounterEl) {
        this.descCounterEl.style.color = "var(--text-error, #ef4436)";
        this.descCounterEl.textContent = `⚠ ${desc.length}/100 — максимум 100`;
        setTimeout(() => {
          this.descCounterEl!.style.color = "";
          this.updateDescCounter();
        }, 3000);
      }
      return;
    }

    let finalDateUID = this.dateUID;
    if (!finalDateUID && this.dateValue) {
      const m = window.moment(this.dateValue, "YYYY-MM-DD", true);
      if (m.isValid()) finalDateUID = getDateUID(m, "day");
    }
    if (!finalDateUID) finalDateUID = getDateUID(window.moment(), "day");

    let recurrence: RecurrenceConfig | undefined;
    if (this.recurrenceType !== "none") {
      recurrence = { type: this.recurrenceType as any, interval: this.recurrenceInterval };
      if (this.recurrenceType === "weekly" && this.recurrenceDaysOfWeek.length > 0) recurrence.daysOfWeek = [...this.recurrenceDaysOfWeek];
      if (this.recurrenceUntilDateUID) recurrence.until = this.recurrenceUntilDateUID;
    }

    this.onSubmit({
      title: this.titleInput.trim(),
      description: this.descriptionInput.trim() || undefined,
      projectId: this.projectId,
      dateUID: finalDateUID,
      priority: this.priority,
      boundNotePath: this.notePathInput || null,
      recurrence,
      estimatedTime: (parseInt(this.estimatedTimeHours) || 0) * 60 + (parseInt(this.estimatedTimeMinutes) || 0) || undefined,
      scheduledTime: this.scheduledTime || undefined,
      isWorkTask: this.isWorkTask || undefined,
      paymentType: this.isWorkTask ? this.paymentType : undefined,
      rate: this.isWorkTask && this.rate ? parseFloat(this.rate.replace(",", ".")) : undefined,
      overtimeStart: this.isWorkTask && this.paymentType === "hour" && this.overtimeStart ? parseInt(this.overtimeStart) : undefined,
      overtimeMultiplier: this.isWorkTask && this.paymentType === "hour" && this.overtimeMultiplier ? parseFloat(this.overtimeMultiplier.replace(",", ".")) : undefined,
      deadline: this.deadlineDateUID || undefined,
      deadlineTime: this.deadlineTime || undefined,
    });
    this.close();
  }

  private extractDateValue(dateUID: string): string {
    if (!dateUID) return "";
    const match = dateUID.match(/^day-(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
