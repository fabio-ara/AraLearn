import { serializeProjectDocument } from "../storage/projectStore.js";

export const EXAMPLE_SEED_VERSION = "contract-semantic-tree-v1";
export const EXAMPLE_SEED_KEY = "aralearn.example-seed.version";
export const EXAMPLE_SEED_SIGNATURE_KEY = "aralearn.example-seed.signature";

function getProjectSignature(project) {
  if (!project) {
    return "";
  }

  return serializeProjectDocument(project);
}

export function getExampleSeedSignature(seedProject) {
  return getProjectSignature(seedProject);
}

export function shouldHydrateExampleSeed({
  project,
  storedSeedVersion,
  storedSeedSignature,
  currentSeedSignature
}) {
  if (!project) {
    return true;
  }

  if (storedSeedVersion === EXAMPLE_SEED_VERSION) {
    return false;
  }

  if (typeof storedSeedSignature !== "string" || storedSeedSignature.trim() === "") {
    return false;
  }

  return getProjectSignature(project) === storedSeedSignature;
}

export function shouldStoreExampleSeedMetadata({
  project,
  storedSeedVersion,
  storedSeedSignature,
  currentSeedSignature
}) {
  if (!project) {
    return false;
  }

  return (
    getProjectSignature(project) === currentSeedSignature &&
    (storedSeedVersion !== EXAMPLE_SEED_VERSION || storedSeedSignature !== currentSeedSignature)
  );
}
