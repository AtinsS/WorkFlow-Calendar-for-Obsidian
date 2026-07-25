export interface DashboardLink {
  id: string;
  label: string;
  notePath: string;
}

export interface DashboardCard {
  id: string;
  title: string;
  icon: string;
  links: DashboardLink[];
}

export interface DashboardData {
  cards: DashboardCard[];
}

export function createEmptyDashboard(): DashboardData {
  return { cards: [] };
}

export function generateId(): string {
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
