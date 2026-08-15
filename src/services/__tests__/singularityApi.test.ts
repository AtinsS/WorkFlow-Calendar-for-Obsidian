/* eslint-disable @typescript-eslint/no-var-requires */
import {
  verifyToken,
  getTasks,
  createTask,
  getProjects,
  createProject,
} from "../singularityApi";
import { requestUrl } from "obsidian";

// Use the mock from jest.setup.js (which defines requestUrl as jest.fn())
const mockRequestUrl = requestUrl as jest.Mock;

describe("singularityApi", () => {
  const token = "test-token-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("verifyToken", () => {
    it("returns success on 200", async () => {
      mockRequestUrl.mockResolvedValue({ status: 200, text: "[]" });

      const result = await verifyToken(token);
      expect(result.success).toBe(true);
    });

    it("returns error on 401", async () => {
      mockRequestUrl.mockResolvedValue({ status: 401, text: '{"error":"Unauthorized"}' });

      const result = await verifyToken(token);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("getTasks", () => {
    it("sends correct query parameters", async () => {
      let capturedUrl = "";
      mockRequestUrl.mockImplementation((opts: { url: string }) => {
        capturedUrl = opts.url;
        return Promise.resolve({ status: 200, text: JSON.stringify([{ id: "1", title: "Task 1" }]) });
      });

      await getTasks(token, {
        startDateFrom: "2026-08-01T00:00:00.000Z",
        startDateTo: "2026-08-31T23:59:59.000Z",
        maxCount: 10,
      });

      expect(capturedUrl).toContain("startDateFrom=2026-08-01T00%3A00%3A00.000Z");
      expect(capturedUrl).toContain("maxCount=10");
    });

    it("returns parsed task array", async () => {
      mockRequestUrl.mockResolvedValue({ status: 200, text: JSON.stringify([{ id: "1", title: "Task 1" }]) });

      const tasks = await getTasks(token);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe("1");
    });

    it("handles wrapped response format { data: [...] }", async () => {
      mockRequestUrl.mockResolvedValue({ status: 200, text: JSON.stringify({ data: [{ id: "1", title: "T" }], total: 1 }) });

      const tasks = await getTasks(token);
      expect(tasks).toHaveLength(1);
    });
  });

  describe("createTask", () => {
    it("sends POST with correct body", async () => {
      let capturedBody = "";
      mockRequestUrl.mockImplementation((opts: { body?: string }) => {
        capturedBody = opts.body || "";
        return Promise.resolve({ status: 201, text: JSON.stringify({ id: "new-1", title: "New Task" }) });
      });

      const result = await createTask(token, {
        title: "New Task",
        start: "2026-08-01T00:00:00.000Z",
        priority: 1,
      });

      const parsed = JSON.parse(capturedBody);
      expect(parsed.title).toBe("New Task");
      expect(parsed.start).toBe("2026-08-01T00:00:00.000Z");
      expect(result.id).toBe("new-1");
    });
  });

  describe("error handling", () => {
    it("throws on 400 with response body", async () => {
      mockRequestUrl.mockResolvedValue({ status: 400, text: '{"statusCode":400,"message":"Bad Request"}' });

      await expect(getTasks(token)).rejects.toThrow("400");
    });

    it("throws auth error on 401", async () => {
      mockRequestUrl.mockResolvedValue({ status: 401, text: '{"error":"Unauthorized"}' });

      await expect(getTasks(token)).rejects.toThrow("токен");
    });

    it("retries on network error", async () => {
      let callCount = 0;
      mockRequestUrl.mockImplementation(() => {
        callCount++;
        if (callCount < 3) return Promise.reject(new Error("ECONNREFUSED"));
        return Promise.resolve({ status: 200, text: "[]" });
      });

      const tasks = await getTasks(token);
      expect(callCount).toBe(3);
      expect(tasks).toEqual([]);
    });
  });

  describe("getProjects", () => {
    it("returns project array", async () => {
      mockRequestUrl.mockResolvedValue({ status: 200, text: JSON.stringify([{ id: "P-1", title: "Project 1" }]) });

      const projects = await getProjects(token);
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe("P-1");
    });

    it("handles wrapped response { data: [...] }", async () => {
      mockRequestUrl.mockResolvedValue({ status: 200, text: JSON.stringify({ data: [{ id: "P-2", title: "Proj" }], total: 1 }) });

      const projects = await getProjects(token);
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe("P-2");
    });
  });

  describe("createProject", () => {
    it("unwraps {project: {...}, taskGroup: {...}} response", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 201,
        text: JSON.stringify({
          project: { id: "P-abc-123", title: "My Project", color: "#ad1457" },
          taskGroup: { id: "TG-1", title: "Default", parent: "P-abc-123" },
        }),
      });

      const result = await createProject(token, { title: "My Project", color: "#ad1457" });
      expect(result.id).toBe("P-abc-123");
      expect(result.title).toBe("My Project");
      expect(result.color).toBe("#ad1457");
    });

    it("unwraps direct {id, title} response", async () => {
      mockRequestUrl.mockResolvedValue({ status: 201, text: JSON.stringify({ id: "P-direct", title: "Direct" }) });

      const result = await createProject(token, { title: "Direct" });
      expect(result.id).toBe("P-direct");
    });

    it("unwraps {data: {id, title}} response", async () => {
      mockRequestUrl.mockResolvedValue({ status: 201, text: JSON.stringify({ data: { id: "P-wrapped", title: "Wrapped" } }) });

      const result = await createProject(token, { title: "Wrapped" });
      expect(result.id).toBe("P-wrapped");
    });
  });
});
