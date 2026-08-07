import type { App } from "obsidian";
import { CustomModal } from "./CustomModal";

interface IConfirmationDialogParams {
  cta: string;
  onAccept: (e: MouseEvent) => Promise<void>;
  text: string;
  title: string;
}

export class ConfirmationModal extends CustomModal {
  private config: IConfirmationDialogParams;

  constructor(app: App, config: IConfirmationDialogParams) {
    super(app);
    this.config = config;
  }

  onOpen(): void {
    const { cta, onAccept, text, title } = this.config;

    this.contentEl.createEl("h2", { text: title });
    this.contentEl.createEl("p", { text });

    const buttonsEl = this.contentEl.createDiv("wf-modal-buttons");

    buttonsEl
      .createEl("button", { text: "Never mind", cls: "wf-btn-cancel" })
      .addEventListener("click", () => this.close());

    buttonsEl
      .createEl("button", {
        cls: "wf-btn-confirm",
        text: cta,
      })
      .addEventListener("click", async (e) => {
        await onAccept(e);
        this.close();
      });
  }
}

export function createConfirmationDialog({
  cta,
  onAccept,
  text,
  title,
}: IConfirmationDialogParams): void {
  new ConfirmationModal(window.app, { cta, onAccept, text, title }).open();
}
