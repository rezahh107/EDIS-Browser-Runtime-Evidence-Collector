import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { BaseMessage } from "../../src/domain/messages";
import { request } from "../../src/shared/ui";

const sessionId = "123e4567-e89b-42d3-a456-426614174000";

describe("strict UI message protocol", () => {
  it("makes requestedProfileId a compile-time requirement for CAPTURE_START", () => {
    const compileOnly = (): void => {
      // @ts-expect-error CAPTURE_START must always include requestedProfileId.
      void request("CAPTURE_START", {
        sessionId,
        userLabel: "Current viewport",
        evidenceLabel: "USER_LABELED_VIEWPORT",
      });
    };
    expect(compileOnly).toBeTypeOf("function");
  });

  it("makes workflowMode a compile-time requirement for CAPTURE_START", () => {
    const compileOnly = (): void => {
      // @ts-expect-error CAPTURE_START must always declare its workflow mode.
      void request("CAPTURE_START", {
        sessionId,
        userLabel: "Current viewport",
        evidenceLabel: "USER_LABELED_VIEWPORT",
        requestedProfileId: "DESKTOP",
      });
    };
    expect(compileOnly).toBeTypeOf("function");
  });

  it("rejects malformed payloads before chrome.runtime.sendMessage", async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    await expect(
      request("CAPTURE_START", {
        sessionId,
        userLabel: "Current viewport",
        evidenceLabel: "USER_LABELED_VIEWPORT",
      } as never),
    ).rejects.toThrow("Invalid CAPTURE_START request payload.");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it.each(["DESKTOP", "TABLET", "MOBILE", "CUSTOM"] as const)(
    "sends a valid %s capture profile",
    async (requestedProfileId) => {
      const sendMessage = vi.fn(async (message: BaseMessage) => ({
        requestId: message.requestId,
        success: true as const,
        data: { accepted: true },
      }));
      vi.stubGlobal("chrome", { runtime: { sendMessage } });

      await expect(
        request<{ accepted: boolean }>("CAPTURE_START", {
          sessionId,
          userLabel: "Current viewport",
          evidenceLabel: "USER_LABELED_VIEWPORT",
          requestedProfileId,
          workflowMode: "RUNTIME_EVIDENCE",
        }),
      ).resolves.toEqual({ accepted: true });

      const sent = sendMessage.mock.calls[0]?.[0] as BaseMessage | undefined;
      expect(sent?.type).toBe("CAPTURE_START");
      expect(sent?.payload).toMatchObject({ requestedProfileId, workflowMode: "RUNTIME_EVIDENCE" });
    },
  );

  it("keeps both capture UIs on the strict profile-aware producer contract", async () => {
    const [popup, sidePanel, popupHtml] = await Promise.all([
      readFile("src/popup/index.ts", "utf8"),
      readFile("src/sidepanel/index.ts", "utf8"),
      readFile("src/popup/index.html", "utf8"),
    ]);

    expect(popup).toContain('request<CaptureJob>("CAPTURE_START"');
    expect(sidePanel).toContain('request<CaptureJob>("CAPTURE_START"');
    expect(popup).toContain("requestedProfileId: selectedViewportProfile()");
    expect(sidePanel).toContain("requestedProfileId: selectedViewportProfile()");
    expect(popup).toContain('workflowMode: "RUNTIME_EVIDENCE"');
    expect(sidePanel).toContain("workflowMode: selectedMode");
    expect(`${popup}\n${sidePanel}`).not.toContain("requestedProfileId: viewportProfile.value");
    for (const profile of ["DESKTOP", "TABLET", "MOBILE", "CUSTOM"])
      expect(popupHtml).toContain(`value="${profile}"`);
  });
});
