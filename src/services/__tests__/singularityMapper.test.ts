import {
  dateUIDToISO,
  isoToDateUID,
  parseRemoteUpdatedAt,
  priorityToSingularity,
  singularityPriorityToLocal,
  statusFromRemote,
  buildCreateTaskBody,
  buildUpdateTaskBody,
  buildLocalTaskFromRemote,
  buildReverseMap,
  buildReverseProjectMap,
  hexToEmoji,
  emojiToHex,
  STATUS_TAG_PREFIX,
} from "../singularityMapper";
import type { SingularityTask } from "../singularityApi";

describe("singularityMapper", () => {
  // --- Date conversion ---

  describe("dateUIDToISO", () => {
    it("converts dateUID to ISO-8601 datetime in UTC", () => {
      const result = dateUIDToISO("day-2026-08-01");
      // Should be a valid ISO datetime ending with Z
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("converts dateUID with time suffix", () => {
      const result = dateUIDToISO("day-2026-08-01T12:00:00+03:00");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("returns undefined for invalid format", () => {
      expect(dateUIDToISO("invalid")).toBeUndefined();
      expect(dateUIDToISO("")).toBeUndefined();
    });
  });

  describe("isoToDateUID", () => {
    it("extracts date from ISO datetime matching getDateUID format", () => {
      const result = isoToDateUID("2026-08-01T00:00:00.000Z");
      // Format must match getDateUID from obsidian-daily-notes-interface: "day-YYYY-MM-DDTHH:mm:ssZ"
      expect(result).toMatch(/^day-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(result).toContain("2026-08-01");
    });

    it("extracts date from ISO date only", () => {
      const result = isoToDateUID("2026-08-01");
      expect(result).toMatch(/^day-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(result).toContain("2026-08-01");
    });

    it("returns valid format for invalid input", () => {
      const result = isoToDateUID("not-a-date");
      expect(result).toMatch(/^day-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("parseRemoteUpdatedAt", () => {
    it("parses ISO datetime to epoch ms", () => {
      const result = parseRemoteUpdatedAt("2026-08-01T12:00:00.000Z");
      expect(result).toBeGreaterThan(0);
    });

    it("returns 0 for undefined", () => {
      expect(parseRemoteUpdatedAt(undefined)).toBe(0);
    });

    it("returns 0 for invalid string", () => {
      expect(parseRemoteUpdatedAt("not-a-date")).toBe(0);
    });
  });

  // --- Priority mapping ---

  describe("priorityToSingularity", () => {
    it("maps high to 0", () => expect(priorityToSingularity("high")).toBe(0));
    it("maps medium to 1", () => expect(priorityToSingularity("medium")).toBe(1));
    it("maps low to 2", () => expect(priorityToSingularity("low")).toBe(2));
    it("maps unknown to 1 (medium)", () => expect(priorityToSingularity("unknown")).toBe(1));
  });

  describe("singularityPriorityToLocal", () => {
    it("maps 0 to high", () => expect(singularityPriorityToLocal(0)).toBe("high"));
    it("maps 1 to medium", () => expect(singularityPriorityToLocal(1)).toBe("medium"));
    it("maps 2 to low", () => expect(singularityPriorityToLocal(2)).toBe("low"));
    it("maps undefined to medium", () => expect(singularityPriorityToLocal(undefined)).toBe("medium"));
    it("maps 99 to medium", () => expect(singularityPriorityToLocal(99)).toBe("medium"));
  });

  // --- Status mapping ---

  describe("statusFromRemote", () => {
    it("returns done when journalDate is set", () => {
      const task: SingularityTask = { id: "1", title: "T", journalDate: "2026-08-01" };
      expect(statusFromRemote(task)).toEqual({ status: "done", completed: true });
    });

    it("returns done when done tag exists", () => {
      const task: SingularityTask = { id: "1", title: "T", tags: [`${STATUS_TAG_PREFIX}done`] };
      expect(statusFromRemote(task)).toEqual({ status: "done", completed: true });
    });

    it("returns progress when tag exists", () => {
      const task: SingularityTask = { id: "1", title: "T", tags: [`${STATUS_TAG_PREFIX}progress`] };
      expect(statusFromRemote(task)).toEqual({ status: "progress", completed: false });
    });

    it("returns paused when tag exists", () => {
      const task: SingularityTask = { id: "1", title: "T", tags: [`${STATUS_TAG_PREFIX}paused`] };
      expect(statusFromRemote(task)).toEqual({ status: "paused", completed: false });
    });

    it("returns todo by default", () => {
      const task: SingularityTask = { id: "1", title: "T" };
      expect(statusFromRemote(task)).toEqual({ status: "todo", completed: false });
    });

    it("returns todo when no matching tags", () => {
      const task: SingularityTask = { id: "1", title: "T", tags: ["#other"] };
      expect(statusFromRemote(task)).toEqual({ status: "todo", completed: false });
    });

    it("journalDate takes precedence over tags", () => {
      const task: SingularityTask = {
        id: "1", title: "T",
        journalDate: "2026-08-01",
        tags: [`${STATUS_TAG_PREFIX}progress`],
      };
      expect(statusFromRemote(task)).toEqual({ status: "done", completed: true });
    });
  });

  // --- Body builders ---

  describe("buildCreateTaskBody", () => {
    it("builds minimal body with title", () => {
      const body = buildCreateTaskBody(
        { title: "Test", dateUID: "day-2026-08-01", priority: "medium" },
        {}
      );
      expect(body.title).toBe("Test");
      expect(body.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(body.priority).toBe(1);
    });

    it("includes description as note", () => {
      const body = buildCreateTaskBody(
        { title: "Test", dateUID: "day-2026-08-01", priority: "high", description: "Desc" },
        {}
      );
      expect(body.note).toBe("Desc");
    });

    it("maps projectId via projectMap", () => {
      const body = buildCreateTaskBody(
        { title: "Test", dateUID: "day-2026-08-01", priority: "low", projectId: "local-1" },
        { "local-1": "remote-abc" }
      );
      expect(body.projectId).toBe("remote-abc");
    });

    it("skips projectId if not in map", () => {
      const body = buildCreateTaskBody(
        { title: "Test", dateUID: "day-2026-08-01", priority: "medium", projectId: "unknown" },
        {}
      );
      expect(body.projectId).toBeUndefined();
    });
  });

  describe("buildUpdateTaskBody", () => {
    it("builds update body with all fields", () => {
      const body = buildUpdateTaskBody(
        { title: "Updated", dateUID: "day-2026-08-02", priority: "high", status: "todo", description: "D" },
        {}
      );
      expect(body.title).toBe("Updated");
      expect(body.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(body.priority).toBe(0);
      expect(body.note).toBe("D");
    });

    it("does not set journalDate when status is done (uses tags instead)", () => {
      const body = buildUpdateTaskBody(
        { title: "Done", dateUID: "day-2026-08-01", priority: "medium", status: "done" },
        {}
      );
      expect(body.journalDate).toBeUndefined();
    });

    it("does not set journalDate for non-done status", () => {
      const body = buildUpdateTaskBody(
        { title: "Active", dateUID: "day-2026-08-01", priority: "medium", status: "progress" },
        {}
      );
      expect(body.journalDate).toBeUndefined();
    });
  });

  describe("buildLocalTaskFromRemote", () => {
    it("maps remote task to local format", () => {
      const remote: SingularityTask = {
        id: "remote-1",
        title: "Remote Task",
        note: "Description",
        start: "2026-08-01T00:00:00.000Z",
        priority: 0,
        projectId: "proj-remote",
      };
      const reverseMap = new Map([["proj-remote", "proj-local"]]);
      const result = buildLocalTaskFromRemote(remote, reverseMap);

      expect(result.title).toBe("Remote Task");
      expect(result.description).toBe("Description");
      expect(result.dateUID).toMatch(/^day-2026-08-01T/);
      expect(result.priority).toBe("high");
      expect(result.projectId).toBe("proj-local");
      expect(result.singularityId).toBe("remote-1");
      expect(result.status).toBe("todo");
    });

    it("maps archived task to done", () => {
      const remote: SingularityTask = {
        id: "r-2", title: "Done", journalDate: "2026-08-01",
      };
      const result = buildLocalTaskFromRemote(remote, new Map());
      expect(result.status).toBe("done");
      expect(result.completed).toBe(true);
    });

    it("sets projectId to null if not in reverse map", () => {
      const remote: SingularityTask = {
        id: "r-3", title: "No Project", projectId: "unknown",
      };
      const result = buildLocalTaskFromRemote(remote, new Map());
      expect(result.projectId).toBeNull();
    });

    it("computes estimatedTime and endTime from timeLength", () => {
      const remote: SingularityTask = {
        id: "r-4", title: "Timed Task",
        start: "2026-08-01T10:00:00.000Z",
        useTime: true,
        timeLength: 90,
      };
      const result = buildLocalTaskFromRemote(remote, new Map());
      expect(result.estimatedTime).toBe(90);
      expect(result.endTime).toBeDefined();
    });

    it("does not set estimatedTime when timeLength is absent", () => {
      const remote: SingularityTask = {
        id: "r-5", title: "No Duration",
        start: "2026-08-01T10:00:00.000Z",
      };
      const result = buildLocalTaskFromRemote(remote, new Map());
      expect(result.estimatedTime).toBeUndefined();
      expect(result.endTime).toBeUndefined();
    });
  });

  // --- Sync map helpers ---

  describe("buildReverseMap", () => {
    it("builds singularityId -> localId map", () => {
      const syncMap = {
        "local-1": { singularityId: "remote-a" },
        "local-2": { singularityId: "remote-b" },
      };
      const reverse = buildReverseMap(syncMap);
      expect(reverse.get("remote-a")).toBe("local-1");
      expect(reverse.get("remote-b")).toBe("local-2");
    });

    it("returns empty map for empty input", () => {
      const reverse = buildReverseMap({});
      expect(reverse.size).toBe(0);
    });
  });

  describe("buildReverseProjectMap", () => {
    it("builds remoteProjectId -> localProjectId map", () => {
      const map = buildReverseProjectMap({ "l1": "r1", "l2": "r2" });
      expect(map.get("r1")).toBe("l1");
      expect(map.get("r2")).toBe("l2");
    });
  });

  // --- Emoji conversion ---

  describe("hexToEmoji", () => {
    it("converts simple hex code to emoji", () => {
      expect(hexToEmoji("1f48c")).toBe("💌");
    });

    it("converts heart emoji hex code", () => {
      expect(hexToEmoji("2764")).toBe("❤");
    });

    it("converts compound hex code with hyphens", () => {
      // 1f468-200d-1f4bb = man technologist
      const result = hexToEmoji("1f468-200d-1f4bb");
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });

    it("returns default emoji for undefined input", () => {
      expect(hexToEmoji(undefined)).toBe("📁");
    });

    it("returns default emoji for empty string", () => {
      expect(hexToEmoji("")).toBe("📁");
    });

    it("returns default emoji for invalid hex", () => {
      expect(hexToEmoji("zzzzzz")).toBe("📁");
    });
  });

  describe("emojiToHex", () => {
    it("converts emoji to hex code", () => {
      expect(emojiToHex("💌")).toBe("1f48c");
    });

    it("converts heart emoji to hex", () => {
      expect(emojiToHex("❤")).toBe("2764");
    });

    it("returns undefined for default folder emoji", () => {
      expect(emojiToHex("📁")).toBeUndefined();
    });

    it("returns undefined for undefined input", () => {
      expect(emojiToHex(undefined)).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(emojiToHex("")).toBeUndefined();
    });
  });

  describe("hexToEmoji ↔ emojiToHex roundtrip", () => {
    it("roundtrips common emojis", () => {
      const emojis = ["💌", "🔥", "⭐", "🎯", "💡", "🚀", "❤", "✅"];
      for (const emoji of emojis) {
        const hex = emojiToHex(emoji);
        expect(hex).toBeTruthy();
        const back = hexToEmoji(hex);
        expect(back).toBe(emoji);
      }
    });
  });
});
