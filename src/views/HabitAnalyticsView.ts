import { ItemView, WorkspaceLeaf } from "obsidian";
import { get } from "svelte/store";

import { VIEW_TYPE_HABIT_ANALYTICS } from "../constants";
import type CalendarPlugin from "../main";
import HabitAnalytics from "../components/HabitAnalytics.svelte";
import { settings } from "../ui/stores";

export default class HabitAnalyticsView extends ItemView {
  private plugin: CalendarPlugin;
  private svelteComponent: HabitAnalytics;

  constructor(leaf: WorkspaceLeaf, plugin: CalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_HABIT_ANALYTICS;
  }

  getDisplayText(): string {
    return "Аналитика";
  }

  getIcon(): string {
    return "bar-chart";
  }

  async onOpen(): Promise<void> {
    if (this.svelteComponent) { this.svelteComponent.$destroy(); this.svelteComponent = null; }
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("habit-analytics-view-container");

    const currentSettings = get(settings);
    const habitsHidden = currentSettings.showHabitTracker === false;

    this.svelteComponent = new HabitAnalytics({
      target: container as HTMLElement,
      props: { habitsHidden },
    });
  }

  async onClose(): Promise<void> {
    if (this.svelteComponent) {
      this.svelteComponent.$destroy();
      this.svelteComponent = null;
    }
  }
}
