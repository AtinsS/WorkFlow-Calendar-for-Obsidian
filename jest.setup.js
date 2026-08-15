const moment = require("moment");

// Mock window.moment for tests
window.moment = moment;

// Provide a stable global Notification mock so all tests share the same instance
// and can reliably assert calls across module boundaries.
global.mockNotify = global.mockNotify || jest.fn();
global.mockNotificationInstances = global.mockNotificationInstances || [];
class MockNotificationGlobal {
  constructor(title, opts) {
    this.title = title;
    this.body = opts && opts.body;
    this.close = jest.fn();
    this.onclick = null;
    try {
      if (typeof global.mockNotify === "function") global.mockNotify(title, this.body);
    } catch {}
    global.mockNotificationInstances.push(this);
  }
}
Object.defineProperty(MockNotificationGlobal, "permission", { value: "granted", writable: true, configurable: true });
MockNotificationGlobal.requestPermission = jest.fn().mockResolvedValue("granted");
global.Notification = MockNotificationGlobal;
Object.defineProperty(window, "Notification", { value: MockNotificationGlobal, writable: true, configurable: true });

// Mock Obsidian Notice
jest.mock("obsidian", () => ({
  Notice: class Notice {
    constructor() {}
  },
  Modal: class Modal {
    constructor() {}
    open() {}
    close() {}
  },
  PluginSettingTab: class PluginSettingTab {},
  Setting: class Setting {
    constructor() {}
    setName() { return this; }
    setDesc() { return this; }
    addText() { return this; }
    addToggle() { return this; }
    addDropdown() { return this; }
    addTextArea() { return this; }
  },
  TFile: class TFile {},
  normalizePath: () => "",
  requestUrl: jest.fn().mockResolvedValue({ status: 200, text: "{}", json: {} }),
}));

// Add minimal SuggestModal, App and TFolder mocks used by tests
jest.mockedObsidian = {
  SuggestModal: class SuggestModal {
    constructor(app) { this.app = app; }
    setPlaceholder() {}
    open() {}
    close() {}
  },
  App: class App {
    constructor() { this.vault = { getRoot: () => ({ children: [] }) }; }
  },
  TFolder: class TFolder {
    constructor(path) { this.path = path || ""; this.children = []; }
  },
};

// Merge into existing mock so imports get these symbols
const obsidianMock = require('obsidian');
Object.assign(obsidianMock, {
  SuggestModal: jest.mockedObsidian.SuggestModal,
  App: jest.mockedObsidian.App,
  TFolder: jest.mockedObsidian.TFolder,
});
