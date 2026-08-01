export const EDUCATIONAL_WORKSPACE_ROLES = Object.freeze([
  "owner",
  "admin",
  "author",
  "reviewer",
  "learner",
  "reader"
]);

export const EDUCATIONAL_WORKSPACE_ROLE_LABELS = Object.freeze({
  owner: "Proprietário",
  admin: "Administrador",
  author: "Professor/Autor",
  reviewer: "Revisor",
  learner: "Estudante",
  reader: "Leitor"
});

const CAPABILITIES_BY_ROLE = Object.freeze({
  owner: Object.freeze([
    "read", "author", "review", "comment", "publish", "manage", "transfer"
  ]),
  admin: Object.freeze([
    "read", "author", "review", "comment", "publish", "manage"
  ]),
  author: Object.freeze(["read", "author", "review", "comment", "publish"]),
  reviewer: Object.freeze(["read", "review", "comment"]),
  learner: Object.freeze(["read", "comment"]),
  reader: Object.freeze(["read"])
});

export function educationalWorkspaceCapabilities(role) {
  return CAPABILITIES_BY_ROLE[role] || Object.freeze([]);
}

export function educationalWorkspaceCan(role, capability) {
  return educationalWorkspaceCapabilities(role).includes(capability);
}

export function educationalWorkspaceRoleLabel(role) {
  return EDUCATIONAL_WORKSPACE_ROLE_LABELS[role] || "Membro";
}

export function normalizeEducationalWorkspaceRole(role, { allowOwner = true } = {}) {
  const normalized = String(role || "").trim().toLowerCase();
  if (!EDUCATIONAL_WORKSPACE_ROLES.includes(normalized) || (!allowOwner && normalized === "owner")) {
    throw new TypeError("Papel do workspace inválido.");
  }
  return normalized;
}
