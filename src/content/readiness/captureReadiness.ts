import { normalizeFiniteNumber } from "../../domain/geometry";
import type { CaptureReadiness } from "../../domain/model";
import { createViewportImageReadinessSession } from "./viewportImages";

const SAMPLE_INTERVAL_MS = 100;
const REQUIRED_STABLE_SAMPLES = 3;

export async function observeCaptureReadiness(hardTimeoutMs: number): Promise<CaptureReadiness> {
  const boundedTimeout = Math.min(Math.max(Math.trunc(hardTimeoutMs), 0), 5_000);
  const started = performance.now();
  const initial = dimensions();
  let previous = initial;
  let stableSamples = 0;
  let sampleCount = 1;

  const imageSession = createViewportImageReadinessSession();
  try {
    const imageWaitBudget = Math.min(boundedTimeout, 1_500);
    let viewportImageReadiness = await imageSession.observe(imageWaitBudget);
    while (performance.now() - started < boundedTimeout) {
      await delay(SAMPLE_INTERVAL_MS);
      const current = dimensions();
      viewportImageReadiness = await imageSession.observe(0);
      sampleCount += 1;
      const fontsReady = !document.fonts || document.fonts.status === "loaded";
      if (
        sameDimensions(previous, current) &&
        document.readyState === "complete" &&
        fontsReady &&
        unresolvedViewportImages(viewportImageReadiness) === 0
      )
        stableSamples += 1;
      else stableSamples = 0;
      previous = current;
      if (stableSamples >= REQUIRED_STABLE_SAMPLES) break;
    }

    const elapsed = performance.now() - started;
    const timeoutReached = stableSamples < REQUIRED_STABLE_SAMPLES && elapsed >= boundedTimeout;
    const final = dimensions();
    const fonts = document.fonts;
    viewportImageReadiness = await imageSession.observe(0);
    const totalIncomplete = imageSession.countIncompleteImages();
    const animations = runningAnimationCount();
    const stable =
      stableSamples >= REQUIRED_STABLE_SAMPLES &&
      document.readyState === "complete" &&
      (!fonts || fonts.status === "loaded") &&
      unresolvedViewportImages(viewportImageReadiness) === 0;
    return {
      availability: timeoutReached ? "PARTIAL" : "AVAILABLE",
      process_state: timeoutReached ? "TIMEOUT" : stable ? "STABLE" : "UNSTABLE",
      document_ready_state: document.readyState,
      fonts_api_available: Boolean(fonts),
      fonts_status: fonts?.status ?? null,
      incomplete_image_count: totalIncomplete,
      incomplete_image_count_total: totalIncomplete,
      incomplete_image_count_in_viewport: unresolvedViewportImages(viewportImageReadiness),
      viewport_image_readiness: viewportImageReadiness,
      active_animation_count: animations,
      initial_document_width: initial.documentWidth,
      final_document_width: final.documentWidth,
      initial_document_height: initial.documentHeight,
      final_document_height: final.documentHeight,
      initial_viewport_width: initial.viewportWidth,
      final_viewport_width: final.viewportWidth,
      initial_viewport_height: initial.viewportHeight,
      final_viewport_height: final.viewportHeight,
      sample_count: sampleCount,
      settle_duration_ms: normalizeFiniteNumber(elapsed),
      hard_timeout_ms: boundedTimeout,
      timeout_reached: timeoutReached,
    };
  } catch {
    const final = dimensions();
    const viewportImageReadiness = await imageSession.observe(0).catch(() => ({
      candidate_count: 0,
      loaded_count: 0,
      broken_count: 0,
      pending_count: 0,
      decode_failed_count: 0,
      timed_out_count: 0,
      wait_time_ms: 0,
      timeout_ms: 0,
      timeout_policy_id: "edis.viewport-image-readiness",
      timeout_policy_version: 1,
    }));
    return {
      availability: "ERROR",
      process_state: "ERROR",
      document_ready_state: document.readyState,
      fonts_api_available: Boolean(document.fonts),
      fonts_status: document.fonts?.status ?? null,
      incomplete_image_count: 0,
      incomplete_image_count_total: 0,
      incomplete_image_count_in_viewport: unresolvedViewportImages(viewportImageReadiness),
      viewport_image_readiness: viewportImageReadiness,
      active_animation_count: 0,
      initial_document_width: initial.documentWidth,
      final_document_width: final.documentWidth,
      initial_document_height: initial.documentHeight,
      final_document_height: final.documentHeight,
      initial_viewport_width: initial.viewportWidth,
      final_viewport_width: final.viewportWidth,
      initial_viewport_height: initial.viewportHeight,
      final_viewport_height: final.viewportHeight,
      sample_count: sampleCount,
      settle_duration_ms: normalizeFiniteNumber(performance.now() - started),
      hard_timeout_ms: boundedTimeout,
      timeout_reached: false,
    };
  } finally {
    imageSession.dispose();
  }
}

function unresolvedViewportImages(value: CaptureReadiness["viewport_image_readiness"]): number {
  return (
    value.broken_count + value.pending_count + value.decode_failed_count + value.timed_out_count
  );
}

function runningAnimationCount(): number {
  return typeof document.getAnimations === "function"
    ? document.getAnimations().filter((animation) => animation.playState === "running").length
    : 0;
}

function dimensions(): {
  documentWidth: number;
  documentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
} {
  const root = document.documentElement;
  return {
    documentWidth: finite(root.scrollWidth),
    documentHeight: finite(root.scrollHeight),
    viewportWidth: finite(window.innerWidth),
    viewportHeight: finite(window.innerHeight),
  };
}
function sameDimensions(
  left: ReturnType<typeof dimensions>,
  right: ReturnType<typeof dimensions>,
): boolean {
  return (
    left.documentWidth === right.documentWidth &&
    left.documentHeight === right.documentHeight &&
    left.viewportWidth === right.viewportWidth &&
    left.viewportHeight === right.viewportHeight
  );
}
function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Non-finite readiness dimension.");
  return normalizeFiniteNumber(value);
}
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
