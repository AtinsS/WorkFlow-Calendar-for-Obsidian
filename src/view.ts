import moment from "moment";
import type { Moment } from "moment";
import {
  getDailyNote,
  getDailyNoteSettings,
  getDateFromFile,
  getDateUID,
  getWeeklyNote,
  getWeeklyNoteSettings,
} from "obsidian-daily-notes-interface";
import { FileView, TFile, ItemView, WorkspaceLeaf } from "obsidian";
import { get } from "svelte/store";

import { TRIGGER_ON_OPEN, VIEW_TYPE_CALENDAR } from "src/constants";
import type { ISettings } from "src/settings";
import type CalendarPlugin from "src/main";

import Calendar from "./ui/Calendar.svelte";
import { showNoteContextMenu } from "./ui/fileMenu";
import { activeFile, dailyNotes, weeklyNotes, settings } from "./ui/stores";
import { customTagsSource, streakSource, wordCountSource } from "./ui/sources";

import TaskPanel from "./task-tracker/TaskPanel.svelte";
import { taskDotSource } from "./task-tracker/taskDotSource";
import { selectedDate } from "./task-tracker/stores";

import HabitPanel from "./habit-tracker/HabitPanel.svelte";
import { habitSource } from "./habit-tracker/habitSource";

import { getMonthGoals } from "./finance/storage";
import { financeData } from "./finance/storage";
import type { MonthGoal } from "./finance/types";

export default class CalendarView extends ItemView {
  private calendar: Calendar;
  private taskPanel: TaskPanel;
  private habitPanel: HabitPanel;
  private settings: ISettings;
  private plugin: CalendarPlugin;
  private goalsContainer: HTMLElement;
  private panelsContainer: HTMLElement;
  private goalsUnsub: (() => void) | null = null;
  private currentMonthKey = "";
  private isMobile = typeof window !== "undefined" && window.innerWidth <= 768;

  constructor(leaf: WorkspaceLeaf, plugin?: CalendarPlugin) {
    super(leaf);
    this.plugin = plugin;

    this.selectDateForDay = this.selectDateForDay.bind(this);
    this.selectDateForWeek = this.selectDateForWeek.bind(this);

    this.onNoteSettingsUpdate = this.onNoteSettingsUpdate.bind(this);
    this.onFileCreated = this.onFileCreated.bind(this);
    this.onFileDeleted = this.onFileDeleted.bind(this);
    this.onFileModified = this.onFileModified.bind(this);
    this.onFileOpen = this.onFileOpen.bind(this);

    this.onHoverDay = this.onHoverDay.bind(this);
    this.onHoverWeek = this.onHoverWeek.bind(this);

    this.onContextMenuDay = this.onContextMenuDay.bind(this);
    this.onContextMenuWeek = this.onContextMenuWeek.bind(this);

    this.registerEvent(
      // Undocumented periodic-notes plugin event
      (
        this.app.workspace as unknown as {
          on: (name: string, cb: () => void) => import("obsidian").EventRef;
        }
      ).on("periodic-notes:settings-updated", this.onNoteSettingsUpdate),
    );
    this.registerEvent(this.app.vault.on("create", this.onFileCreated));
    this.registerEvent(this.app.vault.on("delete", this.onFileDeleted));
    this.registerEvent(this.app.vault.on("modify", this.onFileModified));
    this.registerEvent(this.app.workspace.on("file-open", this.onFileOpen));

    this.settings = null;
    settings.subscribe((val) => {
      this.settings = val;

      // Calendar.svelte reacts to $settings changes directly — no tick needed here

      // Toggle task panel visibility
      if (val.showTaskTracker === false && this.taskPanel) {
        this.taskPanel.$destroy();
        this.taskPanel = null;
      } else if (
        val.showTaskTracker !== false &&
        !this.taskPanel &&
        this.panelsContainer
      ) {
        this.taskPanel = new TaskPanel({
          target: this.panelsContainer,
          props: {
            appInstance: this.app,
          },
        });
      }

      // Toggle habit panel visibility
      if (val.showHabitTracker === false && this.habitPanel) {
        this.habitPanel.$destroy();
        this.habitPanel = null;
      } else if (
        val.showHabitTracker !== false &&
        !this.habitPanel &&
        this.panelsContainer
      ) {
        this.habitPanel = new HabitPanel({
          target: this.panelsContainer,
          props: {
            appInstance: this.app,
          },
        });
      }
    });
  }

  getViewType(): string {
    return VIEW_TYPE_CALENDAR;
  }

  getDisplayText(): string {
    return "Calendar";
  }

  getIcon(): string {
    return "calendar-with-checkmark";
  }

  onClose(): Promise<void> {
    this.removeTooltip();
    if (this.goalsUnsub) {
      this.goalsUnsub();
      this.goalsUnsub = null;
    }
    if (this.calendar) {
      this.calendar.$destroy();
    }
    if (this.taskPanel) {
      this.taskPanel.$destroy();
    }
    if (this.habitPanel) {
      this.habitPanel.$destroy();
    }
    return Promise.resolve();
  }

