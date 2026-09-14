import "server-only";
import { mkdir, stat, rm } from "node:fs/promises";
import path from "node:path";
import { config } from "@/core/config";

export function storageRoot(): string {
  return path.resolve(process.cwd(), config().STORAGE_DIR);
}

export async function projectDir(projectId: string): Promise<string> {
  const dir = path.join(storageRoot(), "projects", safe(projectId));
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function clipDir(clipId: string): Promise<string> {
  const dir = path.join(storageRoot(), "clips", safe(clipId));
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function fileSize(filePath: string): Promise<number> {
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
}

export async function removeDir(dir: string) {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

/** Prevents path traversal from any id that ever reaches the filesystem. */
function safe(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9_-]/g, "");
  if (!cleaned) throw new Error("Invalid storage id");
  return cleaned;
}

/** Ensures a resolved path stays inside the storage root. */
export function assertInsideStorage(target: string) {
  const root = storageRoot();
  const resolved = path.resolve(target);
  if (!resolved.startsWith(root)) throw new Error("Path escapes storage root");
  return resolved;
}
