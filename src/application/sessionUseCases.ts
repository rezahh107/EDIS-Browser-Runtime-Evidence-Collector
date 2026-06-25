import { deterministicUuid, runtimeProvenanceSeed } from "../domain/identifiers";
import {
  CANONICALIZATION_PROFILE,
  COLLECTOR_VERSION,
  HASH_ALGORITHM,
  type CaptureSession,
} from "../domain/model";
import { EvidenceRepository } from "../infrastructure/storage/indexedDb";
import { loadBindingContext } from "../infrastructure/storage/sourceContext";

const CURRENT_SESSION_KEY = "currentSessionId";

export async function createSession(
  name: string,
  browserFamily = "Unknown",
  browserVersion: string | null = null,
): Promise<CaptureSession> {
  const repository = new EvidenceRepository();
  const sequence = await repository.allocateSequence("session");
  const now = new Date().toISOString();
  const provenanceSeed = runtimeProvenanceSeed("session", [
    String(sequence),
    browserFamily,
    browserVersion ?? "unknown",
    now,
  ]);
  const sessionId = await deterministicUuid("edis.runtime.session", provenanceSeed);
  const observationSetId = await deterministicUuid("edis.runtime.observation-set", provenanceSeed);
  const bindingContext = await loadBindingContext();
  const session: CaptureSession = {
    schema_id: "urn:edis:schema:browser:capture-session",
    schema_version: "1.1.0",
    artifact_type: "capture_session",
    producer: { product: "EDIS Browser Runtime Evidence Collector", version: COLLECTOR_VERSION },
    captured_at: now,
    canonicalization: { profile: CANONICALIZATION_PROFILE, hash_algorithm: HASH_ALGORITHM },
    data: {
      session_id: sessionId,
      observation_set_id: observationSetId,
      name: name.trim(),
      created_at: now,
      extension_version: COLLECTOR_VERSION,
      browser_family: browserFamily,
      browser_version: browserVersion,
      runtime_environment: null,
      source_context_reference: bindingContext?.reference ?? null,
      source_binding_state: bindingContext?.selected_document ? "PROBABLE" : "UNMATCHED",
      workflow_mode: null,
      captures: [],
      status: "CREATED",
    },
    diagnostics: [],
  };
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
export async function clearSelectedSessionIfMatches(sessionId: string): Promise<void> {
  const stored = await chrome.storage.session.get(CURRENT_SESSION_KEY);
  if (stored[CURRENT_SESSION_KEY] === sessionId)
    await chrome.storage.session.remove(CURRENT_SESSION_KEY);
}
export async function currentSessionId(): Promise<string | null> {
  const stored = await chrome.storage.session.get(CURRENT_SESSION_KEY);
  const candidate = stored[CURRENT_SESSION_KEY];
  if (typeof candidate !== "string") return null;
  const repository = new EvidenceRepository();
  if (await repository.getSession(candidate)) return candidate;
  await chrome.storage.session.remove(CURRENT_SESSION_KEY);
  return null;
}

export async function synchronizeEmptyCurrentSessionSourceContext(
  reference: CaptureSession["data"]["source_context_reference"],
): Promise<boolean> {
  const sessionId = await currentSessionId();
  if (!sessionId) return false;
  const repository = new EvidenceRepository();
  const session = await repository.getSession(sessionId);
  if (!session || session.data.captures.length > 0 || session.data.status !== "CREATED")
    return false;
  await repository.putSession({
    ...session,
    data: {
      ...session.data,
      source_context_reference: reference,
      source_binding_state:
        reference?.selected_document_id && reference.confirmation_state === "CONFIRMED"
          ? "PROBABLE"
          : "UNMATCHED",
    },
  });
  return true;
}
