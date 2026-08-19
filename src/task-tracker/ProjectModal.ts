import type { App } from "obsidian";
import { get } from "svelte/store";
import { CustomModal } from "../ui/CustomModal";
import { tRaw } from "../i18n";

import type { IProject } from "./types";
import { DEFAULT_PROJECT_COLORS } from "./types";
import {
  projects,
  tasks,
  addProject,
  updateProject,
  removeProject,
} from "./stores";

const RECENT_ICONS_KEY = "calendar-recent-icons";
const MAX_RECENT = 10;

function getRecentIcons(app: App): string[] {
  try {
    const raw = app.loadLocalStorage(RECENT_ICONS_KEY);
    return typeof raw === "string" ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addRecentIcon(app: App, emoji: string): void {
  const recent = getRecentIcons(app).filter((e) => e !== emoji);
  recent.unshift(emoji);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
  app.saveLocalStorage(RECENT_ICONS_KEY, JSON.stringify(recent));
}

function renderIconPicker(
  app: App,
  container: HTMLElement,
  currentIcon: string,
  onSelect: (emoji: string) => void,
): HTMLInputElement {
  container.empty();

  // Custom input
  const customRow = container.createDiv("pm-icon-custom-row");
  customRow.createEl("label", { text: tRaw("tasks.project.icon"), cls: "pm-label" });
  const inputWrap = customRow.createDiv("pm-icon-input-wrap");
  const input = inputWrap.createEl("input", {
    cls: "pm-icon-custom-input",
    attr: { type: "text", placeholder: "📁", maxlength: "1", value: currentIcon },
  });
  const applyBtn = inputWrap.createEl("button", { text: "✓", cls: "pm-icon-apply-btn" });

  function applyIcon() {
    const val = input.value.trim();
    if (val) {
      onSelect(val);
      addRecentIcon(app, val);
      renderRecentSection();
    }
  }

  applyBtn.addEventListener("click", applyIcon);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyIcon();
  });
  input.addEventListener("input", () => {
    onSelect(input.value.trim() || "📁");
  });

  // Recently used
  const recentSection = container.createDiv("pm-icon-recent");
  recentSection.createEl("label", { text: tRaw("tasks.project.recent"), cls: "pm-label" });
  const recentGrid = recentSection.createDiv("pm-icon-grid");

  function renderRecentSection() {
    recentGrid.empty();
    const recent = getRecentIcons(app);
    if (recent.length === 0) {
      recentSection.style.display = "none";
      return;
    }
    recentSection.style.display = "";
    recent.forEach((emoji) => {
      const btn = recentGrid.createDiv("pm-icon-btn");
      btn.textContent = emoji;
      btn.title = emoji;
      btn.addEventListener("click", () => {
        input.value = emoji;
        onSelect(emoji);
        recentGrid.querySelectorAll(".pm-icon-btn").forEach((b) => b.removeClass("active"));
        btn.addClass("active");
      });
    });
  }

  renderRecentSection();

  return input;
}

export class ProjectModal extends CustomModal {
  onOpen(): void {
    this.containerEl.addClass("wf-project-modal");

    this.contentEl.createEl("h2", { text: tRaw("tasks.project.title") });
    this.contentEl.createEl("p", {
      text: tRaw("tasks.project.subtitle"),
      cls: "wf-dialog-subtitle",
    });

    this.renderNewProjectForm(this.contentEl);
    this.renderProjectList(this.contentEl);
  }

