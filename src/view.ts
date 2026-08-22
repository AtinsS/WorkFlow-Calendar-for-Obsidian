import { moment } from "obsidian";
import type { Moment } from "moment";

// Obsidian's type defs export moment as `typeof Moment` (the module namespace),
// but at runtime it's the callable moment function. Cast once here.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Obsidian types moment as namespace, runtime is callable
const momentFn = moment as (inp?: unknown, format?: string, strict?: boolean) => Moment;
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

import { tasks, selectedDate } from "./task-tracker/stores";
import { taskDotSource } from "./task-tracker/taskDotSource";
import { habitSource } from "./habit-tracker/habitSource";
import { QuickAddModal } from "./task-tracker/QuickAddModal";

export default class CalendarView extends ItemView {
  private calendar: Calendar;
  private settings: ISettings | null = null;
  private plugin: CalendarPlugin | undefined;
  private tasksUnsub: (() => void) | null = null;
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
      (this.app.workspace as unknown as { on: (name: string, cb: () => void) => import("obsidian").EventRef })
        .on("periodic-notes:settings-updated", this.onNoteSettingsUpdate),
    );
    this.registerEvent(this.app.vault.on("create", this.onFileCreated));
    this.registerEvent(this.app.vault.on("delete", this.onFileDeleted));
    this.registerEvent(this.app.vault.on("modify", this.onFileModified));
    this.registerEvent(this.app.workspace.on("file-open", this.onFileOpen));

    settings.subscribe((val: ISettings) => { this.settings = val; });
  }

  getViewType(): string { return VIEW_TYPE_CALENDAR; }
  getDisplayText(): string { return "Calendar"; }
  getIcon(): string { return "calendar-with-checkmark"; }

  onClose(): Promise<void> {
    this.removeTooltip();
    if (this.tasksUnsub) { this.tasksUnsub(); this.tasksUnsub = null; }
    if (this.calendar) { this.calendar.$destroy(); }
    return Promise.resolve();
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    if (this.calendar) { this.calendar.$destroy(); this.calendar = null; }
    selectedDate.set(getDateUID(momentFn(), "day"));

    const sources = [customTagsSource, streakSource, wordCountSource, taskDotSource, habitSource];
    this.app.workspace.trigger(TRIGGER_ON_OPEN, sources);

    this.calendar = new Calendar({
      target: this.contentEl,
      props: {
        onClickDay: this.selectDateForDay,
        onClickWeek: this.selectDateForWeek,
        onHoverDay: this.onHoverDay,
        onHoverWeek: this.onHoverWeek,
        onContextMenuDay: this.onContextMenuDay,
        onContextMenuWeek: this.onContextMenuWeek,
        sources,
      },
    });

    this.tasksUnsub = tasks.subscribe(() => {
      if (this.calendar) this.calendar.$set({});
    });
  }

  private activeTooltip: HTMLElement | null = null;

  onHoverDay(date: Moment, targetEl: EventTarget, isMetaPressed: boolean): void {
    if (isMetaPressed) {
      const { format } = getDailyNoteSettings();
      const note = getDailyNote(date, get(dailyNotes));
      this.app.workspace.trigger("link-hover", this, targetEl, date.format(format), note?.path);
    }
  }

  private removeTooltip(): void {
    if (this.activeTooltip) { this.activeTooltip.remove(); this.activeTooltip = null; }
  }

  onHoverWeek(date: Moment, targetEl: EventTarget, isMetaPressed: boolean): void {
    if (!isMetaPressed) return;
    const note = getWeeklyNote(date, get(weeklyNotes));
    const { format } = getWeeklyNoteSettings();
    this.app.workspace.trigger("link-hover", this, targetEl, date.format(format), note?.path);
  }

  private onContextMenuDay(date: Moment, event: MouseEvent): void {
    const note = getDailyNote(date, get(dailyNotes));
    const onQuickAdd = () => {
      new QuickAddModal(this.app, date).open();
    };
    showNoteContextMenu(this.app, note || null, { x: event.pageX, y: event.pageY }, onQuickAdd);
  }

  private onContextMenuWeek(date: Moment, event: MouseEvent): void {
    const note = getWeeklyNote(date, get(weeklyNotes));
    if (!note) return;
    showNoteContextMenu(this.app, note, { x: event.pageX, y: event.pageY });
  }

  private onNoteSettingsUpdate(): void {
    dailyNotes.reindex();
    weeklyNotes.reindex();
  }

  private onFileDeleted(file: TFile): void {
    if (getDateFromFile(file, "day")) dailyNotes.reindex();
    if (getDateFromFile(file, "week")) weeklyNotes.reindex();
    this.updateActiveFile();
  }

  private onFileModified(_file: TFile): void {
    // Calendar reactivity handles display update
  }

  private onFileCreated(file: TFile): void {
    if (this.app.workspace.layoutReady) {
      if (getDateFromFile(file, "day")) dailyNotes.reindex();
      if (getDateFromFile(file, "week")) weeklyNotes.reindex();
    }
  }

  public onFileOpen(_file: TFile): void {
    if (this.app.workspace.layoutReady) this.updateActiveFile();
  }

  private updateActiveFile(): void {
    const leaf = this.app.workspace.activeLeaf;
    if (!leaf) return;
    const { view } = leaf;
    let file = null;
    if (view instanceof FileView) file = view.file;
    activeFile.setFile(file);
  }

  public revealActiveNote(): void {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf) return;
    if (activeLeaf.view instanceof FileView) {
      let date = getDateFromFile(activeLeaf.view.file, "day");
      if (date) { this.calendar.$set({ displayedMonth: date }); return; }
      const { format } = getWeeklyNoteSettings();
      date = momentFn(activeLeaf.view.file.basename, format, true);
      if (date.isValid()) { this.calendar.$set({ displayedMonth: date }); return; }
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
      activeFile.setUID("");
    } else {
      selectedDate.set(dateUID);
      activeFile.setUID(dateUID);
    }
  }
}
