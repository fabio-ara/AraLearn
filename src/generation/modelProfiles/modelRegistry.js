import { listModelCapabilities, getModelCapabilities } from "../providers/modelCapabilities.js";

export function listRegisteredModels() {
  return listModelCapabilities();
}

export function getRegisteredModel(modelId) {
  return getModelCapabilities(modelId);
}
