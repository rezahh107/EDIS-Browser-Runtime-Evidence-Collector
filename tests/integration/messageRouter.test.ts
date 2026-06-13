import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "../../src/domain/messages";

const storageData = new Map<string, unknown>();
const storageArea = {
  get: vi.fn(async (key?: string) =>
    key ? { [key]: storageData.get(key) } : Object.fromEntries(storageData),
  ),
  set: vi.fn(async (items: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(items)) storageData.set(key, value);
  }),
  remove: vi.fn(async (key: string) => {
    storageData.delete(key);
  }),
  clear: vi.fn(async () => {
    storageData.clear();
  }),
};

beforeAll(() => {
  vi.stubGlobal("chrome", {
    runtime: {
      id: "extension-id",
      getURL: (path: string) => `chrome-extension://extension-id/${path.replace(/^\//, "")}`,
      getManifest: () => ({ version: "1.0.0" }),
    },
    storage: { sync: storageArea, session: storageArea },
    tabs: { query: vi.fn(async () => []) },
    scripting: { executeScript: vi.fn(async () => []) },
    sidePanel: {},
  });
});

describe("popup to service worker routing", () => {
  it("creates a session for a validated extension sender", async () => {
    const { routeMessage } = await import("../../src/background/messageRouter");
    const response = await routeMessage(
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "SESSION_CREATE",
        requestId: "123e4567-e89b-12d3-a456-426614174000",
        payload: { name: "Integration session" },
      },
      { id: "extension-id", url: "chrome-extension://extension-id/popup/index.html" },
    );
    expect(response.success).toBe(true);
  });
});
