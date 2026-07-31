import { ItemView, WorkspaceLeaf } from "obsidian";

import { VIEW_TYPE_MOBILE_SCHEDULE } from "../constants";
import type CalendarPlugin from "../main";
import MobileSchedule from "../components/MobileSchedule.svelte";

export default class MobileScheduleView extends ItemView {
  private plugin: CalendarPlugin;
  private svelteComponent: MobileSchedule;

  constructor(leaf: WorkspaceLeaf, plugin: CalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_MOBILE_SCHEDULE;
  }

  getDisplayText(): string {
    return "Расписание";
  }

  getIcon(): string {
    return "calendar-range";
  }

  async onOpen(): Promise<void> {
    if (this.svelteComponent) { this.svelteComponent.$destroy(); this.svelteComponent = null; }
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("mobile-schedule-view-container");
    (container as HTMLElement).style.height = "100%";
    (container as HTMLElement).style.display = "flex";
    (container as HTMLElement).style.flexDirection = "column";

    this.svelteComponent = new MobileSchedule({
      target: container as HTMLElement,
      props: {
        plugin: this.plugin,
        onClose: () => {
          // Close this leaf
          this.app.workspace.getActiveViewOfType(MobileScheduleView)?.leaf.detach();
        },
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
