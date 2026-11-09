import type { ApiErrorCode } from "@officehub/shared";

/** Typed domain error; the API maps it to { error: { code, message } } with `status` (codes/statuses per shared ApiErrorCode). */
export class HubError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public status: number = 400,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}
export const notFound = (what = "resource") => new HubError("not_found", `${what} not found`, 404);
export const forbidden = (message: string) => new HubError("forbidden", message, 403);
