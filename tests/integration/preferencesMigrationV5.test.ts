import { describe, expect, it } from "vitest";
import { migratePreferences } from "../../src/infrastructure/storage/preferences";

describe("preferences schema 5 migration", () => {
  it.each([1, 2, 3, 4])(
    "T11_PREFERENCES_V5_MIGRATION: migrates schema %i while dropping only retainAfterExport",
    (schemaVersion) => {
      const legacy = {
        schemaVersion,
        captureIntent: "RESPONSIVE_COMPARISON",
        redactionMode: "STANDARD",
        includeScreenshot: true,
        includeHiddenElements: true,
        includePath: true,
        includePageTitle: true,
        includeColors: true,
        includeTextPreview: true,
        includeTextShape: false,
        includeInteractionFacts: false,
        includeRelationshipGraph: false,
        prepareFullDocumentImages: true,
        readinessHardTimeoutMs: 2400,
        maxTextPreviewChars: 120,
        maxElements: 1000,
        maxDepth: 40,
        maxSnapshotBytes: 16_000_000,
        retainAfterExport: schemaVersion % 2 === 0,
      };
      const migrated = migratePreferences(legacy);
      expect(migrated).not.toBeNull();
      expect(migrated?.schemaVersion).toBe(5);
      expect(migrated?.captureIntent).toBe("RESPONSIVE_COMPARISON");
      expect(migrated?.redactionMode).toBe("STANDARD");
      expect(migrated?.includeScreenshot).toBe(true);
      expect(migrated?.includeHiddenElements).toBe(true);
      expect(migrated?.includePath).toBe(true);
      expect(migrated?.includePageTitle).toBe(true);
      expect(migrated?.includeColors).toBe(true);
      expect(migrated?.includeTextPreview).toBe(true);
      expect(migrated?.includeTextShape).toBe(false);
      expect(migrated?.includeInteractionFacts).toBe(false);
      expect(migrated?.includeRelationshipGraph).toBe(false);
      expect(migrated?.prepareFullDocumentImages).toBe(true);
      expect(migrated?.readinessHardTimeoutMs).toBe(2400);
      expect(migrated?.maxTextPreviewChars).toBe(120);
      expect(migrated?.maxElements).toBe(1000);
      expect(migrated?.maxDepth).toBe(40);
      expect(migrated?.maxSnapshotBytes).toBe(16_000_000);
      expect(Object.hasOwn(migrated ?? {}, "retainAfterExport")).toBe(false);
    },
  );

  it("migrates schema-4 true and false to the same non-destructive shape", () => {
    const truthy = migratePreferences({ schemaVersion: 4, retainAfterExport: true });
    const falsy = migratePreferences({ schemaVersion: 4, retainAfterExport: false });
    expect(truthy).toEqual(falsy);
    expect(Object.hasOwn(truthy ?? {}, "retainAfterExport")).toBe(false);
  });
});
