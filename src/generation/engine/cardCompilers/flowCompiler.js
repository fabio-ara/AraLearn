import { parsePipeList } from "../slotParser.js";
import { compileChoiceOptionsFromSlots } from "./choiceOptionCompiler.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseFlowStepsSlot(value = "") {
  const source = text(value);
  if (!source) {
    throw new Error("flow precisa de ao menos um passo");
  }
  if (source.includes("|")) {
    return parsePipeList(source);
  }
  if (/\b1\./u.test(source)) {
    const numbered = source
      .split(/\s*(?=\d+\.\s*)/u)
      .map((item) => item.replace(/^\d+\.\s*/u, "").trim())
      .filter(Boolean);
    if (numbered.length > 1) {
      return numbered;
    }
  }
  if (source.includes(";")) {
    const semicolons = source.split(";").map((item) => text(item)).filter(Boolean);
    if (semicolons.length > 1) {
      return semicolons;
    }
  }
  throw new Error("flow precisa listar passos com |, lista numerada ou ponto e vírgula");
}

export function compileFlowCard({ slots = {}, position = 0 }) {
  const steps = parseFlowStepsSlot(slots[3]);
  const items = steps.map((label, index) => ({
    kind: index === 0 ? "start" : index === steps.length - 1 ? "end" : "process",
    text: label
  }));
  return {
    position,
    resource: "flow",
    kind: "exercise",
    exercise: "choice",
    title: text(slots[1]),
    prompt: text(slots[2]),
    structure: {
      kind: "sequence",
      items
    },
    question: text(slots[4]),
    options: compileChoiceOptionsFromSlots(slots, 5),
    answer: text(slots[8]).toLowerCase(),
    after: text(slots[9])
  };
}
