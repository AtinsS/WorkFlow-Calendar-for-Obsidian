import type { App } from "obsidian";

declare global {
  interface Window {
    app: App;
  }
}
