import { createCourseStudyApplication } from "../../src/study/CourseStudyApplication.js";
import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";
import { networkTopologyPackage } from "../../src/resources/packages/network-topology/index.js";
import { calculatorPackage } from "../../src/resources/packages/calculator/index.js";

const hash = "a".repeat(64);
const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
const resource = (id, name, data) => ({ id, package: `aralearn.resource.${name}`, version: "1.0.0", data });

/** UI sintética: nenhum cliente de conta, geração, download real ou escrita remota. */

// Práticas locais da prova de UI do retorno autoral de erro (issue 461): a lacuna
// declara o retorno de cada decisão e a ordenação, o retorno de cada item. O texto
// do erro aparece no estado errado; o acerto mantém apenas o rótulo do package.
export const practiceErrorFeedbackFixtures = Object.freeze({
  gap: {
    content: [paragraph("practice", "O socket é a interface local do processo. A conexão relaciona as duas pontas e só existe após connect().")],
    response: { id: "practice-gap", package: "aralearn.response.gap", version: "1.0.0",
      data: { blanks: [
        { id: "socket", targetInstanceId: "practice", targetPath: "text:socket", responseMode: "text", answer: "socket",
          feedback: "O socket é a interface que o processo usa para falar com o transporte; ele não representa a conexão entre as pontas." },
        { id: "connect", targetInstanceId: "practice", targetPath: "text:connect", responseMode: "text", answer: "connect()",
          feedback: "A interface local existe antes da chamada connect(); a conexão só passa a existir depois dela." }
      ] } }
  },
  ordering: {
    content: [paragraph("sequence-text", "Primeiro preparar, depois executar e por fim conferir.")],
    response: { id: "practice-ordering", package: "aralearn.response.ordering", version: "3.0.0",
      data: { targets: [
        { id: "prepare", targetInstanceId: "sequence-text", targetPath: "text:prepare", answer: "Primeiro preparar",
          feedback: "Preparar vem antes de executar: sem a interface e os dados prontos não há o que transportar." },
        { id: "execute", targetInstanceId: "sequence-text", targetPath: "text:execute", answer: "depois executar",
          feedback: "Executar só faz sentido depois de preparar o processo e a interface." },
        { id: "check", targetInstanceId: "sequence-text", targetPath: "text:check", answer: "por fim conferir",
          feedback: "Conferir fecha o ciclo, depois de executar e observar o resultado." }
      ] } }
  },
  "gap-long": {
    content: [paragraph("practice-long", "O socket é a interface local do processo. A conexão relaciona as duas pontas e só existe após connect(). " +
      "Antes disso o processo apenas prepara os dados. Depois, cada extremidade usa uma porta para identificar o serviço.")],
    response: { id: "practice-gap-long", package: "aralearn.response.gap", version: "1.0.0",
      data: { blanks: [
        { id: "iface", targetInstanceId: "practice-long", targetPath: "text:socket", responseMode: "text", answer: "socket",
          feedback: "O socket é a interface local que o processo usa para falar com o transporte. Ele existe no próprio processo e não representa a conexão inteira entre as duas pontas, nem a rede como um todo. Antes de completar a próxima lacuna, confira qual elemento do enunciado cumpre cada papel." },
        { id: "call", targetInstanceId: "practice-long", targetPath: "text:connect", responseMode: "text", answer: "connect()",
          feedback: "A interface local pode existir antes de qualquer tentativa de comunicação; é a chamada connect() que estabelece a conexão entre as pontas. Se você respondeu que a interface já depende da conexão, inverta a ordem dos acontecimentos no enunciado." },
        { id: "prepare", targetInstanceId: "practice-long", targetPath: "text:prepara", responseMode: "text", answer: "prepara",
          feedback: "Antes de estabelecer a conexão, o processo apenas prepara os dados que pretende enviar. Preparar não é transmitir: observe que o enunciado separa a preparação local do momento em que a comunicação passa a existir." },
        { id: "port", targetInstanceId: "practice-long", targetPath: "text:porta", responseMode: "text", answer: "porta",
          feedback: "Depois de estabelecida a conexão, cada extremidade usa uma porta para identificar o serviço em uso. A porta identifica o serviço naquela extremidade, e não a interface local do processo nem a rede inteira." }
      ] } }
  }
});

