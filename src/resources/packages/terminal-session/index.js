import { academicProfile } from "../../sdk/academic.js";
import {
  renderPackageCode,
  renderPackageInline,
  renderPackageProse
} from "../../sdk/html.js";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function text(value) {
  return typeof value === "string" ? value.trim() : value;
}

function terminalText(value) {
  return typeof value === "string" ? value.replace(/\r\n?/gu, "\n") : value;
}

function accessibleField(label, value) {
  const content = String(value ?? "").trim();
  return `${label}: ${content}${/[.!?;:]$/u.test(content) ? "" : "."}`;
}

function streamBlock(interaction, interactionIndex, field, label) {
  if (!hasOwn(interaction, field)) return "";
  const value = interaction[field];
  const empty = value.length === 0;
  return `<div class="package-terminal-stream is-${field}${empty ? " is-empty" : ""}" role="group" aria-label="${label} da interação ${interactionIndex + 1}"><span class="package-terminal-stream-label"><code>${field}</code><small>${label}</small></span><pre tabindex="0" aria-label="${label} da interação ${interactionIndex + 1}"><samp>${empty ? '<span class="package-terminal-empty">(vazia)</span>' : renderPackageCode(value)}</samp></pre></div>`;
}

function accessibleStream(interaction, field, label) {
  if (!hasOwn(interaction, field)) return "";
  return accessibleField(label, interaction[field] || "vazia");
}

