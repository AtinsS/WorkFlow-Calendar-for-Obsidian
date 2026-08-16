export class TFile {}
export class PluginSettingTab {}
/** Mock of Obsidian's Modal — only used in tests */
export class Modal {
  app: any;
  constructor(app?: any) { this.app = app; }
  open() { /* noop */ }
  close() { /* noop */ }
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
  vault: any;
  constructor() {
    this.vault = {
      getRoot: () => new TFolder("") as any,
    };
  }
}

export class SuggestModal<T> {
  app: any;
  constructor(app?: any) {
    this.app = app;
  }
  setPlaceholder(_: string) { /* noop */ }
  open() { /* noop */ }
  close() { /* noop */ }
  // Methods expected by subclasses
  getSuggestions(_query: string): T[] {
    return [] as T[];
  }
  renderSuggestion(_suggestion: T, _el: HTMLElement) { /* noop */ }
  onChooseSuggestion(_suggestion: T) { /* noop */ }
}