  private injectMainViewStyles(): void {
    if (document.getElementById("mv-injected-styles")) return;
    const style = document.createElement("style");
    style.id = "mv-injected-styles";
    style.textContent = `
/* ═══════════════════════════════════════════════════
   MAIN VIEW — full visual rework
   ═══════════════════════════════════════════════════ */

.calendar-main-view {
  display: flex;
  flex-direction: column;
  padding: 0;
  gap: 0;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

/* ── Two-column body ──────────────────────── */
.mv-body {
  display: flex;
  gap: 16px;
  width: 100%;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}

/* ── Glass card base ──────────────────────── */
.mv-card {
  background: var(--mcp-glass-bg);
  backdrop-filter: var(--mcp-blur);
  -webkit-backdrop-filter: var(--mcp-blur);
  border: 1px solid var(--mcp-glass-border);
  border-radius: var(--mcp-radius-lg);
  box-shadow: var(--mcp-shadow);
  overflow: hidden;
}

/* ── Calendar card — left ─────────────────── */
.mv-calendar-card {
  flex: 1 1 0;
  min-width: 300px;
  max-height: max-content;
  display: flex;
  flex-direction: column;
}

/* Calendar card header: schedule btn + goals inside the card */
.mv-calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 28px 0;
  flex-shrink: 0;
}
.mv-calendar-header .schedule-open-btn {
  flex: 0 0 auto;
  margin: 0;
}

.mv-calendar-card #calendar-container { width: 100%; padding: 8px 28px 24px; }
.mv-calendar-card #calendar-container .calendar { border-spacing: 8px; }
.mv-calendar-card #calendar-container .day,
.mv-calendar-card #calendar-container .week-num {
  min-height: 68px;
  font-size: 19px;
  font-weight: 600;
  padding: 14px 10px;
  border-radius: 14px;
}
.mv-calendar-card #calendar-container .day.today,
.mv-calendar-card #calendar-container .day.active {
  background: var(--mcp-accent);
  color: #fff;
  font-weight: 700;
}
.mv-calendar-card #calendar-container .calendar th {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2.5px;
  padding: 8px 0 12px;
  color: var(--mcp-text-faint);
  text-transform: uppercase;
}
.mv-calendar-card #calendar-container .nav { padding: 0 4px 16px; }
.mv-calendar-card #calendar-container .nav .title {
  font-size: 28px;
  font-weight: 800;
}
.mv-calendar-card #calendar-container .nav .title .year {
  font-size: 30px;
  font-weight: 800;
  color: var(--mcp-accent);
  margin-left: 6px;
}
.mv-calendar-card #calendar-container .arrow svg {
  width: 24px;
  height: 24px;
}
.mv-calendar-card #calendar-container .reset-button {
  padding: 8px 24px;
  font-size: 13px;
  font-weight: 600;
  min-height: 38px;
  border-radius: 10px;
}
.mv-calendar-card #calendar-container .day[data-task-count]::after {
  font-size: 13px;
  min-width: 24px;
  height: 24px;
  bottom: 3px;
  right: 3px;
  border-radius: 8px;
  line-height: 24px;
}
.mv-calendar-card #calendar-container .day[data-habit-count]::before {
  font-size: 12px;
  min-width: 22px;
  height: 22px;
  bottom: 3px;
  left: 3px;
  border-radius: 8px;
}

/* ── Panels card — right ──────────────────── */
.mv-panels-card {
  flex: 1 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
}
.mv-panels-card .month-goals-indicator {
  padding: 16px 28px;
  flex-shrink: 0;
}
.mv-panels-card .panels-container {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
}
.mv-panels-card .task-tracker-panel,
.mv-panels-card .habit-tracker-panel {
  width: 100%;
  border-radius: 0;
  border-top: none;
  padding: 24px 28px;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.mv-panels-card .habit-tracker-panel {
  border-top: 1px solid var(--mcp-glass-border);
}
.mv-panels-card .task-tracker-panel .task-tracker-header { padding: 0 0 16px; }
.mv-panels-card .task-tracker-panel .task-tracker-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: var(--mcp-text-muted);
}
.mv-panels-card .task-tracker-panel .task-item {
  padding: 12px 14px;
  gap: 10px;
  border-radius: 12px;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.03);
  margin-bottom: 6px;
  transition: all 0.2s ease;
}
.mv-panels-card .task-tracker-panel .task-item:hover {
  background: rgba(255,255,255,0.05);
  border-color: rgba(255,255,255,0.06);
}
.mv-panels-card .task-tracker-panel .task-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--mcp-text);
}
.mv-panels-card .task-tracker-panel .task-status-btn {
  width: 28px;
  height: 28px;
  font-size: 13px;
  border-radius: 8px;
}
.mv-panels-card .task-tracker-panel .task-project-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.mv-panels-card .task-tracker-panel .task-tracker-filter-btn {
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 600;
  min-height: 36px;
  border-radius: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  transition: all 0.2s ease;
}
.mv-panels-card .task-tracker-panel .task-tracker-filter-btn:hover {
  background: rgba(255,255,255,0.08);
}
.mv-panels-card .task-tracker-panel .task-tracker-filter-btn.active {
  background: var(--mcp-accent);
  border-color: var(--mcp-accent);
  color: #fff;
}
.mv-panels-card .task-tracker-panel .task-tracker-search-input {
  padding: 9px 16px;
  font-size: 14px;
  border-radius: 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
}
.mv-panels-card .task-tracker-panel .task-tracker-search-input:focus {
  border-color: var(--mcp-accent);
  background: rgba(255,255,255,0.05);
}
.mv-panels-card .task-tracker-panel .task-scheduled,
.mv-panels-card .task-tracker-panel .task-timer,
.mv-panels-card .task-tracker-panel .task-estimate,
.mv-panels-card .task-tracker-panel .task-estimate-compare {
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 8px;
  background: rgba(255,255,255,0.04);
}
.mv-panels-card .task-tracker-panel .task-deadline {
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 8px;
}
.mv-panels-card .task-tracker-panel .task-work-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 8px;
  background: rgba(251,191,36,0.12);
}
.mv-panels-card .task-tracker-panel .task-actions-toggle {
  padding: 4px 8px;
  font-size: 16px;
  min-width: 30px;
  min-height: 30px;
  border-radius: 8px;
  transition: all 0.2s ease;
}
.mv-panels-card .task-tracker-panel .task-actions-toggle:hover {
  background: rgba(255,255,255,0.08);
}
.mv-panels-card .habit-tracker-panel .habit-tracker-header { padding: 16px 0; }
.mv-panels-card .habit-tracker-panel .habit-tracker-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: rgba(200,210,220,0.5);
}
.mv-panels-card .habit-tracker-panel .habit-item {
  padding: 14px 16px;
  gap: 12px;
  border-radius: 14px;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.03);
  margin-bottom: 6px;
  transition: all 0.2s ease;
}
.mv-panels-card .habit-tracker-panel .habit-item:hover {
  background: rgba(255,255,255,0.05);
  border-color: rgba(255,255,255,0.06);
}
.mv-panels-card .habit-tracker-panel .habit-check-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.12);
  transition: all 0.25s ease;
}
.mv-panels-card .habit-tracker-panel .habit-check-btn:hover {
  border-color: var(--habit-color, var(--mcp-accent));
  transform: scale(1.08);
}
.mv-panels-card .habit-tracker-panel .habit-icon { font-size: 24px; }
.mv-panels-card .habit-tracker-panel .habit-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--mcp-text);
}
.mv-panels-card .habit-tracker-panel .habit-progress-text {
  font-size: 13px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(255,255,255,0.04);
}
.mv-panels-card .habit-tracker-panel .habit-streak {
  font-size: 13px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 8px;
}
.mv-panels-card .habit-tracker-panel .habit-edit-btn,
.mv-panels-card .habit-tracker-panel .habit-delete-btn {
  font-size: 14px;
  padding: 4px 8px;
  min-width: 30px;
  min-height: 30px;
  border-radius: 8px;
  transition: all 0.2s ease;
}
.mv-panels-card .habit-tracker-panel .habit-edit-btn:hover {
  background: rgba(255,255,255,0.08);
}
.mv-panels-card .task-tracker-panel .task-tracker-empty,
.mv-panels-card .habit-tracker-panel .habit-tracker-empty {
  padding: 32px 16px;
  text-align: center;
  color: rgba(200,210,220,0.35);
  font-size: 14px;
}
.mv-panels-card .empty-illustration {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}
.mv-panels-card .empty-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--mcp-text-muted);
  margin-bottom: 4px;
}
.mv-panels-card .empty-subtitle {
  font-size: 13px;
  color: var(--mcp-text-faint);
}

/* ═══════════════════════════════════════════════════
   FLUID RESPONSIVE — smooth scaling, no hard jumps
   ═══════════════════════════════════════════════════ */

/* Calendar internals — compact fluid */
.mv-calendar-header { padding: clamp(10px, 1.2vw, 18px) clamp(12px, 1.5vw, 24px) 0; }
.mv-calendar-card #calendar-container { padding: clamp(2px, 0.5vw, 6px) clamp(8px, 1.5vw, 24px) clamp(8px, 1.2vw, 20px); }
.mv-calendar-card #calendar-container .calendar { border-spacing: clamp(2px, 0.5vw, 7px); }
.mv-calendar-card #calendar-container .day,
.mv-calendar-card #calendar-container .week-num {
  min-height: clamp(32px, 4.5vw, 56px);
  font-size: clamp(11px, 1.3vw, 16px);
  padding: clamp(4px, 0.8vw, 10px) clamp(2px, 0.5vw, 10px);
  border-radius: clamp(5px, 0.8vw, 12px);
}
.mv-calendar-card #calendar-container .nav { padding: 0 clamp(2px, 0.3vw, 4px) clamp(8px, 1vw, 14px); }
.mv-calendar-card #calendar-container .nav .title { font-size: clamp(13px, 1.8vw, 22px); }
.mv-calendar-card #calendar-container .nav .title .year { font-size: clamp(14px, 2vw, 24px); }
.mv-calendar-card #calendar-container .arrow svg { width: clamp(14px, 1.5vw, 20px); height: clamp(14px, 1.5vw, 20px); }
.mv-calendar-card #calendar-container .reset-button {
  padding: clamp(3px, 0.5vw, 6px) clamp(8px, 1.2vw, 18px);
  font-size: clamp(10px, 1vw, 12px);
  min-height: clamp(24px, 3vw, 32px);
}
.mv-calendar-card #calendar-container .calendar th {
  font-size: clamp(7px, 0.8vw, 10px);
  letter-spacing: clamp(1px, 0.15vw, 2px);
  padding: clamp(3px, 0.5vw, 6px) 0 clamp(5px, 0.8vw, 10px);
}
.mv-calendar-card #calendar-container .day[data-task-count]::after {
  font-size: clamp(8px, 0.9vw, 11px);
  min-width: clamp(14px, 1.5vw, 20px);
  height: clamp(14px, 1.5vw, 20px);
  border-radius: clamp(4px, 0.6vw, 6px);
  line-height: clamp(14px, 1.5vw, 20px);
}
.mv-calendar-card #calendar-container .day[data-habit-count]::before {
  font-size: clamp(7px, 0.8vw, 10px);
  min-width: clamp(12px, 1.3vw, 18px);
  height: clamp(12px, 1.3vw, 18px);
  border-radius: clamp(3px, 0.5vw, 6px);
}

/* Panels card — compact fluid */
.mv-panels-card .month-goals-indicator { padding: clamp(8px, 1vw, 14px) clamp(10px, 1.5vw, 24px); }
.mv-panels-card .task-tracker-panel,
.mv-panels-card .habit-tracker-panel { padding: clamp(10px, 1.2vw, 18px) clamp(10px, 1.5vw, 24px); }
.mv-panels-card .task-tracker-panel .task-item {
  padding: clamp(6px, 0.9vw, 10px) clamp(8px, 1vw, 12px);
  gap: clamp(5px, 0.7vw, 8px);
}
.mv-panels-card .task-tracker-panel .task-title { font-size: clamp(11px, 1.2vw, 14px); }
.mv-panels-card .task-tracker-panel .task-status-btn {
  width: clamp(20px, 2.2vw, 26px);
  height: clamp(20px, 2.2vw, 26px);
  font-size: clamp(9px, 1vw, 12px);
}
.mv-panels-card .task-tracker-panel .task-project-dot {
  width: clamp(4px, 0.5vw, 7px);
  height: clamp(4px, 0.5vw, 7px);
}
.mv-panels-card .task-tracker-panel .task-tracker-filter-btn {
  padding: clamp(4px, 0.5vw, 6px) clamp(8px, 1vw, 14px);
  font-size: clamp(10px, 1vw, 12px);
  min-height: clamp(24px, 2.8vw, 32px);
}
.mv-panels-card .task-tracker-panel .task-tracker-search-input {
  padding: clamp(6px, 0.7vw, 8px) clamp(8px, 1vw, 14px);
  font-size: clamp(12px, 1.1vw, 13px);
}
.mv-panels-card .task-tracker-panel .task-scheduled,
.mv-panels-card .task-tracker-panel .task-timer,
.mv-panels-card .task-tracker-panel .task-estimate {
  font-size: clamp(9px, 0.9vw, 11px);
  padding: clamp(2px, 0.25vw, 3px) clamp(5px, 0.7vw, 8px);
}
.mv-panels-card .task-tracker-panel .task-actions-toggle {
  font-size: clamp(12px, 1.2vw, 14px);
  min-width: clamp(22px, 2.2vw, 28px);
  min-height: clamp(22px, 2.2vw, 28px);
}
.mv-panels-card .habit-tracker-panel .habit-item {
  padding: clamp(8px, 1vw, 12px) clamp(8px, 1.2vw, 14px);
  gap: clamp(6px, 0.9vw, 10px);
  border-radius: clamp(8px, 1vw, 12px);
}
.mv-panels-card .habit-tracker-panel .habit-check-btn {
  width: clamp(24px, 3vw, 34px);
  height: clamp(24px, 3vw, 34px);
}
.mv-panels-card .habit-tracker-panel .habit-icon { font-size: clamp(16px, 1.8vw, 22px); }
.mv-panels-card .habit-tracker-panel .habit-title { font-size: clamp(11px, 1.2vw, 14px); }
.mv-panels-card .habit-tracker-panel .habit-progress-text,
.mv-panels-card .habit-tracker-panel .habit-streak {
  font-size: clamp(10px, 1vw, 12px);
  padding: clamp(2px, 0.3vw, 3px) clamp(5px, 0.7vw, 8px);
}
.mv-panels-card .habit-tracker-panel .habit-edit-btn,
.mv-panels-card .habit-tracker-panel .habit-delete-btn {
  font-size: clamp(11px, 1.1vw, 13px);
  min-width: clamp(22px, 2.2vw, 28px);
  min-height: clamp(22px, 2.2vw, 28px);
}
.mv-panels-card .task-tracker-panel .task-tracker-title,
.mv-panels-card .habit-tracker-panel .habit-tracker-title {
  font-size: clamp(10px, 1vw, 12px);
}

/* ── Stack on narrow screens ──────────────── */
@media (max-width: 860px) {
  .mv-body { flex-direction: column; align-items: stretch; gap: 12px; width: 100%; }
  .mv-calendar-card { flex: none; width: 100%; max-width: 100%; min-width: 0; margin: 0; }
  .mv-panels-card { width: 100%; max-width: 100%; margin: 0; border-radius: var(--mcp-radius); overflow: visible; }
}

/* ── Small phone (≤360px) — widget style ── */
@media (max-width: 360px) {
  .mv-body { padding: 0 4px !important; gap: 3px !important; max-width: 340px !important; margin: 0 auto !important; }
  .calendar-main-view { overflow-x: visible !important; }

  /* ── Calendar card — match reference ── */
  .mv-calendar-card {
    min-width: 0 !important;
    border-radius: 12px !important;
    overflow: hidden;
  }
  .mv-calendar-card .mv-card,
  .mv-card.mv-calendar-card {
    border-radius: 12px !important;
  }
  .mv-calendar-header {
    padding: 8px 10px 0 !important;
    gap: 6px !important;
  }
  .mv-calendar-header .schedule-open-btn {
    padding: 4px 8px !important;
    font-size: 10px !important;
    min-height: 22px !important;
    border-radius: 6px !important;
  }
  .mv-calendar-card #calendar-container {
    padding: 0 6px 10px !important;
  }
  .mv-calendar-card #calendar-container .calendar {
    border-spacing: 3px !important;
  }
  .mv-calendar-card #calendar-container .day,
  .mv-calendar-card #calendar-container .week-num {
    min-height: 38px !important;
    font-size: 13px !important;
    padding: 5px 2px !important;
    border-radius: 6px !important;
    font-weight: 500 !important;
  }
  .mv-calendar-card #calendar-container .day.today,
  .mv-calendar-card #calendar-container .day.active {
    border-radius: 6px !important;
  }
  .mv-calendar-card #calendar-container .calendar th {
    font-size: 9px !important;
    letter-spacing: 0.5px !important;
    padding: 4px 0 !important;
    font-weight: 600 !important;
  }
  .mv-calendar-card #calendar-container .nav {
    padding: 0 4px 8px !important;
    align-items: center;
  }
  .mv-calendar-card #calendar-container .nav .title {
    font-size: 14px !important;
    font-weight: 700 !important;
  }
  .mv-calendar-card #calendar-container .nav .title .year {
    font-size: 15px !important;
    margin-left: 4px !important;
    font-weight: 700 !important;
  }
  .mv-calendar-card #calendar-container .arrow svg {
    width: 14px !important;
    height: 14px !important;
  }
  .mv-calendar-card #calendar-container .reset-button {
    padding: 3px 10px !important;
    font-size: 10px !important;
    min-height: 24px !important;
    border-radius: 6px !important;
  }
  .mv-calendar-card #calendar-container .day[data-task-count]::after {
    font-size: 8px !important;
    min-width: 12px !important;
    height: 12px !important;
    line-height: 12px !important;
    bottom: 1px !important;
    right: 1px !important;
    border-radius: 4px !important;
    padding: 0 2px !important;
  }
  .mv-calendar-card #calendar-container .day[data-habit-count]::before {
    font-size: 7px !important;
    min-width: 10px !important;
    height: 10px !important;
    top: 1px !important;
    left: 1px !important;
  }

  /* ── Panels card — full width, rounded ── */
  .mv-panels-card {
    border-radius: 12px !important;
    border-top: none !important;
    overflow: visible !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
  }
  .mv-panels-card .month-goals-indicator { display: none !important; }
  .mv-panels-card .panels-container { gap: 0 !important; width: 100% !important; }
  .mv-panels-card .task-tracker-panel,
  .mv-panels-card .habit-tracker-panel {
    padding: 8px 10px !important;
    border-radius: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
    overflow: visible !important;
  }
  .mv-panels-card .task-tracker-panel .task-tracker-header {
    padding: 0 0 4px !important;
    gap: 4px !important;
  }
  .mv-panels-card .task-tracker-panel .task-tracker-title {
    font-size: 11px !important;
    letter-spacing: 0.6px !important;
    font-weight: 700 !important;
  }
  .mv-panels-card .task-tracker-panel .task-tracker-count {
    font-size: 10px !important;
    padding: 2px 6px !important;
  }
  .mv-panels-card .task-tracker-panel .task-item {
    padding: 5px 6px !important;
    gap: 3px !important;
    min-height: 28px !important;
    border-radius: 6px !important;
    margin-bottom: 3px !important;
  }
  .mv-panels-card .task-tracker-panel .task-title {
    font-size: 12px !important;
  }
  .mv-panels-card .task-tracker-panel .task-status-btn {
    width: 18px !important;
    height: 18px !important;
    font-size: 8px !important;
    border-radius: 5px !important;
  }
  .mv-panels-card .task-tracker-panel .task-tracker-filter-btn {
    padding: 2px 6px !important;
    font-size: 9px !important;
    min-height: 22px !important;
    border-radius: 6px !important;
  }
  .mv-panels-card .task-tracker-panel .task-tracker-search-input {
    padding: 4px 8px !important;
    font-size: 11px !important;
    border-radius: 6px !important;
  }
  .mv-panels-card .task-tracker-panel .task-tracker-list {
    max-height: 35vh !important;
    overflow-x: visible !important;
  }
  .mv-panels-card .task-tracker-panel .task-actions-toggle {
    min-width: 22px !important;
    min-height: 22px !important;
    font-size: 11px !important;
    padding: 1px 3px !important;
  }
  .mv-panels-card .task-tracker-panel .task-scheduled,
  .mv-panels-card .task-tracker-panel .task-timer,
  .mv-panels-card .task-tracker-panel .task-estimate,
  .mv-panels-card .task-tracker-panel .task-deadline {
    font-size: 8px !important;
    padding: 1px 4px !important;
    border-radius: 3px !important;
  }
  .mv-panels-card .task-tracker-panel .task-project-dot {
    width: 4px !important;
    height: 4px !important;
  }
  .mv-panels-card .task-tracker-panel .note-icon {
    font-size: 10px !important;
  }
  .mv-panels-card .task-tracker-panel .task-tracker-btn,
  .mv-panels-card .habit-tracker-panel .habit-tracker-btn {
    min-width: 24px !important;
    min-height: 24px !important;
    font-size: 12px !important;
    padding: 2px 4px !important;
  }
  .mv-panels-card .task-tracker-panel .add-btn {
    font-size: 11px !important;
    padding: 2px 6px !important;
  }

  /* ── Habit panel — match reference ── */
  .mv-panels-card .habit-tracker-panel .habit-tracker-header {
    padding: 4px 0 !important;
    gap: 3px !important;
  }
  .mv-panels-card .habit-tracker-panel .habit-tracker-title {
    font-size: 11px !important;
    letter-spacing: 0.6px !important;
    font-weight: 700 !important;
  }
  .mv-panels-card .habit-tracker-panel .habit-tracker-streak {
    font-size: 9px !important;
    padding: 2px 5px !important;
  }
  .mv-panels-card .habit-tracker-panel .habit-item {
    padding: 4px 6px !important;
    gap: 4px !important;
    min-height: 26px !important;
    border-radius: 6px !important;
  }
  .mv-panels-card .habit-tracker-panel .habit-check-btn {
    width: 20px !important;
    height: 20px !important;
  }
  .mv-panels-card .habit-tracker-panel .habit-icon {
    font-size: 13px !important;
  }
  .mv-panels-card .habit-tracker-panel .habit-title {
    font-size: 10px !important;
  }
  .mv-panels-card .habit-tracker-panel .habit-progress-text {
    font-size: 8px !important;
    padding: 1px 4px !important;
    border-radius: 4px !important;
  }
  .mv-panels-card .habit-tracker-panel .habit-streak {
    font-size: 8px !important;
    padding: 1px 4px !important;
    border-radius: 4px !important;
  }
  .mv-panels-card .habit-tracker-panel .habit-edit-btn,
  .mv-panels-card .habit-tracker-panel .habit-delete-btn {
    display: none !important;
  }
  .mv-panels-card .habit-tracker-panel .habit-tracker-list {
    max-height: 25vh !important;
    overflow-x: visible !important;
  }
  .mv-panels-card .habit-tracker-panel .habit-tracker-empty {
    padding: 10px 8px !important;
    font-size: 11px !important;
  }

  /* ── Kanban tabs — scroll ── */
  .kanban-dropdown-trigger {
    padding: 2px 6px !important;
    font-size: 9px !important;
    min-height: 20px !important;
    gap: 2px !important;
    border-radius: 5px !important;
  }
  .kanban-trigger-icon { font-size: 9px !important; }
  .kanban-trigger-label { font-size: 9px !important; }
  .kanban-trigger-count { font-size: 7px !important; padding: 0 2px !important; }

  /* ── Filter bar — scroll ── */
  .task-tracker-filter-bar {
    padding: 2px 0 !important;
    gap: 2px !important;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    flex-wrap: nowrap !important;
  }
  .task-tracker-filter-bar::-webkit-scrollbar { display: none; }
  .task-tracker-filter-btn {
    flex-shrink: 0 !important;
  }
}

/* ═══════════════════════════════════════════════════
   TOUCH — bigger targets
   ═══════════════════════════════════════════════════ */
@media (hover: none) and (pointer: coarse) {
  .mv-calendar-card #calendar-container .day,
  .mv-calendar-card #calendar-container .week-num { min-height: clamp(38px, 5.5vw, 48px); }
  .mv-panels-card .task-tracker-panel .task-item { padding: 10px 12px; min-height: 44px; }
  .mv-panels-card .habit-tracker-panel .habit-item { padding: 12px 14px; min-height: 48px; }
  .mv-panels-card .habit-tracker-panel .habit-edit-btn,
  .mv-panels-card .habit-tracker-panel .habit-delete-btn { min-width: 36px; min-height: 36px; }
  .mv-panels-card .task-tracker-panel .task-actions-toggle { min-width: 36px; min-height: 36px; }
}

/* ── Mobile: hide info panel, fix two-column collapse ── */
@media (max-width: 768px) {
  .calendar-main-view .month-goals-indicator { display: none !important; }
  .mv-panels-card .month-goals-indicator { display: none !important; }
  .mv-body {
    flex-direction: column !important;
    gap: 4px !important;
    padding: 0 6px;
    max-width: 420px !important;
    margin: 0 auto !important;
  }
  .mv-calendar-card { max-width: 100% !important; min-width: 0 !important; }
  .mv-calendar-card #calendar-container { padding: 4px 12px 12px; }
  .mv-calendar-card #calendar-container .calendar { border-spacing: 4px; }
  .mv-calendar-card #calendar-container .day,
  .mv-calendar-card #calendar-container .week-num {
    min-height: 38px; font-size: 12px; padding: 6px 3px; border-radius: 8px;
  }
  .mv-calendar-card #calendar-container .nav .title { font-size: 14px; }
  .mv-calendar-card #calendar-container .nav .title .year { font-size: 15px; }
  .mv-calendar-card #calendar-container .arrow svg { width: 14px; height: 14px; }
  .mv-calendar-card #calendar-container .reset-button {
    padding: 4px 12px; font-size: 10px; min-height: 26px;
  }
  .mv-calendar-card #calendar-container .calendar th {
    font-size: 8px; letter-spacing: 1px; padding: 4px 0 6px;
  }
  .mv-calendar-card #calendar-container .day[data-task-count]::after {
    font-size: 8px; min-width: 12px; height: 12px; bottom: 1px; right: 1px;
  }
  .mv-calendar-card #calendar-container .day[data-habit-count]::before {
    font-size: 7px; min-width: 11px; height: 11px;
  }
  .mv-calendar-header { padding: 6px 8px 0; gap: 4px; }

  /* ── Panels — compact inline ── */
  .mv-panels-card { padding: 0 !important; border-radius: 0 !important; }
  .mv-panels-card .panels-container { gap: 0; }
  .mv-panels-card .task-tracker-panel,
  .mv-panels-card .habit-tracker-panel {
    padding: 6px 8px !important; border-radius: 0 !important;
    border-top: 1px solid var(--mcp-glass-border); background: transparent !important;
  }
  .mv-panels-card .task-tracker-panel .task-tracker-header {
    padding: 0 0 4px; gap: 3px; flex-wrap: nowrap;
  }
  .mv-panels-card .task-tracker-panel .task-tracker-title { font-size: 10px; letter-spacing: 0.5px; }
  .mv-panels-card .task-tracker-panel .task-tracker-count { font-size: 9px; }
  .mv-panels-card .task-tracker-panel .task-item {
    padding: 3px 5px !important; gap: 2px !important; min-height: 26px !important;
    margin-bottom: 2px !important; border-radius: 6px !important;
  }
  .mv-panels-card .task-tracker-panel .task-item-row-main { gap: 4px; }
  .mv-panels-card .task-tracker-panel .task-item-row-meta {
    display: flex !important; gap: 3px; padding-left: 0;
  }
  .mv-panels-card .task-tracker-panel .task-status-badge,
  .mv-panels-card .task-tracker-panel .task-scheduled,
  .mv-panels-card .task-tracker-panel .task-timer,
  .mv-panels-card .task-tracker-panel .task-estimate {
    font-size: 8px !important; padding: 1px 3px !important;
  }
  .mv-panels-card .task-tracker-panel .task-title { font-size: 11px; }
  .mv-panels-card .task-tracker-panel .task-status-btn {
    width: 16px; height: 16px; font-size: 8px; border-radius: 4px;
  }
  .mv-panels-card .task-tracker-panel .task-tracker-filter-bar {
    padding: 2px 0; gap: 2px; overflow-x: auto; flex-wrap: nowrap;
    -webkit-overflow-scrolling: touch; scrollbar-width: none;
  }
  .mv-panels-card .task-tracker-panel .task-tracker-filter-bar::-webkit-scrollbar { display: none; }
  .mv-panels-card .task-tracker-panel .task-tracker-filter-btn {
    padding: 2px 6px; font-size: 9px; min-height: 20px; flex-shrink: 0;
  }
  .mv-panels-card .task-tracker-panel .task-tracker-search-input {
    padding: 4px 6px; font-size: 11px;
  }
  .mv-panels-card .task-tracker-panel .task-tracker-list { max-height: none; overflow-y: auto; }
  .mv-panels-card .task-tracker-panel .task-actions-toggle {
    min-width: 20px; min-height: 20px; font-size: 10px; padding: 1px 2px;
  }
  .mv-panels-card .task-tracker-panel .task-scheduled,
  .mv-panels-card .task-tracker-panel .task-timer,
  .mv-panels-card .task-tracker-panel .task-estimate { font-size: 8px; padding: 1px 3px; }
  .mv-panels-card .task-tracker-panel .note-icon { font-size: 9px; }

  /* ── Kanban tabs — compact ── */
  .kanban-dropdown-trigger { padding: 2px 5px; font-size: 9px; min-height: 18px; gap: 2px; border-radius: 4px; }
  .kanban-trigger-icon { font-size: 9px; }
  .kanban-trigger-label { font-size: 9px; }
  .kanban-trigger-count { font-size: 7px; padding: 0 2px; }

  /* ── Habit panel — compact ── */
  .mv-panels-card .habit-tracker-panel .habit-tracker-header { padding: 4px 0; gap: 2px; }
  .mv-panels-card .habit-tracker-panel .habit-tracker-title { font-size: 10px; }
  .mv-panels-card .habit-tracker-panel .habit-item {
    padding: 3px 5px; gap: 4px; min-height: 28px;
  }
  .mv-panels-card .habit-tracker-panel .habit-check-btn { width: 20px; height: 20px; }
  .mv-panels-card .habit-tracker-panel .habit-icon { font-size: 12px; }
  .mv-panels-card .habit-tracker-panel .habit-title { font-size: 10px; }
  .mv-panels-card .habit-tracker-panel .habit-progress-text,
  .mv-panels-card .habit-tracker-panel .habit-streak { font-size: 8px; padding: 1px 3px; }
  .mv-panels-card .habit-tracker-panel .habit-edit-btn,
  .mv-panels-card .habit-tracker-panel .habit-delete-btn { display: none !important; }
  .mv-panels-card .habit-tracker-panel .habit-tracker-list { max-height: none; }
}
/* ═══════ END MAIN VIEW ═══════ */
`;
    document.head.appendChild(style);
  }

