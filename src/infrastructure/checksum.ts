export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const stable: Uint8Array<ArrayBuffer> =
    bytes.buffer instanceof ArrayBuffer
      ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", stable);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) throw new Error("Unsupported screenshot data URL.");
  const binary = atob(dataUrl.slice(prefix.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function sha256Digest(value: string | Uint8Array): Promise<`sha256:${string}`> {
  return `sha256:${await sha256Hex(value)}`;
}
