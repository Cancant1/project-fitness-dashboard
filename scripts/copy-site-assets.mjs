import { copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist");
mkdirSync(output, { recursive: true });

const publicData = resolve(output, "data");
mkdirSync(publicData, { recursive: true });
for (const file of ["food-catalog.js", "helpers.js", "routine.js", "strength-analytics.js"]) {
  const source = resolve(root, "data", file);
  if (existsSync(source)) copyFileSync(source, resolve(publicData, file));
}

for (const file of ["Reps.html", "app.bundle.js", "styles.css", "icon-180.png"]) {
  const source = resolve(root, file);
  if (existsSync(source)) copyFileSync(source, resolve(output, file));
}

const builtEntry = resolve(output, "app.html");
if (existsSync(builtEntry)) renameSync(builtEntry, resolve(output, "index.html"));
