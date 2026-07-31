import {
  VIEWPORT_IMAGE_READINESS_POLICY_ID,
  VIEWPORT_IMAGE_READINESS_POLICY_VERSION,
} from "../../domain/capturePolicy";
import { normalizeFiniteNumber } from "../../domain/geometry";
import type { ViewportImageReadinessEvidence } from "../../domain/model";
import {
  createCaptureMeasurementContext,
  type CaptureMeasurementContext,
} from "../measurements/context";
import { isEffectivelyVisibleInViewport } from "../measurements/visibility";

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

  async observe(timeoutMs: number): Promise<ViewportImageReadinessEvidence> {
    const boundedTimeout = Math.max(0, Math.min(Math.trunc(timeoutMs), 5_000));
    const started = performance.now();
    this.#refreshCandidatesFull();
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

    // Geometry and effective visibility can change without a DOM mutation. The final sample is
    // therefore always authoritative for candidate membership.
    this.#refreshCandidatesFull();

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
    this.#candidates.clear();
    this.#failed.clear();
  }

  #refreshCandidatesFull(): void {
    this.#measurementContext = createCaptureMeasurementContext(document);
    this.#candidates.clear();
    for (const image of document.images) {
      if (image.isConnected && isEffectivelyVisibleInViewport(image, this.#measurementContext))
        this.#candidates.add(image);
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
