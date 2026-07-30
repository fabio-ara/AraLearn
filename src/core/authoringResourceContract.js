import {
  AUTHORING_RESOURCE_CONTRACT_VERSION,
  getAuthoringResourceContract as getAuthoringMetadata,
  getCardResourceDefinition,
  listAuthoringResourceContracts
} from "../resources/registry/index.js";

export {
  AUTHORING_RESOURCE_CONTRACT_VERSION,
  listAuthoringResourceContracts
};

export function getAuthoringResourceContract(resource) {
  const authoring = getAuthoringMetadata(resource);
  const definition = getCardResourceDefinition(String(resource || "").trim());
  if (!authoring || !definition) return null;
  return {
    ...structuredClone(authoring),
    authoringSchema: structuredClone(definition.authoringSchema),
    schemaRole:
      "JSON Schema estrutural de entrada autoral; a aceitação final inclui validação semântica do domínio."
  };
}