  private renderNewProjectForm(container: HTMLElement): void {
    const section = container.createDiv("pm-new-project");

    const header = section.createDiv("pm-section-header pm-section-toggle");
    header.createEl("span", { text: "+", cls: "pm-section-icon" });
    header.createEl("span", { text: tRaw("tasks.project.newProject"), cls: "pm-section-title" });
    const chevron = header.createEl("span", { text: "▾", cls: "pm-chevron" });

    const body = section.createDiv("pm-section-body");

    let isExpanded = true;
    header.addEventListener("click", () => {
      isExpanded = !isExpanded;
      body.style.display = isExpanded ? "" : "none";
      chevron.textContent = isExpanded ? "▾" : "▸";
    });

    let newName = "";
    let newColor = DEFAULT_PROJECT_COLORS[0];
    let newIcon = "📁";

    // Name input
    const nameField = body.createDiv("pm-field");
    nameField.createEl("label", { text: tRaw("tasks.project.name"), cls: "pm-label" });
    const nameInput = nameField.createEl("input", {
      cls: "pm-input",
      attr: { type: "text", placeholder: tRaw("tasks.project.namePlaceholder"), maxlength: "60" },
    });
    const charCount = nameField.createEl("span", { text: "0/60", cls: "pm-char-count" });
    nameInput.addEventListener("input", () => {
      newName = nameInput.value;
      charCount.textContent = `${newName.length}/60`;
    });

    // Color + Icon row
    const row = body.createDiv("pm-row");

    // Color picker
    const colorSection = row.createDiv("pm-color-section");
    colorSection.createEl("label", { text: tRaw("tasks.project.color"), cls: "pm-label" });
    const colorGrid = colorSection.createDiv("pm-color-grid");

    DEFAULT_PROJECT_COLORS.forEach((color) => {
      const swatch = colorGrid.createDiv("pm-color-swatch");
      swatch.style.backgroundColor = color;
      if (color === newColor) swatch.addClass("active");
      swatch.addEventListener("click", () => {
        colorGrid.querySelectorAll(".pm-color-swatch").forEach((s) => s.removeClass("active"));
        swatch.addClass("active");
        newColor = color;
        updatePreview();
      });
    });

    // Icon picker
    const iconSection = row.createDiv("pm-icon-section");
    renderIconPicker(this.app, iconSection, newIcon, (emoji) => {
      newIcon = emoji;
      updatePreview();
    });

    // Preview
    const preview = body.createDiv("pm-preview");
    preview.createEl("label", { text: tRaw("tasks.project.preview"), cls: "pm-label" });
    const previewCard = preview.createDiv("pm-preview-card");

    const previewDot = previewCard.createDiv("pm-preview-dot");
    previewDot.style.backgroundColor = newColor;
    const previewIcon = previewCard.createSpan("pm-preview-icon");
    previewIcon.textContent = newIcon;
    const previewName = previewCard.createSpan("pm-preview-name");
    previewName.textContent = tRaw("tasks.project.name");

    function updatePreview() {
      previewDot.style.backgroundColor = newColor;
      previewIcon.textContent = newIcon;
      previewName.textContent = newName || tRaw("tasks.project.name");
    }

    nameInput.addEventListener("input", updatePreview);

    // Create button
    const createBtn = body.createEl("button", {
      text: tRaw("tasks.project.create"),
      cls: "pm-create-btn",
    });
    createBtn.addEventListener("click", () => {
      if (!newName.trim()) {
        nameInput.focus();
        nameInput.classList.add("pm-input-error");
        setTimeout(() => nameInput.classList.remove("pm-input-error"), 1500);
        return;
      }
      addRecentIcon(this.app, newIcon);
      addProject({
        name: newName.trim(),
        color: newColor,
        icon: newIcon,
        folder: null,
        archived: false,
        sortOrder: get(projects).length,
      });
      this.rerender();
    });
  }

  private renderProjectList(container: HTMLElement): void {
    const section = container.createDiv("pm-existing");
    const header = section.createDiv("pm-section-header");
    header.createEl("span", { text: "🗂", cls: "pm-section-icon" });
    header.createEl("span", { text: tRaw("tasks.project.existingProjects"), cls: "pm-section-title" });

    const allProjects = get(projects);
    const allTasks = get(tasks);

    if (allProjects.length === 0) {
      section.createEl("p", {
        text: tRaw("tasks.project.empty"),
        cls: "pm-empty",
      });
      return;
    }

    const list = section.createDiv("pm-project-list");

    allProjects.forEach((project) => {
      const taskCount = allTasks.filter((t) => t.projectId === project.id && t.status !== "done").length;
      const doneCount = allTasks.filter((t) => t.projectId === project.id && t.status === "done").length;

      const item = list.createDiv("pm-project-item");
      item.style.setProperty("--project-color", project.color);

      const left = item.createDiv("pm-project-left");
      const dot = left.createDiv("pm-project-dot");
      dot.style.backgroundColor = project.color;
      left.createEl("span", { text: project.icon, cls: "pm-project-icon" });
      const info = left.createDiv("pm-project-info");
      info.createEl("span", { text: project.name, cls: "pm-project-name" });

      const stats = info.createDiv("pm-project-stats");
      if (taskCount > 0) {
        stats.createEl("span", { text: tRaw("tasks.project.activeCount", {count: taskCount}), cls: "pm-stat pm-stat-active" });
      }
      if (doneCount > 0) {
        stats.createEl("span", { text: tRaw("tasks.project.doneCount", {count: doneCount}), cls: "pm-stat pm-stat-done" });
      }

      const actions = item.createDiv("pm-project-actions");

      const editBtn = actions.createEl("button", { cls: "pm-action-btn pm-edit-btn", text: "✎" });
      editBtn.title = tRaw("common.edit");
      editBtn.addEventListener("click", () => this.openEditProject(project));

      const deleteBtn = actions.createEl("button", { cls: "pm-action-btn pm-delete-btn", text: "✕" });
      deleteBtn.title = tRaw("common.delete");
      deleteBtn.addEventListener("click", () => {
        new DeleteConfirmModal(this.app, project.name, () => {
          removeProject(project.id);
          this.rerender();
        }).open();
      });
    });

    // Footer tip
    const footer = container.createDiv("pm-footer-tip");
    footer.createEl("span", { cls: "pm-footer-tip-icon", text: "💡" });
    footer.createEl("span", { text: tRaw("tasks.project.footerTip") });
  }

