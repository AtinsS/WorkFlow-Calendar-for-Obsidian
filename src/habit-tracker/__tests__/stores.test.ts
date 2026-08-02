import { get } from "svelte/store";
import {
  habits,
  habitLogs,
  addHabit,
  updateHabit,
  removeHabit,
  toggleHabitCompletion,
  isHabitCompletedOnDate,
  getHabitCountOnDate,
  calculateStreak,
  rebuildLogsCache,
} from "../stores";

beforeEach(() => {
  habits.set([]);
  habitLogs.set([]);
  rebuildLogsCache();
});

describe("addHabit", () => {
  it("should create a habit with generated id", () => {
    const habit = addHabit({
      title: "Drink water",
      icon: "\uD83D\uDCA7",
      color: "#4d96ff",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    expect(habit.id).toBeDefined();
    expect(habit.id.length).toBeGreaterThan(0);
    expect(habit.title).toBe("Drink water");
    expect(habit.icon).toBe("\uD83D\uDCA7");
    expect(habit.color).toBe("#4d96ff");
    expect(habit.frequency).toBe("daily");
    expect(habit.createdAt).toBeDefined();
  });

  it("should add habit to the store", () => {
    addHabit({
      title: "Read",
      icon: "\uD83D\uDCDA",
      color: "#6bcb77",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    expect(get(habits).length).toBe(1);
    expect(get(habits)[0].title).toBe("Read");
  });
});

describe("updateHabit", () => {
  it("should update habit fields", () => {
    const habit = addHabit({
      title: "Original",
      icon: "\u2728",
      color: "#ff0000",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    updateHabit(habit.id, { title: "Updated", color: "#00ff00" });

    const updated = get(habits).find((h) => h.id === habit.id);
    expect(updated.title).toBe("Updated");
    expect(updated.color).toBe("#00ff00");
  });
});

describe("removeHabit", () => {
  it("should remove habit and its logs", () => {
    const habit = addHabit({
      title: "To delete",
      icon: "\u2728",
      color: "#ff0000",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    toggleHabitCompletion(habit.id, "2026-07-05");

    expect(get(habits).length).toBe(1);
    expect(get(habitLogs).length).toBe(1);

    removeHabit(habit.id);

    expect(get(habits).length).toBe(0);
    expect(get(habitLogs).length).toBe(0);
  });
});

describe("toggleHabitCompletion", () => {
  it("should create log entry at 100% on first toggle (SingularityApp model)", () => {
    const habit = addHabit({
      title: "Exercise",
      icon: "\uD83C\uDFC3",
      color: "#ffa502",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    toggleHabitCompletion(habit.id, "2026-07-05");

    expect(get(habitLogs).length).toBe(1);
    // First toggle = 100% (count=2, completed=true)
    expect(isHabitCompletedOnDate(habit.id, "2026-07-05")).toBe(true);
    expect(getHabitCountOnDate(habit.id, "2026-07-05")).toBe(2);
  });

  it("should go to 50% on second toggle and reset on third", () => {
    const habit = addHabit({
      title: "Exercise",
      icon: "\uD83C\uDFC3",
      color: "#ffa502",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    toggleHabitCompletion(habit.id, "2026-07-05"); // 100%
    expect(isHabitCompletedOnDate(habit.id, "2026-07-05")).toBe(true);

    toggleHabitCompletion(habit.id, "2026-07-05"); // 50%
    expect(isHabitCompletedOnDate(habit.id, "2026-07-05")).toBe(false);
    expect(get(habitLogs).length).toBe(1);

    toggleHabitCompletion(habit.id, "2026-07-05"); // reset to 0
    expect(get(habitLogs).length).toBe(0);
    expect(isHabitCompletedOnDate(habit.id, "2026-07-05")).toBe(false);
  });

  it("should handle multiple habits on same date", () => {
    const h1 = addHabit({
      title: "Habit 1",
      icon: "\u2728",
      color: "#ff0000",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });
    const h2 = addHabit({
      title: "Habit 2",
      icon: "\u2728",
      color: "#00ff00",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 1,
    });

    toggleHabitCompletion(h1.id, "2026-07-05");
    toggleHabitCompletion(h2.id, "2026-07-05");

    expect(get(habitLogs).length).toBe(2);
    // First toggle = 100% (completed)
    expect(isHabitCompletedOnDate(h1.id, "2026-07-05")).toBe(true);
    expect(isHabitCompletedOnDate(h2.id, "2026-07-05")).toBe(true);
  });
});

describe("isHabitCompletedOnDate", () => {
  it("should return false when not completed", () => {
    const habit = addHabit({
      title: "Test",
      icon: "\u2728",
      color: "#ff0000",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    expect(isHabitCompletedOnDate(habit.id, "2026-07-05")).toBe(false);
  });

  it("should return true when completed (first toggle for targetCount=1)", () => {
    const habit = addHabit({
      title: "Test",
      icon: "\u2728",
      color: "#ff0000",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    toggleHabitCompletion(habit.id, "2026-07-05"); // 100%
    expect(isHabitCompletedOnDate(habit.id, "2026-07-05")).toBe(true);
    toggleHabitCompletion(habit.id, "2026-07-05"); // 50%
    expect(isHabitCompletedOnDate(habit.id, "2026-07-05")).toBe(false);
  });

  it("should return false for different date", () => {
    const habit = addHabit({
      title: "Test",
      icon: "\u2728",
      color: "#ff0000",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    toggleHabitCompletion(habit.id, "2026-07-05");
    expect(isHabitCompletedOnDate(habit.id, "2026-07-06")).toBe(false);
  });
});

describe("calculateStreak", () => {
  it("should return 0 for no logs", () => {
    const habit = addHabit({
      title: "Test",
      icon: "\u2728",
      color: "#ff0000",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    expect(calculateStreak(habit.id)).toBe(0);
  });

  it("should return 1 for single day completion", () => {
    const habit = addHabit({
      title: "Test",
      icon: "\u2728",
      color: "#ff0000",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    const today = new Date().toISOString().split("T")[0];
    toggleHabitCompletion(habit.id, today); // 100%

    expect(calculateStreak(habit.id)).toBe(1);
  });

  it("should return 2 for two consecutive days", () => {
    const habit = addHabit({
      title: "Test",
      icon: "\u2728",
      color: "#ff0000",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    toggleHabitCompletion(habit.id, yesterday.toISOString().split("T")[0]); // 100%
    toggleHabitCompletion(habit.id, today.toISOString().split("T")[0]); // 100%

    expect(calculateStreak(habit.id)).toBe(2);
  });
});

describe("calculateLongestStreak", () => {
  it("should return 0 for no logs", () => {
    const habit = addHabit({
      title: "Test",
      icon: "\u2728",
      color: "#ff0000",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    expect(calculateStreak(habit.id)).toBe(0);
  });

  it("should count consecutive days", () => {
    const habit = addHabit({
      title: "Test",
      icon: "\u2728",
      color: "#ff0000",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    const today = new Date();
    for (let i = 0; i < 5; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      toggleHabitCompletion(habit.id, d.toISOString().split("T")[0]); // 100%
    }

    expect(calculateStreak(habit.id)).toBe(5);
  });
});
