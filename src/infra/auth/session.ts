import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { prisma } from "@/infra/db/prisma";
import { isProd } from "@/core/config";
import { Unauthorized } from "@/core/errors";

export const SESSION_COOKIE = "clipper_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

function getAuthSecret(): string {
  return process.env.AUTH_SECRET || "clipper-default-secret-key-at-least-16";
}

function signToken(userId: string, expiresAtMs: number): string {
  const secret = getAuthSecret();
  const payload = `${userId}:${expiresAtMs}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}:${sig}`;
}

function verifyToken(token: string): { userId: string; expiresAt: number } | null {
  try {
    const parts = token.split(":");
    if (parts.length !== 3) return null;
    const [userId, expiresAtStr, sig] = parts;
    const expiresAt = Number(expiresAtStr);
    if (isNaN(expiresAt) || Date.now() > expiresAt) return null;

    const secret = getAuthSecret();
    const payload = `${userId}:${expiresAtStr}`;
    const expectedSig = createHmac("sha256", secret).update(payload).digest("base64url");
    if (sig !== expectedSig) return null;

    return { userId, expiresAt };
  } catch {
    return null;
  }
}

export async function createSession(userId: string, meta?: { ip?: string; userAgent?: string }) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const token = signToken(userId, expiresAt.getTime());

  // Attempt database session creation if writable
  try {
    await prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        expiresAt,
        ip: meta?.ip ?? "",
        userAgent: (meta?.userAgent ?? "").slice(0, 250),
      },
    });
  } catch (err) {
    console.warn("Database session record skipped:", err);
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } }).catch(() => {});
  }
  jar.delete(SESSION_COOKIE);
}

/** Returns the signed-in user, or null. Never throws. */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  // 1. Try finding in the database session table
  const session = await prisma.session
    .findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } })
    .catch(() => null);

  if (session) {
    if (session.expiresAt.getTime() < Date.now()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }
    return session.user;
  }

  // 2. Serverless fallback: verify the signed HMAC token
  const verified = verifyToken(token);
  if (!verified) return null;

  const user = await prisma.user.findUnique({ where: { id: verified.userId } }).catch(() => null);
  return user;
}

/** Same as getCurrentUser but throws a 401 AppError. Use inside API routes. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw Unauthorized();
  return user;
}
