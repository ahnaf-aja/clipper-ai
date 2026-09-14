import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/core/errors";
import { logger } from "@/infra/log/logger";

const log = logger("api");

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data: serialize(data) }, init);
}

export function fail(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    // Zod's default text ("Invalid input") is useless on its own once a schema
    // nests, so lead with the field that actually failed.
    const path = first?.path.join(".") ?? "";
    const message = first
      ? path
        ? `${path}: ${first.message}`
        : first.message
      : "Invalid input.";

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "validation_error",
          message,
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }

  log.error("unhandled route error", { error: String(error) });
  return NextResponse.json(
    { ok: false, error: { code: "internal_error", message: "Something went wrong on our side." } },
    { status: 500 },
  );
}

/** Wraps a route handler with consistent error handling. */
export function route<Args extends unknown[]>(
  handler: (req: Request, ...args: Args) => Promise<Response>,
) {
  return async (req: Request, ...args: Args): Promise<Response> => {
    try {
      return await handler(req, ...args);
    } catch (error) {
      return fail(error);
    }
  };
}

/** BigInt and Date are not JSON-serialisable by default. */
export function serialize<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === "bigint" ? Number(v) : v instanceof Date ? v.toISOString() : v,
    ),
  ) as T;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("Request body must be valid JSON.", 400, "bad_json");
  }
}
