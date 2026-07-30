import { freezeRecord } from "./engineConfigUtils.js";

const ADS_DOMAINS = Object.freeze([
  "programação",
  "matemática para computação",
  "ferramentas e terminal",
  "engenharia de software",
  "teoria computacional aplicada"
]);

function createCardAssistanceProfile({
  profileId,
  family = "ads",
  label,
  intendedDomains = ADS_DOMAINS,
  targetStudentProfile,
  learningTrail,
  microsequenceProgression
}) {
  return freezeRecord({
    profileId,
    family,
    label,
    intendedDomains: [...intendedDomains],
    didacticPolicy: {
      targetStudentProfile,
      courseSemantics: {
        learningTrail,
        microsequenceProgression
      }
    }
  });
}

export const DEFAULT_ENGINE_PROFILE_ID = "aralearn.engine.ads.general.v4";

export const ENGINE_PROFILE_SEEDS = Object.freeze({
  [DEFAULT_ENGINE_PROFILE_ID]: createCardAssistanceProfile({
    profileId: DEFAULT_ENGINE_PROFILE_ID,
    label: "Geral",
    intendedDomains: [
      "álgebra linear",
      "engenharia de software",
      "teoria dos grafos",
      "lógica de programação",
      "shell linux",
      "linguagem c",
      "administração de empresas"
    ],
    targetStudentProfile:
      "estudante-trabalhador de ADS com pouco tempo, pouca margem para erro e possível fragilidade de base",
    learningTrail: "problem_solving",
    microsequenceProgression: "worked_example_analogous_variation"
  }),
  "aralearn.engine.ads.math.v1": createCardAssistanceProfile({
    profileId: "aralearn.engine.ads.math.v1",
    label: "Matemática",
    targetStudentProfile:
      "estudante de ADS em disciplina matemática formal com dificuldade de abstração e notação",
    learningTrail: "formalization",
    microsequenceProgression: "concrete_visual_formal"
  }),
  "aralearn.engine.ads.programming.v1": createCardAssistanceProfile({
    profileId: "aralearn.engine.ads.programming.v1",
    label: "Programação procedural",
    targetStudentProfile:
      "estudante de ADS aprendendo programação passo a passo, com necessidade de explicação palavra por palavra",
    learningTrail: "procedure",
    microsequenceProgression: "worked_example_fading_execution"
  }),
  "aralearn.engine.ads.systems.v1": createCardAssistanceProfile({
    profileId: "aralearn.engine.ads.systems.v1",
    label: "Script em terminal",
    targetStudentProfile:
      "estudante de ADS em disciplina operacional de terminal, shell, ferramentas ou workflow",
    learningTrail: "procedure",
    microsequenceProgression: "isolated_operation_sequence_workflow"
  }),
  "aralearn.engine.ads.theory.v1": createCardAssistanceProfile({
    profileId: "aralearn.engine.ads.theory.v1",
    label: "Teoria e modelagem",
    targetStudentProfile:
      "estudante de ADS em disciplina conceitual, analítica ou de modelagem",
    learningTrail: "argumentation_classification",
    microsequenceProgression: "cases_contrast_criterion_classification"
  }),
  "aralearn.engine.languages.v1": createCardAssistanceProfile({
    profileId: "aralearn.engine.languages.v1",
    family: "generalized",
    label: "Idiomas",
    intendedDomains: ["idiomas", "vocabulário", "escuta", "gramática aplicada"],
    targetStudentProfile:
      "aprendiz de idioma com necessidade de exposição, retomada e uso contextual",
    learningTrail: "language_communication",
    microsequenceProgression: "contextual_input_focus_reuse"
  }),
  "aralearn.engine.research-reading.v1": createCardAssistanceProfile({
    profileId: "aralearn.engine.research-reading.v1",
    family: "generalized",
    label: "Leitura acadêmica e fundamentos",
    intendedDomains: ["artigos", "teses", "fundamentos para leigos", "avaliação crítica"],
    targetStudentProfile:
      "leitor não especialista que precisa entender argumento, conceito e estrutura de texto denso",
    learningTrail: "technical_reading",
    microsequenceProgression: "orientation_guided_reading_interpretation"
  }),
  "aralearn.engine.project-programming.v1": createCardAssistanceProfile({
    profileId: "aralearn.engine.project-programming.v1",
    family: "generalized",
    label: "Programação por projeto",
    intendedDomains: [
      "programação por projeto",
      "arquitetura de software",
      "linguagens e ferramentas"
    ],
    targetStudentProfile:
      "aprendiz de programação por projeto que precisa de progressão conforme o raciocínio do programador ideal",
    learningTrail: "complex_project",
    microsequenceProgression: "reference_case_adaptation_construction"
  })
});

export const DEFAULT_ENGINE_PROFILE = ENGINE_PROFILE_SEEDS[DEFAULT_ENGINE_PROFILE_ID];
