import { renderUiIcon } from "./renderUiIcons.js";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function itemsFrom(result) {
  if (Array.isArray(result)) return result;
  return array(result?.items);
}

function messageFrom(error) {
  if (error?.authRequired || error?.status === 401) return "Entre novamente para continuar.";
  if (error?.status === 403) return "Esta sessão não pode concluir a operação editorial.";
  return error instanceof Error ? error.message : String(error || "Operação indisponível.");
}

function statusLabel(status) {
  return ({
    submitted: "Enviado",
    in_review: "Em análise",
    stale: "Alterado após o envio",
    accepted: "Publicado",
    rejected: "Não aceito",
    withdrawn: "Retirado"
  })[status] || "Estado desconhecido";
}

function iconButton(documentValue, {
  icon,
  label,
  action,
  submissionId = "",
  courseId = "",
  danger = false
}) {
  const button = documentValue.createElement("button");
  button.type = "button";
  button.className = `icon-ghost remote-course-action${danger ? " is-danger" : ""}`;
  button.dataset.catalogSubmissionAction = action;
  if (submissionId) button.dataset.submissionId = submissionId;
  if (courseId) button.dataset.courseId = courseId;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = renderUiIcon(icon, "remote-library-action-icon");
  return button;
}

function input(documentValue, {
  name,
  label,
  placeholder = "",
  maximum = 0,
  value = "",
  required = false
}) {
  const field = documentValue.createElement("input");
  field.type = "text";
  field.name = name;
  field.placeholder = placeholder;
  field.setAttribute("aria-label", label);
  field.value = value;
  field.required = required;
  if (maximum) field.maxLength = maximum;
  return field;
}

function textarea(documentValue, { name, label, placeholder = "", maximum, required = false }) {
  const field = documentValue.createElement("textarea");
  field.name = name;
  field.placeholder = placeholder;
  field.setAttribute("aria-label", label);
  field.maxLength = maximum;
  field.required = required;
  field.rows = 2;
  return field;
}

function heading(documentValue, label, count) {
  const row = documentValue.createElement("div");
  row.className = "catalog-submission-section-heading";
  const title = documentValue.createElement("h3");
  title.textContent = label;
  const value = documentValue.createElement("span");
  value.textContent = String(count);
  value.setAttribute("aria-label", `${count} ${count === 1 ? "item" : "itens"}`);
  row.append(title, value);
  return row;
}

function uniquePublishedCollections(rows) {
  const byId = new Map();
  array(rows).forEach((row) => {
    const collectionId = text(row?.collection_id ?? row?.collectionId).trim();
    const title = text(row?.collection_title ?? row?.collectionTitle).trim();
    if (collectionId && !byId.has(collectionId)) {
      byId.set(collectionId, { collectionId, title: title || "Coleção" });
    }
  });
  return [...byId.values()].sort((left, right) => left.title.localeCompare(right.title, "pt-BR"));
}

