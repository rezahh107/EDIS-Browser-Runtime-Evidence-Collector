import {
  buildEvidencePackage,
  type BuiltEvidencePackage,
  type EvidencePackageInput,
} from "./packageBuilder";

interface ExportWorkerSuccess {
  readonly requestId: string;
  readonly ok: true;
  readonly result: {
    readonly bytes: ArrayBuffer;
    readonly filename: string;
    readonly entryCount: number;
    readonly validation: BuiltEvidencePackage["validation"];
  };
}

interface ExportWorkerFailure {
  readonly requestId: string;
  readonly ok: false;
  readonly error: string;
}

type ExportWorkerResponse = ExportWorkerSuccess | ExportWorkerFailure;

const EXPORT_WORKER_TIMEOUT_MS = 180_000;

export async function buildEvidencePackageOffMainThread(
  input: EvidencePackageInput,
): Promise<BuiltEvidencePackage> {
  if (!canUseExportWorker()) return buildEvidencePackage(input);

  const requestId = `export-${Date.now().toString(36)}`;
  const worker = new Worker(chrome.runtime.getURL("workers/export-worker.js"));
  const workerInput = cloneInputForWorkerTransfer(input);
  const transfer = workerInput.screenshots.map((screenshot) => screenshot.bytes);

  return new Promise<BuiltEvidencePackage>((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("Export worker timed out."));
    }, EXPORT_WORKER_TIMEOUT_MS);

    const finish = (): void => {
      clearTimeout(timeout);
      worker.terminate();
    };

    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Export worker failed."));
    };
    worker.onmessage = (event: MessageEvent<ExportWorkerResponse>) => {
      const response = event.data;
      if (!response || response.requestId !== requestId) return;
      finish();
      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }
      resolve({
        bytes: new Uint8Array(response.result.bytes),
        filename: response.result.filename,
        entryCount: response.result.entryCount,
        validation: response.result.validation,
      });
    };

    worker.postMessage({ requestId, input: workerInput }, transfer);
  });
}

function cloneInputForWorkerTransfer(input: EvidencePackageInput): EvidencePackageInput {
  return {
    ...input,
    snapshots: [...input.snapshots],
    screenshots: input.screenshots.map((screenshot) => ({
      ...screenshot,
      bytes: screenshot.bytes.slice(0),
    })),
  };
}

function canUseExportWorker(): boolean {
  return (
    typeof Worker === "function" &&
    typeof chrome !== "undefined" &&
    typeof chrome.runtime?.getURL === "function"
  );
}
