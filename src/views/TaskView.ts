import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_TASKS, VIEW_TYPE_SCHEDULE, VIEW_TYPE_MOBILE_SCHEDULE } from "../constants";
import TaskPanel from "../task-tracker/TaskPanel.svelte";
import HabitPanel from "../habit-tracker/HabitPanel.svelte";
import { get } from "svelte/store";
import { selectedDate, projects, taskFilter } from "../task-tracker/stores";
import { settings } from "../ui/stores";
import moment from "moment";
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
    return "Задачи";
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

    selectedDate.set(getDateUID(moment(), "day"));
    const currentSettings = get(settings);

    // Inject styles
    this.injectStyles();

    // Main layout: sidebar + panels
    const body = this.contentEl.createDiv({ cls: "task-view-body" });
    const mainContent = body.createDiv({ cls: "task-view-main" });

    // Sidebar: project list
    const sidebar = mainContent.createDiv({ cls: "task-view-sidebar" });
    sidebar.createDiv({ cls: "task-view-sidebar-title", text: "Проекты" });
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

  private injectStyles(): void {
    if (document.getElementById("tv-injected-styles")) return;
    const style = document.createElement("style");
    style.id = "tv-injected-styles";
    style.textContent = `
/* ═══════════════════════════════════════════════════
   TASK VIEW — tasks + projects tab
   ═══════════════════════════════════════════════════ */

.task-view {
  height: 100%;
  overflow: hidden;
}

.task-view-body {
  display: flex;
  width: 100%;
  height: 100%;
}

.task-view-main {
  display: flex;
  gap: 0;
  width: 100%;
  height: 100%;
  align-items: stretch;
}

.task-view-sidebar {
  flex: 0 0 200px;
  min-width: 160px;
  max-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px 16px;
  background: var(--mcp-glass-bg);
  border-right: 1px solid var(--mcp-glass-border);
  overflow-y: auto;
  align-self: stretch;
}

.task-view-sidebar-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--mcp-text-muted);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  padding: 0 8px 12px;
  border-bottom: 1px solid var(--mcp-glass-border);
  margin-bottom: 4px;
}

.task-view-sidebar-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-view-sidebar-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--mcp-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  text-align: left;
}

.task-view-sidebar-btn:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--mcp-text);
}

.task-view-sidebar-btn.active {
  background: var(--project-color, var(--mcp-accent));
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--project-color, var(--mcp-accent)) 40%, transparent);
}

.task-view-sidebar-icon {
  font-size: 16px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  flex-shrink: 0;
}

.task-view-sidebar-btn.active .task-view-sidebar-icon {
  background: rgba(255, 255, 255, 0.15);
}

.task-view-sidebar-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-view-panels {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  overflow: hidden;
}

.task-view-panels .panels-container {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  flex: 1;
  overflow-y: auto;
}

.task-view-panels .task-tracker-panel,
.task-view-panels .habit-tracker-panel {
  width: 100%;
  border-radius: 0;
  padding: 24px 28px;
  background: transparent;
}

.task-view-panels .habit-tracker-panel {
  border-top: 1px solid var(--mcp-glass-border);
}

.task-tracker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
}

.task-tracker-header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-tracker-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--mcp-text);
}

.task-tracker-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 860px) {
  .task-view-sidebar { display: none; }
  .task-view-panels { padding: 8px; }
}
`;
    document.head.appendChild(style);
  }

  private renderProjectSidebar(): void {
    if (!this.projectSidebar) return;

    projects.subscribe((projectList) => {
      this.projectSidebar.empty();

      const allBtn = this.projectSidebar.createDiv({ cls: "task-view-sidebar-btn" });
      allBtn.createDiv({ cls: "task-view-sidebar-icon", text: "📋" });
      allBtn.createDiv({ cls: "task-view-sidebar-name", text: "Все" });
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
