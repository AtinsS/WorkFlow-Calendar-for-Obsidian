import { App, Modal } from "obsidian";
import type { Moment } from "moment";
import { getDateUID } from "obsidian-daily-notes-interface";
import { tRaw } from "../i18n";
import { addTask } from "./stores";

interface ParsedInput {
  title: string;
  scheduledTime: string | null;
  endTime: string | null;
  priority: "low" | "medium" | "high" | null;
  timeValid: boolean;
  endValid: boolean;
}

function normalizeTime(raw: string): string {
  if (raw.includes(":")) {
    const [h, m] = raw.split(":");
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  }
  return `${raw.padStart(2, "0")}:00`;
}

function parseQuickInput(raw: string): ParsedInput {
  let text = raw.trim();
  let scheduledTime: string | null = null;
  let endTime: string | null = null;
  let priority: "low" | "medium" | "high" | null = null;
  let timeValid = true;
  let endValid = true;

  // Priority prefix
  if (text.startsWith("!!")) { priority = "high"; text = text.slice(2).trim(); }
  else if (text.startsWith("!")) { priority = "high"; text = text.slice(1).trim(); }
  else if (text.startsWith("~")) { priority = "medium"; text = text.slice(1).trim(); }
  else if (text.startsWith("-") && !text.match(/^-\d/)) { priority = "low"; text = text.slice(1).trim(); }

  // Pattern 1: "с HH:MM до HH:MM title"
  const p1 = text.match(/^с\s*(\d{1,2}:\d{2})\s*(?:до|-)\s*(\d{1,2}:\d{2})\s+(.+)$/i);
  if (p1) {
    scheduledTime = normalizeTime(p1[1]);
    endTime = normalizeTime(p1[2]);
    text = p1[3].trim();
    timeValid = isValidTime(scheduledTime);
    endValid = isValidTime(endTime);
    return { title: text, scheduledTime, endTime, priority, timeValid, endValid };
  }

  // Pattern 2: "HH:MM-HH:MM title"
  const p2 = text.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s+(.+)$/);
  if (p2) {
    scheduledTime = normalizeTime(p2[1]);
    endTime = normalizeTime(p2[2]);
    text = p2[3].trim();
    timeValid = isValidTime(scheduledTime);
    endValid = isValidTime(endTime);
    return { title: text, scheduledTime, endTime, priority, timeValid, endValid };
  }

  // Pattern 3: "HH-HH title"
  const p3 = text.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(.+)$/);
  if (p3) {
    scheduledTime = normalizeTime(p3[1]);
    endTime = normalizeTime(p3[2]);
    text = p3[3].trim();
    timeValid = isValidTime(scheduledTime);
    endValid = isValidTime(endTime);
    return { title: text, scheduledTime, endTime, priority, timeValid, endValid };
  }

  // Pattern 4: "HH:MM title" or "в HH:MM title"
  const p4 = text.match(/^(?:в\s*)?(\d{1,2}:\d{2})\s+(.+)$/i);
  if (p4) {
    scheduledTime = normalizeTime(p4[1]);
    text = p4[2].trim();
    timeValid = isValidTime(scheduledTime);
    return { title: text, scheduledTime, endTime: null, priority, timeValid, endValid: true };
  }

  return { title: text, scheduledTime: null, endTime: null, priority, timeValid: true, endValid: true };
}

