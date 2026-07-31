export interface PackageInventoryExpectation {
  readonly zipPaths: ReadonlySet<string>;
  readonly checksumPaths: ReadonlySet<string>;
}

export function exactPackageInventory(
  manifestPaths: readonly string[],
): PackageInventoryExpectation {
  assertNoDuplicatePaths(manifestPaths, "Package manifest");
  return {
    zipPaths: new Set([...manifestPaths, "package-manifest.json", "checksums.sha256"]),
    checksumPaths: new Set([...manifestPaths, "package-manifest.json"]),
  };
}

export function assertExactPathSet(
  actualPaths: readonly string[],
  expectedPaths: ReadonlySet<string>,
  label: string,
): void {
  assertNoDuplicatePaths(actualPaths, label);
  const actual = new Set(actualPaths);
  const missing = [...expectedPaths].filter((path) => !actual.has(path)).sort();
  const extra = [...actual].filter((path) => !expectedPaths.has(path)).sort();
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${label} inventory mismatch: missing=[${missing.join(", ")}] extra=[${extra.join(", ")}]`,
    );
  }
}

export function assertNoDuplicatePaths(paths: readonly string[], label: string): void {
  if (new Set(paths).size !== paths.length) throw new Error(`${label} contains duplicate paths.`);
}
