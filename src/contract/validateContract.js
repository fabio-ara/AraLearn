import {
  PROJECT_CONTRACT as CONTRACT_NAME,
  validateProjectDocument
} from "../domain/aralearnProject.js";

export { CONTRACT_NAME };

export function validateContractDocument(document) {
  return validateProjectDocument(document);
}
