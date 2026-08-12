import { createPackageRegistry } from "../kernel/packageRegistry.js";
import { paragraphPackage } from "./paragraph/index.js";
import { codePackage } from "./code/index.js";
import { tablePackage } from "./table/index.js";
import { sequencePackage } from "./sequence/index.js";
import { annotatedTextPackage } from "./annotated-text/index.js";
import { linguisticExamplePackage } from "./linguistic-example/index.js";

export const RESOURCE_PACKAGE_REGISTRY = createPackageRegistry([
  paragraphPackage,
  codePackage,
  tablePackage,
  sequencePackage,
  annotatedTextPackage,
  linguisticExamplePackage
]);

export {
  annotatedTextPackage,
  codePackage,
  linguisticExamplePackage,
  paragraphPackage,
  sequencePackage,
  tablePackage
};