  private openEditProject(project: IProject): void {
    this.close();
    const modal = new EditProjectModal(this.app, project, () => {
      new ProjectModal(this.app).open();
    });
    modal.open();
  }

  private rerender(): void {
    this.contentEl.empty();
    this.onOpen();
  }
}

class EditProjectModal extends CustomModal {
  private project: IProject;
  private onClosed: () => void;

  constructor(app: App, project: IProject, onClosed: () => void) {
    super(app);
    this.project = project;
    this.onClosed = onClosed;
  }

  onOpen(): void {
    this.containerEl.addClass("wf-project-modal");
    this.containerEl.addClass("wf-edit-modal");

    this.contentEl.createEl("h2", { text: tRaw("tasks.project.editProject") });

    let name = this.project.name;
    let color = this.project.color;
    let icon = this.project.icon;

    // Name
    const nameField = this.contentEl.createDiv("pm-field");
    nameField.createEl("label", { text: tRaw("tasks.project.name"), cls: "pm-label" });
    const nameInput = nameField.createEl("input", {
      cls: "pm-input",
      attr: { type: "text", placeholder: tRaw("tasks.project.name"), value: name, maxlength: "50" },
    });
    nameInput.addEventListener("input", () => { name = nameInput.value; });

    // Color
    const colorSection = this.contentEl.createDiv("pm-color-section");
    colorSection.createEl("label", { text: tRaw("tasks.project.color"), cls: "pm-label" });
    const colorGrid = colorSection.createDiv("pm-color-grid");

    DEFAULT_PROJECT_COLORS.forEach((c) => {
      const swatch = colorGrid.createDiv("pm-color-swatch");
      swatch.style.backgroundColor = c;
      if (c === color) swatch.addClass("active");
      swatch.addEventListener("click", () => {
        colorGrid.querySelectorAll(".pm-color-swatch").forEach((s) => s.removeClass("active"));
        swatch.addClass("active");
        color = c;
      });
    });

    // Icon
    const iconSection = this.contentEl.createDiv("pm-icon-section");
    renderIconPicker(this.app, iconSection, icon, (emoji) => {
      icon = emoji;
    });

    // Buttons
    const buttonsEl = this.contentEl.createDiv("pm-modal-buttons");

    const cancelBtn = buttonsEl.createEl("button", { text: tRaw("common.cancel"), cls: "pm-cancel-btn" });
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = buttonsEl.createEl("button", { text: tRaw("common.save"), cls: "pm-save-btn" });
    saveBtn.addEventListener("click", () => {
      if (!name.trim()) {
        nameInput.focus();
        nameInput.classList.add("pm-input-error");
        setTimeout(() => nameInput.classList.remove("pm-input-error"), 1500);
        return;
      }
      addRecentIcon(this.app, icon);
      updateProject(this.project.id, {
        name: name.trim(),
        color,
        icon: icon || "📁",
        folder: null,
      });
      this.close();
    });
  }

  onClose(): void {
    this.onClosed();
  }
}

class DeleteConfirmModal extends CustomModal {
  private name: string;
  private onConfirm: () => void;

  constructor(app: App, name: string, onConfirm: () => void) {
    super(app);
    this.name = name;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("p", { text: tRaw("tasks.project.deleteConfirm", { name: this.name }) });
    const btnRow = contentEl.createDiv({ cls: "pm-modal-buttons" });
    btnRow.createEl("button", { text: tRaw("common.cancel"), cls: "pm-btn" }).addEventListener("click", () => this.close());
    btnRow.createEl("button", { text: tRaw("common.delete"), cls: "pm-btn pm-btn-danger" }).addEventListener("click", () => {
      this.onConfirm();
      this.close();
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function -- required by CustomModal
  onClose(): void {}
}
