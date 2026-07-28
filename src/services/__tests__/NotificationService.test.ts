import moment from "moment";
import type { ITask } from "src/task-tracker/types";
import type { ISettings } from "src/settings";
import {
  NotificationService,
  defaultNotificationSettings,
} from "../NotificationService";

// --- Mocks ---

const mockNotify = jest.fn();
const mockNotificationInstances: Array<{ close: jest.Mock; onclick: jest.Mock }> = [];

jest.mock("svelte/store", () => ({
  get: jest.fn(),
}));

jest.mock("src/main", () => ({}));

jest.mock("src/task-tracker/stores", () => ({
  tasks: { subscribe: jest.fn() },
}));

jest.mock("src/task-tracker/TimerManager", () => ({
  getActiveTimer: jest.fn().mockReturnValue(null),
}));

// Mock Notification constructor
const OriginalNotification = global.Notification;
class MockNotification {
  title: string;
  body: string;
  close: jest.Mock;
  onclick: jest.Mock;
  constructor(title: string, opts: { body: string }) {
    this.title = title;
    this.body = opts.body;
    this.close = jest.fn();
    this.onclick = null as any;
    // Call mockNotify once (via global reference to avoid module-scope duplication)
    const g = global as any;
    if (typeof g.mockNotify === "function") {
      g.mockNotify(title, opts.body);
    }
    mockNotificationInstances.push({ close: this.close, onclick: this.onclick });
  }
}

