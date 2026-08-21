export interface RecurrenceConfig {
  type: "daily" | "weekly" | "monthly";
  interval?: number;
  daysOfWeek?: number[];
  until?: DateUID; // dateUID "day-YYYY-MM-DD" — повторение до этой даты включительно
}

export type TaskStatus = "todo" | "progress" | "done" | "paused" | "all";

export interface ITask {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  status: TaskStatus;
  dateUID: string;
  projectId: string | null;
  notePath: string | null; // Task заметка в Tasks/
  boundNotePath?: string | null; // Привязанная заметка
  priority: "low" | "medium" | "high";
  tags: string[];
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  recurrence?: RecurrenceConfig;
  timerStartedAt?: number;
  pausedAt?: number;
  pausedWorkTime?: number;
  totalWorkTime?: number;
  estimatedTime?: number;
  scheduledTime?: string;
  endTime?: string; // время окончания задачи (формат: "HH:MM")
  isRecurringInstance?: boolean;
  parentTaskId?: string;
  isWorkTask?: boolean;
  paymentType?: "hour" | "day";
  rate?: number;
  overtimeStart?: number; // hour when overtime begins (e.g., 8 = after 8 hours)
  overtimeMultiplier?: number; // rate multiplier during overtime (e.g., 1.5 = 1.5x)
  deadline?: DateUID; // deadline date (format: "day-YYYY-MM-DD")
  deadlineTime?: string; // deadline time (format: "HH:MM")
  isNoteTask?: boolean; // true = задача-заметка (файл создаётся/архивируется)
}

export interface IProject {
  id: string;
  name: string;
  color: string;
  icon: string;
  folder: string | null;
  archived: boolean;
  sortOrder: number;
  createdAt: number;
}

export interface TimeLog {
  id: string;
  taskId: string;
  taskTitle: string;
  startTime: number;
  endTime: number;
  duration: number;
  date: string;
}

export interface IChecklistItem {
  id: string;
  taskId: string; // parent task ID
  title: string;
  checked: boolean;
  sortOrder: number;
  updatedAt?: number; // epoch ms — last local modification
}

export interface ITaskTrackerData {
  tasks: ITask[];
  projects: IProject[];
  timeLogs: TimeLog[];
  checklists: IChecklistItem[];
  version: number;
}

export type DateUID = string;

export const TASK_TRACKER_DATA_VERSION = 7;
export const MAX_TIME_LOGS = 180;

export const DEFAULT_PROJECT_COLORS = [
  "#882e25",
  "#a84402",
  "#ac6a01",
  "#1b7942",
  "#1f618d",
  "#65337a",
  "#86103f",
  "#017065",
  "#851339",
  "#4c6570",
  "#37474f",
  "#647177",
];
