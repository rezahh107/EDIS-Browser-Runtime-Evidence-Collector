import type {
  CaptureConfiguration,
  CaptureIntent,
  CaptureWorkflowMode,
  CollectorPreferences,
  RequestedViewportProfile,
} from "./model";
import { nextRequestId } from "./identifiers";

export const PROTOCOL_VERSION = "1.3.0";
export const MESSAGE_TYPES = [
  "PAGE_CHECK",
  "PAGE_PROBE",
  "PYTHON_FEED_CAPTURE_CHECK",
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
  "SOURCE_CONTEXT_IMPORT",
  "SOURCE_CONTEXT_GET",
  "SOURCE_CONTEXT_CLEAR",
  "SOURCE_CONTEXT_SELECT_DOCUMENT",
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
  readonly evidenceLabel: "SIMULATED_VIEWPORT" | "USER_LABELED_VIEWPORT";
  readonly requestedProfileId: RequestedViewportProfile;
  readonly workflowMode: CaptureWorkflowMode;
  readonly captureIntent?: CaptureIntent;
  readonly overrides?: Partial<CollectorPreferences>;
}
export interface PythonFeedCaptureCheckPayload {
  readonly sessionId: string;
  readonly requestedProfileId: RequestedViewportProfile;
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
  readonly sha256: string;
  readonly byteLength: number;
}
export interface ContentCompletePayload {
  readonly jobId: string;
  readonly total: number;
  readonly snapshotSha256: string;
  readonly byteLength: number;
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
export interface SourceContextImportPayload {
  readonly text: string;
  readonly selectedDocumentId: string | null;
}
export interface SourceContextSelectDocumentPayload {
  readonly documentId: string | null;
}

export interface MessagePayloadMap {
  readonly PAGE_CHECK: undefined;
  readonly PAGE_PROBE: undefined;
  readonly PYTHON_FEED_CAPTURE_CHECK: PythonFeedCaptureCheckPayload;
  readonly STATE_GET: undefined;
  readonly SESSION_CREATE: SessionCreatePayload;
  readonly SESSION_SELECT: SessionSelectPayload;
  readonly CAPTURE_START: CaptureStartPayload;
  readonly CAPTURE_CANCEL: CaptureCancelPayload;
  readonly CAPTURE_STATUS: CaptureCancelPayload;
  readonly OPEN_SIDE_PANEL: undefined;
  readonly OPTIONS_GET: undefined;
  readonly OPTIONS_SAVE: OptionsSavePayload;
  readonly CLEAR_ALL_DATA: undefined;
  readonly EXPORT_COMPLETE: ExportCompletePayload;
  readonly SOURCE_CONTEXT_IMPORT: SourceContextImportPayload;
  readonly SOURCE_CONTEXT_GET: undefined;
  readonly SOURCE_CONTEXT_CLEAR: undefined;
  readonly SOURCE_CONTEXT_SELECT_DOCUMENT: SourceContextSelectDocumentPayload;
  readonly CONTENT_CONFIG_REQUEST: ContentConfigRequestPayload;
  readonly CONTENT_CHUNK: ContentChunkPayload;
  readonly CONTENT_COMPLETE: ContentCompletePayload;
  readonly CONTENT_FAILED: ContentFailedPayload;
  readonly CONTENT_JOB_STATUS: CaptureCancelPayload;
}

export type NoPayloadMessageType = {
  [K in MessageType]: MessagePayloadMap[K] extends undefined ? K : never;
}[MessageType];
export type PayloadMessageType = Exclude<MessageType, NoPayloadMessageType>;
export interface ContentConfigurationResponse {
  readonly jobId: string;
  readonly configuration: CaptureConfiguration;
}

export function makeMessage(type: NoPayloadMessageType): BaseMessage;
export function makeMessage<M extends PayloadMessageType>(
  type: M,
  payload: MessagePayloadMap[M],
): BaseMessage;
export function makeMessage(type: MessageType, payload?: unknown): BaseMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type,
    requestId: nextRequestId(type),
    ...(payload === undefined ? {} : { payload }),
  };
}
export function success<T>(requestId: string, data: T): ResponseMessage<T> {
  return { requestId, success: true, data };
}
export function failure(requestId: string, code: string, message: string): ResponseMessage<never> {
  return { requestId, success: false, error: { code, message } };
}

export class ResponseEnvelopeError extends Error {
  readonly code = "EDIS_RUNTIME_MALFORMED_RESPONSE";
  readonly failureBoundary = "RESPONSE_ENVELOPE_VALIDATION_FAILURE" as const;

  constructor(message: string) {
    super(message);
    this.name = "ResponseEnvelopeError";
  }
}

export function validateResponseEnvelope<T>(
  value: unknown,
  expectedRequestId: string,
): ResponseMessage<T> {
  if (!isResponseRecord(value))
    throw new ResponseEnvelopeError("Malformed extension response envelope.");
  if (value.requestId !== expectedRequestId)
    throw new ResponseEnvelopeError("Extension response correlation failed.");
  if (value.success === true) {
    if (!hasOnlyResponseKeys(value, ["requestId", "success", "data"]) || !("data" in value))
      throw new ResponseEnvelopeError("Malformed extension success response.");
    return value as ResponseMessage<T>;
  }
  if (value.success === false) {
    if (
      !hasOnlyResponseKeys(value, ["requestId", "success", "error"]) ||
      !isErrorEnvelope(value.error)
    )
      throw new ResponseEnvelopeError("Malformed extension error response.");
    return value as ResponseMessage<T>;
  }
  throw new ResponseEnvelopeError("Malformed extension response success flag.");
}

function isResponseRecord(
  value: unknown,
): value is Record<string, unknown> & { requestId: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).requestId === "string"
  );
}

function hasOnlyResponseKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function isErrorEnvelope(
  value: unknown,
): value is { readonly code: string; readonly message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    hasOnlyResponseKeys(value as Record<string, unknown>, ["code", "message"]) &&
    typeof (value as Record<string, unknown>).code === "string" &&
    /^EDIS_[A-Z0-9_]{1,120}$/.test((value as Record<string, unknown>).code as string) &&
    typeof (value as Record<string, unknown>).message === "string" &&
    ((value as Record<string, unknown>).message as string).length > 0 &&
    ((value as Record<string, unknown>).message as string).length <= 500
  );
}
