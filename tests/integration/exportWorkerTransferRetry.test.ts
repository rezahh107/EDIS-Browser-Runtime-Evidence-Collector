import { afterEach, describe, expect, it } from "vitest";
import { buildEvidencePackageOffMainThread } from "../../src/infrastructure/exportWorkerClient";
import { sha256Hex } from "../../src/infrastructure/checksum";
import { capturedAt, makeSession, makeSnapshot, sessionId, snapshotId } from "../helpers/fixtures";
import type { ScreenshotRecord } from "../../src/domain/model";

const originalWorker = globalThis.Worker;
const originalChrome = globalThis.chrome;

describe("export worker transfer retry", () => {
  afterEach(() => {
    globalThis.Worker = originalWorker;
    globalThis.chrome = originalChrome;
  });

  it("keeps original screenshot ArrayBuffers retryable after a failed worker transfer", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
    const screenshot: ScreenshotRecord = {
      snapshotId,
      sessionId,
      mimeType: "image/png",
      bytes,
      checksumSha256: await sha256Hex(new Uint8Array(bytes)),
      createdAt: capturedAt,
    };
    const input = {
      session: makeSession(),
      snapshots: [makeSnapshot()],
      screenshots: [screenshot],
    };

    globalThis.chrome = { runtime: { getURL: (value: string) => value } } as typeof chrome;
    globalThis.Worker = FailingTransferWorker as unknown as typeof Worker;

    await expect(buildEvidencePackageOffMainThread(input)).rejects.toThrow(
      /simulated worker failure/i,
    );
    expect(screenshot.bytes.byteLength).toBe(8);

    globalThis.Worker = undefined as unknown as typeof Worker;
    const retried = await buildEvidencePackageOffMainThread(input);
    expect(typeof retried.entryCount).toBe("number");
    expect(retried.filename).toContain("edis-runtime-package");
  });
});

class FailingTransferWorker {
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  public postMessage(_message: unknown, transfer?: Transferable[]): void {
    if (transfer) structuredClone(_message, { transfer });
    setTimeout(() => {
      this.onerror?.({ message: "simulated worker failure" } as ErrorEvent);
    }, 0);
  }
  public terminate(): void {
    // no-op for the deterministic mock worker
  }
}
