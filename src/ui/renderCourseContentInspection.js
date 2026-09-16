const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function renderCourseContentInspection(inspection, error = "") {
  if (error) return '<p class="course-authoring-notice is-error" role="status">O parecer de inspeção por IA não está disponível. Reabra o conteúdo para tentar novamente.</p>';
  if (!inspection) return "";
  const label = inspection.state === "current"
    ? inspection.report.outcome === "needs_attention" ? "Inspeção por IA: há pontos a conferir."
      : inspection.report.outcome === "human_preference_retained" ? "Inspeção por IA: preferência humana preservada."
        : "Inspeção por IA registrada para esta versão."
    : inspection.state === "pending" ? "Inspeção por IA pendente. O texto salvo continua vigente."
      : "Este conteúdo ainda não tem parecer de inspeção por IA.";
  return `<section class="course-content-inspection" aria-label="Inspeção por IA" data-ai-inspection-state="${inspection.state}">` +
    `<p>${label}</p>` + (inspection.state === "current" ? `<p>${escape(inspection.report.summary)}</p>` +
      (inspection.report.findings.length ? `<ul>${inspection.report.findings.map(item => `<li>${escape(item)}</li>`).join("")}</ul>` : "")
      : '<p>Na conversa conectada, peça a inspeção do texto e das fontes atuais. O parecer fica registrado para essa versão.</p>') + '</section>';
}
