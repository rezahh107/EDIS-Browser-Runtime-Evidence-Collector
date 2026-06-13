import { DEFAULT_PREFERENCES, type CollectorPreferences } from "../../domain/model";
import { isPreferences } from "../../domain/validation";

const KEY = "collectorPreferences";

export async function loadPreferences(): Promise<CollectorPreferences> {
  const stored = await chrome.storage.sync.get(KEY);
  const candidate = stored[KEY];
  return isPreferences(candidate) ? candidate : DEFAULT_PREFERENCES;
}

export async function savePreferences(preferences: CollectorPreferences): Promise<void> {
  if (!isPreferences(preferences)) throw new Error("Invalid preferences.");
  await chrome.storage.sync.set({ [KEY]: preferences });
}

export async function clearPreferences(): Promise<void> {
  await chrome.storage.sync.remove(KEY);
}
