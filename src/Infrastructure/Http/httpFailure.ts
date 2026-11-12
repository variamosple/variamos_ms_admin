import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";

interface FailedResponse {
  status?: unknown;
  data?: unknown;
}

/**
 * Response carried by a failed HTTP call (axios puts it in `response`).
 * Read without trusting the shape: a `catch` receives `unknown`.
 */
function responseOf(error: unknown): FailedResponse | undefined {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return undefined;
  }
  const { response } = error;
  return typeof response === "object" && response !== null
    ? response
    : undefined;
}

/** HTTP status of a failed call, undefined when no response came back. */
export function httpStatus(error: unknown): unknown {
  return responseOf(error)?.status;
}

/** What to log of a failed call: the response body, else the error message. */
export function httpFailure(error: unknown): unknown {
  const data = responseOf(error)?.data;
  return data ? data : errorMessage(error) || "Unknown error";
}

/** The `message` field of the response body, else the error message. */
export function httpFailureMessage(error: unknown): string {
  const data = responseOf(error)?.data;
  const apiMessage =
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof data.message === "string"
      ? data.message
      : "";
  return apiMessage || errorMessage(error) || "Unknown error";
}
