import { App, TFile } from "obsidian";
import {
  DashboardData,
  DashboardCard,
  DashboardLink,
  createEmptyDashboard,
  generateId,
} from "./types";

let cachedData: DashboardData | null = null;
let cachedFilePath: string | null = null;

function serializeToYaml(data: DashboardData): string {
  const lines: string[] = ["dashboard:"];
  for (const card of data.cards) {
    lines.push(`  - id: "${card.id}"`);
    lines.push(`    title: "${card.title.replace(/"/g, '\\"')}"`);
    lines.push(`    icon: "${card.icon}"`);
    if (card.links.length > 0) {
      lines.push(`    links:`);
      for (const link of card.links) {
        lines.push(`      - id: "${link.id}"`);
        lines.push(`        label: "${link.label.replace(/"/g, '\\"')}"`);
        lines.push(`        notePath: "${link.notePath.replace(/"/g, '\\"')}"`);
      }
    } else {
      lines.push(`    links: []`);
    }
  }
  return lines.join("\n");
}

function parseYamlFrontmatter(content: string): DashboardData | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const data = createEmptyDashboard();

  if (!yaml.includes("dashboard:")) return null;

  const cardBlocks = yaml.split(/\n\s{2}- /g).slice(1);

  for (const block of cardBlocks) {
    const card: DashboardCard = { id: "", title: "", icon: "", links: [] };

    const idMatch = block.match(/id:\s*"([^"]+)"/);
    if (idMatch) card.id = idMatch[1];

    const titleMatch = block.match(/title:\s*"([^"]+)"/);
    if (titleMatch) card.title = titleMatch[1].replace(/\\"/g, '"');

    const iconMatch = block.match(/icon:\s*"([^"]+)"/);
    if (iconMatch) card.icon = iconMatch[1];

    const linksSection = block.split("links:")[1];
    if (linksSection && !linksSection.trim().startsWith("[]")) {
      const linkBlocks = linksSection.split(/\n\s{6}- /g).slice(1);
      for (const linkBlock of linkBlocks) {
        const link: DashboardLink = { id: "", label: "", notePath: "" };

        const linkIdMatch = linkBlock.match(/id:\s*"([^"]+)"/);
        if (linkIdMatch) link.id = linkIdMatch[1];

        const labelMatch = linkBlock.match(/label:\s*"([^"]+)"/);
        if (labelMatch) link.label = labelMatch[1].replace(/\\"/g, '"');

        const notePathMatch = linkBlock.match(/notePath:\s*"([^"]+)"/);
        if (notePathMatch) link.notePath = notePathMatch[1].replace(/\\"/g, '"');

        if (link.id && link.notePath) {
          card.links.push(link);
        }
      }
    }

    if (card.id) {
      data.cards.push(card);
    }
  }

  return data;
}

function updateFrontmatter(noteContent: string, dashboardYaml: string): string {
  const fmMatch = noteContent.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (fmMatch) {
    const body = noteContent.substring(fmMatch[0].length);
    // Note already has frontmatter — replace or add dashboard section
    const existingFm = fmMatch[2];
    if (existingFm.includes("dashboard:")) {
      // Replace existing dashboard block
      const before = existingFm.substring(0, existingFm.indexOf("dashboard:"));
      const afterStart = existingFm.indexOf("dashboard:");
      let afterEnd = existingFm.length;
      // Find end of dashboard block (next top-level key or end of frontmatter)
      const afterDash = existingFm.substring(afterStart + 10);
      const nextKeyMatch = afterDash.match(/\n[a-zA-Z]/);
      if (nextKeyMatch) {
        afterEnd = afterStart + 10 + nextKeyMatch.index;
      }
      const after = existingFm.substring(afterEnd);
      const newFm = before + dashboardYaml + after;
      return `${fmMatch[1]}${newFm}${fmMatch[3]}${body}`;
    } else {
      // Add dashboard to existing frontmatter
      return `${fmMatch[1]}${existingFm}\n${dashboardYaml}${fmMatch[3]}${body}`;
    }
  } else {
    // No frontmatter — create new
    return `---\n${dashboardYaml}\n---\n\n${noteContent}`;
  }
}

export async function loadDashboard(app: App, filePath?: string): Promise<DashboardData> {
  if (cachedData && cachedFilePath === filePath) return cachedData;

  if (filePath) {
    try {
      const file = app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        const content = await app.vault.read(file);
        const parsed = parseYamlFrontmatter(content);
        if (parsed) {
          cachedData = parsed;
          cachedFilePath = filePath;
          return cachedData;
        }
      }
    } catch {
      // file doesn't exist
    }
  }

  cachedData = createEmptyDashboard();
  cachedFilePath = filePath || null;
  return cachedData;
}

export async function saveDashboard(app: App, data: DashboardData, filePath?: string): Promise<void> {
  cachedData = data;

  if (!filePath) return;

  const file = app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return;

  const noteContent = await app.vault.read(file);
  const dashboardYaml = serializeToYaml(data);
  const newContent = updateFrontmatter(noteContent, dashboardYaml);

  await app.vault.modify(file, newContent);
}

export function invalidateDashboardCache(): void {
  cachedData = null;
  cachedFilePath = null;
}

// --- Card operations ---

export async function addCard(app: App, title: string, icon: string, filePath?: string): Promise<DashboardCard> {
  const data = await loadDashboard(app, filePath);
  const card: DashboardCard = { id: generateId(), title, icon, links: [] };
  data.cards.push(card);
  await saveDashboard(app, data, filePath);
  return card;
}

export async function updateCard(app: App, cardId: string, updates: Partial<Pick<DashboardCard, "title" | "icon">>, filePath?: string): Promise<void> {
  const data = await loadDashboard(app, filePath);
  const card = data.cards.find((c) => c.id === cardId);
  if (card) {
    if (updates.title !== undefined) card.title = updates.title;
    if (updates.icon !== undefined) card.icon = updates.icon;
    await saveDashboard(app, data, filePath);
  }
}

export async function deleteCard(app: App, cardId: string, filePath?: string): Promise<void> {
  const data = await loadDashboard(app, filePath);
  data.cards = data.cards.filter((c) => c.id !== cardId);
  await saveDashboard(app, data, filePath);
}

export async function addLink(app: App, cardId: string, label: string, notePath: string, filePath?: string): Promise<DashboardLink> {
  const data = await loadDashboard(app, filePath);
  const card = data.cards.find((c) => c.id === cardId);
  if (!card) throw new Error("Card not found");
  const link: DashboardLink = { id: generateId(), label, notePath };
  card.links.push(link);
  await saveDashboard(app, data, filePath);
  return link;
}

export async function deleteLink(app: App, cardId: string, linkId: string, filePath?: string): Promise<void> {
  const data = await loadDashboard(app, filePath);
  const card = data.cards.find((c) => c.id === cardId);
  if (card) {
    card.links = card.links.filter((l) => l.id !== linkId);
    await saveDashboard(app, data, filePath);
  }
}

export async function reorderCards(app: App, cardIds: string[], filePath?: string): Promise<void> {
  const data = await loadDashboard(app, filePath);
  const cardMap = new Map(data.cards.map((c) => [c.id, c]));
  data.cards = cardIds.map((id) => cardMap.get(id)).filter(Boolean) as DashboardCard[];
  await saveDashboard(app, data, filePath);
}
