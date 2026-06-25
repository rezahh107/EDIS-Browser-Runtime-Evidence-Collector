export interface LazyLoadPreparationResult {
  readonly completed: boolean;
  readonly scroll_steps: number;
  readonly initial_scroll_x: number;
  readonly initial_scroll_y: number;
  readonly restored_scroll_x: number;
  readonly restored_scroll_y: number;
  readonly initial_document_height: number;
}

const MAX_SCROLL_STEPS = 12;
const STEP_SETTLE_MS = 75;

export async function prepareFullDocumentImages(): Promise<LazyLoadPreparationResult> {
  const initialScrollX = finite(window.scrollX);
  const initialScrollY = finite(window.scrollY);
  const initialDocumentHeight = finite(document.documentElement?.scrollHeight ?? 0);
  const viewportHeight = Math.max(1, finite(window.innerHeight));
  const maximumY = Math.max(0, initialDocumentHeight - viewportHeight);
  const scrollSteps = Math.min(
    MAX_SCROLL_STEPS,
    maximumY === 0 ? 0 : Math.max(1, Math.ceil(maximumY / Math.max(1, viewportHeight * 0.8))),
  );

  try {
    for (let index = 1; index <= scrollSteps; index += 1) {
      const targetY = Math.round((maximumY * index) / scrollSteps);
      window.scrollTo({ left: initialScrollX, top: targetY, behavior: "auto" });
      await settle();
    }
  } finally {
    window.scrollTo({ left: initialScrollX, top: initialScrollY, behavior: "auto" });
    await settle();
  }

  const restoredScrollX = finite(window.scrollX);
  const restoredScrollY = finite(window.scrollY);
  return {
    completed:
      Math.abs(restoredScrollX - initialScrollX) <= 1 &&
      Math.abs(restoredScrollY - initialScrollY) <= 1,
    scroll_steps: scrollSteps,
    initial_scroll_x: initialScrollX,
    initial_scroll_y: initialScrollY,
    restored_scroll_x: restoredScrollX,
    restored_scroll_y: restoredScrollY,
    initial_document_height: initialDocumentHeight,
  };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, STEP_SETTLE_MS));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