  async onOpen(): Promise<void> {
    // Clean up any previous content (prevents duplicates on re-open / hot-reload)
    this.contentEl.empty();

    // Destroy stale Svelte components from prior open
    if (this.calendar) { this.calendar.$destroy(); this.calendar = null; }
    if (this.taskPanel) { this.taskPanel.$destroy(); this.taskPanel = null; }
    if (this.habitPanel) { this.habitPanel.$destroy(); this.habitPanel = null; }

    // Initialize selected date with today
    selectedDate.set(getDateUID(moment(), "day"));

    const currentSettings = get(settings);
    const isMainView = !!currentSettings.calendarInMainView;

    if (isMainView) {
      this.injectMainViewStyles();
      this.contentEl.addClass("calendar-main-view");
    }

    // Schedule view button
    const scheduleBtn = this.contentEl.createEl("button", {
      text: "📅 Открыть расписание",
      cls: "schedule-open-btn",
    });
    scheduleBtn.addEventListener("click", () => {
      if (this.isMobile && this.plugin) {
        this.plugin.activateMobileScheduleView();
      } else if (this.plugin) {
        this.plugin.activateScheduleView();
      }
    });

    // Monthly goals indicator (rendered after DOM restructure below)
    this.goalsContainer = this.contentEl.createDiv({
      cls: "month-goals-indicator",
    });

    // Integration point: external plugins can listen for `calendar:open`
    // to feed in additional sources.
    const sources = [
      customTagsSource,
      streakSource,
      wordCountSource,
      taskDotSource,
      habitSource,
    ];
    this.app.workspace.trigger(TRIGGER_ON_OPEN, sources);

    // Calendar always mounts directly into contentEl
    this.calendar = new Calendar({
      target: this.contentEl,
      props: {
        onClickDay: this.selectDateForDay,
        onClickWeek: this.selectDateForWeek,
        onHoverDay: this.onHoverDay,
        onHoverWeek: this.onHoverWeek,
        onContextMenuDay: this.onContextMenuDay,
        onContextMenuWeek: this.onContextMenuWeek,
        onMonthChange: (mk: string) => {
          this.currentMonthKey = mk;
          this.updateGoalsIndicator(mk);
        },
        sources,
      },
    });

    if (isMainView) {
      // --- Main view: two-column layout ---
      const layout = this.contentEl.createDiv({ cls: "mv-layout" });
      const body = layout.createDiv({ cls: "mv-body" });

      // Left: calendar card
      const leftCard = body.createDiv({ cls: "mv-card mv-calendar-card" });
      const calHeader = leftCard.createDiv({ cls: "mv-calendar-header" });
      calHeader.appendChild(scheduleBtn);

      const calendarWrapper = this.contentEl.querySelector(
        "#calendar-container",
      )?.parentElement;
      if (calendarWrapper) {
        leftCard.appendChild(calendarWrapper);
      }

      // Right: panels + goals inside glass card
      const rightCard = body.createDiv({ cls: "mv-card mv-panels-card" });
      rightCard.appendChild(this.goalsContainer);
      this.panelsContainer = rightCard.createDiv({ cls: "panels-container" });
    } else {
      // Single-column: original behavior
      this.panelsContainer = this.contentEl.createDiv({
        cls: "panels-container",
      });
    }

    // Render goals after DOM is in final position and finance data is loaded
    setTimeout(() => {
      if (!this.goalsContainer) return;
      this.updateGoalsIndicator();
      // Subscribe to future finance data changes
      this.goalsUnsub = financeData.subscribe(() => {
        this.updateGoalsIndicator(this.currentMonthKey);
      });
    }, 300);

    // Create panels now that panelsContainer exists
    if (currentSettings.showTaskTracker !== false) {
      this.taskPanel = new TaskPanel({
        target: this.panelsContainer,
        props: { appInstance: this.app },
      });
    }
    if (currentSettings.showHabitTracker !== false) {
      this.habitPanel = new HabitPanel({
        target: this.panelsContainer,
        props: { appInstance: this.app },
      });
    }
  }

