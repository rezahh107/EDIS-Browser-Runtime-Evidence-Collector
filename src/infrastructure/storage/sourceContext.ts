import {
  bindingContextFromRecord,
  parseImportedSourceContext,
  type ImportedContextRecord,
} from "../../domain/bridge";
import type { BindingContext } from "../../domain/model";

const KEY = "importedSourceContextV1";

export async function importSourceContext(
  text: string,
  selectedDocumentId: string | null,
): Promise<ImportedContextRecord> {
  const record = await parseImportedSourceContext(text, selectedDocumentId);
  await chrome.storage.local.set({ [KEY]: record });
  return record;
}

export async function loadSourceContextRecord(): Promise<ImportedContextRecord | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
  const result = await chrome.storage.local.get(KEY);
  const value = result[KEY] as ImportedContextRecord | undefined;
  return value ?? null;
}

export async function loadBindingContext(): Promise<BindingContext | null> {
  const record = await loadSourceContextRecord();
  return record ? bindingContextFromRecord(record) : null;
}

export async function clearSourceContext(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
