"use client";

export type ApiError = { code: string; message: string; details?: unknown };

export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly api: ApiError,
  ) {
    super(api.message);
    this.name = "RequestError";
  }
}

type Options = RequestInit & { retries?: number; timeoutMs?: number };

/**
 * Typed fetch wrapper: JSON in/out, consistent error objects, timeout, and
 * bounded retry with backoff for idempotent requests only.
 */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { retries, timeoutMs = 45_000, ...init } = options;
  const method = (init.method ?? "GET").toUpperCase();
  const maxAttempts = (retries ?? (method === "GET" ? 2 : 0)) + 1;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(path, {
        ...init,
        signal: controller.signal,
        headers: {
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...init.headers,
        },
      });

      const payload = (await res.json().catch(() => null)) as
        | { ok: true; data: T }
        | { ok: false; error: ApiError }
        | null;

      if (!res.ok || !payload || payload.ok === false) {
        const err = payload && payload.ok === false
          ? payload.error
          : { code: "network_error", message: `Request failed (${res.status}).` };
        // Only retry on transient server errors.
        if (res.status >= 500 && attempt < maxAttempts - 1) {
          lastError = new RequestError(res.status, err);
          await sleep(300 * 2 ** attempt);
          continue;
        }
        throw new RequestError(res.status, err);
      }

      return payload.data;
    } catch (err) {
      if (err instanceof RequestError) throw err;
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await sleep(300 * 2 ** attempt);
        continue;
      }
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "The request timed out. Check your connection and try again."
          : "Could not reach the server. Check your connection.";
      throw new RequestError(0, { code: "network_error", message });
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

export const post = <T,>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const patch = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });

export const del = <T,>(path: string) => api<T>(path, { method: "DELETE" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const errorMessage = (err: unknown): string =>
  err instanceof RequestError
    ? err.message
    : err instanceof Error
      ? err.message
      : "Something went wrong.";