  private updateGoalsIndicator(monthKey?: string): void {
    if (!this.goalsContainer) return;

    if (!monthKey) {
      const now = new Date();
      monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    const goals = getMonthGoals(monthKey);
    this.renderGoalsIndicator(goals, monthKey);
  }

  private renderGoalsIndicator(goals: MonthGoal[], monthKey: string): void {
    if (!this.goalsContainer) return;
    this.goalsContainer.empty();

    if (goals.length === 0) return;

    if (goals.length === 1) {
      const goal = goals[0];
      const remaining = (goal.targetAmount || 0) - (goal.currentAmount || 0);
      const remainingText =
        remaining > 0
          ? `Осталось накопить: ${remaining.toLocaleString("ru-RU")} ₽`
          : remaining === 0
            ? "Цель достигнута!"
            : `Превышено на ${Math.abs(remaining).toLocaleString("ru-RU")} ₽`;

      const wrapper = this.goalsContainer.createDiv({
        cls: "month-goals-single",
      });
      wrapper.createEl("span", {
        text: goal.icon || "🎯",
        cls: "month-goals-icon",
      });
      const textEl = wrapper.createEl("span", { cls: "month-goals-text" });
      textEl.createEl("strong", { text: goal.name || "Цель" });
      textEl.createEl("span", {
        text: ` — ${remainingText}`,
        cls: "month-goals-remaining",
      });

      const navBtn = wrapper.createEl("button", {
        text: "💰",
        cls: "month-goals-nav-btn",
      });
      navBtn.title = "Перейти к распределению средств";
      navBtn.addEventListener("click", () => {
        if (this.plugin) {
          this.plugin.activateFinanceView();
        }
      });
    } else {
      const wrapper = this.goalsContainer.createDiv({
        cls: "month-goals-multi",
      });
      wrapper.createEl("span", { text: "🎯", cls: "month-goals-icon" });
      const summary = goals
        .map((g) => {
          const rem = (g.targetAmount || 0) - (g.currentAmount || 0);
          return `${g.icon || "🎯"} ${g.name || "Цель"}: ${rem > 0 ? `ост. ${rem.toLocaleString("ru-RU")} ₽` : "✓"}`;
        })
        .join(" | ");
      wrapper.createEl("span", { text: summary, cls: "month-goals-text" });

      const showBtn = wrapper.createEl("button", {
        text: `Все (${goals.length})`,
        cls: "month-goals-show-btn",
      });
      showBtn.addEventListener("click", () => {
        this.showGoalsModal(monthKey);
      });

      const navBtn = wrapper.createEl("button", {
        text: "💰",
        cls: "month-goals-nav-btn",
      });
      navBtn.title = "Перейти к распределению средств";
      navBtn.addEventListener("click", () => {
        if (this.plugin) {
          this.plugin.activateFinanceView();
        }
      });
    }
  }

  private showGoalsModal(monthKey: string): void {
    const goals = getMonthGoals(monthKey);
    if (goals.length === 0) return;

    const months = [
      "Январь",
      "Февраль",
      "Март",
      "Апрель",
      "Май",
      "Июнь",
      "Июль",
      "Август",
      "Сентябрь",
      "Октябрь",
      "Ноябрь",
      "Декабрь",
    ];
    const [y, m] = monthKey.split("-");
    const monthName = `${months[parseInt(m) - 1]} ${y}`;

    const overlay = document.body.createDiv({ cls: "goals-modal-overlay" });
    const modal = overlay.createDiv({ cls: "goals-modal" });

    const header = modal.createDiv({ cls: "goals-modal-header" });
    header.createEl("span", { text: "🎯", cls: "goals-modal-icon" });
    header.createEl("h2", { text: `Цели на ${monthName}` });
    const closeBtn = header.createEl("button", {
      text: "✕",
      cls: "goals-modal-close",
    });

    const body = modal.createDiv({ cls: "goals-modal-body" });
    goals.forEach((goal: MonthGoal, i: number) => {
      const remaining = (goal.targetAmount || 0) - (goal.currentAmount || 0);
      const item = body.createDiv({ cls: "goal-item" });
      item.createEl("span", { text: `${i + 1}.`, cls: "goal-number" });
      const name = goal.name || "Цель";
      const icon = goal.icon || "🎯";
      item.createEl("span", { text: `${icon} ${name}`, cls: "goal-text" });
      const amountsEl = item.createDiv({ cls: "goal-amounts" });
      amountsEl.createEl("span", {
        text: `${(goal.currentAmount || 0).toLocaleString("ru-RU")} ₽ / ${(goal.targetAmount || 0).toLocaleString("ru-RU")} ₽`,
        cls: "goal-amounts-detail",
      });
      amountsEl.createEl("span", {
        text:
          remaining > 0
            ? `Осталось: ${remaining.toLocaleString("ru-RU")} ₽`
            : remaining === 0
              ? "✓ Достигнуто"
              : `Превышено: ${Math.abs(remaining).toLocaleString("ru-RU")} ₽`,
        cls: remaining > 0 ? "goal-remaining" : "goal-remaining done",
      });
    });

    const footer = modal.createDiv({ cls: "goals-modal-footer" });
    const navBtn = footer.createEl("button", {
      text: "💰 Перейти к распределению",
      cls: "goals-modal-nav-btn",
    });
    navBtn.addEventListener("click", () => {
      close();
      if (this.plugin) {
        this.plugin.activateFinanceView();
      }
    });

    const close = () => overlay.remove();
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
  }

  private activeTooltip: HTMLElement | null = null;

  onHoverDay(
    date: Moment,
    targetEl: EventTarget,
    isMetaPressed: boolean,
  ): void {
    if (isMetaPressed) {
      const { format } = getDailyNoteSettings();
      const note = getDailyNote(date, get(dailyNotes));
      this.app.workspace.trigger(
        "link-hover",
        this,
        targetEl,
        date.format(format),
        note?.path,
      );
    }
    // Tooltips disabled — tasks are visible in the task panel
  }

  private removeTooltip(): void {
    if (this.activeTooltip) {
      this.activeTooltip.remove();
      this.activeTooltip = null;
    }
  }

  onHoverWeek(
    date: Moment,
    targetEl: EventTarget,
    isMetaPressed: boolean,
  ): void {
    if (!isMetaPressed) {
      return;
    }
    const note = getWeeklyNote(date, get(weeklyNotes));
    const { format } = getWeeklyNoteSettings();
    this.app.workspace.trigger(
      "link-hover",
      this,
      targetEl,
      date.format(format),
      note?.path,
    );
  }

  private onContextMenuDay(date: Moment, event: MouseEvent): void {
    const note = getDailyNote(date, get(dailyNotes));
    if (!note) {
      // If no file exists for a given day, show nothing.
      return;
    }
    showNoteContextMenu(this.app, note, {
      x: event.pageX,
      y: event.pageY,
    });
  }

  private onContextMenuWeek(date: Moment, event: MouseEvent): void {
    const note = getWeeklyNote(date, get(weeklyNotes));
    if (!note) {
      // If no file exists for a given day, show nothing.
      return;
    }
    showNoteContextMenu(this.app, note, {
      x: event.pageX,
      y: event.pageY,
    });
  }

  private onNoteSettingsUpdate(): void {
    dailyNotes.reindex();
    weeklyNotes.reindex();
    // Calendar reactivity handles display update — no tick needed
  }

  private onFileDeleted(file: TFile): void {
    if (getDateFromFile(file, "day")) {
      dailyNotes.reindex();
    }
    if (getDateFromFile(file, "week")) {
      weeklyNotes.reindex();
    }
    this.updateActiveFile();
  }

  private onFileModified(_file: TFile): void {
    // Calendar reactivity handles display update via store subscriptions
  }

  private onFileCreated(file: TFile): void {
    if (this.app.workspace.layoutReady) {
      if (getDateFromFile(file, "day")) {
        dailyNotes.reindex();
      }
      if (getDateFromFile(file, "week")) {
        weeklyNotes.reindex();
      }
    }
  }

  public onFileOpen(_file: TFile): void {
    if (this.app.workspace.layoutReady) {
      this.updateActiveFile();
    }
  }

  private updateActiveFile(): void {
    const leaf = this.app.workspace.activeLeaf;
    if (!leaf) return;

    const { view } = leaf;

    let file = null;
    if (view instanceof FileView) {
      file = view.file;
    }
    activeFile.setFile(file);
  }

  public revealActiveNote(): void {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf) return;

    if (activeLeaf.view instanceof FileView) {
      // Check to see if the active note is a daily-note
      let date = getDateFromFile(activeLeaf.view.file, "day");
      if (date) {
        this.calendar.$set({ displayedMonth: date });
        return;
      }

      // Check to see if the active note is a weekly-note
      const { format } = getWeeklyNoteSettings();
      date = moment(activeLeaf.view.file.basename, format, true);
      if (date.isValid()) {
        this.calendar.$set({ displayedMonth: date });
        return;
      }
    }
  }

  selectDateForWeek(date: Moment): void {
    const dateUID = getDateUID(date, "week");
    selectedDate.set(dateUID);
    activeFile.setUID(dateUID);
  }

  selectDateForDay(date: Moment): void {
    const dateUID = getDateUID(date, "day");
    const current = get(selectedDate);
    if (current === dateUID) {
      selectedDate.set(null);
      activeFile.setUID(null);
    } else {
      selectedDate.set(dateUID);
      activeFile.setUID(dateUID);
    }
  }
}
