import type { App } from "obsidian";

export abstract class CustomModal {
  protected app: App;
  protected containerEl: HTMLElement;
  protected overlayEl: HTMLElement;
  protected contentEl: HTMLElement;
  private isOpen = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(app: App) {
    this.app = app;
  }

  abstract onOpen(): void;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onClose(): void {}

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    // Overlay
    this.overlayEl = document.body.createDiv({ cls: "wf-modal-overlay" });
    this.overlayEl.addEventListener("click", (e) => {
      if (e.target === this.overlayEl) this.close();
    });

    // Container
    this.containerEl = this.overlayEl.createDiv({ cls: "wf-modal-container" });

    // Close button
    const closeBtn = this.containerEl.createEl("button", {
      cls: "wf-modal-close",
      text: "\u00D7",
    });
    closeBtn.addEventListener("click", () => this.close());

    // Content
    this.contentEl = this.containerEl.createDiv({ cls: "wf-modal-content" });

    // Escape key
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    };
    document.addEventListener("keydown", this.keyHandler);

    this.onOpen();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;

    this.onClose();

    if (this.keyHandler) {
      document.removeEventListener("keydown", this.keyHandler);
      this.keyHandler = null;
    }

    this.overlayEl.remove();
  }
}
