/* eslint-disable @typescript-eslint/no-var-requires */
// Mock https module
const mockRequest = jest.fn();
jest.mock("https", () => ({
  request: jest.fn((_opts, callback) => {
    const req = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(() => {
        // Simulate response
        const res = {
          statusCode: 200,
          headers: {},
          on: jest.fn((event, handler) => {
            if (event === "data") handler(JSON.stringify({ id: "test-1", title: "Test" }));
            if (event === "end") handler();
          }),
        };
        callback(res);
      }),
    };
    mockRequest.mockReturnValue(req);
    return req;
  }),
}));

import {
  verifyToken,
  getTasks,
  createTask,
  getProjects,
  createProject,
} from "../singularityApi";

describe("singularityApi", () => {
  const token = "test-token-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("verifyToken", () => {
    it("returns success on 200", async () => {
      const https = require("https");
      https.request.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
        const req = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(() => {
            const res = {
              statusCode: 200,
              headers: {},
              on: jest.fn((event: string, handler: (data?: string) => void) => {
                if (event === "data") handler("[]");
                if (event === "end") handler();
              }),
            };
            callback(res);
          }),
        };
        return req;
      });

      const result = await verifyToken(token);
      expect(result.success).toBe(true);
    });

    it("returns error on 401", async () => {
      const https = require("https");
      https.request.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
        const req = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(() => {
            const res = {
              statusCode: 401,
              headers: {},
              on: jest.fn((event: string, handler: (data?: string) => void) => {
                if (event === "data") handler('{"error":"Unauthorized"}');
                if (event === "end") handler();
              }),
            };
            callback(res);
          }),
        };
        return req;
      });

      const result = await verifyToken(token);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("getTasks", () => {
    it("sends correct query parameters", async () => {
      const https = require("https");
      let capturedPath = "";
      https.request.mockImplementation((opts: { path: string }, callback: (res: unknown) => void) => {
        capturedPath = opts.path;
        const req = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(() => {
            const res = {
              statusCode: 200,
              headers: {},
              on: jest.fn((event: string, handler: (data?: string) => void) => {
                if (event === "data") handler(JSON.stringify([{ id: "1", title: "Task 1" }]));
                if (event === "end") handler();
              }),
            };
            callback(res);
          }),
        };
        return req;
      });

      await getTasks(token, {
        startDateFrom: "2026-08-01T00:00:00.000Z",
        startDateTo: "2026-08-31T23:59:59.000Z",
        maxCount: 10,
      });

      expect(capturedPath).toContain("startDateFrom=2026-08-01T00%3A00%3A00.000Z");
      expect(capturedPath).toContain("maxCount=10");
    });

    it("returns parsed task array", async () => {
      const https = require("https");
      https.request.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
        const req = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(() => {
            const res = {
              statusCode: 200,
              headers: {},
              on: jest.fn((event: string, handler: (data?: string) => void) => {
                if (event === "data") handler(JSON.stringify([{ id: "1", title: "Task 1" }]));
                if (event === "end") handler();
              }),
            };
            callback(res);
          }),
        };
        return req;
      });

      const tasks = await getTasks(token);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe("1");
    });

    it("handles wrapped response format { data: [...] }", async () => {
      const https = require("https");
      https.request.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
        const req = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(() => {
            const res = {
              statusCode: 200,
              headers: {},
              on: jest.fn((event: string, handler: (data?: string) => void) => {
                if (event === "data") handler(JSON.stringify({ data: [{ id: "1", title: "T" }], total: 1 }));
                if (event === "end") handler();
              }),
            };
            callback(res);
          }),
        };
        return req;
      });

      const tasks = await getTasks(token);
      expect(tasks).toHaveLength(1);
    });
  });

  describe("createTask", () => {
    it("sends POST with correct body", async () => {
      const https = require("https");
      let capturedBody = "";
      https.request.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
        const req = {
          on: jest.fn(),
          write: jest.fn((data: string) => { capturedBody = data; }),
          end: jest.fn(() => {
            const res = {
              statusCode: 201,
              headers: {},
              on: jest.fn((event: string, handler: (data?: string) => void) => {
                if (event === "data") handler(JSON.stringify({ id: "new-1", title: "New Task" }));
                if (event === "end") handler();
              }),
            };
            callback(res);
          }),
        };
        return req;
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
      const https = require("https");
      https.request.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
        const req = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(() => {
            const res = {
              statusCode: 400,
              headers: {},
              on: jest.fn((event: string, handler: (data?: string) => void) => {
                if (event === "data") handler('{"statusCode":400,"message":"Bad Request"}');
                if (event === "end") handler();
              }),
            };
            callback(res);
          }),
        };
        return req;
      });

      await expect(getTasks(token)).rejects.toThrow("400");
    });

    it("throws auth error on 401", async () => {
      const https = require("https");
      https.request.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
        const req = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(() => {
            const res = {
              statusCode: 401,
              headers: {},
              on: jest.fn((event: string, handler: (data?: string) => void) => {
                if (event === "data") handler('{"error":"Unauthorized"}');
                if (event === "end") handler();
              }),
            };
            callback(res);
          }),
        };
        return req;
      });

      await expect(getTasks(token)).rejects.toThrow("токен");
    });

    it("retries on network error", async () => {
      const https = require("https");
      let callCount = 0;
      https.request.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
        callCount++;
        const req = {
          on: jest.fn((event: string, handler: (err: Error) => void) => {
            if (event === "error" && callCount < 3) handler(new Error("ECONNREFUSED"));
          }),
          write: jest.fn(),
          end: jest.fn(() => {
            if (callCount >= 3) {
              const res = {
                statusCode: 200,
                headers: {},
                on: jest.fn((event: string, handler: (data?: string) => void) => {
                  if (event === "data") handler("[]");
                  if (event === "end") handler();
                }),
              };
              callback(res);
            }
          }),
        };
        return req;
      });

      const tasks = await getTasks(token);
      expect(callCount).toBe(3);
      expect(tasks).toEqual([]);
    });
  });

  describe("getProjects", () => {
    it("returns project array", async () => {
      const https = require("https");
      https.request.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
        const req = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(() => {
            const res = {
              statusCode: 200,
              headers: {},
              on: jest.fn((event: string, handler: (data?: string) => void) => {
                if (event === "data") handler(JSON.stringify([{ id: "P-1", title: "Project 1" }]));
                if (event === "end") handler();
              }),
            };
            callback(res);
          }),
        };
        return req;
      });

      const projects = await getProjects(token);
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe("P-1");
    });

    it("handles wrapped response { data: [...] }", async () => {
      const https = require("https");
      https.request.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
        const req = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(() => {
            const res = {
              statusCode: 200,
              headers: {},
              on: jest.fn((event: string, handler: (data?: string) => void) => {
                if (event === "data") handler(JSON.stringify({ data: [{ id: "P-2", title: "Proj" }], total: 1 }));
                if (event === "end") handler();
              }),
            };
            callback(res);
          }),
        };
        return req;
      });

      const projects = await getProjects(token);
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe("P-2");
    });
  });

  describe("createProject", () => {
    it("unwraps {project: {...}, taskGroup: {...}} response", async () => {
      const https = require("https");
      https.request.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
        const req = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(() => {
            const res = {
              statusCode: 201,
              headers: {},
              on: jest.fn((event: string, handler: (data?: string) => void) => {
                // Real SingularityApp API response format
                if (event === "data") handler(JSON.stringify({
                  project: { id: "P-abc-123", title: "My Project", color: "#ad1457" },
                  taskGroup: { id: "TG-1", title: "Default", parent: "P-abc-123" },
                }));
                if (event === "end") handler();
              }),
            };
            callback(res);
          }),
        };
        return req;
      });

      const result = await createProject(token, { title: "My Project", color: "#ad1457" });
      expect(result.id).toBe("P-abc-123");
      expect(result.title).toBe("My Project");
      expect(result.color).toBe("#ad1457");
    });

    it("unwraps direct {id, title} response", async () => {
      const https = require("https");
      https.request.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
        const req = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(() => {
            const res = {
              statusCode: 201,
              headers: {},
              on: jest.fn((event: string, handler: (data?: string) => void) => {
                if (event === "data") handler(JSON.stringify({ id: "P-direct", title: "Direct" }));
                if (event === "end") handler();
              }),
            };
            callback(res);
          }),
        };
        return req;
      });

      const result = await createProject(token, { title: "Direct" });
      expect(result.id).toBe("P-direct");
    });

    it("unwraps {data: {id, title}} response", async () => {
      const https = require("https");
      https.request.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
        const req = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(() => {
            const res = {
              statusCode: 201,
              headers: {},
              on: jest.fn((event: string, handler: (data?: string) => void) => {
                if (event === "data") handler(JSON.stringify({ data: { id: "P-wrapped", title: "Wrapped" } }));
                if (event === "end") handler();
              }),
            };
            callback(res);
          }),
        };
        return req;
      });

      const result = await createProject(token, { title: "Wrapped" });
      expect(result.id).toBe("P-wrapped");
    });
  });
});
