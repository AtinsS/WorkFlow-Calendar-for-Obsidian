import { App, TFile } from "obsidian";
import {
  DashboardData,
  DashboardCard,
  DashboardLink,
  createEmptyDashboard,
  generateId,
} from "./types";

const DASHBOARD_FILE = "calendar-data/dashboard.json";

let cachedData: DashboardData | null = null;

export async function loadDashboard(app: App): Promise<DashboardData> {
  if (cachedData) return cachedData;

  try {
    const file = app.vault.getAbstractFileByPath(DASHBOARD_FILE);
    if (file instanceof TFile) {
      const content = await app.vault.read(file);
      cachedData = JSON.parse(content) as DashboardData;
      if (!cachedData.cards) cachedData.cards = [];
      return cachedData;
    }
  } catch {
    // file doesn't exist yet
  }

  cachedData = createEmptyDashboard();
  return cachedData;
}

export async function saveDashboard(app: App, data: DashboardData): Promise<void> {
  cachedData = data;

  const dir = DASHBOARD_FILE.split("/")[0];
  const dirFile = app.vault.getAbstractFileByPath(dir);
  if (!dirFile) {
    await app.vault.createFolder(dir);
  }

  const file = app.vault.getAbstractFileByPath(DASHBOARD_FILE);
  const json = JSON.stringify(data, null, 2);

  if (file instanceof TFile) {
    await app.vault.modify(file, json);
  } else {
    await app.vault.create(DASHBOARD_FILE, json);
  }
}

export function invalidateDashboardCache(): void {
  cachedData = null;
}

// --- Card operations ---

export async function addCard(app: App, title: string, icon: string): Promise<DashboardCard> {
  const data = await loadDashboard(app);
  const card: DashboardCard = { id: generateId(), title, icon, links: [] };
  data.cards.push(card);
  await saveDashboard(app, data);
  return card;
}

export async function updateCard(app: App, cardId: string, updates: Partial<Pick<DashboardCard, "title" | "icon">>): Promise<void> {
  const data = await loadDashboard(app);
  const card = data.cards.find((c) => c.id === cardId);
  if (card) {
    if (updates.title !== undefined) card.title = updates.title;
    if (updates.icon !== undefined) card.icon = updates.icon;
    await saveDashboard(app, data);
  }
}

export async function deleteCard(app: App, cardId: string): Promise<void> {
  const data = await loadDashboard(app);
  data.cards = data.cards.filter((c) => c.id !== cardId);
  await saveDashboard(app, data);
}

export async function addLink(app: App, cardId: string, label: string, notePath: string): Promise<DashboardLink> {
  const data = await loadDashboard(app);
  const card = data.cards.find((c) => c.id === cardId);
  if (!card) throw new Error("Card not found");
  const link: DashboardLink = { id: generateId(), label, notePath };
  card.links.push(link);
  await saveDashboard(app, data);
  return link;
}

export async function deleteLink(app: App, cardId: string, linkId: string): Promise<void> {
  const data = await loadDashboard(app);
  const card = data.cards.find((c) => c.id === cardId);
  if (card) {
    card.links = card.links.filter((l) => l.id !== linkId);
    await saveDashboard(app, data);
  }
}

export async function reorderCards(app: App, cardIds: string[]): Promise<void> {
  const data = await loadDashboard(app);
  const cardMap = new Map(data.cards.map((c) => [c.id, c]));
  data.cards = cardIds.map((id) => cardMap.get(id)).filter(Boolean) as DashboardCard[];
  await saveDashboard(app, data);
}
