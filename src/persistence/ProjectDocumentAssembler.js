import {
  relationalRowsToContract,
  relationalRowsToMicrosequenceFragment
} from "./relationalRowsToContract.js";

export class ProjectDocumentAssembler {
  constructor({ validate = true } = {}) {
    this.validate = validate;
  }

  assemble(rows) {
    return relationalRowsToContract(rows, { validate: this.validate });
  }

  assembleMicrosequence(rows, microsequenceIdentity = null) {
    return relationalRowsToMicrosequenceFragment(rows, microsequenceIdentity, { validate: this.validate });
  }
}

export function assembleProjectDocument(rows, options = {}) {
  return new ProjectDocumentAssembler(options).assemble(rows);
}
