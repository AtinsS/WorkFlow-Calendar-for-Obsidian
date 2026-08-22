export class TFile {}
export class PluginSettingTab {}
/** Mock of Obsidian's Modal — only used in tests */
export class Modal {
  app: unknown;
  constructor(app?: unknown) { this.app = app; }
  open(): void { /* noop */ }
  close(): void { /* noop */ }
}
export class Notice {}
export function normalizePath(): string {
  return "";
}

// Mock requestUrl for API client tests
export const requestUrl = jest.fn().mockResolvedValue({ status: 200, text: "{}", json: {} });

// Minimal mock implementations used by tests
export class TFolder {
  path = "";
  children: Array<TFolder | TFile> = [];
  constructor(path?: string) {
    if (path) this.path = path;
  }
}

export class App {
  vault: unknown;
  constructor() {
    this.vault = {
      getRoot: () => new TFolder(""),
    };
  }
}

export class SuggestModal<T> {
  app: unknown;
  constructor(app?: unknown) {
    this.app = app;
  }
  setPlaceholder(_: string): void { /* noop */ }
  open(): void { /* noop */ }
  close(): void { /* noop */ }
  // Methods expected by subclasses
  getSuggestions(_query: string): T[] {
    return [] as T[];
  }
  renderSuggestion(_suggestion: T, _el: HTMLElement): void { /* noop */ }
  onChooseSuggestion(_suggestion: T): void { /* noop */ }
}
