import { renderUiIcon } from "./renderUiIcons.js";

export const SOURCE_KIND_LABELS = Object.freeze({ web_page: "Página web", article: "Artigo", book: "Livro",
  chapter: "Capítulo", slides: "Slides", notice: "Edital", standard: "Norma", internal_document: "Documento interno",
  document: "Documento", media: "Áudio ou vídeo", other: "Outro" });
export const SOURCE_ROLE_LABELS = Object.freeze({ curricular_scope: "Escopo do estudo", assessment_evidence: "Avaliação",
  technical_conceptual: "Sustentação do conteúdo", recommended_reading: "Leitura complementar" });
export const BIBLIOGRAPHIC_FIELD_LABELS = Object.freeze({ containerTitle: "Livro, periódico ou publicação",
  publisher: "Editora ou instituição", publisherPlace: "Local de publicação", volume: "Volume", issue: "Número da edição",
  pages: "Páginas", articleNumber: "Identificador do artigo", doi: "DOI", isbn: "ISBN", issn: "ISSN",
  accessedDate: "Data de acesso", genre: "Tipo do material", number: "Número ou designação" });

const SIMPLE_FIELDS = ["sourceId", "kind", "title", "publicationDate", "identifier", "language", "citationMode",
  "citationText", "url", "editionOrVersion", "origin", "availability", "verificationStatus", "studyVisibility"];
const KIND_FIELDS = Object.freeze({
  web_page: ["containerTitle", "publisher", "accessedDate"],
  article: ["containerTitle", "volume", "issue", "pages", "articleNumber", "doi", "issn", "accessedDate"],
  book: ["publisher", "publisherPlace", "isbn", "accessedDate"],
  chapter: ["containerTitle", "publisher", "publisherPlace", "pages", "isbn", "doi", "accessedDate"],
  slides: ["publisher", "genre", "accessedDate"], notice: ["publisher", "number", "accessedDate"],
  standard: ["publisher", "number", "publisherPlace", "accessedDate"],
  internal_document: ["publisher", "genre", "number", "accessedDate"],
  document: ["publisher", "publisherPlace", "genre", "number", "pages", "accessedDate"],
  media: ["containerTitle", "publisher", "genre", "accessedDate"]
});
const escape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const nullable = value => String(value ?? "").trim() || null;
const read = (form, name, fallback = "") => String(form?.elements?.[name]?.value ?? fallback);

function contributorDraft(value = {}) {
  return { format: Object.hasOwn(value, "family") ? "person" : "literal", literal: value.literal || "",
    family: value.family || "", given: value.given || "" };
}

export function createSourceBibliographyDraft(source = null) {
  return { sourceId: source?.sourceId || "", kind: source?.kind || "web_page", title: source?.title || "",
    defaultRoles: [...(source?.defaultRoles || [])], authors: (source?.authors || []).map(contributorDraft),
    publicationDate: source?.publicationDate || "", identifier: source?.identifier || "", language: source?.language || "",
    citationMode: source?.citationMode || "generated", citationText: source?.citationText || "", url: source?.url || "",
    editionOrVersion: source?.editionOrVersion || "", origin: source?.origin || "author_provided",
    availability: source?.availability || "unknown", verificationStatus: source?.verificationStatus || "unverified",
    studyVisibility: source?.studyVisibility || "citation_and_link",
    bibliographic: { ...Object.fromEntries(Object.keys(BIBLIOGRAPHIC_FIELD_LABELS).map(key => [key, source?.bibliographic?.[key] || ""])),
      editors: (source?.bibliographic?.editors || []).map(contributorDraft) } };
}

function readContributors(form, prefix, previous) {
  return previous.map((value, index) => Object.fromEntries(["format", "literal", "family", "given"].map(key =>
    [key, read(form, `${prefix}_${index}_${key}`, value[key])])));
}

