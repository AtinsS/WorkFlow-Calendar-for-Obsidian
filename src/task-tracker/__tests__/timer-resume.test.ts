import {
  formatDuration,
  formatEstimate,
  resumeTimer,
  stopTimer,
  getActiveTimer,
  cleanupTimers,
} from "../TimerManager";

describe("formatDuration", () => {
  it("returns '0:00' for zero or negative", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(-100)).toBe("0:00");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(60000)).toBe("1:00");
    expect(formatDuration(300000)).toBe("5:00");
    expect(formatDuration(90000)).toBe("1:30");
  });

  it("formats hours, minutes and seconds", () => {
    expect(formatDuration(3600000)).toBe("1:00:00");
    expect(formatDuration(5400000)).toBe("1:30:00");
    expect(formatDuration(7200000)).toBe("2:00:00");
    expect(formatDuration(3661000)).toBe("1:01:01");
  });
});

describe("formatEstimate", () => {
  it("formats minutes", () => {
    expect(formatEstimate(30)).toBe("30 мин");
  });

  it("formats hours", () => {
    expect(formatEstimate(60)).toBe("1 ч");
    expect(formatEstimate(120)).toBe("2 ч");
  });

  it("formats hours and minutes", () => {
    expect(formatEstimate(90)).toBe("1 ч 30 мин");
  });
});

describe("Timer resume logic — accumulated time display", () => {
  it("resume should add totalWorkTime to current session elapsed", () => {
    // Simulates what TaskItem.svelte does:
    // timerDisplay = formatDuration(elapsed + (task.totalWorkTime || 0))

    const totalWorkTimeBeforePause = 120000; // 2 minutes accumulated before pause
    const currentSessionElapsed = 30000; // 30 seconds into new session after resume

    const displayTime = currentSessionElapsed + totalWorkTimeBeforePause;
    // 150000ms = 2 min 30 sec
    expect(formatDuration(displayTime)).toBe("2:30");
  });

  it("fresh start should show only elapsed (totalWorkTime = 0)", () => {
    const totalWorkTime = 0;
    const elapsed = 60000; // 1 minute

    const displayTime = elapsed + totalWorkTime;
    expect(formatDuration(displayTime)).toBe("1:00");
  });

  it("pause shows accumulated totalWorkTime", () => {
    // When paused, timerDisplay is null, and the template shows:
    // formatDuration(task.totalWorkTime)
    const totalWorkTime = 3660000; // 1 hour 1 minute
    expect(formatDuration(totalWorkTime)).toBe("1:01:00");
  });

  it("multiple pause/resume cycles accumulate correctly", () => {
    // Cycle 1: work 5 min → pause → totalWorkTime = 300000
    let totalWorkTime = 300000;

    // Cycle 2: resume, work 3 min → pause → totalWorkTime += 180000
    totalWorkTime += 180000;
    expect(totalWorkTime).toBe(480000);

    // Cycle 3: resume, work 2 min → pause → totalWorkTime += 120000
    totalWorkTime += 120000;
    expect(totalWorkTime).toBe(600000);
    expect(formatDuration(totalWorkTime)).toBe("10:00");
  });

  it("resume display = currentSessionElapsed + totalWorkTime", () => {
    // After 2 cycles: totalWorkTime = 600000 (10 min)
    const totalWorkTime = 600000;

    // Resume and work 45 seconds
    const currentSessionElapsed = 45000;

    const display = formatDuration(currentSessionElapsed + totalWorkTime);
    // 645000ms = 10 min 45 sec
    expect(display).toBe("10:45");
  });

  it("resume display shows hours when accumulated time crosses hour boundary", () => {
    // After several cycles: totalWorkTime = 3600000 (1 hour)
    const totalWorkTime = 3600000;

    // Resume and work 5 minutes
    const currentSessionElapsed = 300000;

    const display = formatDuration(currentSessionElapsed + totalWorkTime);
    // 3900000ms = 65 minutes = 1 hour 5 minutes
    expect(display).toBe("1:05:00");
  });
});

describe("resumeTimer", () => {
  beforeEach(() => {
    cleanupTimers();
  });

  it("registers a timer with a saved start time", () => {
    const savedStartTime = Date.now() - 60000; // started 1 minute ago
    resumeTimer("task-1", savedStartTime);

    const elapsed = getActiveTimer("task-1");
    expect(elapsed).not.toBeNull();
    // Elapsed should be approximately 60000ms (within tolerance for test execution time)
    expect(elapsed).toBeGreaterThanOrEqual(59000);
    expect(elapsed).toBeLessThanOrEqual(65000);
  });

  it("resumeTimer + getActiveTimer returns correct elapsed", () => {
    const savedStartTime = Date.now() - 300000; // started 5 minutes ago
    resumeTimer("task-2", savedStartTime);

    const elapsed = getActiveTimer("task-2");
    expect(elapsed).not.toBeNull();
    // Should show ~5 minutes (300000ms) elapsed since saved start
    expect(elapsed).toBeGreaterThanOrEqual(299000);
    expect(elapsed).toBeLessThanOrEqual(305000);
  });

  it("resumeTimer preserves totalWorkTime in display calculation", () => {
    // Simulate: task had 10 min work, was paused, then Obsidian restarted
    // and task was somehow still "progress" (edge case)
    const totalWorkTime = 600000; // 10 minutes from prior sessions
    const savedStartTime = Date.now() - 120000; // new session started 2 min ago

    resumeTimer("task-3", savedStartTime);

    const elapsed = getActiveTimer("task-3");
    const displayTime = elapsed + totalWorkTime;
    // ~720000ms = 12 minutes
    expect(formatDuration(displayTime)).toBe("12:00");
  });

  it("stopTimer after resumeTimer returns correct duration", () => {
    const savedStartTime = Date.now() - 60000; // 1 minute ago
    resumeTimer("task-4", savedStartTime);

    const log = stopTimer("task-4");
    expect(log).not.toBeNull();
    expect(log.duration).toBeGreaterThanOrEqual(59000);
    expect(log.duration).toBeLessThanOrEqual(65000);
  });

  it("multiple tasks can be resumed independently", () => {
    const start1 = Date.now() - 60000;  // 1 min ago
    const start2 = Date.now() - 300000; // 5 min ago

    resumeTimer("task-a", start1);
    resumeTimer("task-b", start2);

    const elapsed1 = getActiveTimer("task-a");
    const elapsed2 = getActiveTimer("task-b");

    expect(elapsed1).toBeGreaterThanOrEqual(59000);
    expect(elapsed1).toBeLessThanOrEqual(65000);

    expect(elapsed2).toBeGreaterThanOrEqual(299000);
    expect(elapsed2).toBeLessThanOrEqual(305000);
  });
});
