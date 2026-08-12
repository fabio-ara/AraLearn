import assert from "node:assert/strict";
import test from "node:test";

import {
  createWorkspaceStructure,
  saveWorkspaceMicrosequenceCards
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceIncremental.js";
import {
  buildWorkspaceOutline,
  createEmptyAuthoringWorkspace
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceModel.js";
import {
  composeWorkspaceDocument,
  flattenWorkspaceDocument
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceParts.js";

const guide = { include: [], exclude: [], notation: [], avoid: [] };

function plannedWorkspace() {
  return createWorkspaceStructure(createEmptyAuthoringWorkspace(), {
    parts: [
      { entityType: "course", id: "redes", title: "Redes", goal: "Aprender redes." },
      { entityType: "module", parentPath: ["redes"], id: "fundamentos", title: "Fundamentos", goal: "Situar a comunicação.", ...guide },
      { entityType: "lesson", parentPath: ["redes", "fundamentos"], id: "protocolos", title: "Protocolos", goal: "Entender regras de comunicação.", topics: [], ...guide },
      { entityType: "microsequence", parentPath: ["redes", "fundamentos", "protocolos"], id: "primeiro-contato", title: "Primeiro contato", goal: "Criar um referente concreto.", role: "explain", dependsOn: [], covers: [], checks: [], errors: [] }
    ]
  });
}

test("autoria materializa envelope por packages sem estado de publicação", () => {
  const workspace = plannedWorkspace();
  const document = saveWorkspaceMicrosequenceCards(workspace, {
    microsequencePath: ["redes", "fundamentos", "protocolos", "primeiro-contato"],
    mode: "append",
    cards: [{
      id: "card-protocolo",
      position: 1,
      title: "O que é um protocolo",
      role: "theory",
      content: [{ id: "explicacao", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "Um protocolo define regras compartilhadas para a troca de mensagens." } }],
      response: null,
      feedback: [],
      topics: [],
      sources: []
    }]
  });
  const microsequence = document.courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(Object.hasOwn(microsequence, "status"), false);
  assert.equal(microsequence.cards[0].content[0].package, "aralearn.resource.paragraph");
  assert.equal(Object.hasOwn(buildWorkspaceOutline(document).courses[0].modules[0].lessons[0].microsequences[0], "status"), false);
  assert.deepEqual(composeWorkspaceDocument(flattenWorkspaceDocument(document)), document);
});