function isValidTime(time: string): boolean {
  const parts = time.split(":");
  if (parts.length !== 2) return false;
  const [h, m] = parts.map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

export class QuickAddModal extends Modal {
  private date: Moment;
  private onSubmit: () => void;

  constructor(app: App, date: Moment, onSubmit?: () => void) {
    super(app);
    this.date = date;
    this.onSubmit = onSubmit ?? (() => { /* noop */ });
  }

  onOpen(): void {
    const { contentEl } = this;

    // Modal container with glassmorphism
    contentEl.addClass("quick-add-modal");
    contentEl.style.padding = "0";
    contentEl.style.overflow = "hidden";
    contentEl.style.borderRadius = "12px";

    // Header with date
    const header = contentEl.createDiv({ cls: "quick-add-header" });
    header.style.padding = "12px 16px";
    header.style.background = "var(--background-secondary)";
    header.style.borderBottom = "1px solid var(--background-modifier-border)";
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "8px";

    const dateIcon = header.createSpan({ text: "📅" });
    dateIcon.style.fontSize = "16px";

    const dateLabel = header.createSpan({
      text: this.date.format("dddd, D MMMM"),
    });
    dateLabel.style.fontSize = "13px";
    dateLabel.style.fontWeight = "600";
    dateLabel.style.color = "var(--text-normal)";
    dateLabel.style.textTransform = "capitalize";

    // Input area
    const inputArea = contentEl.createDiv({ cls: "quick-add-input-area" });
    inputArea.style.padding = "12px 16px";

    const input = inputArea.createEl("input", {
      type: "text",
      placeholder: tRaw("tasks.quickAdd.placeholder"),
    });
    input.style.width = "100%";
    input.style.padding = "10px 12px";
    input.style.fontSize = "14px";
    input.style.border = "2px solid var(--background-modifier-border)";
    input.style.borderRadius = "8px";
    input.style.background = "var(--background-primary)";
    input.style.color = "var(--text-normal)";
    input.style.outline = "none";
    input.style.boxSizing = "border-box";
    input.style.fontFamily = "inherit";
    input.style.transition = "border-color 0.15s ease";

    // Preview line
    const preview = inputArea.createDiv({ cls: "quick-add-preview" });
    preview.style.fontSize = "12px";
    preview.style.padding = "6px 0 0";
    preview.style.minHeight = "20px";
    preview.style.display = "none";
    preview.style.alignItems = "center";
    preview.style.gap = "6px";

    // Bottom bar with hints and shortcuts
    const bottomBar = contentEl.createDiv({ cls: "quick-add-bottom" });
    bottomBar.style.padding = "8px 16px";
    bottomBar.style.background = "var(--background-secondary)";
    bottomBar.style.borderTop = "1px solid var(--background-modifier-border)";
    bottomBar.style.display = "flex";
    bottomBar.style.justifyContent = "space-between";
    bottomBar.style.alignItems = "center";
    bottomBar.style.fontSize = "11px";
    bottomBar.style.color = "var(--text-faint)";

    // Hints (left side)
    const hints = bottomBar.createDiv({ cls: "quick-add-hints" });
    hints.style.display = "flex";
    hints.style.gap = "12px";

    const hint1 = hints.createSpan();
    hint1.createEl("kbd", { text: "14:00" });
    hint1.createSpan({ text: ` ${tRaw("tasks.quickAdd.hintTime")}` });

    const hint2 = hints.createSpan();
    hint2.createEl("kbd", { text: "14-15" });
    hint2.createSpan({ text: ` ${tRaw("tasks.quickAdd.hintRange")}` });

    const hint3 = hints.createSpan();
    hint3.createEl("kbd", { text: "!" });
    hint3.createSpan({ text: ` ${tRaw("tasks.quickAdd.hintPriority")}` });

    // Shortcuts (right side)
    const shortcuts = bottomBar.createDiv({ cls: "quick-add-shortcuts" });
    shortcuts.style.display = "flex";
    shortcuts.style.gap = "8px";

    const sc1 = shortcuts.createSpan();
    sc1.createEl("kbd", { text: "Enter" });
    sc1.createSpan({ text: ` ${tRaw("common.save")}` });

    const sc2 = shortcuts.createSpan();
    sc2.createEl("kbd", { text: "⇧Enter" });
    sc2.createSpan({ text: ` ${tRaw("common.edit")}` });

    // KBD styling
    contentEl.querySelectorAll("kbd").forEach((kbd) => {
      kbd.style.display = "inline-block";
      kbd.style.padding = "1px 5px";
      kbd.style.fontSize = "10px";
      kbd.style.fontFamily = "monospace";
      kbd.style.background = "var(--background-modifier-border)";
      kbd.style.borderRadius = "3px";
      kbd.style.color = "var(--text-muted)";
    });

    // Live preview with color validation
    input.addEventListener("input", () => {
      const parsed = parseQuickInput(input.value);
      if (!input.value.trim()) {
        preview.style.display = "none";
        return;
      }
      preview.style.display = "flex";
      preview.innerHTML = "";

      // Time badge
      if (parsed.scheduledTime) {
        const timeBadge = document.createElement("span");
        timeBadge.style.display = "inline-flex";
        timeBadge.style.alignItems = "center";
        timeBadge.style.gap = "3px";
        timeBadge.style.padding = "2px 6px";
        timeBadge.style.borderRadius = "4px";
        timeBadge.style.fontSize = "11px";
        timeBadge.style.fontWeight = "600";

        if (parsed.timeValid) {
          timeBadge.style.background = "rgba(61, 214, 140, 0.15)";
          timeBadge.style.color = "var(--text-success, #3dd68c)";
        } else {
          timeBadge.style.background = "rgba(240, 101, 101, 0.15)";
          timeBadge.style.color = "var(--text-error, #f06565)";
        }

        timeBadge.textContent = `🕐 ${formatTime(parsed.scheduledTime)}`;
        preview.appendChild(timeBadge);
      }

      // End time
      if (parsed.endTime) {
        const arrow = document.createElement("span");
        arrow.textContent = "→";
        arrow.style.color = "var(--text-muted)";
        preview.appendChild(arrow);

        const endBadge = document.createElement("span");
        endBadge.style.padding = "2px 6px";
        endBadge.style.borderRadius = "4px";
        endBadge.style.fontSize = "11px";
        endBadge.style.fontWeight = "600";

        if (parsed.endValid) {
          endBadge.style.background = "rgba(61, 214, 140, 0.15)";
          endBadge.style.color = "var(--text-success, #3dd68c)";
        } else {
          endBadge.style.background = "rgba(240, 101, 101, 0.15)";
          endBadge.style.color = "var(--text-error, #f06565)";
        }

        endBadge.textContent = formatTime(parsed.endTime);
        preview.appendChild(endBadge);
      }

      // Priority
      if (parsed.priority) {
        const prioBadge = document.createElement("span");
        prioBadge.style.padding = "2px 6px";
        prioBadge.style.borderRadius = "4px";
        prioBadge.style.fontSize = "11px";
        prioBadge.style.fontWeight = "600";

        if (parsed.priority === "high") {
          prioBadge.textContent = "!! high";
          prioBadge.style.background = "rgba(240, 101, 101, 0.15)";
          prioBadge.style.color = "var(--text-error, #f06565)";
        } else if (parsed.priority === "medium") {
          prioBadge.textContent = "~ medium";
          prioBadge.style.background = "rgba(245, 166, 35, 0.15)";
          prioBadge.style.color = "var(--text-warning, #f5a623)";
        } else {
          prioBadge.textContent = "- low";
          prioBadge.style.background = "rgba(79, 146, 255, 0.15)";
          prioBadge.style.color = "var(--text-accent, #4d96ff)";
        }

        preview.appendChild(prioBadge);
      }

      // Title
      if (parsed.title) {
        const titleSpan = document.createElement("span");
        titleSpan.textContent = parsed.title;
        titleSpan.style.color = "var(--text-normal)";
        titleSpan.style.marginLeft = "4px";
        preview.appendChild(titleSpan);
      }
    });

    // Enter → create task
    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.submit(input.value, false);
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        this.submit(input.value, true);
      } else if (e.key === "Escape") {
        this.close();
      }
    });

    // Focus styles
    input.addEventListener("focus", () => {
      input.style.borderColor = "var(--interactive-accent)";
      input.style.boxShadow = "0 0 0 2px rgba(var(--interactive-accent-rgb, 95, 153, 225), 0.2)";
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = "var(--background-modifier-border)";
      input.style.boxShadow = "none";
    });

    input.focus();
    requestAnimationFrame(() => input.focus());
  }

  private submit(raw: string, openFullModal: boolean): void {
    const parsed = parseQuickInput(raw);
    if (!parsed.title) { this.close(); return; }

    const dateUID = getDateUID(this.date, "day");

    let scheduledTime: string | undefined;
    let endTime: string | undefined;
    if (parsed.scheduledTime && parsed.timeValid) {
      scheduledTime = formatTime(parsed.scheduledTime);
    }
    if (parsed.endTime && parsed.endValid) {
      endTime = formatTime(parsed.endTime);
    }

    try {
      const task = addTask({
        title: parsed.title,
        dateUID,
        status: "todo",
        completed: false,
        projectId: null,
        notePath: null,
        priority: parsed.priority || "medium",
        tags: [],
        sortOrder: 0,
        description: "",
        scheduledTime,
        endTime,
      });

      this.close();
      this.onSubmit();

      if (openFullModal && task) {
        import("./TaskModal").then(({ TaskModal }) => {
          new TaskModal(this.app, task, () => { /* handled by TaskModal */ }).open();
        });
      }
    } catch (e) {
      console.error("[QuickAddModal] Failed to create task:", e);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
