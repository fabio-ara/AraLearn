export const DIRECTORY_TREE_BASE_NODE_ID = "__directory_tree_base__";

const DIRECTORY_TREE_PRACTICE_MODES = Object.freeze([
  "none",
  "select",
  "create_folder",
  "create_file",
  "delete",
  "rename"
]);

function clone(value) {
  return structuredClone(value);
}

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "");
}

function normalizeWhitespace(value) {
  return normalizeText(value).replace(/\n+/g, " ").trim();
}

function escapeTemplateAnswer(value) {
  return String(value || "").replace(/\]\]/g, "");
}

export function normalizeDirectoryTreeBase(value) {
  const text = String(value || "").trim();
  return text || "/";
}

export function normalizeDirectoryTreeName(value, fallback = "item") {
  const text = normalizeWhitespace(value);
  return text || fallback;
}

export function normalizeDirectoryTreeNodeType(value) {
  return String(value || "folder") === "file" ? "file" : "folder";
}

export function normalizeDirectoryTreeNodeNameByType(value, nodeType) {
  const safeType = normalizeDirectoryTreeNodeType(nodeType);
  const text = normalizeDirectoryTreeName(value, safeType === "file" ? "arquivo" : "pasta");
  return safeType === "folder" ? text.replace(/[\/\\]+$/g, "").trim() : text;
}

export function normalizeDirectoryTreeNode(node, index = 0) {
  const type = normalizeDirectoryTreeNodeType(node?.type);
  const normalized = {
    id: String(node?.id || `tree-node-${index + 1}`),
    type,
    name: normalizeDirectoryTreeNodeNameByType(node?.name, type)
  };

  if (type === "folder") {
    normalized.children = normalizeDirectoryTreeNodes(node?.children);
  }

  return normalized;
}

export function normalizeDirectoryTreeNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : []).map((node, index) => normalizeDirectoryTreeNode(node, index));
}

export function cloneDirectoryTreeNodes(nodes) {
  return clone(normalizeDirectoryTreeNodes(nodes));
}

export function directoryTreeNodeCanHaveChildren(node) {
  return normalizeDirectoryTreeNodeType(node?.type) !== "file";
}

export function getDirectoryTreePathLabels(base, nodes, nodeId) {
  const safeBase = normalizeDirectoryTreeBase(base);
  if (!nodeId || String(nodeId) === DIRECTORY_TREE_BASE_NODE_ID) {
    return [safeBase];
  }

  const trail = [];

  function walk(items) {
    for (const node of Array.isArray(items) ? items : []) {
      trail.push(normalizeDirectoryTreeName(node?.name));
      if (String(node?.id || "") === String(nodeId)) {
        return true;
      }
      if (walk(node?.children)) {
        return true;
      }
      trail.pop();
    }
    return false;
  }

  if (!walk(nodes)) {
    return null;
  }

  return [safeBase, ...trail];
}

export function findDirectoryTreeNodeEntry(nodes, nodeId) {
  const targetId = String(nodeId || "");
  if (!targetId) {
    return null;
  }

  function visit(list, parents) {
    for (let index = 0; index < list.length; index += 1) {
      const node = list[index];
      if (!node) {
        continue;
      }
      const path = parents.concat(String(node.id || ""));
      if (String(node.id || "") === targetId) {
        return {
          node,
          index,
          parentId: parents.length ? parents[parents.length - 1] : null,
          path
        };
      }
      if (Array.isArray(node.children) && node.children.length) {
        const childResult = visit(node.children, path);
        if (childResult) {
          return childResult;
        }
      }
    }
    return null;
  }

  return visit(normalizeDirectoryTreeNodes(nodes), []);
}

function visitDirectoryTreeNodes(nodes, visitor, parents = []) {
  return normalizeDirectoryTreeNodes(nodes)
    .map((node, index) => {
      const nextNode = clone(node);
      nextNode.children = visitDirectoryTreeNodes(nextNode.children, visitor, parents.concat(nextNode.id || ""));
      return visitor(nextNode, index, parents.slice());
    })
    .filter(Boolean);
}

export function addDirectoryTreeChildNode(nodes, parentNodeId, rawNode) {
  const candidate = normalizeDirectoryTreeNode(rawNode);
  const targetId = String(parentNodeId || "");
  if (!targetId || targetId === DIRECTORY_TREE_BASE_NODE_ID) {
    const next = cloneDirectoryTreeNodes(nodes);
    next.push(candidate);
    return next;
  }

  return visitDirectoryTreeNodes(nodes, (node) => {
    if (String(node.id || "") === targetId && directoryTreeNodeCanHaveChildren(node)) {
      node.children = node.children.concat(candidate);
    }
    return node;
  });
}

