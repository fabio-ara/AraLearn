import { createCourseStudyApplication } from "../../src/study/CourseStudyApplication.js";
import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";
import { networkTopologyPackage } from "../../src/resources/packages/network-topology/index.js";
import { calculatorPackage } from "../../src/resources/packages/calculator/index.js";

const hash = "a".repeat(64);
const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
const resource = (id, name, data) => ({ id, package: `aralearn.resource.${name}`, version: "1.0.0", data });

/** UI sintética: nenhum cliente de conta, geração, download real ou escrita remota. */
export async function mountStudyExplanationFixture(root, { unit = "theory", state = "available", theme = "light" } = {}) {
  document.documentElement.dataset.colorMode = theme;
  const response = await fetch(new URL("../fixtures/package/project-minimal.json", import.meta.url));
  if (!response.ok) throw new Error("Fixture curricular local indisponível.");
  const project = await response.json();
  const course = project.courses[0]; course.id = "34400000-0000-4000-8000-000000000001";
  course.title = "Comunicação em rede — fixture sintética";
  const module = course.modules[0]; const lesson = module.lessons[0]; const ms = lesson.microsequences[0];
  ms.title = "Interfaces, sinais e quadros";
  const tools = [resource("calculator", "calculator", structuredClone(calculatorPackage.authoringContract.example)),
    resource("calculator-second", "calculator", { title: "Conferir uma segunda estimativa", angleUnit: "radians" })];
  const support = { title: "Processos, interfaces e transporte: distinguir os participantes da comunicação sem confundir sinais, quadros e conexões",
    content: [paragraph("support-lead", "Um **quadro** transporta informações entre interfaces de uma rede local. Um processo é um programa em execução; sua interface com o transporte é chamada socket. Essa interface local não representa toda a conexão entre os participantes."),
      resource("comparison", "table", { prompt: "Compare o papel de cada elemento antes de examinar o diagrama.",
        columns: ["Elemento", "Papel", "O que não representa"], rows: [
          ["Processo", "Programa em execução", "Toda a rede"], ["Socket", "Interface local com o transporte", "A conexão inteira"],
          ["Hub", "Repetição de sinais para as demais portas", "Seleção de destino por endereço MAC"],
          ["Switch", "Encaminhamento de quadros", "O processo que produz os dados"]] }),
      resource("topology", "network_topology", structuredClone(networkTopologyPackage.authoringContract.example)),
      resource("socket-code", "code", { prompt: "Observe a criação de uma interface local antes da conexão. O trecho é ilustrativo e não é executado.",
        language: "python", code: "import socket\ninterface_local = socket.socket(socket.AF_INET, socket.SOCK_STREAM)\n# A interface existe antes de connect()." }),
      ...Array.from({ length: 8 }, (_, index) => paragraph(`selective-${index}`, `Caso ${index + 1}: um programa entrega dados à interface local. O transporte recebe os dados e trata a comunicação entre as pontas. Identifique primeiro o programa em execução, depois a interface usada por ele e por fim a relação entre participantes. Essa ordem ajuda a separar os papéis sem exigir que um único elemento represente toda a comunicação. Um hub repete sinais; um switch encaminha quadros segundo sua função. A distinção depende do mecanismo observado, não apenas da aparência do equipamento.`)),
      ...structuredClone(tools)] };
  const baseUnit = (id, role, content) => ({ id, title: role === "practice" ? "Justifique os papéis no caso" : "Distinguir interface e conexão",
    position: role === "practice" ? 2 : 1, role, content, feedback: [], topics: [], response: null });
  const theory = baseUnit("explanation-theory", "theory", [paragraph("theory", "O socket é a interface local usada pelo processo para entregar dados ao transporte. Uma conexão relaciona pontas de comunicação. A interface pode existir antes da conexão. ".repeat(8)), ...structuredClone(tools)]);
  const practice = baseUnit("explanation-practice", "practice", [paragraph("practice", "Um programa inicia uma comunicação. Explique por que a interface local usada por ele não equivale à relação inteira entre os participantes."), ...structuredClone(tools)]);
  practice.response = { id: "pending-response", package: "aralearn.response.open", version: "1.0.0",
    data: { prompt: "Explique a diferença com suas palavras." } };
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
  const repository = {
    loadProject: () => structuredClone(project), loadCourse: async () => structuredClone(course),
    loadProgress: () => ({ version: 1, lessons: {} }), loadAnnotationsForPath: () => [], loadReviewItems: () => [],
    isStudyUnitMarkedForReview: () => false, loadRuntimeStatus: () => ({ offline: probe.offline }),
    setStudyUnitCompleted: async reference => { probe.completions.push(structuredClone(reference)); return true; },
    loadCourseSummaries: () => [{ courseId: course.id, title: course.title, ownership: "public", canEdit: false,
      revision: 1, studyUnitCount: 2, availableOffline: true }],
    loadStudyUnitCitations: async reference => {
      const unitCitations = structuredClone(citations);
      delete unitCitations.targetKind; delete unitCitations.targetId;
      return { ...unitCitations, studyUnitId: reference.studyUnitId, citations: [] };
    },
    loadExplanationContext: reference => {
      if (probe.state === "error") throw new Error("A Explicação desta cópia está indisponível.");
      return { courseId: course.id, courseRevision: 1, microsequenceId: ms.id, entityPath: [...path, reference.studyUnitId],
        targetKind: "microsequence_explanation", targetId: ms.id,
        explanation: probe.state === "missing" ? null : structuredClone(support),
        contentReview: probe.state === "draft" ? { state: "draft" } : { state: "current", approvedAt: "2026-09-07T00:00:00Z" },
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
