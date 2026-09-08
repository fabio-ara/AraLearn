import { parseCourseAuthoringRoute } from "./courseAuthoringRoute.js";
import { renderUiIcon } from "./renderUiIcons.js";

const escape = value => String(value ?? "").replace(/[&<>"']/gu, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export function buildCourseAuthoringDebate({ courseId, courseRevision, title, route, contextLabel }) {
  const parsed = parseCourseAuthoringRoute(route);
  if (parsed?.courseId !== courseId || !Number.isSafeInteger(courseRevision) || courseRevision < 1) {
    throw new TypeError("O debate exige o curso e a revisão do recorte inspecionado.");
  }
  return `Quero debater ${contextLabel || "este recorte"}. Objeto: “${title}”.\n` +
    `Referência: ${route}\nRevisão observada: ${courseRevision}.\n\n` +
    "Use o conector AraLearn por MCP ou Actions para ler o recorte atual, a Explicação compartilhada, " +
    "as unidades relacionadas, suas fontes e configurações pertinentes. Se a revisão mudou, " +
    "informe a diferença antes de propor uma alteração. Não suponha que este link contém o conteúdo.\n\n" +
    "Apresente uma proposta curta, com fundamento, efeito na cobertura e limites das fontes; " +
    "mantenha o detalhe literal disponível se eu pedir. Aguarde minha contestação ou decisão. " +
    "Este pedido é de debate e não autoriza escrita. Uma decisão de aplicar deve delimitar a mudança, " +
    "seguir os canais existentes e terminar com releitura e link para reinspeção. " +
    "Não registre revisão humana por mim nem trate aprovação do mapa como aprovação do conteúdo.";
}

export function renderCourseAuthoringDebate(context) {
  const prompt = buildCourseAuthoringDebate(context);
  return '<details class="course-authoring-debate"><summary>' +
    renderUiIcon("sparkles", "course-authoring-button-icon") + '<span>Debater com GPT</span></summary>' +
    '<div><p>Copie a referência deste recorte e cole na sua conversa conectada ao AraLearn por MCP ou Actions. ' +
    'O GPT precisa ler o conteúdo pelo conector. Copiar ou debater não altera o curso.</p>' +
    `<label>Pedido com referência exata<textarea readonly rows="7" data-authoring-debate-prompt>${escape(prompt)}</textarea></label>` +
    '<button type="button" data-copy-authoring-debate>' + renderUiIcon("copy", "course-authoring-button-icon") +
    '<span>Copiar pedido</span></button><p role="status" data-authoring-debate-status></p></div></details>';
}

export function bindCourseAuthoringDebate(root, { navigatorValue = globalThis.navigator,
  locationValue = globalThis.location, onFeedback = () => {} } = {}) {
  async function click(event) {
    const button = event.target.closest?.("[data-copy-authoring-debate]");
    if (!button || !root.contains(button)) return;
    event.preventDefault(); event.stopPropagation();
    const host = button.closest(".course-authoring-debate");
    const field = host.querySelector("[data-authoring-debate-prompt]");
    const status = host.querySelector("[data-authoring-debate-status]");
    try {
      if (typeof navigatorValue?.clipboard?.writeText !== "function") throw new Error("clipboard_unavailable");
      // Somente a origem pública da página e o hash do recorte; nunca query de sessão.
      const page = new URL(locationValue.href);
      const text = field.value.replace(/Referência: (#\/authoring\/[^\n]+)/u,
        (_, hash) => `Referência: ${page.origin}${page.pathname}${hash}`);
      await navigatorValue.clipboard.writeText(text);
      status.textContent = "Pedido copiado. Cole na conversa conectada para iniciar o debate.";
      onFeedback("Pedido copiado.");
    } catch {
      field.focus(); field.select();
      status.textContent = "Cópia automática indisponível. Selecione e copie o pedido acima.";
    }
  }
  root.addEventListener("click", click);
  return { destroy() { root.removeEventListener("click", click); } };
}