export const terminalSessionPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.terminal_session",
    version: "1.0.0",
    label: "Sessão de terminal",
    purpose: "Representar uma interação textual temporal entre pessoa e sistema, preservando entradas, saídas, erros e mudanças observáveis de estado.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze([
      "trace-interaction",
      "interpret-output",
      "identify-error",
      "relate-action-consequence",
      "compare-state",
      "diagnose-situation",
      "predict-result",
      "recognize-command"
    ]),
    academic: academicProfile({
      domains: [
        "computação",
        "programação",
        "bancos de dados",
        "administração de sistemas",
        "infraestrutura em nuvem"
      ],
      knowledgeObjects: [
        "sessão textual de terminal",
        "interação temporal",
        "comando ou entrada",
        "saída padrão",
        "erro padrão",
        "código de saída",
        "estado observável"
      ],
      conventions: [
        "interações em ordem temporal",
        "prompt visual separado da entrada",
        "stdout e stderr identificados",
        "espaços e quebras preservados",
        "efeito ligado à interação que o produziu"
      ],
      appropriateWhen: [
        "a aprendizagem depende de acompanhar ação textual, resposta do sistema e evolução observável da sessão",
        "uma situação operacional precisa permanecer observável sem acesso ao ambiente original"
      ],
      avoidWhen: [
        "apenas a sintaxe de um trecho de código ou configuração importa",
        "registros homogêneos precisam ser comparados em linhas e colunas",
        "a ideia pode ser explicada adequadamente como prosa sem uma sequência de interações"
      ],
      technologies: ["HTML semântico", "texto pré-formatado", "CSS com rolagem local"],
      practiceModes: ["exposition", "gap", "selection"],
      taxonomy: {
        primaryFamilyId: "family.process_state",
        familyIds: ["family.process_state"],
        structureIds: [
          "structure.terminal_session",
          "structure.process",
          "structure.state_transition"
        ],
        specificity: "versatile"
      }
    }),
    responseCompatibility: Object.freeze([
      "aralearn.response.gap",
      "aralearn.response.choice"
    ]),
    limitations: Object.freeze([
      "Não executa nem interpreta comandos e não consulta shell, banco de dados, rede ou ambiente externo.",
      "Registra uma sessão observável; não comprova que o resultado ocorrerá em outra versão, configuração ou contexto.",
      "Não substitui prática real quando operar o sistema faz parte do objetivo de aprendizagem."
    ]),
    accessibility: "A sessão é uma lista cronológica; entrada, stdout, stderr, código de saída e efeito têm rótulos textuais, e todo conteúdo monoespaçado permanece selecionável."
  }),
  authoringContract: Object.freeze({
    intent: "Declare uma sessão já observada na ordem em que ocorreu, separando o que a pessoa inseriu do que o sistema devolveu.",
    required: Object.freeze(["prompt", "environment", "interactions"]),
    optional: Object.freeze(["initialContext"]),
    fieldSemantics: Object.freeze({
      prompt: "Orientação pedagógica sobre o que observar; não é o prompt visual do terminal.",
      environment: "Tecnologia e contexto de execução necessários para interpretar a sessão, sem depender de fornecedor específico.",
      initialContext: "Estado conhecido antes da primeira interação, como diretório, conexão, branch ou escopo administrativo.",
      interactions: "Sequência temporal imutável; cada item liga uma entrada à resposta e ao estado observável correspondente.",
      "interactions[].prompt": "Indicador visual apresentado pela interface antes da entrada, como $, PS>, psql=> ou equivalente.",
      "interactions[].input": "Comando ou entrada exatamente como foi apresentado, com espaços, aspas e quebras relevantes.",
      "interactions[].stdout": "Saída padrão observada. String vazia significa stream observado sem conteúdo; omissão significa que o stream não foi registrado ou não é pertinente.",
      "interactions[].stderr": "Erro padrão observado, com a mesma distinção entre vazio e omitido usada em stdout.",
      "interactions[].exitCode": "Código de saída quando o ambiente o expõe e ele ajuda a interpretar o resultado.",
      "interactions[].effect": "Rótulo curto do estado ou efeito observável produzido por esta interação, somente quando acrescenta informação."
    }),
    rules: Object.freeze([
      "Não inclua o prompt visual dentro de input; use interactions[].prompt.",
      "Preserve literalmente espaços, quebras, aspas e caracteres especiais semanticamente relevantes.",
      "Declare stdout e stderr separadamente; uma string vazia registra ausência observada de conteúdo.",
      "Cada interação precisa registrar ao menos stdout, stderr, exitCode ou effect, inclusive quando um stream estiver explicitamente vazio.",
      "Não sugira que o renderer executa, valida ou interpreta a entrada.",
      "Use lacuna de escolha somente em trecho inequívoco de input; não avalie equivalência de comandos."
    ]),
    example: Object.freeze({
      prompt: "Acompanhe como a permissão de execução altera o resultado observado a cada tentativa.",
      environment: "Bash 5.2 · GNU/Linux",
      initialContext: "O arquivo script.sh pertence ao usuário aluno e começa sem permissão de execução.",
      interactions: Object.freeze([
        Object.freeze({
          prompt: "$",
          input: "ls -l script.sh",
          stdout: "-rw-r--r-- 1 aluno grupo 340 ago 14 09:12 script.sh",
          exitCode: 0,
          effect: "permissão de execução ausente"
        }),
        Object.freeze({
          prompt: "$",
          input: "./script.sh",
          stdout: "",
          stderr: "bash: ./script.sh: Permission denied",
          exitCode: 126,
          effect: "execução recusada"
        }),
        Object.freeze({
          prompt: "$",
          input: "chmod u+x script.sh",
          stdout: "",
          exitCode: 0,
          effect: "permissão de execução concedida"
        }),
        Object.freeze({
          prompt: "$",
          input: "./script.sh",
          stdout: "Processamento concluído.",
          exitCode: 0,
          effect: "execução concluída"
        })
      ])
    })
  }),
  schema: Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["prompt", "environment", "interactions"],
    properties: {
      prompt: { type: "string", minLength: 1, maxLength: 2000 },
      environment: { type: "string", minLength: 1, maxLength: 160 },
      initialContext: { type: "string", minLength: 1, maxLength: 2000 },
      interactions: {
        type: "array",
        minItems: 1,
        maxItems: 40,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["input"],
          properties: {
            prompt: { type: "string", minLength: 1, maxLength: 200 },
            input: { type: "string", minLength: 1, maxLength: 20000 },
            stdout: { type: "string", maxLength: 200000 },
            stderr: { type: "string", maxLength: 100000 },
            exitCode: { type: "integer", minimum: -2147483648, maximum: 4294967295 },
            effect: { type: "string", minLength: 1, maxLength: 240 }
          }
        }
      }
    }
  }),
  normalize(data) {
    return {
      prompt: text(data?.prompt),
      environment: text(data?.environment),
      ...(hasOwn(data, "initialContext") ? { initialContext: text(data.initialContext) } : {}),
      interactions: (Array.isArray(data?.interactions) ? data.interactions : []).map((interaction) => ({
        ...(hasOwn(interaction, "prompt") ? { prompt: text(interaction.prompt) } : {}),
        input: terminalText(interaction?.input),
        ...(hasOwn(interaction, "stdout") ? { stdout: terminalText(interaction.stdout) } : {}),
        ...(hasOwn(interaction, "stderr") ? { stderr: terminalText(interaction.stderr) } : {}),
        ...(hasOwn(interaction, "exitCode") ? { exitCode: interaction.exitCode } : {}),
        ...(hasOwn(interaction, "effect") ? { effect: text(interaction.effect) } : {})
      }))
    };
  },
  validate(data) {
    const errors = [];
    data.interactions.forEach((interaction, index) => {
      const label = `Interação ${index + 1}`;
      if (!interaction.input.trim()) errors.push(`${label} precisa de input não vazio.`);
      if (interaction.prompt?.includes("\n")) errors.push(`${label} precisa de prompt visual em uma única linha.`);
      if (interaction.effect?.includes("\n")) errors.push(`${label} precisa de effect em uma única linha.`);
      if (!["stdout", "stderr", "exitCode", "effect"].some((field) => hasOwn(interaction, field))) {
        errors.push(`${label} precisa registrar saída, código de saída ou efeito observável.`);
      }
    });
    return errors;
  },
  render(data) {
    return `<div class="runtime-block package-terminal-session">${renderPackageProse(data.prompt)}<figure><figcaption><span>Sessão textual observada</span><strong>${renderPackageInline(data.environment)}</strong></figcaption>${data.initialContext ? `<p class="package-terminal-context"><span>Contexto inicial</span>${renderPackageInline(data.initialContext)}</p>` : ""}<ol aria-label="Interações da sessão">${data.interactions.map((interaction, index) => `<li data-terminal-interaction="${index + 1}"><header><strong>Interação ${index + 1}</strong>${interaction.effect ? `<small><span class="package-terminal-effect-label">Estado ou efeito:</span> ${renderPackageInline(interaction.effect)}</small>` : ""}</header><div class="package-terminal-input" role="group" aria-label="Entrada da interação ${index + 1}"><span class="package-terminal-stream-label"><code>input</code><small>comando ou entrada</small></span><pre tabindex="0" aria-label="Entrada da interação ${index + 1}"><code>${interaction.prompt ? `<span class="package-terminal-prompt">${renderPackageCode(interaction.prompt)} </span>` : ""}${renderPackageCode(interaction.input)}</code></pre></div><div class="package-terminal-streams">${streamBlock(interaction, index, "stdout", "Saída padrão")}${streamBlock(interaction, index, "stderr", "Erro padrão")}</div>${hasOwn(interaction, "exitCode") ? `<p class="package-terminal-exit${interaction.exitCode === 0 ? " is-success" : " is-error"}"><span>exit code</span><code>${interaction.exitCode}</code></p>` : ""}</li>`).join("")}</ol></figure></div>`;
  },
  accessibleText(data) {
    const context = data.initialContext ? ` ${accessibleField("Contexto inicial", data.initialContext)}` : "";
    const interactions = data.interactions.map((interaction, index) => [
      `Interação ${index + 1}.`,
      interaction.prompt ? accessibleField("Prompt visual", interaction.prompt) : "",
      accessibleField("Entrada", interaction.input),
      accessibleStream(interaction, "stdout", "Saída padrão"),
      accessibleStream(interaction, "stderr", "Erro padrão"),
      hasOwn(interaction, "exitCode") ? accessibleField("Código de saída", interaction.exitCode) : "",
      interaction.effect ? accessibleField("Estado ou efeito", interaction.effect) : ""
    ].filter(Boolean).join(" ")).join(" ");
    return `${data.prompt} Ambiente: ${data.environment}.${context} ${interactions}`;
  },
  editableTargets(data) {
    return [
      { path: "prompt", label: "Editar orientação" },
      { path: "environment", label: "Editar ambiente" },
      ...(data.initialContext ? [{ path: "initialContext", label: "Editar contexto inicial" }] : []),
      ...data.interactions.flatMap((interaction, index) => [
        ...(interaction.prompt ? [{ path: `interactions[${index}].prompt`, label: `Editar prompt visual ${index + 1}` }] : []),
        { path: `interactions[${index}].input`, label: `Editar entrada ${index + 1}`, preserveWhitespace: true },
        ...(hasOwn(interaction, "stdout") ? [{ path: `interactions[${index}].stdout`, label: `Editar stdout ${index + 1}`, preserveWhitespace: true }] : []),
        ...(hasOwn(interaction, "stderr") ? [{ path: `interactions[${index}].stderr`, label: `Editar stderr ${index + 1}`, preserveWhitespace: true }] : []),
        ...(interaction.effect ? [{ path: `interactions[${index}].effect`, label: `Editar efeito ${index + 1}` }] : [])
      ])
    ];
  },
  practiceTargets(data) {
    return data.interactions.map((_, index) => ({
      path: `interactions[${index}].input`,
      label: `Lacuna de escolha na entrada ${index + 1}`,
      modes: ["gap"]
    }));
  }
});
