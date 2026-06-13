import { beforeAll, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION, type BaseMessage } from "../../src/domain/messages";

beforeAll(() => {
  vi.stubGlobal("chrome", {
    runtime: {
      id: "trusted",
      getURL: (path: string) => `chrome-extension://trusted/${path.replace(/^\//, "")}`,
      getManifest: () => ({ version: "1.0.0" }),
    },
    storage: { sync: {}, session: {} },
    tabs: {},
    scripting: {},
    sidePanel: {},
  });
});

describe("forged message rejection", () => {
  it("rejects another extension and page sender", async () => {
    const { validSender } = await import("../../src/background/messageRouter");
    const message: BaseMessage = {
      protocolVersion: PROTOCOL_VERSION,
      type: "STATE_GET",
      requestId: "123e4567-e89b-12d3-a456-426614174000",
    };
    expect(
      validSender(message, { id: "attacker", url: "chrome-extension://attacker/popup.html" }),
    ).toBe(false);
    expect(
      validSender(message, {
        id: "trusted",
        tab: {
          id: 2,
          index: 0,
          pinned: false,
          highlighted: false,
          active: true,
          incognito: false,
          windowId: 1,
          discarded: false,
          autoDiscardable: true,
          frozen: false,
          selected: true,
          groupId: -1,
        },
      }),
    ).toBe(false);
  });
});
