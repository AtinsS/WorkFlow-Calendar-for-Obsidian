import { ItemView, WorkspaceLeaf } from "obsidian";

import { VIEW_TYPE_MOBILE_SCHEDULE } from "../constants";
import type CalendarPlugin from "../main";
import MobileSchedule from "../components/MobileSchedule.svelte";
import { tRaw } from "../i18n";

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
    return tRaw("hello.navSchedule");
  }

  getIcon(): string {
    return "calendar-range";
  }

  async onOpen(): Promise<void> {
    if (this.svelteComponent) { this.svelteComponent.$destroy(); this.svelteComponent = null; }
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("mobile-schedule-view-container");

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
