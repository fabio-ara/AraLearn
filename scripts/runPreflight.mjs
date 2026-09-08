import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A mesma preparação é usada localmente, em PRs draft e antes da integral.
export const preflightCommands = [
  ["buildReadableReferences.mjs", "--check"],
  ["buildVegaInterpreterVendor.mjs", "--check"],
  ["buildBibliographyVendor.mjs", "--check"],
  ["syncEdgeResourceRuntime.mjs", "--check"],
  ["buildResourceCatalogCourse.mjs", "--check"],
  ["buildResourceGalleryFixture.mjs", "--check"],
  ["buildChatGptActionOpenApi.mjs", "--check"],
  ["auditCurrentArchitecture.mjs"],
  ["auditTerminology.mjs"],
  ["auditFrontendStyles.mjs"],
  ["auditFrontendResidues.mjs"],
  ["auditVerticalParity.mjs"],
  ["auditChoicePromptDuplication.mjs", "--check"],
  ["auditDocumentation.mjs"]
];

export function runPreflight(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  for (const [script, ...args] of preflightCommands) {
    const result = spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], { cwd: root, stdio: "inherit" });
    if (result.error || result.status !== 0) return result.status || 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  process.exitCode = runPreflight();
}
