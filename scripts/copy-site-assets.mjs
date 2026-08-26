import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist");
mkdirSync(output, { recursive: true });

for (const directory of ["data", "components", "vendor", "uploads"]) {
  const source = resolve(root, directory);
  if (existsSync(source)) cpSync(source, resolve(output, directory), { recursive: true });
}

for (const file of ["Reps.html", "Reps-migration.html", "app.bundle.js", "app.jsx", "styles.css", "icon-180.png"]) {
  const source = resolve(root, file);
  if (existsSync(source)) cpSync(source, resolve(output, file));
}
