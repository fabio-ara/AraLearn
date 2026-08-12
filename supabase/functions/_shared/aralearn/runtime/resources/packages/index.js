import { createPackageRegistry } from "../kernel/packageRegistry.js";
import { paragraphPackage } from "./paragraph/index.js";
import { codePackage } from "./code/index.js";
import { tablePackage } from "./table/index.js";
import { sequencePackage } from "./sequence/index.js";
import { annotatedTextPackage } from "./annotated-text/index.js";
import { linguisticExamplePackage } from "./linguistic-example/index.js";
import { choiceResponsePackage } from "./choice-response/index.js";
import { gapResponsePackage } from "./gap-response/index.js";
import { orderingResponsePackage } from "./ordering-response/index.js";
import { treePackage } from "./tree/index.js";
import { matrixPackage } from "./matrix/index.js";
import { reactionPackage } from "./reaction/index.js";
import { flowPackage } from "./flow/index.js";
import { formulaPackage } from "./formula/index.js";
import { planePackage } from "./plane/index.js";
import { chartPackage } from "./chart/index.js";
import { systemMapPackage } from "./system-map/index.js";

export const RESOURCE_PACKAGE_REGISTRY = createPackageRegistry([
  paragraphPackage,
  codePackage,
  tablePackage,
  sequencePackage,
  annotatedTextPackage,
  linguisticExamplePackage,
  choiceResponsePackage,
  gapResponsePackage,
  orderingResponsePackage,
  treePackage,
  matrixPackage,
  reactionPackage,
  flowPackage,
  formulaPackage,
  planePackage,
  chartPackage,
  systemMapPackage
]);

export {
  annotatedTextPackage,
  codePackage,
  choiceResponsePackage,
  gapResponsePackage,
  linguisticExamplePackage,
  paragraphPackage,
  orderingResponsePackage,
  sequencePackage,
  tablePackage,
  treePackage,
  matrixPackage,
  reactionPackage,
  flowPackage,
  formulaPackage,
  planePackage,
  chartPackage,
  systemMapPackage
};
