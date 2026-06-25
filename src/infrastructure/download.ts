const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function safeFilename(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+|[. -]+$/g, "");
  const bounded = (normalized || "edis-runtime-package").slice(0, 120).replace(/[. ]+$/g, "");
  return WINDOWS_RESERVED_NAME.test(bounded) ? `edis-${bounded}` : bounded;
}

export function downloadBytes(bytes: Uint8Array, filename: string, mimeType: string): void {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFilename(filename);
  anchor.rel = "noopener";
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
