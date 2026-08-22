import { ItemView, WorkspaceLeaf, moment } from "obsidian";
import type { Moment } from "moment";

// Obsidian's type defs export moment as `typeof Moment` (the module namespace),
// but at runtime it's the callable moment function. Cast once here.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const momentFn: (inp?: unknown, format?: string, strict?: boolean) => Moment =
  moment as unknown as (inp?: unknown, format?: string, strict?: boolean) => Moment;
import { VIEW_TYPE_TASKS, VIEW_TYPE_SCHEDULE, VIEW_TYPE_MOBILE_SCHEDULE } from "../constants";
import TaskPanel from "../task-tracker/TaskPanel.svelte";
import HabitPanel from "../habit-tracker/HabitPanel.svelte";
import { get } from "svelte/store";
import { tRaw } from "../i18n";
import { selectedDate, projects, taskFilter } from "../task-tracker/stores";
import { settings } from "../ui/stores";
import { getDateUID } from "obsidian-daily-notes-interface";

export default class TaskView extends ItemView {
  private taskPanel: TaskPanel;
  private habitPanel: HabitPanel;
  private projectSidebar: HTMLElement | null = null;
  private panelsContainer: HTMLElement | null = null;
  private tasksUnsub: (() => void) | null = null;
  private projectsUnsub: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_TASKS;
  }

  getDisplayText(): string {
    return tRaw("tasks.panel.title");
  }

  getIcon(): string {
    return "checkbox-glyph";
  }

  onClose(): Promise<void> {
    if (this.tasksUnsub) { this.tasksUnsub(); this.tasksUnsub = null; }
    if (this.projectsUnsub) { this.projectsUnsub(); this.projectsUnsub = null; }
    if (this.taskPanel) { this.taskPanel.$destroy(); }
    if (this.habitPanel) { this.habitPanel.$destroy(); }
    return Promise.resolve();
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("task-view");

    selectedDate.set(getDateUID(momentFn(), "day"));
    const currentSettings = get(settings);

    // Main layout: sidebar + panels
    const body = this.contentEl.createDiv({ cls: "task-view-body" });
    const mainContent = body.createDiv({ cls: "task-view-main" });

    // Sidebar: project list
    const sidebar = mainContent.createDiv({ cls: "task-view-sidebar" });
    sidebar.createDiv({ cls: "task-view-sidebar-title", text: tRaw("tasks.panel.menuProjects").replace("📂 ", "") });
    this.projectSidebar = sidebar.createDiv({ cls: "task-view-sidebar-list" });

    // Panels
    const panelsCard = mainContent.createDiv({ cls: "task-view-panels" });
    this.panelsContainer = panelsCard.createDiv({ cls: "panels-container" });

    // Task panel
    this.taskPanel = new TaskPanel({
      target: this.panelsContainer,
      props: {
        appInstance: this.app,
        onOpenSchedule: () => this.openSchedule(),
      },
    });

    // Habit panel
    if (currentSettings.showHabitTracker !== false) {
      this.habitPanel = new HabitPanel({
        target: this.panelsContainer,
        props: { appInstance: this.app },
      });
    }

    // Project sidebar
    this.renderProjectSidebar();
  }

  private renderProjectSidebar(): void {
    if (!this.projectSidebar) return;

    projects.subscribe((projectList) => {
      this.projectSidebar.empty();

      const allBtn = this.projectSidebar.createDiv({ cls: "task-view-sidebar-btn" });
      allBtn.createDiv({ cls: "task-view-sidebar-icon", text: "📋" });
      allBtn.createDiv({ cls: "task-view-sidebar-name", text: tRaw("tasks.tabs.all") });
      if (get(taskFilter).projectId === null) allBtn.addClass("active");
      allBtn.addEventListener("click", () => taskFilter.update((f) => ({ ...f, projectId: null })));

      const activeProjects = projectList.filter((p) => !p.archived);
      for (const project of activeProjects) {
        const btn = this.projectSidebar.createDiv({ cls: "task-view-sidebar-btn" });
        btn.style.setProperty("--project-color", project.color || "var(--mcp-accent)");
        btn.createDiv({ cls: "task-view-sidebar-icon", text: project.icon || "📁" });
        btn.createDiv({ cls: "task-view-sidebar-name", text: project.name });
        if (get(taskFilter).projectId === project.id) btn.addClass("active");
        btn.addEventListener("click", () => {
          taskFilter.update((f) => ({
            ...f,
            projectId: f.projectId === project.id ? null : project.id,
          }));
        });
      }
    });

    taskFilter.subscribe(() => {
      if (!this.projectSidebar) return;
      const currentFilter = get(taskFilter);
      const buttons = this.projectSidebar.querySelectorAll(".task-view-sidebar-btn");
      buttons.forEach((btn, i) => {
        if (i === 0) {
          btn.classList.toggle("active", currentFilter.projectId === null);
        } else {
          const projectList = get(projects);
          const activeProjects = projectList.filter((p) => !p.archived);
          const project = activeProjects[i - 1];
          if (project) btn.classList.toggle("active", currentFilter.projectId === project.id);
        }
      });
    });
  }

  private openSchedule(): void {
    const { workspace } = this.app;
    const isMobile = window.innerWidth <= 768;
    const viewType = isMobile ? VIEW_TYPE_MOBILE_SCHEDULE : VIEW_TYPE_SCHEDULE;

    const existing = workspace.getLeavesOfType(viewType);
    if (existing.length) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getLeaf("tab");
    if (leaf) {
      leaf.setViewState({ type: viewType, active: true });
      workspace.revealLeaf(leaf);
    }
  }
}
