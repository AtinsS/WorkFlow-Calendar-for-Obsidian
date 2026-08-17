import { App, Menu, Point, TFile } from "obsidian";
import { tRaw } from "../i18n";

export function showNoteContextMenu(
  app: App,
  file: TFile | null,
  position: Point,
  onQuickAdd?: () => void
): void {
  const fileMenu = new Menu();

  // Quick add task — always available
  if (onQuickAdd) {
    fileMenu.addItem((item) =>
      item
        .setTitle(tRaw("tasks.quickAdd.menuItem"))
        .setIcon("zap")
        .onClick(onQuickAdd)
    );
  }

  // File-specific options (only when note exists)
  if (file) {
    fileMenu.addSeparator();
    fileMenu.addItem((item) =>
      item
        .setTitle("Delete")
        .setIcon("trash")
        .onClick(() => {
          (app.fileManager as unknown as { promptForFileDeletion: (file: TFile) => void }).promptForFileDeletion(file);
        })
    );

    app.workspace.trigger(
      "file-menu",
      fileMenu,
      file,
      "calendar-context-menu",
      null
    );
  }

  fileMenu.showAtPosition(position);
}
