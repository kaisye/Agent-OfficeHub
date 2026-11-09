/** Typed domain error; the API maps it to { error: { code, message } } with `status`. */
export class HubError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}
export const notFound = (what = "resource") => new HubError("not_found", `${what} not found`, 404);
export const forbidden = (code: string, message: string) => new HubError(code, message, 403);
