import { ItemView, WorkspaceLeaf } from "obsidian";

import { VIEW_TYPE_FINANCIAL_ANALYTICS } from "../constants";
import type CalendarPlugin from "../main";
import FinancialAnalytics from "../finance/FinancialAnalytics.svelte";
import { tRaw } from "../i18n";

export default class FinancialAnalyticsView extends ItemView {
  private plugin: CalendarPlugin;
  private svelteComponent: FinancialAnalytics;

  constructor(leaf: WorkspaceLeaf, plugin: CalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_FINANCIAL_ANALYTICS;
  }

  getDisplayText(): string {
    return tRaw("hello.navFinAnalytics");
  }

  getIcon(): string {
    return "trending-up";
  }

  async onOpen(): Promise<void> {
    if (this.svelteComponent) { this.svelteComponent.$destroy(); this.svelteComponent = null; }
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("financial-analytics-view-container");

    this.svelteComponent = new FinancialAnalytics({
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