export function removeDirectoryTreeNode(nodes, targetNodeId) {
  const targetId = String(targetNodeId || "");
  if (!targetId || targetId === DIRECTORY_TREE_BASE_NODE_ID) {
    return cloneDirectoryTreeNodes(nodes);
  }

  function visit(list) {
    return normalizeDirectoryTreeNodes(list).reduce((acc, node) => {
      if (String(node.id || "") === targetId) {
        return acc;
      }
      const current = clone(node);
      current.children = visit(current.children);
      acc.push(current);
      return acc;
    }, []);
  }

  return visit(nodes);
}

export function renameDirectoryTreeNode(nodes, targetNodeId, nextName) {
  const targetId = String(targetNodeId || "");
  if (!targetId || targetId === DIRECTORY_TREE_BASE_NODE_ID) {
    return cloneDirectoryTreeNodes(nodes);
  }

  return visitDirectoryTreeNodes(nodes, (node) => {
    if (String(node.id || "") === targetId) {
      node.name = normalizeDirectoryTreeNodeNameByType(nextName, node.type);
    }
    return node.name ? node : null;
  });
}

function compareDirectoryTreeNode(left, right) {
  if (!left || !right) {
    return false;
  }
  if (normalizeDirectoryTreeNodeType(left.type) !== normalizeDirectoryTreeNodeType(right.type)) {
    return false;
  }
  if (String(left.name || "") !== String(right.name || "")) {
    return false;
  }
  const leftChildren = normalizeDirectoryTreeNodes(left.children);
  const rightChildren = normalizeDirectoryTreeNodes(right.children);
  if (leftChildren.length !== rightChildren.length) {
    return false;
  }
  for (let index = 0; index < leftChildren.length; index += 1) {
    if (!compareDirectoryTreeNode(leftChildren[index], rightChildren[index])) {
      return false;
    }
  }
  return true;
}

export function compareDirectoryTreeStructures(left, right) {
  const leftNodes = normalizeDirectoryTreeNodes(left);
  const rightNodes = normalizeDirectoryTreeNodes(right);
  if (leftNodes.length !== rightNodes.length) {
    return false;
  }
  for (let index = 0; index < leftNodes.length; index += 1) {
    if (!compareDirectoryTreeNode(leftNodes[index], rightNodes[index])) {
      return false;
    }
  }
  return true;
}

export function normalizeDirectoryTreePracticeMode(value) {
  const mode = String(value || "").toLowerCase();
  return DIRECTORY_TREE_PRACTICE_MODES.includes(mode) ? mode : "none";
}

export function directoryTreePracticeNeedsName(mode) {
  const safeMode = normalizeDirectoryTreePracticeMode(mode);
  return safeMode === "create_folder" || safeMode === "create_file" || safeMode === "rename";
}

export function directoryTreePracticeNeedsTargetNode(mode) {
  const safeMode = normalizeDirectoryTreePracticeMode(mode);
  return safeMode === "select" || safeMode === "delete" || safeMode === "rename";
}

export function directoryTreePracticeNeedsParentNode(mode) {
  const safeMode = normalizeDirectoryTreePracticeMode(mode);
  return safeMode === "create_folder" || safeMode === "create_file";
}

function normalizeDirectoryTreePracticeOption(item) {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const value = normalizeWhitespace(item.value);
    return value
      ? {
          value,
          correct: !!item.correct
        }
      : null;
  }
  const value = normalizeWhitespace(item);
  return value
    ? {
        value,
        correct: false
      }
    : null;
}

function normalizeDirectoryTreePracticeOptions(options) {
  return (Array.isArray(options) ? options : [])
    .map((item) => normalizeDirectoryTreePracticeOption(item))
    .filter(Boolean);
}

function resolveLegacyExpectedName(source) {
  const explicit = normalizeWhitespace(source?.expectedName);
  if (explicit) {
    return explicit;
  }

  const options = normalizeDirectoryTreePracticeOptions(source?.options);
  const correct = options.find((item) => item.correct);
  return correct?.value || "";
}

function resolveLegacyNameOptions(source, expectedName) {
  const options = normalizeDirectoryTreePracticeOptions(source?.options).map((item) => item.value);
  if (!expectedName) {
    return [];
  }
  return Array.from(new Set([expectedName, ...options].filter(Boolean)));
}

