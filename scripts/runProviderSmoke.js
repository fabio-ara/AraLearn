import { createDefaultProviderRegistry } from "../src/generation/providers/providerRegistry.js";

const registry = createDefaultProviderRegistry();
console.log(
  JSON.stringify(
    registry.list().map((provider) => ({
      id: provider.id,
      label: provider.label,
      capabilities: provider.capabilities
    })),
    null,
    2
  )
);
