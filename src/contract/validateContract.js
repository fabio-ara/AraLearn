import {
  PROJECT_CONTRACT as CONTRACT_NAME,
  PROJECT_VERSION as CONTRACT_VERSION,
  validateProjectDocument
} from "../domain/aralearnProject.js";

export { CONTRACT_NAME, CONTRACT_VERSION };
export const CONTRACT_KIND_PROJECT = "project";

export function validateContractDocument(document) {
  return validateProjectDocument(document);
}