// Helper to create a task with defaults
function makeTask(overrides: Partial<ITask> = {}): ITask {
  return {
    id: "task-1",
    title: "Test Task",
    completed: false,
    status: "todo",
    dateUID: "day-2025-07-15",
    projectId: null,
    notePath: null,
    priority: "medium",
    tags: [],
    sortOrder: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeSettings(overrides: Partial<ISettings> = {}): ISettings {
  return {
    shouldConfirmBeforeCreate: false,
    wordsPerDot: 250,
    showWeeklyNote: false,
    weeklyNoteFolder: "",
    weeklyNoteFormat: "",
    weeklyNoteTemplate: "",
    localeOverride: "system-default",
    showTaskTracker: true,
    taskTrackerCollapsed: false,
    syncAllTasksToNotes: false,
    tasksFolderPath: "Tasks",
    autoCleanupThreshold: 180,
    timeLogCleanupThreshold: 180,
    showHabitTracker: true,
    habitLogCleanupThreshold: 1000,
    syncToVault: false,
    notificationsEnabled: true,
    reminderMinutesBefore: 5,
    checkIntervalMs: 60000,
    notifyReminders: true,
    notifyOverdue: true,
    notifyEstimateExceeded: true,
    notifyDeadlines: true,
    ntfyEnabled: false,
    ntfyTopic: "Calendar_Remastered",
    overdueCheckEnabled: false,
    defaultPaymentType: "hour",
    defaultRate: 0,
    scheduleShowTime: true,
    scheduleShowStatus: true,
    scheduleShowPriority: true,
    scheduleShowWorkBadge: true,
    scheduleShowNoteBadge: true,
    scheduleShowDeadline: true,
    scheduleShowOverdue: true,
    scheduleShowDescription: true,
    scheduleShowNowIndicator: true,
    scheduleShowDeadlineEvents: true,
    weatherEnabled: false,
    weatherLatitude: 55.75,
    weatherLongitude: 37.62,
    showStatusBar: true,
    dtwShowOnAllPages: false,
    ...overrides,
  };
}

function makePlugin(settings: ISettings) {
  return {
    options: settings,
    loadData: jest.fn().mockResolvedValue({}),
    saveData: jest.fn().mockResolvedValue(undefined),
  } as any;
}

// --- Tests ---

describe("NotificationService", () => {
  let service: NotificationService;
  let getMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNotificationInstances.length = 0;
    (global as any).Notification = MockNotification;
    Object.defineProperty(window, "Notification", {
      value: MockNotification,
      writable: true,
      configurable: true,
    });
    // Mock Notification.permission
    Object.defineProperty(MockNotification, "permission", {
      value: "granted",
      writable: true,
      configurable: true,
    });
    // Expose mockNotify globally so mocks outside this module can call it
    (global as any).mockNotify = mockNotify;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    getMock = require("svelte/store").get;
  });

  afterEach(() => {
    if (service) {
      service.stop();
    }
    (global as any).Notification = OriginalNotification;
  });

  describe("overdue detection — immediate (no 30-min delay)", () => {
    it("fires overdue immediately when scheduled time has passed", async () => {
      const now = Date.now();
      // Task scheduled 10 minutes ago
      const scheduledMoment = moment(now - 10 * 60_000);
      const dateUID = `day-${scheduledMoment.format("YYYY-MM-DD")}`;
      const scheduledTime = scheduledMoment.format("HH:mm");

      const task = makeTask({
        scheduledTime,
        dateUID,
        status: "todo",
      });

      getMock.mockReturnValue([task]);

      const settings = makeSettings();
      service = new NotificationService(makePlugin(settings));
      await service.start();

      expect(mockNotify).toHaveBeenCalledWith(
        "📅 WorkLIfe Calendar",
        expect.stringContaining("Просрочено")
      );
    });

    it("does NOT fire overdue if scheduled time is in the future", async () => {
      const now = Date.now();
      const scheduledMoment = moment(now + 10 * 60_000); // 10 min from now
      const dateUID = `day-${scheduledMoment.format("YYYY-MM-DD")}`;
      const scheduledTime = scheduledMoment.format("HH:mm");

      const task = makeTask({
        scheduledTime,
        dateUID,
        status: "todo",
      });

      getMock.mockReturnValue([task]);

      const settings = makeSettings();
      service = new NotificationService(makePlugin(settings));
      await service.start();

      expect(mockNotify).not.toHaveBeenCalledWith(
        "📅 WorkLIfe Calendar",
        expect.stringContaining("Просрочено")
      );
    });

    it("does NOT fire overdue if task is in progress", async () => {
      const now = Date.now();
      const scheduledMoment = moment(now - 10 * 60_000);
      const dateUID = `day-${scheduledMoment.format("YYYY-MM-DD")}`;
      const scheduledTime = scheduledMoment.format("HH:mm");

      const task = makeTask({
        scheduledTime,
        dateUID,
        status: "progress",
      });

      getMock.mockReturnValue([task]);

      const settings = makeSettings();
      service = new NotificationService(makePlugin(settings));
      await service.start();

      expect(mockNotify).not.toHaveBeenCalledWith(
        "📅 WorkLIfe Calendar",
        expect.stringContaining("Просрочено")
      );
    });

    it("does NOT fire overdue if task is done", async () => {
      const now = Date.now();
      const scheduledMoment = moment(now - 10 * 60_000);
      const dateUID = `day-${scheduledMoment.format("YYYY-MM-DD")}`;
      const scheduledTime = scheduledMoment.format("HH:mm");

      const task = makeTask({
        scheduledTime,
        dateUID,
        status: "done",
        completed: true,
      });

      getMock.mockReturnValue([task]);

      const settings = makeSettings();
      service = new NotificationService(makePlugin(settings));
      await service.start();

      expect(mockNotify).not.toHaveBeenCalledWith(
        "📅 WorkLIfe Calendar",
        expect.stringContaining("Просрочено")
      );
    });

    it("does NOT fire overdue twice for the same task", async () => {
      const now = Date.now();
      const scheduledMoment = moment(now - 10 * 60_000);
      const dateUID = `day-${scheduledMoment.format("YYYY-MM-DD")}`;
      const scheduledTime = scheduledMoment.format("HH:mm");

      const task = makeTask({
        id: "task-dedup",
        scheduledTime,
        dateUID,
        status: "todo",
      });

      getMock.mockReturnValue([task]);

      const settings = makeSettings();
      service = new NotificationService(makePlugin(settings));
      await service.start();
      service.stop();

      const overdueCalls = mockNotify.mock.calls.filter(
        ([, body]) => typeof body === "string" && body.includes("Просрочено")
      );
      expect(overdueCalls.length).toBe(1);
    });
  });

  describe("reminder notifications", () => {
    it("fires reminder 5 min before scheduled time", async () => {
      const now = Date.now();
      // Task scheduled 3 min from now (within 5-min reminder window)
      const scheduledMoment = moment(now + 3 * 60_000);
      const dateUID = `day-${scheduledMoment.format("YYYY-MM-DD")}`;
      const scheduledTime = scheduledMoment.format("HH:mm");

      const task = makeTask({
        scheduledTime,
        dateUID,
        status: "todo",
      });

      getMock.mockReturnValue([task]);

      const settings = makeSettings({ reminderMinutesBefore: 5 });
      service = new NotificationService(makePlugin(settings));
      await service.start();

      expect(mockNotify).toHaveBeenCalledWith(
        "📅 WorkLIfe Calendar",
        expect.stringContaining("Напоминание")
      );
    });

    it("does NOT fire reminder if more than N min before scheduled", async () => {
      const now = Date.now();
      // Task scheduled 10 min from now (outside 5-min window)
      const scheduledMoment = moment(now + 10 * 60_000);
      const dateUID = `day-${scheduledMoment.format("YYYY-MM-DD")}`;
      const scheduledTime = scheduledMoment.format("HH:mm");

      const task = makeTask({
        scheduledTime,
        dateUID,
        status: "todo",
      });

      getMock.mockReturnValue([task]);

      const settings = makeSettings({ reminderMinutesBefore: 5 });
      service = new NotificationService(makePlugin(settings));
      await service.start();

      expect(mockNotify).not.toHaveBeenCalledWith(
        "📅 WorkLIfe Calendar",
        expect.stringContaining("Напоминание")
      );
    });
  });

  describe("estimate exceeded notifications", () => {
    it("fires when work time exceeds estimate", async () => {
      const now = Date.now();
      const scheduledMoment = moment(now + 60 * 60_000);
      const dateUID = `day-${scheduledMoment.format("YYYY-MM-DD")}`;
      const scheduledTime = scheduledMoment.format("HH:mm");

      const task = makeTask({
        scheduledTime,
        dateUID,
        status: "progress",
        estimatedTime: 30, // 30 minutes
        totalWorkTime: 31 * 60_000, // 31 minutes in ms
      });

      getMock.mockReturnValue([task]);

      const settings = makeSettings();
      service = new NotificationService(makePlugin(settings));
      await service.start();

      expect(mockNotify).toHaveBeenCalledWith(
        "📅 WorkLIfe Calendar",
        expect.stringContaining("Превышен лимит")
      );
    });

    it("does NOT fire when work time is within estimate", async () => {
      const now = Date.now();
      const scheduledMoment = moment(now + 60 * 60_000);
      const dateUID = `day-${scheduledMoment.format("YYYY-MM-DD")}`;
      const scheduledTime = scheduledMoment.format("HH:mm");

      const task = makeTask({
        scheduledTime,
        dateUID,
        status: "progress",
        estimatedTime: 30,
        totalWorkTime: 20 * 60_000, // 20 minutes — under 30 min estimate
      });

      getMock.mockReturnValue([task]);

      const settings = makeSettings();
      service = new NotificationService(makePlugin(settings));
      await service.start();

      expect(mockNotify).not.toHaveBeenCalledWith(
        "📅 WorkLIfe Calendar",
        expect.stringContaining("Превышен лимит")
      );
    });

    it("fires when current running session pushes total over estimate", async () => {
      const { getActiveTimer } = jest.requireMock("src/task-tracker/TimerManager");
      getActiveTimer.mockReturnValue(15 * 60_000); // 15 min current session

      const now = Date.now();
      const scheduledMoment = moment(now + 60 * 60_000);
      const dateUID = `day-${scheduledMoment.format("YYYY-MM-DD")}`;
      const scheduledTime = scheduledMoment.format("HH:mm");

      const task = makeTask({
        scheduledTime,
        dateUID,
        status: "progress",
        estimatedTime: 30, // 30 minutes
        totalWorkTime: 20 * 60_000, // 20 min accumulated
        // 20 + 15 = 35 min total > 30 min estimate
      });

      getMock.mockReturnValue([task]);

      const settings = makeSettings();
      service = new NotificationService(makePlugin(settings));
      await service.start();

      expect(mockNotify).toHaveBeenCalledWith(
        "📅 WorkLIfe Calendar",
        expect.stringContaining("Превышен лимит")
      );
    });
  });

  describe("deadline notifications", () => {
    it("fires 'deadline tomorrow' 1 day before deadline", async () => {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const y = tomorrow.getFullYear();
      const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
      const d = String(tomorrow.getDate()).padStart(2, "0");
      const deadline = `day-${y}-${m}-${d}`;

      const task = makeTask({
        deadline,
        status: "todo",
      });

      getMock.mockReturnValue([task]);

      const settings = makeSettings();
      service = new NotificationService(makePlugin(settings));
      await service.start();

      expect(mockNotify).toHaveBeenCalledWith(
        "📅 WorkLIfe Calendar",
        expect.stringContaining("Дедлайн завтра")
      );
    });

    it("fires 'deadline today' on deadline day at 9 AM+", async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, "0");
      const d = String(today.getDate()).padStart(2, "0");
      const deadline = `day-${y}-${m}-${d}`;

      const task = makeTask({
        deadline,
        status: "todo",
      });

      getMock.mockReturnValue([task]);

      // Mock Date to be 10:00 AM today
      const RealDate = Date;
      const mockNow = new Date(y, parseInt(m) - 1, parseInt(d), 10, 0, 0).getTime();
      const MockDateClass = function (...args: any[]) {
        if (args.length === 0) {
          return new RealDate(mockNow);
        }
        return new (RealDate as any)(...args);
      } as any;
      MockDateClass.now = () => mockNow;
      MockDateClass.parse = RealDate.parse;
      MockDateClass.UTC = RealDate.UTC;
      MockDateClass.prototype = RealDate.prototype;
      (global as any).Date = MockDateClass;

      const settings = makeSettings();
      service = new NotificationService(makePlugin(settings));
      await service.start();

      (global as any).Date = RealDate;

      expect(mockNotify).toHaveBeenCalledWith(
        "📅 WorkLIfe Calendar",
        expect.stringContaining("Дедлайн сегодня")
      );
    });
  });

  describe("notification type toggles", () => {
    it("does NOT fire reminders when notifyReminders is false", async () => {
      const now = Date.now();
      const scheduledMoment = moment(now + 3 * 60_000);
      const dateUID = `day-${scheduledMoment.format("YYYY-MM-DD")}`;
      const scheduledTime = scheduledMoment.format("HH:mm");

      const task = makeTask({ scheduledTime, dateUID, status: "todo" });
      getMock.mockReturnValue([task]);

      service = new NotificationService(
        makePlugin(makeSettings({ notifyReminders: false }))
      );
      await service.start();

      expect(mockNotify).not.toHaveBeenCalledWith(
        "📅 WorkLIfe Calendar",
        expect.stringContaining("Напоминание")
      );
    });

    it("does NOT fire overdue when notifyOverdue is false", async () => {
      const now = Date.now();
      const scheduledMoment = moment(now - 10 * 60_000);
      const dateUID = `day-${scheduledMoment.format("YYYY-MM-DD")}`;
      const scheduledTime = scheduledMoment.format("HH:mm");

      const task = makeTask({ scheduledTime, dateUID, status: "todo" });
      getMock.mockReturnValue([task]);

      service = new NotificationService(
        makePlugin(makeSettings({ notifyOverdue: false }))
      );
      await service.start();

      expect(mockNotify).not.toHaveBeenCalledWith(
        "📅 WorkLIfe Calendar",
        expect.stringContaining("Просрочено")
      );
    });

    it("does NOT fire estimate exceeded when notifyEstimateExceeded is false", async () => {
      const now = Date.now();
      const scheduledMoment = moment(now + 60 * 60_000);
      const dateUID = `day-${scheduledMoment.format("YYYY-MM-DD")}`;
      const scheduledTime = scheduledMoment.format("HH:mm");

      const task = makeTask({
        scheduledTime,
        dateUID,
        status: "progress",
        estimatedTime: 30,
        totalWorkTime: 31 * 60_000,
      });
      getMock.mockReturnValue([task]);

      service = new NotificationService(
        makePlugin(makeSettings({ notifyEstimateExceeded: false }))
      );
      await service.start();

      expect(mockNotify).not.toHaveBeenCalledWith(
        "📅 WorkLIfe Calendar",
        expect.stringContaining("Превышен лимит")
      );
    });

    it("does NOT fire deadline when notifyDeadlines is false", async () => {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const y = tomorrow.getFullYear();
      const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
      const d = String(tomorrow.getDate()).padStart(2, "0");
      const deadline = `day-${y}-${m}-${d}`;

      const task = makeTask({ deadline, status: "todo" });
      getMock.mockReturnValue([task]);

      service = new NotificationService(
        makePlugin(makeSettings({ notifyDeadlines: false }))
      );
      await service.start();

      expect(mockNotify).not.toHaveBeenCalledWith(
        "📅 WorkLIfe Calendar",
        expect.stringContaining("Дедлайн завтра")
      );
    });
  });

  describe("notification service lifecycle", () => {
    it("does nothing when notifications are disabled", async () => {
      const now = Date.now();
      const scheduledMoment = moment(now - 10 * 60_000);
      const dateUID = `day-${scheduledMoment.format("YYYY-MM-DD")}`;
      const scheduledTime = scheduledMoment.format("HH:mm");

      const task = makeTask({ scheduledTime, dateUID, status: "todo" });
      getMock.mockReturnValue([task]);

      service = new NotificationService(
        makePlugin(makeSettings({ notificationsEnabled: false }))
      );
      await service.start();

      expect(mockNotify).not.toHaveBeenCalled();
    });

    it("cleans up fired sets on stop", async () => {
      const now = Date.now();
      const scheduledMoment = moment(now - 10 * 60_000);
      const dateUID = `day-${scheduledMoment.format("YYYY-MM-DD")}`;
      const scheduledTime = scheduledMoment.format("HH:mm");

      const task = makeTask({ scheduledTime, dateUID, status: "todo" });
      getMock.mockReturnValue([task]);

      service = new NotificationService(makePlugin(makeSettings()));
      await service.start();
      service.stop();

      // After restart, same task should fire again
      mockNotify.mockClear();
      service = new NotificationService(makePlugin(makeSettings()));
      getMock.mockReturnValue([task]);
      await service.start();

      const overdueCalls = mockNotify.mock.calls.filter(
        ([, body]) => typeof body === "string" && body.includes("Просрочено")
      );
      expect(overdueCalls.length).toBe(1);
    });
  });

  describe("defaultNotificationSettings", () => {
    it("has all notification type flags enabled by default", () => {
      expect(defaultNotificationSettings.notifyReminders).toBe(true);
      expect(defaultNotificationSettings.notifyOverdue).toBe(true);
      expect(defaultNotificationSettings.notifyEstimateExceeded).toBe(true);
      expect(defaultNotificationSettings.notifyDeadlines).toBe(true);
    });
  });
});
