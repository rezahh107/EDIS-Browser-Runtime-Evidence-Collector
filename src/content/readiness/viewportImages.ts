import {
  VIEWPORT_IMAGE_READINESS_POLICY_ID,
  VIEWPORT_IMAGE_READINESS_POLICY_VERSION,
} from "../../domain/capturePolicy";
import { normalizeFiniteNumber } from "../../domain/geometry";
import type { ViewportImageReadinessEvidence } from "../../domain/model";
import {
  boundingRectFor,
  createCaptureMeasurementContext,
  type CaptureMeasurementContext,
} from "../measurements/context";
import { inspectEffectiveVisibility } from "../measurements/visibility";

export interface ViewportImageReadinessSession {
  observe(timeoutMs: number): Promise<ViewportImageReadinessEvidence>;
  countIncompleteImages(): number;
  dispose(): void;
}

export function createViewportImageReadinessSession(): ViewportImageReadinessSession {
  return new ViewportImageReadinessSessionImpl();
}

export async function awaitViewportImageReadiness(
  timeoutMs: number,
): Promise<ViewportImageReadinessEvidence> {
  const session = createViewportImageReadinessSession();
  try {
    return await session.observe(timeoutMs);
  } finally {
    session.dispose();
  }
}

class ViewportImageReadinessSessionImpl implements ViewportImageReadinessSession {
  #candidates = new Set<HTMLImageElement>();
  #failed = new Set<HTMLImageElement>();
  #decodeTasks = new WeakMap<HTMLImageElement, Promise<void>>();
  #measurementContext: CaptureMeasurementContext = createCaptureMeasurementContext(document);
  #fullScanRequired = true;
  #pendingImages = new Set<HTMLImageElement>();
  #pendingVisibilityRoots = new Set<Element>();
  #removedRoots = new Set<Element>();
  #observer: MutationObserver | null = null;

  constructor() {
    if (typeof MutationObserver === "function" && document.documentElement) {
      this.#observer = new MutationObserver((records) => this.#recordMutations(records));
      this.#observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "src", "srcset"],
      });
    }
  }

  async observe(timeoutMs: number): Promise<ViewportImageReadinessEvidence> {
    const boundedTimeout = Math.max(0, Math.min(Math.trunc(timeoutMs), 5_000));
    const started = performance.now();
    this.#refreshCandidatesIfNeeded();
    const pending = [...this.#candidates].filter(
      (image) => !(image.complete && image.naturalWidth > 0),
    );
    let timedOut = false;

    if (pending.length > 0 && boundedTimeout > 0) {
      const decodes = pending.map((image) => this.#decode(image));
      await Promise.race([
        Promise.allSettled(decodes),
        new Promise<void>((resolve) =>
          setTimeout(() => {
            timedOut = true;
            resolve();
          }, boundedTimeout),
        ),
      ]);
    }

    let loadedCount = 0;
    let brokenCount = 0;
    let pendingCount = 0;
    let decodeFailedCount = 0;
    let timedOutCount = 0;
    for (const image of this.#candidates) {
      if (image.complete && image.naturalWidth > 0) loadedCount += 1;
      else if (image.complete && image.naturalWidth === 0) brokenCount += 1;
      else if (this.#failed.has(image)) decodeFailedCount += 1;
      else if (timedOut) timedOutCount += 1;
      else pendingCount += 1;
    }

    return {
      candidate_count: this.#candidates.size,
      loaded_count: loadedCount,
      broken_count: brokenCount,
      pending_count: pendingCount,
      decode_failed_count: decodeFailedCount,
      timed_out_count: timedOutCount,
      wait_time_ms: normalizeFiniteNumber(Math.max(0, performance.now() - started)),
      timeout_ms: boundedTimeout,
      timeout_policy_id: VIEWPORT_IMAGE_READINESS_POLICY_ID,
      timeout_policy_version: VIEWPORT_IMAGE_READINESS_POLICY_VERSION,
    };
  }

  countIncompleteImages(): number {
    let count = 0;
    for (const image of document.images)
      if (!(image.complete && image.naturalWidth > 0)) count += 1;
    return count;
  }

  dispose(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#candidates.clear();
    this.#failed.clear();
    this.#pendingImages.clear();
    this.#pendingVisibilityRoots.clear();
    this.#removedRoots.clear();
  }

  #refreshCandidatesIfNeeded(): void {
    if (
      !this.#fullScanRequired &&
      this.#pendingImages.size === 0 &&
      this.#pendingVisibilityRoots.size === 0 &&
      this.#removedRoots.size === 0
    )
      return;
    this.#measurementContext = createCaptureMeasurementContext(document);
    if (this.#fullScanRequired) {
      this.#candidates.clear();
      for (const image of document.images) this.#refreshImage(image);
      this.#fullScanRequired = false;
    } else {
      for (const root of this.#removedRoots)
        for (const image of [...this.#candidates])
          if (image === root || root.contains(image) || !image.isConnected)
            this.#candidates.delete(image);
      for (const root of minimalRoots(this.#pendingVisibilityRoots)) {
        if (root instanceof HTMLImageElement) this.#refreshImage(root);
        for (const image of root.querySelectorAll("img")) this.#refreshImage(image);
      }
      for (const image of this.#pendingImages) this.#refreshImage(image);
    }
    this.#pendingImages.clear();
    this.#pendingVisibilityRoots.clear();
    this.#removedRoots.clear();
  }

  #refreshImage(image: HTMLImageElement): void {
    if (image.isConnected && isEffectivelyVisibleInViewport(image, this.#measurementContext))
      this.#candidates.add(image);
    else this.#candidates.delete(image);
  }

  #recordMutations(records: readonly MutationRecord[]): void {
    for (const record of records) {
      if (record.type === "attributes") {
        if (!(record.target instanceof Element)) continue;
        if (record.target instanceof HTMLImageElement) this.#pendingImages.add(record.target);
        if (["class", "style", "hidden"].includes(record.attributeName ?? ""))
          this.#pendingVisibilityRoots.add(record.target);
        continue;
      }
      for (const node of record.removedNodes)
        if (node instanceof Element) this.#removedRoots.add(node);
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node instanceof HTMLImageElement) this.#pendingImages.add(node);
        for (const image of node.querySelectorAll("img")) this.#pendingImages.add(image);
      }
    }
  }

  #decode(image: HTMLImageElement): Promise<void> {
    const existing = this.#decodeTasks.get(image);
    if (existing) return existing;
    const task =
      typeof image.decode === "function"
        ? image.decode().catch(() => {
            this.#failed.add(image);
          })
        : Promise.resolve();
    this.#decodeTasks.set(image, task);
    return task;
  }
}

function minimalRoots(roots: ReadonlySet<Element>): readonly Element[] {
  const values = [...roots];
  return values.filter(
    (candidate, index) =>
      !values.some((other, otherIndex) => otherIndex !== index && other.contains(candidate)),
  );
}

function isEffectivelyVisibleInViewport(
  element: Element,
  context: CaptureMeasurementContext,
): boolean {
  if (!inspectEffectiveVisibility(element, context).effectiveVisible) return false;
  const rect = boundingRectFor(element, context);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}
