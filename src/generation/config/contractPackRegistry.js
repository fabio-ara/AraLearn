import { text } from "./engineConfigUtils.js";
import { resolveEngineProfileSection } from "./engineProfileSections.js";

export function getContractPack(packId = "", profileOrOverrides = {}, overrides = {}) {
  const contractPacks = resolveEngineProfileSection("contractPacks", profileOrOverrides, overrides, {});
  return structuredClone(contractPacks?.[text(packId)] || {});
}
