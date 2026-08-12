import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDirectories = [
  path.resolve(__dirname, "../tests/kernel"),
  path.resolve(__dirname, "../tests/v4")
];

const files = testDirectories.flatMap((testsDir) => fs.readdirSync(testsDir)
  .filter((fileName) => fileName.endsWith(".test.js"))
  .sort()
  .map((fileName) => path.join(testsDir, fileName)));

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit"
});

process.exit(typeof result.status === "number" ? result.status : 1);
