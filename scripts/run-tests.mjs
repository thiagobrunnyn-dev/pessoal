// Runs every executable test file in tests/ and fails if any of them fails.
// Each file is a standalone script that signals failure through its exit code.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(join(root, "tests"))
  .filter((name) => name.endsWith(".cjs") && !name.endsWith("-harness.cjs"))
  .sort();

const failed = [];
for (const name of files) {
  console.log(`\n=== ${name}`);
  const result = spawnSync(process.execPath, [join("tests", name)], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) failed.push(name);
}

console.log(`\n${files.length - failed.length}/${files.length} test files passed`);
if (failed.length) {
  console.error(`Failed: ${failed.join(", ")}`);
  process.exit(1);
}
