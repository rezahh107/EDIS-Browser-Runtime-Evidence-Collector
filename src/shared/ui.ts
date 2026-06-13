import { makeMessage, type MessageType, type ResponseMessage } from "../domain/messages";

export function localizeDocument(): void {
  const locale = chrome.i18n.getUILanguage();
  document.documentElement.lang = locale;
  document.documentElement.dir = locale.toLowerCase().startsWith("fa") ? "rtl" : "ltr";
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n;
    if (!key) continue;
    const message = chrome.i18n.getMessage(key);
    if (message) element.textContent = message;
  }
}

export async function request<T>(
  type: MessageType,
  payload?: unknown,
  timeoutMs = 15_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const responsePromise = chrome.runtime.sendMessage(makeMessage(type, payload)) as Promise<
      ResponseMessage<T>
    >;
    const response = await Promise.race([
      responsePromise,
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("Extension request timed out.")),
          { once: true },
        ),
      ),
    ]);
    if (!response.success) throw new Error(response.error.message);
    return response.data;
  } finally {
    clearTimeout(timeout);
  }
}

export function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required UI element is missing: ${selector}`);
  return element;
}

export function setStatus(
  element: HTMLElement,
  message: string,
  kind: "ready" | "working" | "complete" | "error" = "ready",
): void {
  element.textContent = message;
  element.dataset.kind = kind;
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let current = value;
  let unit = 0;
  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }
  return `${current.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function clearChildren(element: Element): void {
  while (element.firstChild) element.firstChild.remove();
}
