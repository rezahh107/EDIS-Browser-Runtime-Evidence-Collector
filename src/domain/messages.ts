import type { CaptureConfiguration, CollectorPreferences } from "./model";

export const PROTOCOL_VERSION = "1.0.0";
export const MESSAGE_TYPES = [
  "PAGE_CHECK",
  "STATE_GET",
  "SESSION_CREATE",
  "SESSION_SELECT",
  "CAPTURE_START",
  "CAPTURE_CANCEL",
  "CAPTURE_STATUS",
  "OPEN_SIDE_PANEL",
  "OPTIONS_GET",
  "OPTIONS_SAVE",
  "CLEAR_ALL_DATA",
  "EXPORT_COMPLETE",
  "CONTENT_CONFIG_REQUEST",
  "CONTENT_CHUNK",
  "CONTENT_COMPLETE",
  "CONTENT_FAILED",
  "CONTENT_JOB_STATUS",
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export interface BaseMessage {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly type: MessageType;
  readonly requestId: string;
  readonly payload?: unknown;
}

export type ResponseMessage<T> =
  | Readonly<{ requestId: string; success: true; data: T }>
  | Readonly<{
      requestId: string;
      success: false;
      error: Readonly<{ code: string; message: string }>;
    }>;

export interface SessionCreatePayload {
  readonly name: string;
}
export interface SessionSelectPayload {
  readonly sessionId: string;
}
export interface CaptureStartPayload {
  readonly sessionId: string;
  readonly userLabel: string;
  readonly evidenceLabel:
    | "SIMULATED_VIEWPORT"
    | "USER_LABELED_VIEWPORT"
    | "OFFICIAL_MANIFEST_MATCH";
  readonly officialBreakpointId: string | null;
  readonly overrides?: Partial<CollectorPreferences>;
}
export interface CaptureCancelPayload {
  readonly jobId: string;
}
export interface ContentConfigRequestPayload {
  readonly tabUrl: string;
}
export interface ContentChunkPayload {
  readonly jobId: string;
  readonly index: number;
  readonly total: number;
  readonly data: string;
}
export interface ContentCompletePayload {
  readonly jobId: string;
  readonly total: number;
}
export interface ContentFailedPayload {
  readonly jobId: string;
  readonly code: string;
}
export interface ExportCompletePayload {
  readonly sessionId: string;
}
export interface OptionsSavePayload {
  readonly preferences: CollectorPreferences;
}

export interface ContentConfigurationResponse {
  readonly jobId: string;
  readonly configuration: CaptureConfiguration;
}

export function makeMessage(type: MessageType, payload?: unknown): BaseMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type,
    requestId: crypto.randomUUID(),
    ...(payload === undefined ? {} : { payload }),
  };
}

export function success<T>(requestId: string, data: T): ResponseMessage<T> {
  return { requestId, success: true, data };
}

export function failure(requestId: string, code: string, message: string): ResponseMessage<never> {
  return { requestId, success: false, error: { code, message } };
}