function normalizeDirectoryTreePracticeTypePrompt(rawPrompt, fallbackType = "") {
  if (!rawPrompt) {
    return null;
  }

  if (typeof rawPrompt === "string") {
    const expected = normalizeDirectoryTreeNodeType(rawPrompt);
    return {
      expected,
      options: ["folder", "file"]
    };
  }

  if (typeof rawPrompt !== "object" || Array.isArray(rawPrompt)) {
    return null;
  }

  const expected = normalizeDirectoryTreeNodeType(
    rawPrompt.expected ?? rawPrompt.answer ?? rawPrompt.value ?? fallbackType
  );
  const options = Array.from(
    new Set(
      (Array.isArray(rawPrompt.options) ? rawPrompt.options : [expected, "folder", "file"])
        .map((item) => normalizeDirectoryTreeNodeType(item))
        .filter(Boolean)
    )
  );

  return {
    expected,
    options: options.length ? options : [expected]
  };
}

export function resolveDirectoryTreePracticeNameTemplate(practice) {
  const safePractice = practice && typeof practice === "object" ? practice : {};
  const explicitTemplate = normalizeText(safePractice.nameTemplate || safePractice.expectedNameTemplate).trim();
  if (explicitTemplate) {
    return explicitTemplate;
  }

  const expectedName = resolveLegacyExpectedName(safePractice);
  if (!expectedName) {
    return "";
  }

  const options = resolveLegacyNameOptions(safePractice, expectedName);
  if (options.length > 1) {
    return `[[${escapeTemplateAnswer(expectedName)}::${options.map((item) => escapeTemplateAnswer(item)).join("|")}]]`;
  }

  return `[[${escapeTemplateAnswer(expectedName)}]]`;
}

export function resolveDirectoryTreeTemplateValue(template) {
  return String(template || "").replace(/\[\[([\s\S]*?)\]\]/g, (_, raw) => {
    const text = String(raw || "");
    const delimiterIndex = text.indexOf("::");
    return delimiterIndex >= 0 ? text.slice(0, delimiterIndex) : text;
  });
}

export function normalizeDirectoryTreePractice(rawPractice) {
  const source = rawPractice && typeof rawPractice === "object" ? rawPractice : {};
  const mode = normalizeDirectoryTreePracticeMode(source.mode);
  const expectedType =
    mode === "create_file"
      ? "file"
      : mode === "create_folder"
        ? "folder"
        : "";
  const typePrompt = normalizeDirectoryTreePracticeTypePrompt(
    source.typePrompt ?? source.iconPrompt ?? source.nodeTypePrompt,
    expectedType
  );

  return {
    mode,
    targetNodeId: String(source.targetNodeId || ""),
    parentNodeId: String(source.parentNodeId || ""),
    nameTemplate: directoryTreePracticeNeedsName(mode)
      ? resolveDirectoryTreePracticeNameTemplate(source)
      : "",
    typePrompt
  };
}

export function resolveDirectoryTreePracticeExpectedType(practice) {
  const safePractice = normalizeDirectoryTreePractice(practice);
  if (safePractice.typePrompt?.expected) {
    return safePractice.typePrompt.expected;
  }
  if (safePractice.mode === "create_file") {
    return "file";
  }
  if (safePractice.mode === "create_folder") {
    return "folder";
  }
  return "";
}

export function resolveDirectoryTreePracticeExpectedName(practice) {
  const safePractice = normalizeDirectoryTreePractice(practice);
  return safePractice.nameTemplate ? normalizeDirectoryTreeNodeNameByType(
    resolveDirectoryTreeTemplateValue(safePractice.nameTemplate),
    resolveDirectoryTreePracticeExpectedType(safePractice) || "folder"
  ) : "";
}

export function deriveDirectoryTreeExpectedNodes(nodes, practice, nodeFactory = null) {
  const safePractice = normalizeDirectoryTreePractice(practice);
  const expectedName = resolveDirectoryTreePracticeExpectedName(safePractice);
  const createNodeFactory =
    typeof nodeFactory === "function"
      ? nodeFactory
      : (type, name) => ({
          id: "",
          type,
          name,
          children: []
        });

  if (safePractice.mode === "none" || safePractice.mode === "select") {
    return cloneDirectoryTreeNodes(nodes);
  }

  if (safePractice.mode === "delete") {
    return removeDirectoryTreeNode(nodes, safePractice.targetNodeId);
  }

  if (safePractice.mode === "rename") {
    if (!expectedName) {
      return cloneDirectoryTreeNodes(nodes);
    }
    return renameDirectoryTreeNode(nodes, safePractice.targetNodeId, expectedName);
  }

  if (safePractice.mode === "create_folder" || safePractice.mode === "create_file") {
    if (!expectedName) {
      return cloneDirectoryTreeNodes(nodes);
    }
    return addDirectoryTreeChildNode(
      nodes,
      safePractice.parentNodeId || DIRECTORY_TREE_BASE_NODE_ID,
      createNodeFactory(resolveDirectoryTreePracticeExpectedType(safePractice), expectedName)
    );
  }

  return cloneDirectoryTreeNodes(nodes);
}
