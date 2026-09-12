import { escapePackageAttribute, renderPackageInline } from "../../sdk/html.js";
import { stripPackageManualTextMarkers } from "../../kernel/manualTextMarkers.js";

export function gapAuthoringEditableTargets(data) {
  return [
    ...(typeof data.prompt === "string" ? [{ path: "prompt", label: "Enunciado da prática" }] : []),
    ...data.blanks.flatMap((blank, index) => {
      const prefix = `blanks[${index}]`;
      const suffix = data.blanks.length > 1 ? ` · lacuna ${index + 1}` : "";
      return [
        { path: `${prefix}.answer`, label: `Resposta correta${suffix}` },
        ...(typeof blank.label === "string" ? [{ path: `${prefix}.label`, label: `Rótulo${suffix}` }] : []),
        ...(blank.acceptedAnswers || []).map((_, answer) => ({ path: `${prefix}.acceptedAnswers[${answer}]`, label: `Resposta aceita ${answer + 1}${suffix}` })),
        ...(blank.distractors || []).map((_, answer) => ({ path: `${prefix}.distractors[${answer}]`, label: `Alternativa ${answer + 1}${suffix}` }))
      ];
    })
  ];
}

function readPath(root, path) {
  return (path.match(/[^.[\]]+/gu) || []).reduce((value, key) => value?.[key], root);
}

function setPath(root, path, value) {
  const keys = path.match(/[^.[\]]+/gu) || [];
  const last = keys.pop();
  const parent = keys.reduce((current, key) => current?.[key], root);
  parent[last] = value;
}

// Editing a displayed answer changes its precise content occurrence too. Other
// blanks, identifiers and package structure are kept intact.
export function reconcileGapResponseAnswerEdit(studyUnit, path, newValue, registry) {
  const match = /^blanks\[(\d+)\]\.answer$/u.exec(path);
  if (!match) return;
  const index = Number(match[1]);
  const blanks = studyUnit.response.data.blanks;
  const blank = blanks[index];
  if (!blank || blank.answer === newValue) return;
  const target = studyUnit.content.find(instance => instance.id === blank.targetInstanceId);
  const contentPath = blank.targetPath.split(":", 1)[0].trim();
  if (registry.practiceTargets(target).some(candidate => candidate.path === contentPath && candidate.preserveReference)) {
    throw new Error("Edite o rótulo no componente de conteúdo; esta resposta identifica um elemento da representação.");
  }
  const source = readPath(target.data, contentPath);
  const claimed = [];
  let selected;
  blanks.forEach((candidate, candidateIndex) => {
    if (candidate.targetInstanceId !== blank.targetInstanceId || candidate.targetPath.split(":", 1)[0].trim() !== contentPath) return;
    let offset = 0;
    let start;
    while ((start = source.indexOf(candidate.answer, offset)) >= 0) {
      const end = start + candidate.answer.length;
      if (!claimed.some(range => start < range.end && end > range.start)) {
        const range = { start, end };
        claimed.push(range);
        if (candidateIndex === index) selected = range;
        break;
      }
      offset = start + 1;
    }
  });
  if (!selected) throw new Error("A resposta deixou de corresponder ao trecho de conteúdo salvo.");
  setPath(target.data, contentPath, source.slice(0, selected.start) + newValue + source.slice(selected.end));
}

export function renderGapAuthoringOptions(data, options) {
  if (!options.authoringPracticePreview && !options.resourceSelectionEnabled) return "";
  const row = (label, value) => `<div><dt>${label}</dt><dd>${renderPackageInline(value)}</dd></div>`;
  const blanks = data.blanks.map((blank, index) => {
    const rawAnswer = stripPackageManualTextMarkers(blank.answer);
    const path = blank.targetPath.split(":", 1)[0].trim();
    const visibleAnswer = options.practiceValueLabel?.(blank.targetInstanceId, path, rawAnswer) ?? rawAnswer;
    const answer = visibleAnswer === rawAnswer ? blank.answer : visibleAnswer;
    return `<section class="runtime-authoring-gap" aria-label="Lacuna ${index + 1}">` +
      (data.blanks.length > 1 ? `<h4>Lacuna ${index + 1}</h4>` : "") +
      `<dl>${typeof blank.label === "string" ? row("Rótulo", blank.label) : ""}` +
      row("Resposta correta", answer) +
      (blank.acceptedAnswers || []).map((value, answerIndex) => row(`Resposta aceita ${answerIndex + 1}`, value)).join("") +
      (blank.distractors || []).map((value, answerIndex) => row(`Alternativa ${answerIndex + 1}`, value)).join("") +
      "</dl></section>";
  }).join("");
  const editing = options.authoringPracticeEditing === true || options.manualEditing === true;
  return `<div class="runtime-authoring-practice-controls"><details class="runtime-authoring-gap-options"${editing ? " open" : ""}>` +
    `<summary aria-label="Inspecionar alternativas da prática" title="Alternativas da prática"><svg class="runtime-feedback-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M3 6h1M3 12h1M3 18h1"/></svg></summary>` +
    `<div class="runtime-authoring-gap-fields">${typeof data.prompt === "string" ? `<dl>${row("Enunciado", data.prompt)}</dl>` : ""}${blanks}</div></details>` +
    (!editing ? `<button class="icon-pill runtime-authoring-practice-check" type="button" data-action="complete-validate" data-complete-block-key="${escapePackageAttribute(options.blockKey)}" aria-label="Conferir resposta" title="Conferir resposta"><svg class="runtime-feedback-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button>` : "") + "</div>";
}
