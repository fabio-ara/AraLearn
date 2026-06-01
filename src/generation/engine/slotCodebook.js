const FAMILY_RANGES = Object.freeze([
  ["resource", 100, 199],
  ["operation", 200, 299],
  ["questionKind", 300, 399],
  ["probableMistake", 400, 499],
  ["feedbackKind", 500, 599],
  ["flowTemplate", 600, 699],
  ["graphTemplate", 700, 799],
  ["planeTemplate", 800, 899],
  ["treeTemplate", 900, 999],
  ["relationMapTemplate", 1000, 1099],
  ["didacticMove", 1100, 1199],
  ["auditAction", 1200, 1299]
]);

const CODEBOOK = Object.freeze([
  [101, "paragraph", "resource"],
  [102, "choice", "resource"],
  [103, "matrix", "resource"],
  [104, "table", "resource"],
  [105, "code", "resource"],
  [106, "flow", "resource"],
  [107, "tree", "resource"],
  [108, "graph", "resource"],
  [109, "plane", "resource"],
  [110, "relation_map", "resource"],
  [111, "composite", "resource"],

  [201, "explain_text", "operation"],
  [202, "fill_gap", "operation"],
  [203, "ask_choice", "operation"],
  [204, "locate_cell", "operation"],
  [205, "show_matrix", "operation"],
  [206, "compare_cells", "operation"],
  [207, "transpose_matrix", "operation"],
  [208, "show_table", "operation"],
  [209, "show_code", "operation"],
  [210, "show_flow", "operation"],
  [211, "show_tree", "operation"],
  [212, "show_graph", "operation"],
  [213, "show_relation_map", "operation"],
  [214, "show_plane_vector", "operation"],
  [215, "show_plane_sum", "operation"],
  [216, "show_code_output", "operation"],
  [217, "show_table_case", "operation"],
  [218, "compare_graph_pair", "operation"],

  [301, "identify_cell_position", "questionKind"],
  [302, "choose_correct_value", "questionKind"],
  [303, "complete_statement", "questionKind"],
  [304, "recognize_rule", "questionKind"],
  [305, "classify_case", "questionKind"],
  [306, "identify_relation", "questionKind"],
  [307, "identify_path", "questionKind"],
  [308, "identify_node", "questionKind"],
  [309, "identify_vector", "questionKind"],
  [310, "identify_output", "questionKind"],

  [401, "none", "probableMistake"],
  [402, "confused_row_with_column", "probableMistake"],
  [403, "confused_value_with_position", "probableMistake"],
  [404, "skipped_visual_case", "probableMistake"],
  [405, "confused_operation_with_result", "probableMistake"],
  [406, "confused_node_with_edge", "probableMistake"],
  [407, "confused_parent_with_child", "probableMistake"],
  [408, "confused_left_with_right_set", "probableMistake"],
  [409, "confused_axis_order", "probableMistake"],
  [410, "confused_condition_flow", "probableMistake"],
  [411, "confused_code_order", "probableMistake"],

  [501, "neutral_confirmation", "feedbackKind"],
  [502, "explain_row_before_column", "feedbackKind"],
  [503, "explain_value_does_not_change", "feedbackKind"],
  [504, "ask_review_prerequisite", "feedbackKind"],
  [505, "explain_edge_connection", "feedbackKind"],
  [506, "explain_tree_parent", "feedbackKind"],
  [507, "explain_relation_pair", "feedbackKind"],
  [508, "explain_vector_components", "feedbackKind"],
  [509, "explain_condition_path", "feedbackKind"],
  [510, "explain_code_trace", "feedbackKind"],

  [601, "linear_flow", "flowTemplate"],
  [602, "decision_flow", "flowTemplate"],
  [603, "loop_flow", "flowTemplate"],

  [701, "simple_path_graph", "graphTemplate"],
  [702, "simple_cycle_graph", "graphTemplate"],
  [703, "star_graph", "graphTemplate"],
  [704, "disconnected_graph", "graphTemplate"],

  [801, "vector_from_origin", "planeTemplate"],
  [802, "two_vectors_sum", "planeTemplate"],
  [803, "scalar_multiply", "planeTemplate"],
  [804, "distance_between_points", "planeTemplate"],
  [805, "point_pair", "planeTemplate"],

  [901, "path_tree", "treeTemplate"],
  [902, "folder_file_tree", "treeTemplate"],
  [903, "concept_hierarchy_tree", "treeTemplate"],

  [1001, "simple_pair_relation", "relationMapTemplate"],
  [1002, "one_to_many_relation", "relationMapTemplate"],
  [1003, "many_to_one_relation", "relationMapTemplate"],
  [1004, "relation_table", "relationMapTemplate"],

  [1101, "introduce_rule", "didacticMove"],
  [1102, "materialize_example", "didacticMove"],
  [1103, "closed_practice", "didacticMove"],
  [1104, "vary_case", "didacticMove"],
  [1105, "correct_common_error", "didacticMove"],
  [1106, "consolidate", "didacticMove"],
  [1107, "return_to_main_track", "didacticMove"],
  [1108, "bridge_from_dependency", "didacticMove"],
  [1109, "split_dense_theory", "didacticMove"],

  [1201, "ok", "auditAction"],
  [1202, "replace_slot", "auditAction"],
  [1203, "ask_missing_slot", "auditAction"],
  [1204, "simplify_template", "auditAction"],
  [1205, "mark_needs_review", "auditAction"],
  [1206, "fail_closed", "auditAction"],
  [1207, "split_theory", "auditAction"],
  [1208, "reduce_choice_overuse", "auditAction"],
  [1209, "improve_feedback", "auditAction"],
  [1210, "improve_distractor", "auditAction"]
]);

const CODE_MAP = new Map(CODEBOOK.map(([code, id, family]) => [code, { code, id, family }]));

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function decodeCode(code) {
  return CODE_MAP.get(Number(code)) || null;
}

export function isCodeKnown(code) {
  return CODE_MAP.has(Number(code));
}

export function getFamilyForCode(code) {
  const item = decodeCode(code);
  return item?.family || null;
}

export function assertCodeFamily(code, family) {
  const decoded = decodeCode(code);
  if (!decoded) {
    throw new Error(`Código desconhecido: ${code}.`);
  }
  if (decoded.family !== family) {
    throw new Error(`Código ${code} pertence à família ${decoded.family}, não ${family}.`);
  }
  return decoded;
}

export function listCodesByFamily(family) {
  return CODEBOOK
    .filter(([, , itemFamily]) => itemFamily === family)
    .map(([code, id, itemFamily]) => ({ code, id, family: itemFamily }));
}

export function formatCodebookForPrompt(families = []) {
  const selectedFamilies = Array.isArray(families) && families.length
    ? families.map(text).filter(Boolean)
    : FAMILY_RANGES.map(([family]) => family);
  return selectedFamilies
    .map((family) => {
      const codes = listCodesByFamily(family).map((item) => `${item.code} ${item.id}`);
      return `${family}:\n${codes.map((line) => `- ${line}`).join("\n")}`;
    })
    .join("\n\n");
}

export function listCodebookEntries() {
  return CODEBOOK.map(([code, id, family]) => ({ code, id, family }));
}

export function familyFromNumericCode(code) {
  const numeric = Number(code);
  return FAMILY_RANGES.find(([, start, end]) => numeric >= start && numeric <= end)?.[0] || null;
}
