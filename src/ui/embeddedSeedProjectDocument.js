import { CONTRACT_KIND_PROJECT, CONTRACT_NAME, CONTRACT_VERSION, validateContractDocument } from "../contract/validateContract.js";
import { loadEmbeddedCourseFromJson, loadEmbeddedSeedManifest } from "./embeddedSeedCourseLoader.js";

export async function loadEmbeddedSeedProjectDocument(options) {
  const manifest = await loadEmbeddedSeedManifest(options);
  const courses = await Promise.all(
    manifest.courseFiles.map((fileName) => loadEmbeddedCourseFromJson(fileName, options))
  );
  const project = {
    contract: CONTRACT_NAME,
    version: CONTRACT_VERSION,
    kind: CONTRACT_KIND_PROJECT,
    courses
  };
  const validation = validateContractDocument(project);
  if (!validation.ok) {
    const details = validation.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`Catálogo embarcado inválido: ${details}`);
  }
  return validation.value;
}
