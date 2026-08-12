import { createPackageRegistry } from "../kernel/packageRegistry.js";
import { paragraphPackage } from "./paragraph/index.js";

export const RESOURCE_PACKAGE_REGISTRY = createPackageRegistry([
  paragraphPackage
]);

export { paragraphPackage };