export function createCatalogSubmissionsPanel({
  catalog,
  documentValue = globalThis.document,
  onAuthRequired = () => {}
} = {}) {
  if (!catalog || typeof catalog.listCatalogSubmissionCandidates !== "function") {
    throw new TypeError("Catálogo com submissões editoriais obrigatório.");
  }
  if (!documentValue?.createElement) throw new TypeError("Documento obrigatório.");

  const element = documentValue.createElement("section");
  element.className = "catalog-submissions-panel";
  element.dataset.catalogSubmissionsPanel = "";
  element.setAttribute("aria-label", "Ofertas ao catálogo");
  let active = false;
  let busy = false;
  let canReview = false;
  let collections = [];
  let candidates = [];
  let submissions = [];
  let queue = [];
  let expandedCourseId = "";
  let status = "";

  const setFailure = (error) => {
    status = messageFrom(error);
    if (error?.authRequired || error?.status === 401) onAuthRequired(error);
  };

  const renderStatus = () => {
    const paragraph = documentValue.createElement("p");
    paragraph.className = "catalog-submission-status";
    paragraph.dataset.catalogSubmissionStatus = "";
    paragraph.setAttribute("role", "status");
    paragraph.setAttribute("aria-live", "polite");
    paragraph.textContent = status;
    return paragraph;
  };

  const candidateForm = (candidate) => {
    const courseId = text(candidate.courseId ?? candidate.course_id);
    const form = documentValue.createElement("form");
    form.className = "catalog-submission-offer-form";
    form.dataset.catalogSubmissionOffer = courseId;
    const license = input(documentValue, {
      name: "license-code",
      label: "Licença da publicação",
      placeholder: "Licença",
      maximum: 80,
      value: "CC-BY-4.0",
      required: true
    });
    const attribution = input(documentValue, {
      name: "attribution",
      label: "Crédito autoral",
      placeholder: "Crédito autoral",
      maximum: 1000,
      required: true
    });
    const provenance = textarea(documentValue, {
      name: "provenance",
      label: "Procedência e fontes",
      placeholder: "Procedência e fontes",
      maximum: 4000,
      required: true
    });
    const consent = documentValue.createElement("label");
    consent.className = "catalog-submission-consent";
    const consentField = documentValue.createElement("input");
    consentField.type = "checkbox";
    consentField.name = "consent";
    consentField.required = true;
    const consentText = documentValue.createElement("span");
    consentText.textContent = "Autorizo a publicação deste curso no catálogo. Ele deixará de ser privado.";
    consent.append(consentField, consentText);
    const actions = documentValue.createElement("div");
    actions.className = "catalog-submission-actions";
    const cancel = iconButton(documentValue, {
      icon: "remove-state",
      label: "Cancelar oferta",
      action: "cancel-offer",
      courseId
    });
    const submit = iconButton(documentValue, {
      icon: "upload",
      label: "Oferecer curso ao catálogo",
      action: "submit-offer",
      courseId
    });
    submit.type = "submit";
    submit.disabled = true;
    consentField.addEventListener("change", () => {
      submit.disabled = busy || !consentField.checked;
    });
    actions.append(cancel, submit);
    form.append(license, attribution, provenance, consent, actions);
    return form;
  };

  const candidateCard = (candidate) => {
    const courseId = text(candidate.courseId ?? candidate.course_id);
    const activeSubmissionId = text(candidate.activeSubmissionId ?? candidate.active_submission_id);
    const activeStatus = text(candidate.activeSubmissionStatus ?? candidate.active_submission_status);
    const article = documentValue.createElement("article");
    article.className = "catalog-submission-card";
    article.dataset.catalogSubmissionCandidate = courseId;
    const row = documentValue.createElement("div");
    row.className = "catalog-submission-row";
    const title = documentValue.createElement("span");
    title.className = "catalog-submission-title";
    title.textContent = text(candidate.title) || "Curso sem título";
    const actions = documentValue.createElement("div");
    actions.className = "catalog-submission-actions";
    if (activeSubmissionId) {
      const state = documentValue.createElement("span");
      state.className = "catalog-submission-state";
      state.textContent = statusLabel(activeStatus);
      actions.append(state);
    } else {
      actions.append(iconButton(documentValue, {
        icon: "upload",
        label: "Oferecer curso ao catálogo",
        action: "open-offer",
        courseId
      }));
    }
    row.append(title, actions);
    article.append(row);
    if (!activeSubmissionId && expandedCourseId === courseId) article.append(candidateForm(candidate));
    return article;
  };

  const submissionCard = (submission) => {
    const submissionId = text(submission.submissionId ?? submission.submission_id);
    const stateValue = text(submission.status);
    const article = documentValue.createElement("article");
    article.className = "catalog-submission-card";
    article.dataset.catalogSubmissionState = stateValue;
    const row = documentValue.createElement("div");
    row.className = "catalog-submission-row";
    const copy = documentValue.createElement("div");
    copy.className = "catalog-submission-copy";
    const title = documentValue.createElement("span");
    title.className = "catalog-submission-title";
    title.textContent = text(submission.title) || "Curso sem título";
    const state = documentValue.createElement("span");
    state.className = "catalog-submission-state";
    state.textContent = statusLabel(stateValue);
    copy.append(title, state);
    const actions = documentValue.createElement("div");
    actions.className = "catalog-submission-actions";
    if (["submitted", "in_review", "stale"].includes(stateValue)) {
      actions.append(iconButton(documentValue, {
        icon: "remove-state",
        label: "Retirar oferta do catálogo",
        action: "withdraw",
        submissionId
      }));
    }
    row.append(copy, actions);
    article.append(row);
    return article;
  };

  const editorForm = (entry) => {
    const submissionId = text(entry.submissionId ?? entry.submission_id);
    const form = documentValue.createElement("form");
    form.className = "catalog-submission-decision-form";
    form.dataset.catalogSubmissionDecision = submissionId;
    const collection = documentValue.createElement("select");
    collection.name = "collection-id";
    collection.required = true;
    collection.setAttribute("aria-label", "Coleção de destino");
    const prompt = documentValue.createElement("option");
    prompt.value = "";
    prompt.textContent = "Coleção";
    collection.append(prompt);
    collections.forEach((item) => {
      const option = documentValue.createElement("option");
      option.value = item.collectionId;
      option.textContent = item.title;
      collection.append(option);
    });
    const contractKey = input(documentValue, {
      name: "official-contract-key",
      label: "Identificador do curso",
      placeholder: "identificador-do-curso",
      maximum: 160,
      required: true
    });
    contractKey.value = text(entry.sourceContractKey ?? entry.source_contract_key);
    contractKey.readOnly = true;
    contractKey.title = "A publicação preserva o identificador do curso.";
    const note = textarea(documentValue, {
      name: "decision-note",
      label: "Nota editorial",
      placeholder: "Nota editorial",
      maximum: 4000
    });
    const actions = documentValue.createElement("div");
    actions.className = "catalog-submission-actions";
    const reject = iconButton(documentValue, {
      icon: "remove-state",
      label: "Recusar oferta",
      action: "reject",
      submissionId,
      danger: true
    });
    reject.type = "submit";
    reject.formNoValidate = true;
    const accept = iconButton(documentValue, {
      icon: "ready-state",
      label: "Publicar curso no catálogo",
      action: "accept",
      submissionId
    });
    accept.type = "submit";
    if (!collections.length) {
      accept.disabled = true;
      accept.dataset.fixedDisabled = "true";
    }
    actions.append(reject, accept);
    form.append(collection, contractKey, note, actions);
    return form;
  };

  const queueCard = (entry) => {
    const submissionId = text(entry.submissionId ?? entry.submission_id);
    const stateValue = text(entry.status);
    const article = documentValue.createElement("article");
    article.className = "catalog-submission-card catalog-submission-editor-card";
    article.dataset.catalogSubmissionQueueItem = submissionId;
    const row = documentValue.createElement("div");
    row.className = "catalog-submission-row";
    const copy = documentValue.createElement("div");
    copy.className = "catalog-submission-copy";
    const title = documentValue.createElement("span");
    title.className = "catalog-submission-title";
    title.textContent = text(entry.title) || "Curso sem título";
    const details = documentValue.createElement("span");
    details.className = "catalog-submission-state";
    details.textContent = [text(entry.license), text(entry.attribution)].filter(Boolean).join(" · ");
    copy.append(title, details);
    const actions = documentValue.createElement("div");
    actions.className = "catalog-submission-actions";
    if (stateValue === "submitted") {
      actions.append(iconButton(documentValue, {
        icon: "preview",
        label: "Iniciar análise editorial",
        action: "start-review",
        submissionId
      }));
    }
    row.append(copy, actions);
    article.append(row);
    if (text(entry.provenance)) {
      const provenance = documentValue.createElement("p");
      provenance.className = "catalog-submission-provenance";
      provenance.textContent = text(entry.provenance);
      article.append(provenance);
    }
    if (stateValue === "in_review") article.append(editorForm(entry));
    return article;
  };

  const renderList = (label, values, cardFactory, emptyLabel) => {
    const section = documentValue.createElement("section");
    section.className = "catalog-submission-section";
    section.append(heading(documentValue, label, values.length));
    const list = documentValue.createElement("div");
    list.className = "catalog-submission-list";
    values.forEach((value) => list.append(cardFactory(value)));
    if (!values.length) {
      const empty = documentValue.createElement("p");
      empty.className = "catalog-submission-empty";
      empty.textContent = emptyLabel;
      list.append(empty);
    }
    section.append(list);
    return section;
  };

  const render = () => {
    if (!active) return;
    element.replaceChildren();
    element.append(
      renderList("Cursos pessoais", candidates, candidateCard, "Nenhum curso pronto para oferta."),
      renderList("Ofertas", submissions, submissionCard, "Nenhuma oferta."),
      ...(canReview
        ? [renderList("Análise editorial", queue, queueCard, "Nenhuma oferta aguardando análise.")]
        : []),
      renderStatus()
    );
    element.querySelectorAll("button, input, textarea, select").forEach((control) => {
      control.disabled ||= busy;
    });
  };

  const load = async () => {
    busy = true;
    status = "Consultando…";
    render();
    try {
      const [candidateResult, submissionResult, queueResult] = await Promise.all([
        catalog.listCatalogSubmissionCandidates(),
        catalog.listMyCatalogSubmissions(),
        canReview ? catalog.listCatalogSubmissionQueue() : Promise.resolve({ items: [] })
      ]);
      candidates = itemsFrom(candidateResult);
      submissions = itemsFrom(submissionResult);
      queue = itemsFrom(queueResult);
      status = "";
    } catch (error) {
      setFailure(error);
    } finally {
      busy = false;
      render();
    }
  };

  element.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-catalog-submission-action]");
    if (!button || busy) return;
    const action = button.dataset.catalogSubmissionAction;
    if (action === "open-offer") {
      expandedCourseId = button.dataset.courseId;
      render();
      element.querySelector("[data-catalog-submission-offer] input")?.focus();
      return;
    }
    if (action === "cancel-offer") {
      expandedCourseId = "";
      render();
      return;
    }
    if (action === "withdraw" || action === "start-review") {
      busy = true;
      status = action === "withdraw" ? "Retirando oferta…" : "Iniciando análise…";
      render();
      try {
        if (action === "withdraw") {
          await catalog.withdrawCatalogSubmission(button.dataset.submissionId);
        } else {
          await catalog.startCatalogSubmissionReview(button.dataset.submissionId);
        }
        await load();
      } catch (error) {
        busy = false;
        setFailure(error);
        render();
      }
    }
  });

  element.addEventListener("submit", async (event) => {
    const offer = event.target.closest("[data-catalog-submission-offer]");
    const decision = event.target.closest("[data-catalog-submission-decision]");
    if ((!offer && !decision) || busy) return;
    event.preventDefault();
    const submitterAction = event.submitter?.dataset.catalogSubmissionAction;
    const data = new FormData(event.target);
    busy = true;
    status = offer ? "Enviando oferta…" : "Registrando decisão…";
    render();
    try {
      if (offer) {
        await catalog.submitPersonalCourseToCatalog({
          courseId: offer.dataset.catalogSubmissionOffer,
          consent: data.get("consent") === "on",
          licenseCode: data.get("license-code"),
          attribution: data.get("attribution"),
          provenance: data.get("provenance")
        });
        expandedCourseId = "";
      } else {
        const rejecting = submitterAction === "reject";
        const note = text(data.get("decision-note")).trim();
        if (rejecting && !note) {
          throw new TypeError("Informe a justificativa da recusa.");
        }
        await catalog.decideCatalogSubmission({
          submissionId: decision.dataset.catalogSubmissionDecision,
          decision: rejecting ? "reject" : "accept",
          collectionId: rejecting ? null : data.get("collection-id"),
          officialContractKey: rejecting ? null : data.get("official-contract-key"),
          note
        });
      }
      await load();
    } catch (error) {
      busy = false;
      setFailure(error);
      render();
    }
  });

  return {
    element,
    async open({ canReview: nextCanReview = false, collectionRows = [] } = {}) {
      active = true;
      canReview = nextCanReview === true;
      collections = uniquePublishedCollections(collectionRows);
      await load();
    },
    close() {
      active = false;
      busy = false;
      expandedCourseId = "";
      candidates = [];
      submissions = [];
      queue = [];
      status = "";
      element.replaceChildren();
    },
    refresh: load
  };
}
