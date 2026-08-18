import { ItemView, WorkspaceLeaf } from "obsidian";

import { VIEW_TYPE_FINANCE } from "../constants";
import type CalendarPlugin from "../main";
import FinanceTracker from "../finance/FinanceTracker.svelte";
import { tRaw } from "../i18n";

export default class FinanceView extends ItemView {
  private plugin: CalendarPlugin;
  private svelteComponent: FinanceTracker;

  constructor(leaf: WorkspaceLeaf, plugin: CalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_FINANCE;
  }

  getDisplayText(): string {
    return tRaw("hello.navFinance");
  }

  getIcon(): string {
    return "coins";
  }

  async onOpen(): Promise<void> {
    if (this.svelteComponent) { this.svelteComponent.$destroy(); this.svelteComponent = null; }
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("finance-view-container");

    this.svelteComponent = new FinanceTracker({
      target: container as HTMLElement,
    });
  }

  async onClose(): Promise<void> {
    if (this.svelteComponent) {
      this.svelteComponent.$destroy();
      this.svelteComponent = null;
    }
  }
}
