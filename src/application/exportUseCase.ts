import { downloadBytes } from "../infrastructure/download";
import { buildEvidencePackage } from "../infrastructure/packageBuilder";
import { EvidenceRepository } from "../infrastructure/storage/indexedDb";
import { loadPreferences } from "../infrastructure/storage/preferences";

export async function exportSession(
  sessionId: string,
): Promise<{ filename: string; entryCount: number }> {
  const repository = new EvidenceRepository();
  const session = await repository.getSession(sessionId);
  if (!session) throw new Error("Session not found.");
  const snapshots = await repository.listSnapshotsBySession(sessionId);
  const screenshots = [];
  for (const snapshot of snapshots) {
    const record = await repository.getScreenshot(snapshot.data.snapshot_id);
    if (record) screenshots.push(record);
  }
  const built = await buildEvidencePackage({ session, snapshots, screenshots });
  downloadBytes(built.bytes, built.filename, "application/zip");
  const preferences = await loadPreferences();
  if (!preferences.retainAfterExport) await repository.deleteSessionArtifacts(sessionId);
  return { filename: built.filename, entryCount: built.entryCount };
}