// Práticas locais da prova de UI do retorno autoral por alternativa (issue 466): o retorno
// da alternativa marcada é renderizado dentro dela, no painel de leitura. A contagem de
// fluxos é apenas contagem: nenhuma alternativa afirma ganho de taxa. O parágrafo inicial é
// longo o bastante para que o retorno de qualquer alternativa fique abaixo da dobra, e a
// variação "choice-return-tall" declara retorno maior que o painel no risco de 320 px.
export const choiceReturnFixtures = Object.freeze({
  "choice-return": {
    content: [paragraph("practice-choice", "Um AP admite quatro fluxos espaciais e o cliente usado no teste admite dois fluxos. O ambiente tem " +
      "interferência e outros clientes ativos. Antes de concluir pela capacidade do AP, conte os fluxos que cada participante sustenta e " +
      "verifique quantos continuam livres com a carga atual. A contagem do conjunto é uma contagem simples: nenhum participante acrescenta " +
      "fluxos ao outro.")],
    response: { id: "practice-choice-return", package: "aralearn.response.choice", version: "1.0.0",
      data: { question: "Qual conclusão é adequada?", selectionMode: "single", selectionCriterion: "correct",
        options: [
          { id: "ambiente", text: "A interferência do ambiente aumenta o número de fluxos disponíveis.",
            feedback: "A interferência reduz o que o meio entrega; ela não acrescenta fluxos." },
          { id: "quatro", text: "Os quatro fluxos do AP ficam disponíveis para o cliente de dois fluxos.",
            feedback: "A contagem utilizável segue o participante mais restrito, não o AP: o cliente admite dois fluxos, então o conjunto " +
              "entrega dois. Antes de concluir pela capacidade do AP, conte os fluxos de cada participante e confira quais continuam livres " +
              "com a carga atual." },
          { id: "restrito", text: "A contagem utilizável é a do participante mais restrito.",
            feedback: "O participante mais restrito determina a contagem utilizável do conjunto." }
        ], answerIds: ["restrito"] } }
  },
  "choice-return-tall": {
    content: [paragraph("practice-choice-tall", "Um AP admite quatro fluxos espaciais e o cliente usado no teste admite dois fluxos. O ambiente " +
      "tem interferência e outros clientes ativos. Antes de concluir pela capacidade do AP, conte os fluxos que cada participante sustenta e " +
      "verifique quantos continuam livres com a carga atual. A contagem do conjunto é uma contagem simples: nenhum participante acrescenta " +
      "fluxos ao outro.")],
    response: { id: "practice-choice-return-tall", package: "aralearn.response.choice", version: "1.0.0",
      data: { question: "Qual conclusão é adequada?", selectionMode: "single", selectionCriterion: "correct",
        options: [
          { id: "soma", text: "Os fluxos do AP e do cliente se somam na contagem do conjunto.",
            feedback: "Somar os fluxos dos participantes não descreve o conjunto, porque vale o participante mais restrito: se o cliente " +
              "sustenta dois fluxos e o AP admite quatro, o conjunto entrega dois. Conte primeiro o que cada participante sustenta e depois " +
              "compare com a carga em uso para saber quantos fluxos continuam livres. " +
              "Repita a contagem para cada participante do caminho, porque o menor valor decide o conjunto e nenhum participante acrescenta " +
              "fluxos ao outro. " +
              "A carga em uso ocupa parte do que os participantes sustentam, então a contagem de livres é menor do que a contagem de " +
              "sustentados. " +
              "Somar os valores esconde justamente esse participante mais restrito, que é o que limita o conjunto. " +
              "Verifique também se a interferência do ambiente reduz o que o meio entrega antes de concluir qualquer conta." },
          { id: "restrito", text: "A contagem utilizável é a do participante mais restrito.",
            feedback: "O participante mais restrito determina a contagem utilizável do conjunto." }
        ], answerIds: ["restrito"] } }
  },
  "choice-multiple": {
    content: [paragraph("practice-multiple", "Um switch encaminha quadros entre portas, e cada participante do caminho sustenta uma contagem " +
      "própria de fluxos. A carga em uso ocupa parte dessa contagem, e o participante mais restrito limita o conjunto. Antes de responder, " +
      "conte o que cada participante sustenta e confira o que continua livre com a carga atual.")],
    response: { id: "practice-choice-multiple", package: "aralearn.response.choice", version: "1.0.0",
      data: { question: "Quais afirmativas descrevem a contagem do conjunto?", selectionMode: "multiple", selectionCriterion: "correct",
        options: [
          { id: "restrito", text: "A contagem utilizável é a do participante mais restrito.",
            feedback: "O participante mais restrito determina a contagem utilizável do conjunto." },
          { id: "carga", text: "A carga em uso ocupa parte dos fluxos do conjunto.",
            feedback: "O que está em uso não está livre: a carga reduz a contagem disponível do conjunto." },
          { id: "soma", text: "A contagem do conjunto é a soma dos fluxos do AP e do cliente.",
            feedback: "Somar os fluxos dos participantes não descreve o conjunto: vale o participante mais restrito, e a carga em uso ainda " +
              "reduz o que sobra. Conte o participante mais restrito primeiro e depois desconte o que está em uso, sem somar os participantes." }
        ], answerIds: ["restrito", "carga"] } }
  },
  // Retorno autoral com duas âncoras de citação dentro da alternativa marcada (issue 466):
  // o marcador entra depois da revelação e desloca a última linha do retorno.
  "choice-return-anchored": {
    content: [paragraph("practice-choice-anchored-text", "Um AP admite quatro fluxos espaciais e o cliente usado no teste admite dois fluxos. O canal usado " +
      "no teste também limita o que chega a cada participante ativo. Antes de concluir pela capacidade do AP, conte os fluxos que cada " +
      "participante sustenta e verifique quantos continuam livres com a carga atual do conjunto observado.")],
    response: { id: "practice-choice-anchored", package: "aralearn.response.choice", version: "1.0.0",
      data: { question: "Qual conclusão é adequada?", selectionMode: "single", selectionCriterion: "correct",
        options: [
          { id: "restrito", text: "A contagem utilizável é a do participante mais restrito.",
            feedback: "O participante mais restrito determina a contagem utilizável do conjunto." },
          { id: "ambiente", text: "A interferência do ambiente aumenta o número de fluxos disponíveis.",
            feedback: "A interferência reduz o que o meio entrega; ela não acrescenta fluxos." },
          { id: "quatro", text: "Os quatro fluxos do AP ficam disponíveis para o cliente de dois fluxos.",
            feedback: "A contagem utilizável segue o participante mais restrito e não a capacidade nominal anunciada pelo AP, porque o " +
              "cliente admite dois fluxos e o conjunto entrega dois; confira participante por participante antes de concluir pela " +
              "capacidade do AP e desconte a carga que já está em uso no momento da medição." },
        ], answerIds: ["restrito"] } }
  }
});

