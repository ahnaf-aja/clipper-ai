export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status = 400, code = "bad_request", details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Unauthorized = (m = "You need to sign in to continue.") =>
  new AppError(m, 401, "unauthorized");
export const Forbidden = (m = "You don't have access to this resource.") =>
  new AppError(m, 403, "forbidden");
export const NotFound = (m = "Resource not found.") => new AppError(m, 404, "not_found");
export const Conflict = (m: string) => new AppError(m, 409, "conflict");
export const TooMany = (m = "Too many requests. Please slow down.") =>
  new AppError(m, 429, "rate_limited");
export const Invalid = (m: string, details?: unknown) =>
  new AppError(m, 422, "validation_error", details);
export const PaymentRequired = (m: string) => new AppError(m, 402, "payment_required");