export function captureSourceBibliographyDraft(form, current) {
  return { ...current, ...Object.fromEntries(SIMPLE_FIELDS.map(key => [key, read(form, key, current[key])])),
    authors: readContributors(form, "authors", current.authors),
    defaultRoles: Object.keys(SOURCE_ROLE_LABELS).filter(role => form?.elements?.[`role_${role}`]
      ? form.elements[`role_${role}`].checked : current.defaultRoles.includes(role)),
    bibliographic: { ...Object.fromEntries(Object.keys(BIBLIOGRAPHIC_FIELD_LABELS).map(key =>
      [key, read(form, `bibliographic_${key}`, current.bibliographic[key])])),
    editors: readContributors(form, "editors", current.bibliographic.editors) } };
}

function contributorsValue(values) {
  return values.map(value => value.format === "person"
    ? { family: String(value.family).trim(), given: nullable(value.given) }
    : { literal: String(value.literal).trim() });
}

export function sourceDocumentFromBibliographyDraft(draft) {
  return { kind: draft.kind, defaultRoles: [...draft.defaultRoles], title: nullable(draft.title),
    authors: contributorsValue(draft.authors), publicationDate: nullable(draft.publicationDate), identifier: nullable(draft.identifier),
    language: nullable(draft.language), citationMode: draft.citationMode,
    citationText: draft.citationText.trim() ? draft.citationText : null,
    url: nullable(draft.url), editionOrVersion: nullable(draft.editionOrVersion),
    bibliographic: { ...Object.fromEntries(Object.keys(BIBLIOGRAPHIC_FIELD_LABELS).map(key => [key, nullable(draft.bibliographic[key])])),
      editors: contributorsValue(draft.bibliographic.editors) }, origin: draft.origin, availability: draft.availability,
    verificationStatus: draft.verificationStatus, studyVisibility: draft.studyVisibility };
}

function input(name, label, value, { maximum = 500, placeholder = "", type = "text" } = {}) {
  return `<label for="source-field-${name}">${escape(label)}<input id="source-field-${name}" name="${name}" type="${type}"` +
    ` maxlength="${maximum}" value="${escape(value)}"${placeholder ? ` placeholder="${escape(placeholder)}"` : ""}></label>`;
}

function select(name, label, value, options, extra = "") {
  return `<label for="source-field-${name}">${escape(label)}<select id="source-field-${name}" name="${name}" ${extra}>` +
    Object.entries(options).map(([key, title]) => `<option value="${key}"${key === value ? " selected" : ""}>${escape(title)}</option>`).join("") +
    "</select></label>";
}

function contributors(prefix, label, values) {
  return `<fieldset class="source-contributors"><legend>${escape(label)}</legend>` + values.map((value, index) =>
    `<div class="source-contributor" data-source-contributor="${prefix}:${index}">` +
    select(`${prefix}_${index}_format`, "Nome", value.format, { literal: "Nome literal ou instituição", person: "Pessoa" }, "data-source-contributor-format") +
    (value.format === "person" ? input(`${prefix}_${index}_family`, "Sobrenome informado", value.family) +
      input(`${prefix}_${index}_given`, "Prenomes informados", value.given) : input(`${prefix}_${index}_literal`, "Nome como consta na fonte", value.literal)) +
    `<button type="button" data-source-action="remove-contributor" data-contributor-list="${prefix}" data-contributor-index="${index}"` +
    ` aria-label="Remover ${label.toLocaleLowerCase("pt-BR")} ${index + 1}" title="Remover nome">${renderUiIcon("trash", "course-authoring-button-icon")}</button></div>`
  ).join("") + `<button type="button" data-source-action="add-contributor" data-contributor-list="${prefix}" class="source-add-name">` +
    `${renderUiIcon("add", "course-authoring-button-icon")}<span>Adicionar nome</span></button></fieldset>`;
}

export function appendSourceContributor(draft, list) {
  const target = list === "authors" ? draft.authors : list === "editors" ? draft.bibliographic.editors : null;
  if (!target || target.length >= 32) return false;
  target.push(contributorDraft());
  return true;
}

