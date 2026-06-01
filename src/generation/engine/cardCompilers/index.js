import { validateCard } from "../../../domain/cards.js";
import { compileParagraphCard } from "./paragraphCompiler.js";
import { compileChoiceCard } from "./choiceCompiler.js";
import { compileCompositeCard } from "./compositeCompiler.js";
import { compileMatrixCard } from "./matrixCompiler.js";
import { compilePlaneCard } from "./planeCompiler.js";
import { compileGraphCard } from "./graphCompiler.js";
import { compileFlowCard } from "./flowCompiler.js";
import { compileTreeCard } from "./treeCompiler.js";
import { compileRelationMapCard } from "./relationMapCompiler.js";
import { compileTableCard } from "./tableCompiler.js";
import { compileCodeCard } from "./codeCompiler.js";
import { normalizeQuotedTextValue, validateCompiledCardSemantics } from "../templateSemanticValidation.js";

const COMPILERS = Object.freeze({
  paragraph_theory: compileParagraphCard,
  paragraph_gap: compileParagraphCard,
  choice_exercise: compileChoiceCard,
  composite_graph_compare_choice: compileCompositeCard,
  matrix_theory: compileMatrixCard,
  matrix_locate_cell_choice: compileMatrixCard,
  plane_vector: compilePlaneCard,
  plane_sum: compilePlaneCard,
  graph_simple: compileGraphCard,
  flow_linear: compileFlowCard,
  tree_path: compileTreeCard,
  relation_map_simple: compileRelationMapCard,
  table_theory: compileTableCard,
  table_choice: compileTableCard,
  code_theory: compileCodeCard,
  code_choice: compileCodeCard
});

export function compileCardFromTemplate({ templateId = "", slots = {}, position = 0, planItem = {}, context = {} }) {
  const compiler = COMPILERS[templateId];
  if (!compiler) {
    throw new Error(`Template sem compiler: ${templateId}.`);
  }
  const normalizedSlots = Object.fromEntries(
    Object.entries(slots || {}).map(([slotIndex, value]) => [
      slotIndex,
      typeof value === "string" ? normalizeQuotedTextValue(value) : value
    ])
  );
  const card = compiler({ templateId, slots: normalizedSlots, position, planItem, context });
  const semanticResult = validateCompiledCardSemantics(card, {
    templateId,
    slotPacket: { position, slots: normalizedSlots },
    planItem
  });
  if ((templateId === "matrix_locate_cell_choice" || templateId === "graph_simple" || templateId === "relation_map_simple" || templateId === "flow_linear") && semanticResult?.computedAnswer) {
    card.answer = semanticResult.computedAnswer;
  }
  const validation = validateCard(card);
  if (!validation.ok) {
    throw new Error(validation.errors.map((error) => `${error.path}: ${error.message}`).join("; "));
  }
  const { id: _ignoredId, ...normalizedCard } = validation.value;
  return normalizedCard;
}
