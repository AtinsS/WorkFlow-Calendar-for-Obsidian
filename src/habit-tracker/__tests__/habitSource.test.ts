import { habitLogs, habits, addHabit, toggleHabitCompletion, rebuildLogsCache } from "../stores";
import { habitSource } from "../habitSource";

beforeEach(() => {
  habits.set([]);
  habitLogs.set([]);
  rebuildLogsCache();
});

describe("habitSource", () => {
  it("should return empty metadata when no logs exist", async () => {
    const metadata = await habitSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    expect(metadata).toEqual({});
  });

  it("should return habit count for a date with completed habits", async () => {
    const habit = addHabit({
      title: "Exercise",
      icon: "🏋️",
      color: "#ff0000",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    toggleHabitCompletion(habit.id, "2026-07-05"); // 100%

    const metadata = await habitSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    expect(metadata.dataAttributes["data-habit-count"]).toBe("🏆");
    expect(metadata.classes).toContain("has-habit-logs");
  });

  it("should count multiple habits on the same date", async () => {
    const h1 = addHabit({
      title: "Habit 1",
      icon: "💧",
      color: "#4d96ff",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });
    const h2 = addHabit({
      title: "Habit 2",
      icon: "📚",
      color: "#6bcb77",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 1,
    });

    toggleHabitCompletion(h1.id, "2026-07-05"); // 100%
    toggleHabitCompletion(h2.id, "2026-07-05"); // 100%

    const metadata = await habitSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    expect(metadata.dataAttributes["data-habit-count"]).toBe("🏆");
  });

  it("should not count uncompleted habits", async () => {
    addHabit({
      title: "Skipped",
      icon: "⏭️",
      color: "#ffa502",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    // Don't toggle — habit is not completed for this date

    const metadata = await habitSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    expect(metadata).toEqual({});
  });

  it("should return empty for dates with no logs", async () => {
    const habit = addHabit({
      title: "Test",
      icon: "✅",
      color: "#00ff00",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    toggleHabitCompletion(habit.id, "2026-07-05");

    const metadata = await habitSource.getDailyMetadata(
      window.moment("2026-12-25")
    );
    expect(metadata).toEqual({});
  });

  it("should use cache and not rebuild when logs unchanged", async () => {
    const habit = addHabit({
      title: "Cached",
      icon: "💾",
      color: "#9b59b6",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    toggleHabitCompletion(habit.id, "2026-07-05"); // 100%

    // First call — populates cache
    const meta1 = await habitSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    // Second call — should use cached map (same object reference)
    const meta2 = await habitSource.getDailyMetadata(
      window.moment("2026-07-05")
    );

    expect(meta1.dataAttributes["data-habit-count"]).toBe("🏆");
    expect(meta2.dataAttributes["data-habit-count"]).toBe("🏆");
  });

  it("should rebuild cache after toggle off", async () => {
    const habit = addHabit({
      title: "Toggle",
      icon: "🔄",
      color: "#e91e63",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });

    toggleHabitCompletion(habit.id, "2026-07-05"); // 100%
    const meta1 = await habitSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    expect(meta1.dataAttributes["data-habit-count"]).toBe("🏆");

    // Toggle off (100% → 0)
    toggleHabitCompletion(habit.id, "2026-07-05"); // 0
    const meta2 = await habitSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    expect(meta2).toEqual({});
  });

  it("should show trophy when all habits completed", async () => {
    const h1 = addHabit({
      title: "A",
      icon: "💧",
      color: "#4d96ff",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });
    const h2 = addHabit({
      title: "B",
      icon: "📚",
      color: "#6bcb77",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 1,
    });

    toggleHabitCompletion(h1.id, "2026-07-05"); // 100%
    toggleHabitCompletion(h2.id, "2026-07-05"); // 100%

    const meta = await habitSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    expect(meta.dataAttributes["data-habit-count"]).toBe("🏆");
  });

  it("should show fire+count when not all habits completed", async () => {
    const h1 = addHabit({
      title: "A",
      icon: "💧",
      color: "#4d96ff",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 0,
    });
    addHabit({
      title: "B",
      icon: "📚",
      color: "#6bcb77",
      frequency: "daily",
      targetCount: 1,
      archived: false,
      sortOrder: 1,
    });

    toggleHabitCompletion(h1.id, "2026-07-05"); // 100%

    const meta = await habitSource.getDailyMetadata(
      window.moment("2026-07-05")
    );
    expect(meta.dataAttributes["data-habit-count"]).toBe("🔥 1");
  });
});