export async function mountStudyExplanationFixture(root, { unit = "theory", state = "available", theme = "light", resourceContent = null, practiceResponse = null, citationOccurrences = null, includeAudio = false, tools = "authored", practiceKind = "choice" } = {}) {
  // O parâmetro anchors habilita as citações da unidade e as âncoras dentro do retorno
  // autoral da alternativa marcada, sem depender de opção passada por código.
  const anchorOccurrences = new URLSearchParams(globalThis.location?.search || "").has("anchors");
  // A galeria de fixture não repassa opções extras: o parâmetro ?audio=1 da própria
  // URL habilita a ferramenta de áudio sem alterar a página compartilhada.
  const withAudio = includeAudio || new URLSearchParams(globalThis.location?.search || "").has("audio");
  document.documentElement.dataset.colorMode = theme;
  const response = await fetch(new URL("../fixtures/package/project-minimal.json", import.meta.url));
  if (!response.ok) throw new Error("Fixture curricular local indisponível.");
  const project = await response.json();
  const course = project.courses[0]; course.id = "34400000-0000-4000-8000-000000000001";
  course.title = "Comunicação em rede — fixture sintética";
  const module = course.modules[0]; const lesson = module.lessons[0]; const ms = lesson.microsequences[0];
  ms.title = "Interfaces, sinais e quadros";
  const authoredTools = [resource("calculator", "calculator", structuredClone(calculatorPackage.authoringContract.example)),
    resource("calculator-second", "calculator", { title: "Conferir uma segunda estimativa", angleUnit: "radians" })];

  // Faixa nativa sintética para a prova de ferramenta: o leitor abre o player com os
  // controles e a duração declarada desconhecida; a prova não exige fala nem hardware.
  const syntheticAudioTool = () => resource("audio", "audio", { tracks: [{
    id: "synthetic-native-notice", label: "Aviso sintético em português", locale: "pt-BR", kind: "native",
    text: "Aviso sintético para prova de interface.",
    alternative: { text: "Alternativa textual sintética do aviso.", visibility: "on_request" }
  }] });

  // tools=contextual monta a unidade sem bloco de ferramenta escolhido na autoria para
  // provar o apoio contextual do Estudo (issue #445); audio=1 continua somando faixas.
  const toolResources = includeAudio => tools === "contextual" ? []
    : [...structuredClone(authoredTools), ...(includeAudio ? [syntheticAudioTool()] : [])];
  const support = { title: "Processos, interfaces e transporte: distinguir os participantes da comunicação sem confundir sinais, quadros e conexões",
    content: [paragraph("support-lead", "Um **quadro** transporta informações entre interfaces de uma rede local. Um processo é um programa em execução; sua interface com o transporte é chamada socket. Essa interface local não representa toda a conexão entre os participantes."),
      resource("comparison", "table", { title: "Papéis na comunicação",
        columns: ["Elemento", "Papel", "O que não representa"], rows: [
          ["Processo", "Programa em execução", "Toda a rede"], ["Socket", "Interface local com o transporte", "A conexão inteira"],
          ["Hub", "Repetição de sinais para as demais portas", "Seleção de destino por endereço MAC"],
          ["Switch", "Encaminhamento de quadros", "O processo que produz os dados"]] }),
      resource("topology", "network_topology", structuredClone(networkTopologyPackage.authoringContract.example)),
      resource("socket-code", "code", { prompt: "Observe a criação de uma interface local antes da conexão. O trecho é ilustrativo e não é executado.",
        language: "python", code: "import socket\ninterface_local = socket.socket(socket.AF_INET, socket.SOCK_STREAM)\n# A interface existe antes de connect()." }),
      ...Array.from({ length: 8 }, (_, index) => paragraph(`selective-${index}`, `Caso ${index + 1}: um programa entrega dados à interface local. O transporte recebe os dados e trata a comunicação entre as pontas. Identifique primeiro o programa em execução, depois a interface usada por ele e por fim a relação entre participantes. Essa ordem ajuda a separar os papéis sem exigir que um único elemento represente toda a comunicação. Um hub repete sinais; um switch encaminha quadros segundo sua função. A distinção depende do mecanismo observado, não apenas da aparência do equipamento.`)),
      ...toolResources(withAudio)] };
  const baseUnit = (id, role, content) => ({ id, title: role === "practice" ? "Justifique os papéis no caso" : "Distinguir interface e conexão",
    position: role === "practice" ? 2 : 1, role, content, feedback: [], topics: [], response: null });
  const theory = baseUnit("explanation-theory", "theory", [paragraph("theory", "O socket é a interface local usada pelo processo para entregar dados ao transporte. Uma conexão relaciona pontas de comunicação. A interface pode existir antes da conexão. ".repeat(8)), ...toolResources(withAudio)]);
  const practice = baseUnit("explanation-practice", "practice", [paragraph("practice", "Um programa inicia uma comunicação. Explique por que a interface local usada por ele não equivale à relação inteira entre os participantes."), ...toolResources(withAudio)]);
  practice.response = { id: "pending-response", package: "aralearn.response.choice", version: "1.0.0",
    data: { question: "Quais afirmações distinguem a interface da conexão?", selectionMode: "multiple", selectionCriterion: "correct",
      options: [{ id: "local", text: "O socket é uma interface local." }, { id: "prior", text: "A interface pode existir antes da conexão." },
        { id: "whole", text: "O socket representa a rede inteira." }], answerIds: ["local", "prior"] } };
  practice.feedback = [paragraph("feedback", "A interface local permite ao processo usar o transporte e existe antes da conexão. A conexão relaciona as pontas; nenhuma interface representa a rede inteira.")];
  const fixture = practiceErrorFeedbackFixtures[practiceKind] || choiceReturnFixtures[practiceKind];
  if (fixture) {
    practice.content = structuredClone(fixture.content);
    practice.response = structuredClone(fixture.response);
  }
  if (resourceContent) {
    theory.content = structuredClone(resourceContent);
    practice.content = structuredClone(resourceContent);
    support.content = structuredClone(resourceContent);
  }
  if (practiceResponse) practice.response = structuredClone(practiceResponse);
  ms.studyUnits = [theory, practice]; ms.explanation = support;
  const path = [course.id, module.id, lesson.id, ms.id];
  const probe = { reads: [], downloads: [], opened: [], completions: [], state, offline: state === "offline", sourceError: false };
  const citations = { contract: "aralearn.course-study-citations.v2", bibliographyStyle: "abnt-2025", courseId: course.id,
    courseRevision: 1, targetKind: "microsequence_explanation", targetId: ms.id, citations: [{
      linkId: "support-link", sourceId: "synthetic-source", sourceRevision: 1, kind: "article", title: "Fonte sintética do mecanismo",
      authors: [{ literal: "Autoria sintética" }], publicationDate: null, identifier: null, language: "pt-BR",
      bibliographic: createEmptyCourseSourceBibliographicMetadata(), citationMode: "manual", citationText: "Autoria sintética. Referência local para inspeção da interface. 2026.",
      url: null, editionOrVersion: null, relation: "supported_by", roles: ["technical_conceptual"],
      occurrences: [{ occurrenceId: "support-occurrence", slot: "content", resourceId: "support-lead", path: "text",
        quote: "**quadro**", prefix: "Um ", suffix: " transporta", status: "resolved" },
      { occurrenceId: "support-process-occurrence", slot: "content", resourceId: "support-lead", path: "text",
        quote: "Um processo", prefix: null, suffix: " é um programa", status: "resolved" }],
      anchors: [{ anchorId: "support-page", selector: { kind: "page_range", startPage: 3, endPage: 3 }, humanLocator: "Mecanismo", contentHash: hash }],
      attachments: [{ contentHash: hash, byteSize: 128, mediaType: "application/pdf" }] }] };
  if (citationOccurrences) citations.citations[0].occurrences = structuredClone(citationOccurrences);
  // Âncoras de citação dentro do retorno autoral da alternativa marcada (issue 466): o
  // marcador entra no fluxo do texto depois da revelação, como no caso hospedado.
  if (anchorOccurrences) {
    const options = practice.response?.data?.options || [];
    const quotes = ["capacidade nominal anunciada pelo AP", "carga que já está em uso no momento da medição"];
    // A alternativa alvo é a marcada como incorreta cujo retorno contém as duas âncoras.
    const incorrect = options.findIndex((option) => option?.feedback &&
      !practice.response.data.answerIds.includes(option.id) && quotes.every((quote) => option.feedback.includes(quote)));
    if (incorrect >= 0) {
      const feedback = options[incorrect].feedback;
      citations.citations[0].occurrences = quotes.map((quote, index) => ({
        occurrenceId: "practice-anchor-" + (index + 1), slot: "response", resourceId: practice.response.id,
        path: "options[" + incorrect + "].feedback", quote, prefix: null, suffix: null, status: "resolved"
      }));
    }
  }
  const repository = {
    loadProject: () => structuredClone(project), loadCourse: async () => structuredClone(course),
    loadProgress: () => ({ version: 1, lessons: {} }), loadAnnotationsForPath: () => [], loadReviewItems: () => [],
    isStudyUnitMarkedForReview: () => false, loadRuntimeStatus: () => ({ offline: probe.offline }),
    // Configuração sintética que habilita os controles do player; a prova de interface
    // não depende de voz, de fala nem de hardware de áudio.
    loadStudyAudioConfiguration: async () => ({ nativeVoiceURI: null, rate: 1, locale: "pt-BR",
      allowRemoteNativeVoice: false, service: null }),
    setStudyUnitCompleted: async reference => { probe.completions.push(structuredClone(reference)); return true; },
    loadCourseSummaries: () => [{ courseId: course.id, title: course.title, ownership: "public", canEdit: false,
      revision: 1, studyUnitCount: 2, availableOffline: true }],
    loadStudyUnitCitations: async reference => {
      // Fluxo real: a leitura de citações chega depois da conferência. Com o parâmetro
      // gate=1 o teste controla o instante da chegada, sem timeout arbitrário.
      if (new URLSearchParams(globalThis.location?.search || "").has("gate")) {
        await new Promise((resolve) => { globalThis.__releaseStudyCitations = resolve; });
      }
      const unitCitations = structuredClone(citations);
      delete unitCitations.targetKind; delete unitCitations.targetId;
      return { ...unitCitations, studyUnitId: reference.studyUnitId, citations: citationOccurrences || anchorOccurrences ? unitCitations.citations : [] };
    },
    loadExplanationContext: reference => {
      if (probe.state === "error") throw new Error("A explicação desta cópia está indisponível.");
      return { courseId: course.id, courseRevision: 1, microsequenceId: ms.id, entityPath: [...path, reference.studyUnitId],
        targetKind: "microsequence_explanation", targetId: ms.id,
        explanation: probe.state === "missing" ? null : structuredClone(support),
        contentReview: ["draft", "stale", "unregistered"].includes(probe.state)
          ? { state: probe.state } : { state: "current", approvedAt: "2026-09-07T00:00:00Z" },
        state: probe.state, retainedForReview: false, availableRevision: 1, offline: probe.offline };
    },
    loadExplanationCitations: async reference => {
      probe.reads.push(structuredClone(reference));
      if (probe.sourceError) throw Object.assign(new Error("Serviço indisponível"), { status: 503, code: "network_error" });
      return structuredClone(citations);
    },
    loadExplanationCitationStatus: () => ({ courseRevision: 1, source: probe.offline ? "cache" : "remote",
      offline: probe.offline, serviceUnavailable: false }),
    getStudyCitationAttachmentDownload: async (reference, request) => {
      probe.downloads.push({ reference: structuredClone(reference), request: structuredClone(request) });
      if (probe.offline) throw Object.assign(new Error("PDF externo indisponível offline"), { code: "network_error" });
      return { signedUrl: `https://example.test/synthetic.pdf?token=fixture-${probe.downloads.length}` };
    }, flush: async () => true
  };
  const app = createCourseStudyApplication({ root, initialProject: project, repository, visitor: true,
    downloadCitationPdf: url => probe.opened.push(url) });
  globalThis.__explanationFixture = { app, repository, probe, path, project,
    openUnit: name => app.openEntityPath([...path, `explanation-${name}`]) };
  await app.openEntityPath([...path, `explanation-${unit}`]);
  await document.fonts.ready;
  globalThis.__EXPLANATION_FIXTURE_READY__ = true;
  return globalThis.__explanationFixture;
}
