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
  removeLocalUser,
  signInLocalUser
} from "../../tests/support/localSupabaseE2e.js";

function first(value) {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

async function createAuthor(config, marker) {
  const password = `Authoring-${marker}-Aa1!`;
  const created = await localSupabaseRequest(config, "/auth/v1/admin/users", {
    method: "POST",
    token: config.adminKey,
    body: {
      email: `authoring-${marker}@example.test`,
      password,
      email_confirm: true,
      app_metadata: { aralearn_role: "administrator" },
      user_metadata: { test: "course-authoring-current-local-smoke" }
    }
  });
  assert.equal(created.response.status, 200, JSON.stringify(created.payload));
  const signedIn = await signInLocalUser(config, {
    email: `authoring-${marker}@example.test`, password
  });
  assert.equal(signedIn.response.status, 200, JSON.stringify(signedIn.payload));
  return { id: created.payload.id, accessToken: signedIn.payload.access_token };
}

function paragraph(id, text) {
  return {
    id,
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: { text }
  };
}

function unitCalibration(editorialDirection) {
  return {
    parametrosPedagogicos: {
      tetoNovasUnidadesDeAnalise: 1,
      formasDeExplicacao: ["plain_definition"],
      minimoDePraticasPorRequisito: 1,
      dimensoesDeVariacaoDaPratica: ["case_or_data"]
    },
    parametrosEditoriais: {
      alvoDePalavrasPorResposta: 90,
      alvoDePalavrasPorUnidade: 60
    },
    direcaoEditorial: editorialDirection
  };
}

function explanationUnit({ calibrate = true } = {}) {
  return {
    microssequencia: "O que é um socket",
    posicao: 1,
    ...(calibrate ? {
      configuracao: unitCalibration(
        "Defina o mecanismo e contraste socket com conexão."
      )
    } : {}),
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
      modo: "expositiva",
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

function practiceUnit({ calibrate = true } = {}) {
  return {
    microssequencia: "Prática de identificação",
    posicao: 1,
    ...(calibrate ? {
      configuracao: unitCalibration(
        "Peça uma identificação rápida em um contexto concreto sem introduzir nova terminologia."
      )
    } : {}),
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
      modo: "pratica",
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

function curricularMap(course, approved) {
  return {
    curso: course,
    aprovado: approved,
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
          dependencias: [],
          cobertura: ["Compreender o papel de um socket."]
        }, {
          titulo: "Prática de identificação",
          objetivo: "Distinguir processo, socket e conexão em casos variados.",
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

export async function runLocalCourseAuthoringCurrent(environment = process.env) {
  const config = localSupabaseConfiguration(environment);
  const marker = randomUUID();
  const title = `Curso descartável de autoria ${marker.slice(0, 8)}`;
  let actorId = null;
  let accessToken = null;
  let courseId = null;
  const adapter = new CourseSupabaseAdapter({
    supabaseUrl: config.projectUrl,
    publicSupabaseUrl: config.projectUrl,
    serverApiKey: config.adminKey,
    publishableKey: config.publishableKey,
    publicAppUrl: "http://127.0.0.1:4173",
    attempts: 1
  });
  try {
    const author = await createAuthor(config, marker);
    actorId = author.id;
    accessToken = author.accessToken;
    const principal = {
      actorId,
      authenticationKind: "oauth",
      scopes: ["authoring:read", "authoring:write"]
    };
    const created = await executeHumanCourseTask({
      adapter,
      principal,
      name: "criar_curso",
      rawArguments: {
        titulo: title,
        objetivo: "Distinguir processo, socket e conexão a partir dos pré-requisitos declarados."
      }
    });
    assert.match(created.result, /Criei o curso privado/u);

    const proposedMap = curricularMap(title, false);
    await executeHumanCourseTask({
      adapter,
      principal,
      name: "salvar_mapa_curricular",
      rawArguments: proposedMap
    });
    await executeHumanCourseTask({
      adapter,
      principal,
      name: "salvar_mapa_curricular",
      rawArguments: { ...proposedMap, aprovado: true }
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
    const materialized = await executeHumanCourseTask({
      adapter,
      principal,
      name: "materializar_parte",
      rawArguments: {
        curso: title,
        parte: 1,
        unidades: [explanationUnit(), practiceUnit()]
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
        parametrosPedagogicos: { tetoNovasUnidadesDeAnalise: 1 }
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
          explanationUnit({ calibrate: false }),
          practiceUnit({ calibrate: false })
        ]
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
          explanationUnit({ calibrate: false }),
          practiceUnit({ calibrate: false })
        ]
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
          papel: "tecnica_conceitual",
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
    assert.equal(sourceDetail.items[0].sourceRole, "technical_conceptual");
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
    const retiredAnchor = await adapter.executeCourseSourceCommand({
      principal,
      courseId,
      requestId: randomUUID(),
      expectedCourseRevision: edited.revision,
      command: {
        type: "retire_anchor",
        anchorId: sourceDetail.items[0].anchors[0].anchorId,
        expectedAnchorRevision: sourceDetail.items[0].anchors[0].revision
      }
    });
    const retiredCitations = await studyCitations(retiredAnchor.courseRevision);
    assert.equal(retiredCitations.citations.length, 0);

    const deletedUnit = units.items[0].studyUnit.id;
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

    return Object.freeze({
      contract: "aralearn.course-authoring-current-proof.v1",
      partMicrosequenceCount: 2,
      studyUnitCount: 2,
      analysisIntroductionCount: 1,
      practiceOpportunityCount: 1,
      observationCount: 2,
      deletedUnitOverrideCount: 0,
      sourceTargetVersion: afterEditAttribution.items[0].targetVersion,
      retiredAnchorCitationCount: retiredCitations.citations.length
    });
  } finally {
    if (actorId && courseId) {
      await adapter.rpc("maintain_course_for_actor_v1", {
        p_actor_id: actorId,
        p_course_id: courseId,
        p_operation: "delete_owned_course",
        p_confirmed: true,
        p_request_id: randomUUID()
      }).catch(() => undefined);
    }
    await removeLocalUser(config, actorId).catch(() => undefined);
  }
}

const executedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  const result = await runLocalCourseAuthoringCurrent();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
