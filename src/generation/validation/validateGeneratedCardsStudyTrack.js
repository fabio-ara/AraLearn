import { textContainsStudyTrackTerm } from "../policies/studyTrackPolicy.js";
import { annotateDidacticIssue } from "./didacticIssueCatalog.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function collectStrings(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }
  return Object.values(value).flatMap(collectStrings);
}

function cardBody(card) {
  return collectStrings(card).map(text).filter(Boolean).join(" ");
}

function issue(type, target, message) {
  return annotateDidacticIssue({ type, target, message });
}

function containsAny(source, terms = []) {
  return terms.some((term) => textContainsStudyTrackTerm(source, term));
}

export function validateGeneratedCardsStudyTrack(cards = [], generationContract = {}) {
  const policy = generationContract?.studyTrackPolicy || {};
  if (policy.mode !== "clarify_local_doubt") {
    return { ok: true, issues: [] };
  }

  const requiredAnchors = Array.isArray(policy.requiredAnchors) ? policy.requiredAnchors.filter(Boolean) : [];
  if (!requiredAnchors.length) {
    return { ok: true, issues: [] };
  }

  const bodies = (Array.isArray(cards) ? cards : []).map(cardBody);
  const fullText = bodies.join("\n");
  const earlyText = bodies.slice(0, Math.min(2, bodies.length)).join("\n");
  const finalText = bodies.slice(Math.max(0, bodies.length - 2)).join("\n");
  const bridgeBackTargets = Array.isArray(policy.bridgeBackTargets) ? policy.bridgeBackTargets.filter(Boolean) : [];
  const issues = [];

  requiredAnchors.forEach((anchor) => {
    if (!textContainsStudyTrackTerm(fullText, anchor)) {
      issues.push(
        issue(
          "local_doubt_unanswered",
          "cards",
          `A geração não responde à dúvida local sobre "${anchor}".`
        )
      );
      return;
    }
    if (!textContainsStudyTrackTerm(earlyText, anchor)) {
      issues.push(
        issue(
          "local_doubt_unanswered",
          "cards[0..1]",
          `A dúvida local sobre "${anchor}" não é respondida nos primeiros cards.`
        )
      );
    }
  });

  if (bodies.length && !containsAny(bodies[0], requiredAnchors)) {
    issues.push(
      issue(
        "cognitive_drift_from_track",
        "cards[0]",
        "O primeiro card abre um assunto sem ancorar a dúvida local do aluno."
      )
    );
  }

  if (bridgeBackTargets.length && !containsAny(finalText || fullText, bridgeBackTargets)) {
    issues.push(
      issue(
        "missing_return_to_track",
        "cards",
        "A geração esclarece a dúvida, mas não reconecta explicitamente à trilha da lição."
      )
    );
  }

  return {
    ok: issues.every((item) => item.blocksValidation !== true),
    issues
  };
}

