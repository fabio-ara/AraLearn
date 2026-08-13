import { createPackageRegistry } from "../kernel/packageRegistry.js";
import { paragraphPackage } from "./paragraph/index.js";
import { codePackage } from "./code/index.js";
import { tablePackage } from "./table/index.js";
import { sequencePackage } from "./sequence/index.js";
import { annotatedTextPackage } from "./annotated-text/index.js";
import { interlinearGlossPackage } from "./interlinear-gloss/index.js";
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
import { graphPackage } from "./graph/index.js";
import { relationMapPackage } from "./relation-map/index.js";
import { algorithmTracePackage } from "./algorithm-trace/index.js";
import { databaseSchemaPackage } from "./database-schema/index.js";
import { memoryLayoutPackage } from "./memory-layout/index.js";
import { networkTopologyPackage } from "./network-topology/index.js";
import { packetLayoutPackage } from "./packet-layout/index.js";
import { setDiagramPackage } from "./set-diagram/index.js";
import { stateMachinePackage } from "./state-machine/index.js";
import { truthTablePackage } from "./truth-table/index.js";
import { matchingResponsePackage } from "./matching-response/index.js";

export const RESOURCE_PACKAGE_REGISTRY = createPackageRegistry([
  paragraphPackage,
  codePackage,
  tablePackage,
  sequencePackage,
  annotatedTextPackage,
  interlinearGlossPackage,
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
  systemMapPackage,
  graphPackage,
  relationMapPackage,
  algorithmTracePackage,
  databaseSchemaPackage,
  memoryLayoutPackage,
  networkTopologyPackage,
  packetLayoutPackage,
  setDiagramPackage,
  stateMachinePackage,
  truthTablePackage,
  matchingResponsePackage
]);

export {
  annotatedTextPackage,
  codePackage,
  choiceResponsePackage,
  gapResponsePackage,
  interlinearGlossPackage,
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
  systemMapPackage,
  graphPackage,
  relationMapPackage,
  algorithmTracePackage,
  databaseSchemaPackage,
  memoryLayoutPackage,
  networkTopologyPackage,
  packetLayoutPackage,
  setDiagramPackage,
  stateMachinePackage,
  truthTablePackage,
  matchingResponsePackage
};
