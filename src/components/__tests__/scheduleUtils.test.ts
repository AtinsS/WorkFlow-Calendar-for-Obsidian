import type { ITask, IProject } from "src/task-tracker/types";
import {
  extractDateFromUID,
  calculateEndTime,
  getStatusColor,
  taskToEvent,
  tasksToEvents,
} from "../scheduleUtils";

const TEST_DATE = "day-2026-07-05T00:00:00";

function makeTask(overrides: Partial<ITask> & Record<string, unknown> = {}): ITask {
  return {
    id: "test-id",
    title: "Test Task",
    completed: false,
    status: "todo",
    dateUID: TEST_DATE,
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

function makeProject(overrides: Partial<IProject> = {}): IProject {
  return {
    id: "proj-1",
    name: "Work",
    color: "#4d96ff",
    icon: "💼",
    folder: null,
    archived: false,
    sortOrder: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("extractDateFromUID", () => {
  it("should extract date from standard dateUID", () => {
    expect(extractDateFromUID("day-2026-07-05T00:00:00")).toBe("2026-07-05");
  });

  it("should extract date without time component", () => {
    expect(extractDateFromUID("day-2026-12-31")).toBe("2026-12-31");
  });

  it("should return null for invalid format", () => {
    expect(extractDateFromUID("invalid")).toBeNull();
    expect(extractDateFromUID("")).toBeNull();
    expect(extractDateFromUID("week-2026-07-05")).toBeNull();
  });

  it("should handle month boundaries", () => {
    expect(extractDateFromUID("day-2026-01-01T00:00:00")).toBe("2026-01-01");
    expect(extractDateFromUID("day-2026-12-31T23:59:59")).toBe("2026-12-31");
  });
});

describe("calculateEndTime", () => {
  it("should calculate end time adding duration", () => {
    expect(calculateEndTime("2026-07-05", "09:00", 60)).toBe(
      "2026-07-05T10:00:00"
    );
  });

  it("should handle 30-minute duration", () => {
    expect(calculateEndTime("2026-07-05", "14:30", 30)).toBe(
      "2026-07-05T15:00:00"
    );
  });

  it("should wrap past midnight", () => {
    expect(calculateEndTime("2026-07-05", "23:00", 120)).toBe(
      "2026-07-06T01:00:00"
    );
  });

  it("should handle zero duration", () => {
    expect(calculateEndTime("2026-07-05", "12:00", 0)).toBe(
      "2026-07-05T12:00:00"
    );
  });

  it("should handle 15-minute duration", () => {
    expect(calculateEndTime("2026-07-05", "08:45", 15)).toBe(
      "2026-07-05T09:00:00"
    );
  });

  it("should handle long duration (4 hours)", () => {
    expect(calculateEndTime("2026-07-05", "09:00", 240)).toBe(
      "2026-07-05T13:00:00"
    );
  });
});

describe("getStatusColor", () => {
  it("should return opaque color for progress", () => {
    expect(getStatusColor("progress")).toContain("180, 145, 85");
  });

  it("should return opaque color for done", () => {
    expect(getStatusColor("done")).toContain("85, 160, 130");
  });

  it("should return opaque color for todo", () => {
    expect(getStatusColor("todo")).toContain("110, 130, 160");
  });

  it("should return opaque color for unknown status", () => {
    expect(getStatusColor("unknown")).toContain("110, 130, 160");
  });
});

describe("taskToEvent", () => {
  it("should convert task with scheduledTime to event", () => {
    const task = makeTask({ scheduledTime: "14:00", estimatedTime: 90 });
    const event = taskToEvent(task, []);

    expect(event).not.toBeNull();
    expect(event.id).toBe("test-id");
    expect(event.title).toBe("Test Task");
    expect(typeof event.start).toBe("string");
    expect(typeof event.end).toBe("string");
    expect(event.start).toContain("T14:00:00");
    expect(event.end).toContain("T15:30:00");
  });

  it("should create an all-day event when no scheduledTime", () => {
    const task = makeTask({ scheduledTime: undefined, estimatedTime: 60 });
    const event = taskToEvent(task, []);

    expect(typeof event.start).toBe("string");
    expect(typeof event.end).toBe("string");
    expect(event.start).toContain("T00:00:00");
    expect(event.end).toContain("T00:00:00");
  });

  it("should default to 60 minutes when no estimatedTime", () => {
    const task = makeTask({ scheduledTime: "10:00", estimatedTime: undefined });
    const event = taskToEvent(task, []);

    expect(typeof event.start).toBe("string");
    expect(event.start).toContain("T10:00:00");
    expect(typeof event.end).toBe("string");
    expect(event.end).toContain("T11:00:00");
  });

  it("should use project color when available (muted)", () => {
    const project = makeProject({ color: "#ff0000" });
    const task = makeTask({ projectId: "proj-1" });
    const event = taskToEvent(task, [project]);

    expect(event.backgroundColor).toContain("rgba");
    expect(event.borderColor).toContain("rgba");
  });

  it("should use status color when no project", () => {
    const task = makeTask({ status: "progress", projectId: null });
    const event = taskToEvent(task, []);

    expect(event.backgroundColor).toContain("180, 145, 85");
    expect(event.borderColor).toContain("200, 165, 100");
  });

  it("should return null for invalid dateUID", () => {
    const task = makeTask({ dateUID: "invalid" });
    const event = taskToEvent(task, []);

    expect(event).toBeNull();
  });

  it("should include task in extendedProps", () => {
    const task = makeTask();
    const event = taskToEvent(task, []);

    expect(event.extendedProps.task).toBe(task);
    expect(event.extendedProps.projectId).toBeNull();
  });

  it("should set textColor", () => {
    const task = makeTask();
    const event = taskToEvent(task, []);

    expect(event.textColor).toBe("#e8ecf0");
  });
});

describe("tasksToEvents", () => {
  it("should convert multiple tasks to events", () => {
    const tasks = [
      makeTask({ id: "t1", title: "Task 1", scheduledTime: "09:00" }),
      makeTask({ id: "t2", title: "Task 2", scheduledTime: "14:00" }),
    ];

    const events = tasksToEvents(tasks, []);

    expect(events.length).toBe(2);
    expect(events[0].title).toBe("Task 1");
    expect(events[1].title).toBe("Task 2");
  });

  it("should filter out tasks without dateUID", () => {
    const tasks = [
      makeTask({ dateUID: "day-2026-07-05T00:00:00" }),
      makeTask({ dateUID: "" }),
    ];

    const events = tasksToEvents(tasks, []);

    expect(events.length).toBe(1);
  });

  it("should return empty array for no tasks", () => {
    expect(tasksToEvents([], [])).toEqual([]);
  });

  it("should use muted project colors for tasks with projects", () => {
    const project = makeProject({ color: "#9b59b6" });
    const tasks = [makeTask({ projectId: "proj-1" })];

    const events = tasksToEvents(tasks, [project]);

    expect(events[0].backgroundColor).toContain("rgba");
  });

  it("should handle all task statuses", () => {
    const tasks = [
      makeTask({ id: "t1", status: "todo" }),
      makeTask({ id: "t2", status: "progress" }),
      makeTask({ id: "t3", status: "done" }),
    ];

    const events = tasksToEvents(tasks, []);

    expect(events.length).toBe(3);
    expect(
      events.find((e) => e.id === "t1").backgroundColor
    ).toContain("110, 130, 160");
    expect(
      events.find((e) => e.id === "t2").backgroundColor
    ).toContain("180, 145, 85");
    expect(
      events.find((e) => e.id === "t3").backgroundColor
    ).toContain("85, 160, 130");
  });

  it("should handle tasks with different priorities", () => {
    const tasks = [
      makeTask({ id: "t1", priority: "low" }),
      makeTask({ id: "t2", priority: "high" }),
    ];

    const events = tasksToEvents(tasks, []);

    expect(events.length).toBe(2);
  });

  it("should handle tasks with different estimated times", () => {
    const tasks = [
      makeTask({ id: "t1", scheduledTime: "09:00", estimatedTime: 30 }),
      makeTask({ id: "t2", scheduledTime: "09:00", estimatedTime: 120 }),
    ];

    const events = tasksToEvents(tasks, []);

    expect(typeof events[0].end).toBe("string");
    expect(events[0].end).toContain("T09:30:00");
    expect(typeof events[1].end).toBe("string");
    expect(events[1].end).toContain("T11:00:00");
  });

  it("should handle tasks with descriptions", () => {
    const taskList = [makeTask({ description: "Some description" })];
    const events = tasksToEvents(taskList, []);

    expect(events.length).toBe(1);
    expect((events[0].extendedProps.task as ITask).description).toBe("Some description");
  });

  it("should handle tasks with recurrence", () => {
    const taskList = [
      makeTask({
        recurrence: { type: "daily", interval: 1 },
      }),
    ];
    const events = tasksToEvents(taskList, []);

    expect(events.length).toBe(1);
    expect(events[0].extendedProps.task.recurrence.type).toBe("daily");
  });
});

describe("edge cases", () => {
  it("should handle task with empty title", () => {
    const task = makeTask({ title: "" });
    const event = taskToEvent(task, []);

    expect(event.title).toBe("");
  });

  it("should handle task with special characters in title", () => {
    const task = makeTask({ title: 'Task with <html> & "quotes"' });
    const event = taskToEvent(task, []);

    expect(event.title).toBe('Task with <html> & "quotes"');
  });

  it("should handle many tasks efficiently", () => {
    const tasks = Array.from({ length: 100 }, (_, i) =>
      makeTask({ id: `t${i}`, title: `Task ${i}` })
    );

    const events = tasksToEvents(tasks, []);

    expect(events.length).toBe(100);
  });

  it("should handle project not found for task", () => {
    const task = makeTask({ projectId: "nonexistent" });
    const event = taskToEvent(task, []);

    expect(event.backgroundColor).toContain("110, 130, 160");
  });

  it("should handle multiple projects with different colors", () => {
    const projects = [
      makeProject({ id: "p1", color: "#ff0000" }),
      makeProject({ id: "p2", color: "#00ff00" }),
    ];
    const tasks = [
      makeTask({ id: "t1", projectId: "p1" }),
      makeTask({ id: "t2", projectId: "p2" }),
    ];

    const events = tasksToEvents(tasks, projects);

    expect(events[0].backgroundColor).toContain("rgba");
    expect(events[1].backgroundColor).toContain("rgba");
  });
});
