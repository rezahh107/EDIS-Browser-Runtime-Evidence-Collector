const UUID_HEX_LENGTH = 32;
export const NIL_REQUEST_ID = "00000000-0000-4000-8000-000000000000";

let requestSequence = 0;
let fallbackProvenanceSequence = 0;

export function nextRequestId(scope: string): string {
  requestSequence += 1;
  return uuidFromWords(hashWords(`${runtimeContext()}|${scope}|${requestSequence}`));
}

export function runtimeProvenanceSeed(scope: string, parts: readonly string[] = []): string {
  return [runtimeContext(), scope, ...parts, randomRuntimeToken()].join("|");
}

function randomRuntimeToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  }
  fallbackProvenanceSequence += 1;
  return `${Date.now().toString(36)}-${fallbackProvenanceSequence.toString(36)}`;
}

export async function deterministicUuid(namespace: string, value: string): Promise<string> {
  const input = new TextEncoder().encode(`${namespace}\u0000${value}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return uuidFromBytes(digest);
}

function runtimeContext(): string {
  if (typeof location === "undefined") return "worker";
  return `${location.protocol}//${location.host}${location.pathname}`;
}

function hashWords(value: string): readonly number[] {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  return seeds.map((seed, wordIndex) => {
    let hash = seed ^ wordIndex;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index) + wordIndex * 131;
      hash = Math.imul(hash, 0x01000193);
      hash ^= hash >>> 13;
    }
    return hash >>> 0;
  });
}

function uuidFromWords(words: readonly number[]): string {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  words.slice(0, 4).forEach((word, index) => view.setUint32(index * 4, word, false));
  return uuidFromBytes(bytes);
}

function uuidFromBytes(source: Uint8Array): string {
  if (source.length < 16) throw new Error("A deterministic UUID requires at least 16 bytes.");
  const bytes = Uint8Array.from(source.slice(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("");
  if (hex.length !== UUID_HEX_LENGTH) throw new Error("Deterministic UUID encoding failed.");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
