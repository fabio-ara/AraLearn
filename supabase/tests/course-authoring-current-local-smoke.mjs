import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { CourseSupabaseAdapter } from
  "../functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { executeHumanCourseTask } from
  "../functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { resolveHumanCourseContext } from
  "../functions/_shared/aralearn-authoring/courseHumanTaskExecutor.js";
import {
  readPackageStudyUnitText,
  renderPackageStudyUnitArticle
} from "../../src/render/renderPackageStudyUnit.js";
import {
  localSupabaseConfiguration,
  localSupabaseRequest,
  createConfirmedLocalUser,
  createLocalFixtureClient,
  trackLocalFixtureCreation,
  removeLocalUser,
  signInLocalUser
} from "../../tests/support/localSupabaseE2e.js";

function first(value) {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

async function createAuthor(config, marker, onCreated) {
  const password = `Authoring-${marker}-Aa1!`;
  const created = await createConfirmedLocalUser(config, {
      email: `authoring-${marker}@example.test`,
      password,
      appMetadata: { aralearn_role: "administrator" },
      marker: "course-authoring-current-local-smoke"
  });
  assert.equal(created.response.status, 200, `Criação da fixture: HTTP ${created.response.status}`);
  onCreated(created.payload.id);
  const signedIn = await signInLocalUser(config, {
    email: `authoring-${marker}@example.test`, password
  });
  assert.equal(signedIn.response.status, 200, `Login da fixture: HTTP ${signedIn.response.status}`);
  return { id: created.payload.id, accessToken: signedIn.payload.access_token };
}

export function paragraph(id, text) {
  return {
    id,
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: { text }
  };
}

function unitCalibration(editorialDirection) {
  return {
    motivo: "Calibração da fixture sintética local para uma definição e uma aplicação.",
    parametros: {
      maximo_ideias_novas_por_unidade: 1,
      formas_de_explicacao: ["plain_definition"],
      oportunidades_distintas_por_requisito: 1,
      dimensoes_de_variacao_da_pratica: ["case_or_data"],
      alvo_palavras_conversa: 90,
      alvo_palavras_unidade: 60,
      distribuicao_da_pratica: "interleaved",
      posicao_da_pratica: "after_explanation",
      alvo_microssequencias_por_parte: 2,
      alvo_partes_por_lote: 1,
      frequencia_de_pausa: "each_part",
      preferencia_da_conversa: "concise"
    },
    direcaoEditorial: editorialDirection
  };
}

export function explanationUnit() {
  return {
    microssequencia: "O que é um socket",
    posicao: 1,
    configuracao: unitCalibration(
      "Defina o mecanismo e contraste socket com conexão."
    ),
    conteudo: {
      title: "Socket liga processo e transporte",
      role: "theory",
      content: [paragraph(
        "socket-definition",
        "Um processo não envia dados diretamente pela rede. Ele usa um socket: a interface local pela qual entrega e recebe dados de um protocolo de transporte. O socket representa essa ponta local da comunicação, não a conexão inteira entre os participantes."
      )],
      response: null,
      feedback: [],
      topics: ["socket"]
    },
    aplicacaoPedagogica: {
      ideiasIntroduzidas: [{
        nome: "Socket como interface entre processo e transporte",
        descricao: "Interface local pela qual um processo envia e recebe dados usando um protocolo de transporte."
      }],
      ideiasUtilizadas: [],
      explicacoes: [{
        ideia: "Socket como interface entre processo e transporte",
        formas: ["plain_definition"]
      }],
      praticas: [],
      cobertura: ["Compreender o papel de um socket."]
    },
    fontes: []
  };
}

export function practiceUnit() {
  return {
    microssequencia: "Prática de identificação",
    posicao: 1,
    configuracao: unitCalibration(
      "Peça uma identificação rápida em um contexto concreto sem introduzir nova terminologia."
    ),
    conteudo: {
      title: "Distinguir processo, socket e conexão",
      role: "practice",
      content: [paragraph(
        "socket-practice-context",
        "Compare os elementos envolvidos quando um navegador estabelece comunicação com um servidor."
      )],
      response: {
        id: "socket-practice-choice",
        package: "aralearn.response.choice",
        version: "1.0.0",
        data: {
          question: "Qual elemento é a interface usada pelo processo?",
          selectionMode: "single",
          selectionCriterion: "correct",
          options: [
            { id: "socket", text: "Socket", feedback: "É a interface do processo com o transporte." },
            { id: "connection", text: "Conexão", feedback: "É a relação de comunicação, não a interface local." }
          ],
          answerIds: ["socket"]
        }
      },
      feedback: [paragraph(
        "socket-practice-feedback",
        "O processo usa um socket; a conexão relaciona as pontas da comunicação."
      )],
      topics: ["socket", "conexão"]
    },
    aplicacaoPedagogica: {
      ideiasIntroduzidas: [],
      ideiasUtilizadas: ["Socket como interface entre processo e transporte"],
      explicacoes: [],
      praticas: [{
        requisito: "Distinguir processo, socket e conexão.",
        oportunidade: "identificar-interface-em-navegador",
        dimensoesVariadas: ["case_or_data"]
      }],
      cobertura: ["Distinguir processo, socket e conexão."]
    },
    fontes: []
  };
}

export function curricularMap(course) {
  return {
    curso: course,
    publico: "Pessoas iniciantes em comunicação de rede",
    preRequisitos: [
      "Reconhecer um processo computacional.",
      "Reconhecer a função geral de um protocolo de transporte.",
      "Reconhecer uma comunicação cliente-servidor."
    ],
    itensDeEscopo: [
      "Compreender o papel de um socket.",
      "Distinguir processo, socket e conexão."
    ],
    modulos: [{
      titulo: "Comunicação",
      objetivo: "Explicar como processos se comunicam em rede.",
      licoes: [{
        titulo: "Sockets",
        objetivo: "Relacionar processo, interface e transporte.",
        microssequencias: [{
          titulo: "O que é um socket",
          objetivo: "Definir socket sem pressupor uma conexão já estabelecida.",
          explicacao: { proposito: "Explicar a relação entre processo, interface local e transporte.",
            pressupostos: ["Um processo executa um programa."], relacoes: ["O socket é uma interface local usada pelo processo."], fontesPrevistas: [] },
          dependencias: [],
          cobertura: ["Compreender o papel de um socket."]
        }, {
          titulo: "Prática de identificação",
          objetivo: "Distinguir processo, socket e conexão em casos variados.",
          explicacao: { proposito: "Retomar a distinção para examinar um caso de comunicação.",
            pressupostos: ["Processos usam sockets."], relacoes: ["Uma interface local não é a relação entre as pontas da comunicação."], fontesPrevistas: [] },
          dependencias: ["O que é um socket"],
          cobertura: ["Distinguir processo, socket e conexão."]
        }]
      }]
    }]
  };
}

function approvedPart(course) {
  return {
    curso: course,
    titulo: "Sockets",
    intencao: "Construir a distinção e praticá-la em casos variados.",
    microssequencias: ["O que é um socket", "Prática de identificação"],
    progressao: [
      "Compreender por que um processo precisa de uma interface com o transporte.",
      "Distinguir socket de processo e de conexão em situações concretas."
    ]
  };
}

function sharedExplanations() {
  return [{ microssequencia: "O que é um socket", conteudo: {
    title: "Processo, socket e transporte", content: [paragraph("socket-support",
      "Um processo é um programa em execução. Para enviar dados, ele usa uma interface local chamada socket. A interface permite entregar dados ao transporte e receber os dados destinados ao processo. Uma conexão relaciona as pontas da comunicação; um socket identifica uma dessas interfaces locais. Um processo pode usar mais de um socket.")]
  }, fontes: [] }, { microssequencia: "Prática de identificação", conteudo: {
    title: "Distinguir os participantes da comunicação", content: [paragraph("practice-support",
      "Separe três perguntas: qual programa está executando, qual interface local ele usa e quais pontas estão relacionadas pela comunicação. Processo responde à primeira, socket à segunda e conexão à terceira. Por exemplo, duas aplicações podem executar no mesmo computador e usar sockets diferentes. Essa distinção permite explicar o caso sem tratar todo o computador como uma única aplicação.")]
  }, fontes: [] }];
}

export async function runLocalCourseAuthoringCurrent(environment = process.env) {
  const config = localSupabaseConfiguration(environment);
  const marker = randomUUID();
  const title = `Curso descartável de autoria ${marker.slice(0, 8)}`;
  let actorId = null;
  let accessToken = null;
  let courseId = null;
  let ownerClient;
  let primaryError;
  const cleanup = { completed: false, courseRemoved: false, userRemoved: false };
  const adapter = new CourseSupabaseAdapter({
    supabaseUrl: config.projectUrl,
    publicSupabaseUrl: config.projectUrl,
    serverApiKey: config.adminKey,
    publishableKey: config.publishableKey,
    publicAppUrl: "http://127.0.0.1:4173",
    attempts: 1
  });
  try {
    const author = await createAuthor(config, marker, id => { actorId = id; });
    actorId = author.id;
    accessToken = author.accessToken;
    ownerClient = await createLocalFixtureClient(config, { ownerId: actorId, accessToken,
      origin: environment.ARALEARN_LOCAL_APPLICATION_ORIGIN });
    const principal = {
      actorId,
      authenticationKind: "oauth",
      scopes: ["authoring:read", "authoring:write"]
    };
    const created = await trackLocalFixtureCreation(config, { ownerId: actorId,
      courseIdFromResult: result => { courseId = result.deepLink?.match(/\/courses\/([0-9a-f-]{36})/u)?.[1]; return courseId; },
      create: () => executeHumanCourseTask({
      adapter,
      principal,
      name: "criar_curso",
      rawArguments: {
        titulo: title,
        objetivo: "Distinguir processo, socket e conexão a partir dos pré-requisitos declarados."
      }
    }) });
    assert.match(created.result, /Criei o curso privado/u);
    courseId = (await resolveHumanCourseContext({ adapter, principal, course: title })).course.id;

    const proposedMap = curricularMap(title);
    const savedMap = await executeHumanCourseTask({
      adapter,
      principal,
      name: "salvar_mapa_curricular",
      rawArguments: proposedMap
    });
    await executeHumanCourseTask({
      adapter,
      principal,
      name: "aprovar_mapa_curricular",
      rawArguments: { referencia: savedMap.context.referenciaParaAprovar }
    });

    await executeHumanCourseTask({
      adapter,
      principal,
      name: "salvar_parte",
      rawArguments: approvedPart(title)
    });

    const prepared = await executeHumanCourseTask({
      adapter,
      principal,
      name: "preparar_materializacao",
      rawArguments: { curso: title, parte: 1 }
    });
    assert.equal(prepared.context.parte.microssequencias.length, 2);
    assert.deepEqual(
      prepared.context.parte.microssequencias.map(({ coberturaObrigatoria }) =>
        coberturaObrigatoria.map(({ item }) => item)),
      [["Compreender o papel de um socket."], ["Distinguir processo, socket e conexão."]]
    );
    const materialized = await executeHumanCourseTask({
      adapter,
      principal,
      name: "materializar_parte",
      rawArguments: {
        curso: title,
        parte: 1,
        unidades: [explanationUnit(), practiceUnit()],
        explicacoes: sharedExplanations()
      }
    });
    assert.equal(materialized.result, "Primeira parte produzida.");

    await executeHumanCourseTask({
      adapter,
      principal,
      name: "ajustar_configuracao",
      rawArguments: {
        curso: title,
        unidade: "Socket liga processo e transporte",
        condicao: "fixada_pelo_autor",
        parametros: { maximo_ideias_novas_por_unidade: 1 }
      }
    });
    await executeHumanCourseTask({
      adapter,
      principal,
      name: "materializar_parte",
      rawArguments: {
        curso: title,
        parte: 1,
        unidades: [
          explanationUnit(),
          practiceUnit()
        ],
        explicacoes: sharedExplanations()
      }
    });

    const materializedContext = await resolveHumanCourseContext({
      adapter,
      principal,
      course: title
    });
    const materializedRevision = materializedContext.course.revision;
    await executeHumanCourseTask({
      adapter,
      principal,
      name: "materializar_parte",
      rawArguments: {
        curso: title,
        parte: 1,
        unidades: [
          explanationUnit(),
          practiceUnit()
        ],
        explicacoes: sharedExplanations()
      }
    });
    const context = await resolveHumanCourseContext({
      adapter,
      principal,
      course: title
    });
    assert.equal(context.course.revision, materializedRevision);
    courseId = context.course.id;
    const units = await adapter.listCourseStudyUnits({
      principal,
      courseId,
      expectedRevision: context.course.revision,
      scopeKind: "course",
      limit: 12
    });
    assert.equal(units.items.length, 2);
    assert.deepEqual(units.items.map(({ authorship }) => authorship.createdOrigin), [
      "gpt", "gpt"
    ]);
    const sequentialText = units.items.map(({ studyUnit }) =>
      readPackageStudyUnitText(studyUnit));
    assert.match(sequentialText[0], /socket.+interface.+transporte/isu);
    assert.match(sequentialText[1], /processo.+socket.+conexão/isu);
    const renderedUnits = units.items.map(({ studyUnit }) =>
      renderPackageStudyUnitArticle(studyUnit, { revealPracticeAnswers: true }));
    assert.match(renderedUnits[0], /Socket liga processo e transporte/u);
    assert.match(renderedUnits[1], /Qual elemento é a interface usada pelo processo\?/u);

    const annotationCommand = (studyUnitId, text) => ({
      type: "create_anchored_annotation",
      annotationId: randomUUID(),
      target: { kind: "study_unit", id: studyUnitId },
      rawText: text,
      category: "suggestion",
      capturedAt: new Date().toISOString(),
      briefSummary: null
    });
    await assert.rejects(() => adapter.createCourseAnchoredAnnotations({
      principal,
      courseId,
      requestId: randomUUID(),
      expectedCourseRevision: context.course.revision,
      commands: [
        annotationCommand(units.items[0].studyUnit.id, "Observação que deve reverter."),
        annotationCommand("unidade-inexistente", "Alvo inválido para provar rollback.")
      ]
    }));
    const observationQuery = {
      mode: "inbox",
      origins: [],
      channels: [],
      states: [],
      categories: [],
      includeUncategorized: true,
      subjectIds: [],
      hierarchy: null,
      annotationId: null
    };
    assert.equal((await adapter.getCourseAnchoredAnnotations({
      principal,
      courseId,
      expectedCourseRevision: context.course.revision,
      query: observationQuery
    })).items.length, 0);
    const observations = await executeHumanCourseTask({
      adapter,
      principal,
      name: "registrar_observacao",
      rawArguments: {
        curso: title,
        unidades: units.items.map(({ studyUnit }) => studyUnit.title),
        texto: "Reforçar o contraste entre socket e conexão.",
        categoria: "suggestion"
      }
    });
    assert.equal(observations.context.observationCount, 2);
    assert.equal((await adapter.getCourseAnchoredAnnotations({
      principal,
      courseId,
      expectedCourseRevision: context.course.revision,
      query: observationQuery
    })).items.length, 2);

    const analytics = await adapter.getCourseAuthoringAnalytics({
      principal,
      courseId,
      expectedCourseRevision: context.course.revision,
      query: { scope: { kind: "course", ref: null } }
    });
    assert.equal(analytics.design.studyUnitCount, 2);
    assert.equal(analytics.design.analysisUnits[0].introductionCount, 1);
    assert.equal(analytics.design.analysisUnits[0].useCount, 1);
    assert.equal(analytics.design.analysisUnits[0].revisitCount, 0);
    assert.equal(analytics.design.practiceByRequirement[0].opportunityCount, 1);
    const ceiling = analytics.design.parameters.find(({ parameterId }) =>
      parameterId === "new_analysis_unit_ceiling_per_expository_study_unit");
    assert.deepEqual(
      ceiling.effectiveValues.map(({ value, origin, studyUnitCount }) => ({
        value, origin, studyUnitCount
      })),
      [{ value: 1, origin: "author", studyUnitCount: 1 }]
    );
    assert.equal(analytics.authorship.explicitParameterOverrideCount, 1);
    assert.equal(analytics.authorship.studyUnitsByOrigin.find(
      ({ origin }) => origin === "gpt"
    )?.createdCount, 2);

    await executeHumanCourseTask({
      adapter,
      principal,
      name: "manter_fonte",
      rawArguments: {
        curso: title,
        metadados: {
          titulo: "Referência sobre sockets",
          papeisSugeridos: ["tecnica_conceitual"],
          citacao: "AraLearn. Referência sobre sockets, 2026.",
          verificacao: "confirmada_explicitamente_pela_autoria",
          visibilidadeNoEstudo: "citacao"
        },
        ancoras: [{
          seletor: { tipo: "paginas", paginaInicial: 1, paginaFinal: 1 },
          localizadorHumano: "p. 1",
          trechoDeVerificacao: "Um socket liga o processo ao transporte."
        }],
        vinculos: [{
          unidade: units.items[0].studyUnit.title,
          relacao: "supported_by",
          papeis: ["tecnica_conceitual"],
          ancoras: [1]
        }, {
          explicacao: "O que é um socket",
          relacao: "supported_by",
          papeis: ["tecnica_conceitual"],
          ancoras: [1]
        }]
      }
    });
    const sourceContext = await resolveHumanCourseContext({
      adapter,
      principal,
      course: title,
      source: "Referência sobre sockets"
    });
    const sourceDetail = await adapter.getCourseSources({
      principal,
      courseId,
      expectedRevision: sourceContext.course.revision,
      mode: "source",
      sourceId: sourceContext.source.sourceId,
      targetKind: null,
      targetId: null,
      cursor: null,
      limit: 1
    });
    assert.deepEqual(sourceDetail.items[0].defaultRoles, ["technical_conceptual"]);
    const beforeEditAttribution = await adapter.getCourseSources({
      principal,
      courseId,
      expectedRevision: sourceContext.course.revision,
      mode: "target",
      sourceId: null,
      targetKind: "study_unit",
      targetId: units.items[0].studyUnit.id,
      cursor: null,
      limit: 1
    });
    const sourceLinks = beforeEditAttribution.items[0].sourceLinks;
    const editedContent = structuredClone(units.items[0].studyUnit);
    delete editedContent.id;
    delete editedContent.position;
    editedContent.content[0].data.text += " A revisão preserva a mesma Fonte.";
    const edited = await adapter.commitCourseComposition({
      principal,
      courseId,
      requestId: randomUUID(),
      expectedRevision: sourceContext.course.revision,
      upserts: [{
        entityType: "study_unit",
        entityId: units.items[0].studyUnit.id,
        parentType: "microsequence",
        parentId: units.items[0].curriculumPath.didacticMicrosequence.id,
        position: units.items[0].studyUnit.position,
        content: editedContent
      }],
      deletes: [],
      sourceAttributionApplications: [{
        studyUnitId: units.items[0].studyUnit.id,
        sourceLinks
      }]
    });
    const afterEditAttribution = await adapter.getCourseSources({
      principal,
      courseId,
      expectedRevision: edited.revision,
      mode: "target",
      sourceId: null,
      targetKind: "study_unit",
      targetId: units.items[0].studyUnit.id,
      cursor: null,
      limit: 1
    });
    assert.equal(
      afterEditAttribution.items[0].targetVersion,
      beforeEditAttribution.items[0].targetVersion + 1
    );
    assert.deepEqual(afterEditAttribution.items[0].sourceLinks, sourceLinks);
    const explanationTarget = units.items[0].curriculumPath.didacticMicrosequence.id;
    const explanationSources = () => adapter.getCourseSources({ principal, courseId,
      expectedRevision: edited.revision, mode: "target", sourceId: null,
      targetKind: "microsequence_explanation", targetId: explanationTarget, cursor: null, limit: 1 });
    const beforeExplicitCorrection = await explanationSources();
    await executeHumanCourseTask({ adapter, principal, name: "aplicar_correcoes",
      rawArguments: { curso: title, explicacoes: [{ ...sharedExplanations()[0], fontes: [{
        fonte: "Referência sobre sockets", relacao: "supported_by",
        papeis: ["tecnica_conceitual"], ancoras: [1]
      }] }] } });
    assert.equal((await resolveHumanCourseContext({ adapter, principal, course: title })).course.revision,
      edited.revision, "Repetir fonte/âncora e conteúdo não duplica atribuição nem avança revisão.");
    assert.deepEqual((await explanationSources()).items, beforeExplicitCorrection.items,
      "Correção explícita conserva identidade, âncora e versão da atribuição existente.");
    const sourceAnalytics = await adapter.getCourseAuthoringAnalytics({
      principal,
      courseId,
      expectedCourseRevision: edited.revision,
      query: { scope: { kind: "course", ref: null } }
    });
    assert.deepEqual(sourceAnalytics.design.sourcesByRole, [{
      role: "technical_conceptual",
      sourceCount: 1,
      anchorCount: 1,
      studyUnitCount: 1
    }]);
    const exported = await adapter.getCourseAuthoringExport({ principal, courseId,
      expectedRevision: edited.revision, scope: { kind: "course", ref: null } });
    const exportedMicrosequences = exported.artifact.document.courses[0].modules.flatMap(module =>
      module.lessons.flatMap(lesson => lesson.microsequences));
    assert.deepEqual(exportedMicrosequences.map(microsequence => microsequence.explanation),
      sharedExplanations().map(support => support.conteudo));
    assert.equal(exportedMicrosequences.flatMap(microsequence => microsequence.studyUnits)
      .some(unit => Object.hasOwn(unit, "explanation")), false);
    assert.equal(exported.artifact.explanationSources.length, 2);
    assert.equal(exported.artifact.explanationSources.find(read =>
      read.query.targetId === units.items[0].curriculumPath.didacticMicrosequence.id).items[0].sourceLinks[0].sourceId,
    sourceContext.source.sourceId);
    assert.equal(JSON.stringify(exported.artifact.document).includes("contentReview"), false);
    const studyCitations = async (revision) => {
      const response = await localSupabaseRequest(
        config,
        "/rest/v1/rpc/get_course_study_citations_v1",
        {
        method: "POST",
        token: accessToken,
        body: {
          p_course_id: courseId,
          p_expected_revision: revision,
          p_study_unit_id: units.items[0].studyUnit.id
        }
        }
      );
      assert.equal(response.response.status, 200, JSON.stringify(response.payload));
      return first(response.payload);
    };
    assert.equal((await studyCitations(edited.revision)).citations.length, 1);
    const deletedUnit = units.items[0].studyUnit.id;
    await assert.rejects(adapter.commitCourseComposition({ principal, courseId,
      requestId: randomUUID(), expectedRevision: edited.revision,
      upserts: [], deletes: [{ entityType: "study_unit", entityId: deletedUnit }], sourceAttributionApplications: [] }),
    { code: "invalid_course_command" }, "A exclusão não pode descartar a referência sem conservar seu destino.");
    const retainedUnit = structuredClone(units.items[1].studyUnit);
    delete retainedUnit.id;
    delete retainedUnit.position;
    const preservedReference = await adapter.commitCourseComposition({ principal, courseId,
      requestId: randomUUID(), expectedRevision: edited.revision,
      upserts: [{ entityType: "study_unit", entityId: units.items[1].studyUnit.id,
        parentType: "microsequence", parentId: units.items[1].curriculumPath.didacticMicrosequence.id,
        position: units.items[1].studyUnit.position, content: retainedUnit }],
      deletes: [], sourceAttributionApplications: [{ studyUnitId: units.items[1].studyUnit.id, sourceLinks }] });
    const retiredAnchor = await adapter.executeCourseSourceCommand({
      principal,
      courseId,
      requestId: randomUUID(),
      expectedCourseRevision: preservedReference.revision,
      command: {
        type: "retire_anchor",
        anchorId: sourceDetail.items[0].anchors[0].anchorId,
        expectedAnchorRevision: sourceDetail.items[0].anchors[0].revision
      }
    });
    const retiredCitations = await studyCitations(retiredAnchor.courseRevision);
    assert.equal(retiredCitations.citations.length, 1,
      "Retirar uma âncora não apaga a referência já atribuída ao conteúdo.");
    assert.equal(retiredCitations.citations[0].sourceId, sourceContext.source.sourceId);
    assert.equal(retiredCitations.citations[0].anchors[0].anchorId, sourceDetail.items[0].anchors[0].anchorId);
    const retiredSource = await adapter.getCourseSources({ principal, courseId,
      expectedRevision: retiredAnchor.courseRevision, mode: "source", sourceId: sourceContext.source.sourceId,
      targetKind: null, targetId: null, cursor: null, limit: 1 });
    assert.equal(retiredSource.items[0].anchors[0].status, "retired");

    const deletion = await adapter.commitCourseComposition({
      principal,
      courseId,
      requestId: randomUUID(),
      expectedRevision: retiredAnchor.courseRevision,
      upserts: [],
      deletes: [{ entityType: "study_unit", entityId: deletedUnit }],
      sourceAttributionApplications: []
    });
    const afterDeletion = await adapter.getCourseAuthoringAnalytics({
      principal,
      courseId,
      expectedCourseRevision: deletion.revision,
      query: { scope: { kind: "course", ref: null } }
    });
    assert.equal(afterDeletion.design.studyUnitCount, 1);
    assert.equal(afterDeletion.authorship.explicitParameterOverrideCount, 0);

    const correctedSupport = sharedExplanations()[1];
    correctedSupport.conteudo.content[0].data.text += " A interface local pode continuar existindo sem uma conexão estabelecida.";
    await executeHumanCourseTask({ adapter, principal, name: "aplicar_correcoes",
      rawArguments: { curso: title, explicacoes: [correctedSupport] } });
    const correctedContext = await resolveHumanCourseContext({ adapter, principal, course: title });
    const correctedExport = await adapter.getCourseAuthoringExport({ principal, courseId,
      expectedRevision: correctedContext.course.revision, scope: { kind: "course", ref: null } });
    const correctedMicrosequences = correctedExport.artifact.document.courses[0].modules.flatMap(module =>
      module.lessons.flatMap(lesson => lesson.microsequences));
    assert.deepEqual(correctedMicrosequences[1].explanation, correctedSupport.conteudo);
    assert.deepEqual(correctedMicrosequences[0].explanation, sharedExplanations()[0].conteudo);

    return Object.freeze({
      contract: "aralearn.course-authoring-current-proof.v1",
      cleanup,
      partMicrosequenceCount: 2,
      studyUnitCount: 2,
      analysisIntroductionCount: 1,
      practiceOpportunityCount: 1,
      observationCount: 2,
      explanationCount: exportedMicrosequences.length,
      explanationSourceReadCount: exported.artifact.explanationSources.length,
      explanationCorrectionVerified: true,
      explicitExplanationSourceIdentityVerified: true,
      deletedUnitOverrideCount: 0,
      sourceTargetVersion: afterEditAttribution.items[0].targetVersion,
      retiredAnchorCitationCount: retiredCitations.citations.length
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const failures = [];
    if (actorId && courseId) {
      try {
        const removed = await ownerClient.maintainCourse({ courseId,
          operation: "delete_owned_course", confirmed: true, requestId: randomUUID() });
        assert.equal(removed.fileCleanupPending, false, "A limpeza do curso sintético deve terminar antes da conta.");
        cleanup.courseRemoved = true;
      } catch (error) { failures.push(error); }
    } else {
      cleanup.courseRemoved = true;
    }
    if (actorId && cleanup.courseRemoved) {
      try {
        const removed = await removeLocalUser(config, actorId);
        assert.ok([200, 204, 404].includes(removed.response.status), `Limpeza de conta: HTTP ${removed.response.status}`);
        cleanup.userRemoved = true;
      } catch (error) { failures.push(error); }
    } else if (!actorId) {
      cleanup.userRemoved = true;
    }
    cleanup.completed = cleanup.courseRemoved && cleanup.userRemoved && failures.length === 0;
    if (failures.length) throw new AggregateError(primaryError ? [primaryError, ...failures] : failures,
      "Falha na limpeza sintética de autoria; a identidade pendente foi preservada.");
  }
}

const executedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  const result = await runLocalCourseAuthoringCurrent();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
