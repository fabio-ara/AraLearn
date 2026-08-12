import path from "node:path";
import { pathToFileURL } from "node:url";

import { RESOURCE_PACKAGE_REGISTRY } from "../src/resources/packages/index.js";

export function buildPackageValidationCases() {
  return RESOURCE_PACKAGE_REGISTRY.listCatalog().map((manifest, index) => {
    const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
      manifest.id,
      manifest.version
    );
    return {
      id: `${manifest.id}@${manifest.version}`,
      slot: manifest.slots[0],
      instance: {
        id: `package-corpus-${index + 1}`,
        package: manifest.id,
        version: manifest.version,
        data: contract.contract.example
      }
    };
  });
}

export function runResourceCorpusValidation() {
  const cases = buildPackageValidationCases().map((scenario) => {
    try {
      const instance = RESOURCE_PACKAGE_REGISTRY.normalizeInstance(
        scenario.instance,
        scenario.slot
      );
      const validation = RESOURCE_PACKAGE_REGISTRY.validateInstance(instance, scenario.slot);
      if (!validation.valid) throw new Error(validation.errors.join(" "));
      RESOURCE_PACKAGE_REGISTRY.renderInstance(instance, scenario.slot);
      const accessibleText = RESOURCE_PACKAGE_REGISTRY.accessibleText(instance, scenario.slot);
      if (!accessibleText) throw new Error("O package não produziu texto acessível.");
      return { id: scenario.id, slot: scenario.slot, ok: true };
    } catch (error) {
      return {
        id: scenario.id,
        slot: scenario.slot,
        ok: false,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  });
  const passed = cases.filter(({ ok }) => ok).length;
  return {
    contract: "aralearn.package-corpus-validation.v1",
    source: "contratos autorais dos packages instalados no registry",
    ok: passed === cases.length,
    totals: { cases: cases.length, passed, failed: cases.length - passed },
    packages: RESOURCE_PACKAGE_REGISTRY.listCatalog().map(({ id, version }) => ({ id, version })),
    cases
  };
}

export function main() {
  const report = runResourceCorpusValidation();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  return report;
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (entryPoint === import.meta.url) main();
