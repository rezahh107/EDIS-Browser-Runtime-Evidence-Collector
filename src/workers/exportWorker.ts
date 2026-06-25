import { buildEvidencePackage, type EvidencePackageInput } from "../infrastructure/packageBuilder";

interface ExportWorkerRequest {
  readonly requestId: string;
  readonly input: EvidencePackageInput;
}

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<ExportWorkerRequest>): void => {
  const request = event.data;
  void execute(request);
};

async function execute(request: ExportWorkerRequest): Promise<void> {
  try {
    const built = await buildEvidencePackage(request.input);
    const bytes = built.bytes.buffer as ArrayBuffer;
    workerScope.postMessage(
      {
        requestId: request.requestId,
        ok: true,
        result: {
          bytes,
          filename: built.filename,
          entryCount: built.entryCount,
          validation: built.validation,
        },
      },
      [bytes],
    );
  } catch (error: unknown) {
    workerScope.postMessage({
      requestId: request.requestId,
      ok: false,
      error: error instanceof Error ? error.message : "Export worker failed.",
    });
  }
}
