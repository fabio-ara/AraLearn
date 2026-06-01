export const TEMPLATE_CATALOG = Object.freeze({
  paragraph_theory: {
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "text" },
      { index: 3, label: "after" }
    ]
  },
  paragraph_gap: {
    resource: "paragraph",
    kind: "exercise",
    exercise: "gap",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "promptPrefix" },
      { index: 3, label: "answer" },
      { index: 4, label: "distractor1" },
      { index: 5, label: "distractor2" },
      { index: 6, label: "after" }
    ]
  },
  choice_exercise: {
    resource: "choice",
    kind: "exercise",
    exercise: "choice",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "question" },
      { index: 3, label: "optionA" },
      { index: 4, label: "optionB" },
      { index: 5, label: "optionC" },
      { index: 6, label: "answerId" },
      { index: 7, label: "after" }
    ]
  },
  composite_graph_compare_choice: {
    resource: "composite",
    kind: "exercise",
    exercise: "choice",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "introText" },
      { index: 3, label: "graph1Title" },
      { index: 4, label: "graph1Vertices" },
      { index: 5, label: "graph1Edges" },
      { index: 6, label: "graph2Title" },
      { index: 7, label: "graph2Vertices" },
      { index: 8, label: "graph2Edges" },
      { index: 9, label: "question" },
      { index: 10, label: "optionA" },
      { index: 11, label: "optionB" },
      { index: 12, label: "optionC" },
      { index: 13, label: "answerId" },
      { index: 14, label: "after" }
    ]
  },
  matrix_theory: {
    resource: "matrix",
    kind: "theory",
    exercise: "none",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "prompt" },
      { index: 3, label: "name" },
      { index: 4, label: "row1" },
      { index: 5, label: "row2" },
      { index: 6, label: "after" }
    ]
  },
  matrix_locate_cell_choice: {
    resource: "matrix",
    kind: "exercise",
    exercise: "choice",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "prompt" },
      { index: 3, label: "name" },
      { index: 4, label: "row1" },
      { index: 5, label: "row2" },
      { index: 6, label: "targetRow" },
      { index: 7, label: "targetCol" },
      { index: 8, label: "question" },
      { index: 9, label: "optionA" },
      { index: 10, label: "optionB" },
      { index: 11, label: "optionC" },
      { index: 12, label: "after" }
    ]
  },
  plane_vector: {
    resource: "plane",
    kind: "exercise",
    exercise: "choice",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "prompt" },
      { index: 3, label: "vector" },
      { index: 4, label: "question" },
      { index: 5, label: "optionA" },
      { index: 6, label: "optionB" },
      { index: 7, label: "optionC" },
      { index: 8, label: "answerId" },
      { index: 9, label: "after" }
    ]
  },
  plane_sum: {
    resource: "plane",
    kind: "exercise",
    exercise: "choice",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "prompt" },
      { index: 3, label: "vector1" },
      { index: 4, label: "vector2" },
      { index: 5, label: "question" },
      { index: 6, label: "optionA" },
      { index: 7, label: "optionB" },
      { index: 8, label: "optionC" },
      { index: 9, label: "answerId" },
      { index: 10, label: "after" }
    ]
  },
  graph_simple: {
    resource: "graph",
    kind: "exercise",
    exercise: "choice",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "prompt" },
      { index: 3, label: "vertices" },
      { index: 4, label: "edges" },
      { index: 5, label: "question" },
      { index: 6, label: "optionA" },
      { index: 7, label: "optionB" },
      { index: 8, label: "optionC" },
      { index: 9, label: "answerId" },
      { index: 10, label: "after" }
    ]
  },
  flow_linear: {
    resource: "flow",
    kind: "exercise",
    exercise: "choice",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "prompt" },
      { index: 3, label: "steps" },
      { index: 4, label: "question" },
      { index: 5, label: "optionA" },
      { index: 6, label: "optionB" },
      { index: 7, label: "optionC" },
      { index: 8, label: "answerId" },
      { index: 9, label: "after" }
    ]
  },
  tree_path: {
    resource: "tree",
    kind: "exercise",
    exercise: "choice",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "prompt" },
      { index: 3, label: "pathNodes" },
      { index: 4, label: "question" },
      { index: 5, label: "optionA" },
      { index: 6, label: "optionB" },
      { index: 7, label: "optionC" },
      { index: 8, label: "answerId" },
      { index: 9, label: "after" }
    ]
  },
  relation_map_simple: {
    resource: "relation_map",
    kind: "exercise",
    exercise: "choice",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "prompt" },
      { index: 3, label: "leftSet" },
      { index: 4, label: "rightSet" },
      { index: 5, label: "relations" },
      { index: 6, label: "question" },
      { index: 7, label: "optionA" },
      { index: 8, label: "optionB" },
      { index: 9, label: "optionC" },
      { index: 10, label: "answerId" },
      { index: 11, label: "after" }
    ]
  },
  table_theory: {
    resource: "table",
    kind: "theory",
    exercise: "none",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "columns" },
      { index: 3, label: "row1" },
      { index: 4, label: "row2" },
      { index: 5, label: "after" }
    ]
  },
  table_choice: {
    resource: "table",
    kind: "exercise",
    exercise: "choice",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "columns" },
      { index: 3, label: "row1" },
      { index: 4, label: "row2" },
      { index: 5, label: "question" },
      { index: 6, label: "optionA" },
      { index: 7, label: "optionB" },
      { index: 8, label: "optionC" },
      { index: 9, label: "answerId" },
      { index: 10, label: "after" }
    ]
  },
  code_theory: {
    resource: "code",
    kind: "theory",
    exercise: "none",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "prompt" },
      { index: 3, label: "language" },
      { index: 4, label: "code" },
      { index: 5, label: "after" }
    ]
  },
  code_choice: {
    resource: "code",
    kind: "exercise",
    exercise: "choice",
    slots: [
      { index: 1, label: "title" },
      { index: 2, label: "prompt" },
      { index: 3, label: "language" },
      { index: 4, label: "code" },
      { index: 5, label: "question" },
      { index: 6, label: "optionA" },
      { index: 7, label: "optionB" },
      { index: 8, label: "optionC" },
      { index: 9, label: "answerId" },
      { index: 10, label: "after" }
    ]
  }
});

export function getTemplateDefinition(templateId = "") {
  return TEMPLATE_CATALOG[templateId] || null;
}
