import { ItemView, WorkspaceLeaf } from "obsidian";

import { VIEW_TYPE_MOBILE_TASKS } from "../constants";
import type CalendarPlugin from "../main";
import MobileTasks from "../components/MobileTasks.svelte";

export default class MobileTaskTrackerView extends ItemView {
  private plugin: CalendarPlugin;
  private svelteComponent: MobileTasks;

  constructor(leaf: WorkspaceLeaf, plugin: CalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_MOBILE_TASKS;
  }

  getDisplayText(): string {
    return "Задачи";
  }

  getIcon(): string {
    return "checkbox-glyph";
  }

  async onOpen(): Promise<void> {
    if (this.svelteComponent) { this.svelteComponent.$destroy(); this.svelteComponent = null; }
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("mobile-tasks-view-container");
    (container as HTMLElement).style.height = "100%";
    (container as HTMLElement).style.display = "flex";
    (container as HTMLElement).style.flexDirection = "column";

    this.svelteComponent = new MobileTasks({
      target: container as HTMLElement,
      props: {
        plugin: this.plugin,
      },
    });
  }

  async onClose(): Promise<void> {
    if (this.svelteComponent) {
      this.svelteComponent.$destroy();
      this.svelteComponent = null;
    }
  }
}
