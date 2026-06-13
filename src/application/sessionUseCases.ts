import { COLLECTOR_ID, SCHEMA_VERSION, type CaptureSession } from "../domain/model";
import { EvidenceRepository } from "../infrastructure/storage/indexedDb";

const CURRENT_SESSION_KEY = "currentSessionId";

export async function createSession(
  name: string,
  browserFamily = "Unknown",
  browserVersion: string | null = null,
): Promise<CaptureSession> {
  const now = new Date().toISOString();
  const session: CaptureSession = {
    schema_version: SCHEMA_VERSION,
    artifact_type: "capture_session",
    status: "AVAILABLE",
    source: { collector_id: COLLECTOR_ID, collector_version: "1.0.0" },
    captured_at: now,
    data: {
      session_id: crypto.randomUUID(),
      name: name.trim(),
      created_at: now,
      extension_version: "1.0.0",
      browser_family: browserFamily,
      browser_version: browserVersion,
      linked_wordpress_bundle_id: null,
      user_confirmed_document_id: null,
      match_status: "UNMATCHED",
      captures: [],
      status: "CREATED",
    },
    diagnostics: [],
  };
  const repository = new EvidenceRepository();
  await repository.putSession(session);
  await chrome.storage.session.set({ [CURRENT_SESSION_KEY]: session.data.session_id });
  return session;
}

export async function selectSession(sessionId: string): Promise<CaptureSession> {
  const repository = new EvidenceRepository();
  const session = await repository.getSession(sessionId);
  if (!session) throw new Error("Session not found.");
  await chrome.storage.session.set({ [CURRENT_SESSION_KEY]: sessionId });
  return session;
}

export async function currentSessionId(): Promise<string | null> {
  const stored = await chrome.storage.session.get(CURRENT_SESSION_KEY);
  return typeof stored[CURRENT_SESSION_KEY] === "string" ? stored[CURRENT_SESSION_KEY] : null;
}
