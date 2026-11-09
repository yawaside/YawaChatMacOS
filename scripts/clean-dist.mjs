// Полная очистка dist перед тремя последовательными сборками:
// каждая из них больше не чистит папку (см. emptyOutDir в vite.shared.ts).
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
rmSync(dist, { recursive: true, force: true });
