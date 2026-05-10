export const EXAMPLE_SEED_VERSION = "contract-semantic-tree-v2";
export const EXAMPLE_SEED_KEY = "aralearn.example-seed.version";

export function shouldHydrateExampleSeed({
  project,
  storedSeedVersion
}) {
  return !project && storedSeedVersion !== EXAMPLE_SEED_VERSION;
}

export function shouldStoreExampleSeedMetadata({
  project,
  storedSeedVersion
}) {
  return !!project && storedSeedVersion !== EXAMPLE_SEED_VERSION;
}
