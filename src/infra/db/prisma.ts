import { PrismaClient } from "@prisma/client";
import { isProd } from "@/core/config";
import fs from "node:fs";
import path from "node:path";

function resolveDatabaseUrl(): string {
  if (process.env.VERCEL) {
    const tmpDb = "/tmp/dev.db";
    if (!fs.existsSync(tmpDb)) {
      const candidates = [
        path.join(process.cwd(), "prisma", "dev.db"),
        path.join(process.cwd(), "dev.db"),
        "/var/task/prisma/dev.db",
        "/var/task/dev.db",
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          try {
            fs.copyFileSync(candidate, tmpDb);
            break;
          } catch (err) {
            console.error("Failed to copy SQLite database to /tmp:", err);
          }
        }
      }
    }
    return `file:${tmpDb}`;
  }
  return process.env.DATABASE_URL || "file:./dev.db";
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: resolveDatabaseUrl(),
      },
    },
    log: isProd ? ["error"] : ["error", "warn"],
  });

if (!isProd) globalForPrisma.prisma = prisma;
