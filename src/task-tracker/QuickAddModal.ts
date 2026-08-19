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

    // Header with date
    const header = contentEl.createDiv({ cls: "quick-add-header" });

    header.createSpan({ text: "📅", cls: "date-icon" });

    header.createSpan({
      text: this.date.format("dddd, D MMMM"),
      cls: "date-label",
    });

    // Input area
    const inputArea = contentEl.createDiv({ cls: "quick-add-input-area" });

    const input = inputArea.createEl("input", {
      type: "text",
      placeholder: tRaw("tasks.quickAdd.placeholder"),
    });

    // Preview line
    const preview = inputArea.createDiv({ cls: "quick-add-preview" });

    // Bottom bar with hints and shortcuts
    const bottomBar = contentEl.createDiv({ cls: "quick-add-bottom" });

    // Hints (left side)
    const hints = bottomBar.createDiv({ cls: "quick-add-hints" });

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

    const sc1 = shortcuts.createSpan();
    sc1.createEl("kbd", { text: "Enter" });
    sc1.createSpan({ text: ` ${tRaw("common.save")}` });

    const sc2 = shortcuts.createSpan();
    sc2.createEl("kbd", { text: "⇧Enter" });
    sc2.createSpan({ text: ` ${tRaw("common.edit")}` });

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
        timeBadge.className = `qa-badge ${parsed.timeValid ? "qa-badge-valid" : "qa-badge-invalid"}`;

        timeBadge.textContent = `🕐 ${formatTime(parsed.scheduledTime)}`;
        preview.appendChild(timeBadge);
      }

      // End time
      if (parsed.endTime) {
        const arrow = document.createElement("span");
        arrow.textContent = "→";
        arrow.className = "qa-arrow";
        preview.appendChild(arrow);

        const endBadge = document.createElement("span");
        endBadge.className = `qa-badge ${parsed.endValid ? "qa-badge-valid" : "qa-badge-invalid"}`;

        endBadge.textContent = formatTime(parsed.endTime);
        preview.appendChild(endBadge);
      }

      // Priority
      if (parsed.priority) {
        const prioBadge = document.createElement("span");
        prioBadge.className = "qa-badge";

        if (parsed.priority === "high") {
          prioBadge.textContent = "!! high";
          prioBadge.classList.add("qa-badge-invalid");
        } else if (parsed.priority === "medium") {
          prioBadge.textContent = "~ medium";
          prioBadge.classList.add("qa-badge-warning");
        } else {
          prioBadge.textContent = "- low";
          prioBadge.classList.add("qa-badge-info");
        }

        preview.appendChild(prioBadge);
      }

      // Title
      if (parsed.title) {
        const titleSpan = document.createElement("span");
        titleSpan.textContent = parsed.title;
        titleSpan.className = "qa-title";
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