export function renderSourceBibliographyForm(state) {
  if (!state.sourceEditor) return "";
  const draft = state.sourceEditor.draft || createSourceBibliographyDraft(state.sourceEditor.source);
  const isManual = draft.citationMode === "manual";
  return '<form class="course-source-form" data-source-form="source">' +
    `<h3>${state.sourceEditor.source ? "Editar referência" : "Nova fonte"}</h3>` +
    `<input type="hidden" name="sourceId" value="${escape(draft.sourceId)}">` +
    input("title", "Título, quando conhecido", draft.title, { maximum: 600 }) +
    input("url", "Link", draft.url, { maximum: 4096, placeholder: "https://…", type: "url" }) +
    select("citationMode", "Referência", draft.citationMode, { generated: "Gerar no estilo do curso", manual: "Escrita pelo autor" }, "data-source-citation-mode") +
    (isManual ? '<label for="source-field-citationText">Referência escrita pelo autor' +
      `<textarea id="source-field-citationText" name="citationText" rows="4" maxlength="4096">${escape(draft.citationText)}</textarea></label>` : "") +
    `<details class="source-reference-fields" data-source-section="bibliography"${state.sourceEditor.openSections?.includes("bibliography") ? " open" : ""}><summary>Dados da referência</summary><p>Preencha somente o que consta na fonte.</p>` +
    select("kind", "Tipo", draft.kind, SOURCE_KIND_LABELS, "data-source-kind") + contributors("authors", "Autoria", draft.authors) +
    '<div class="course-source-form-grid">' + input("publicationDate", "Publicação", draft.publicationDate, { maximum: 10, placeholder: "AAAA, AAAA-MM ou AAAA-MM-DD" }) +
    input("editionOrVersion", "Edição ou versão", draft.editionOrVersion, { maximum: 240 }) + "</div>" +
    Object.entries(BIBLIOGRAPHIC_FIELD_LABELS).filter(([key]) => !KIND_FIELDS[draft.kind] || KIND_FIELDS[draft.kind].includes(key) || draft.bibliographic[key])
      .map(([key, label]) => input(`bibliographic_${key}`, label, draft.bibliographic[key],
      key === "accessedDate" ? { maximum: 10, placeholder: "AAAA, AAAA-MM ou AAAA-MM-DD" } : {})).join("") +
    contributors("editors", "Organização ou edição", draft.bibliographic.editors) +
    input("identifier", "Outro identificador informado", draft.identifier, { maximum: 480 }) +
    input("language", "Idioma", draft.language, { maximum: 35, placeholder: "pt-BR" }) + "</details>" +
    `<details class="source-reference-fields" data-source-section="access"${state.sourceEditor.openSections?.includes("access") ? " open" : ""}><summary>Uso e acesso</summary>` +
    '<fieldset class="source-default-roles"><legend>Papéis sugeridos ao vincular</legend>' +
    Object.entries(SOURCE_ROLE_LABELS).map(([key, label]) => `<label><input type="checkbox" name="role_${key}"${draft.defaultRoles.includes(key) ? " checked" : ""}>${escape(label)}</label>`).join("") +
    '</fieldset>' + select("studyVisibility", "Mostrar no Estudo", draft.studyVisibility,
      { hidden: "Não mostrar", citation: "Referência", citation_and_link: "Referência e acesso" }) +
    select("verificationStatus", "Conferência da fonte", draft.verificationStatus,
      { unverified: "Ainda não conferida", author_verified: "Conferida pelo autor" }) +
    select("origin", "Origem", draft.origin, { external: "Externa", author_provided: "Fornecida pelo autor", imported: "Importada" }) +
    select("availability", "Disponibilidade conhecida", draft.availability,
      { open_access: "Acesso aberto", restricted: "Restrito", private: "Privado", unknown: "Não informada" }) + "</details>" +
    '<div class="source-reference-preview" data-source-reference-preview aria-live="polite"></div>' +
    '<div class="course-source-form-actions">' +
    `<button type="button" data-source-action="preview-reference" aria-label="Conferir referência" title="Conferir referência">${renderUiIcon("review", "course-authoring-button-icon")}</button>` +
    `<button type="submit" aria-label="Salvar fonte" title="Salvar fonte"${state.busy ? " disabled" : ""}>${renderUiIcon("save", "course-authoring-button-icon")}</button>` +
    `<button type="button" data-source-action="cancel-source-form" aria-label="Cancelar" title="Cancelar">${renderUiIcon("remove-state", "course-authoring-button-icon")}</button></div></form>`;
}
