import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateProjectDocument } from "../src/domain/aralearnProject.js";
import { RESOURCE_CATALOG } from "../src/resources/catalog/resourceCatalog.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../src/resources/packages/index.js";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);

export const RESOURCE_CATALOG_COURSE_FILE_NAME = "aralearn-catalogo-recursos-course.json";
export const RESOURCE_CATALOG_COURSE_PATH = path.resolve(
  scriptDirectory,
  `../supabase/fixtures/catalog/${RESOURCE_CATALOG_COURSE_FILE_NAME}`
);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function identifierToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function pathSegments(value) {
  return (String(value || "").match(/[^.[\]]+|\[(\d+)\]/gu) || []).map((segment) => (
    segment.startsWith("[") ? Number(segment.slice(1, -1)) : segment
  ));
}

function readPath(root, value) {
  return pathSegments(value).reduce((current, segment) => current?.[segment], root);
}

function answerFragment(value) {
  const source = String(value ?? "").trim();
  const words = source.match(/[\p{L}\p{N}_][\p{L}\p{N}_.:/+-]*/gu) || [];
  const candidates = words.filter((word) => word.length >= 2 && word.length <= 36);
  return candidates
    .map((word) => word.replace(/[.:/+-]+$/gu, ""))
    .filter((word) => word.length >= 2)
    .sort((left, right) => right.length - left.length || compareText(left, right))[0] || "";
}

function answerForField(value) {
  const source = String(value ?? "").normalize("NFC").trim();
  if (!source.includes("\n") && source.length >= 2 && source.length <= 56) return source;
  return answerFragment(source);
}

function targetLabelSignature(value) {
  return identifierToken(value).replace(/(?:^|-)[0-9]+(?=-|$)/gu, "");
}

const PRACTICE_BLUEPRINTS = Object.freeze({
  "aralearn.resource.matrix": Object.freeze({
    targetPath: "values[0][1]",
    data: Object.freeze({
      prompt: "Complete a entrada da matriz de rotação que muda o sinal da componente horizontal.",
      name: "R(θ)",
      delimiters: "parentheses",
      values: Object.freeze([
        Object.freeze(["cos θ", "−sin θ", "0"]),
        Object.freeze(["sin θ", "cos θ", "0"]),
        Object.freeze(["0", "0", "1"])
      ])
    })
  }),
  "aralearn.resource.relation_map": Object.freeze({
    targetPath: "rightSet.items[0].label",
    data: Object.freeze({
      prompt: "Complete a área que pertence à imagem de Ana na relação de matrícula.",
      name: "M",
      relationMeaning: "está matriculado em",
      leftSet: Object.freeze({
        label: "Estudantes",
        items: Object.freeze([
          Object.freeze({ id: "ana", label: "Ana" }),
          Object.freeze({ id: "bruno", label: "Bruno" }),
          Object.freeze({ id: "carla", label: "Carla" })
        ])
      }),
      rightSet: Object.freeze({
        label: "Áreas de estudo",
        items: Object.freeze([
          Object.freeze({ id: "linear", label: "Álgebra linear" }),
          Object.freeze({ id: "networks", label: "Redes de computadores" }),
          Object.freeze({ id: "databases", label: "Bancos de dados" }),
          Object.freeze({ id: "linguistics", label: "Linguística formal" })
        ])
      }),
      relations: Object.freeze([
        Object.freeze({ id: "ana-linear", from: "ana", to: "linear" }),
        Object.freeze({ id: "ana-networks", from: "ana", to: "networks" }),
        Object.freeze({ id: "bruno-databases", from: "bruno", to: "databases" }),
        Object.freeze({ id: "carla-linguistics", from: "carla", to: "linguistics" })
      ]),
      highlight: Object.freeze({
        relations: Object.freeze(["ana-linear", "ana-networks"]),
        leftItems: Object.freeze(["ana"]),
        rightItems: Object.freeze([])
      })
    })
  }),
  "aralearn.resource.state_transition_table": Object.freeze({
    targetPaths: Object.freeze(["transitions[1].to", "transitions[5].to"]),
    choiceValues: Object.freeze(["q0", "q1", "q2"])
  })
});

function normalizeInstance({ id, packageId, version, data, slot }) {
  return RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id,
    package: packageId,
    version,
    data
  }, slot);
}

function manifestFor(packageId, slot) {
  const manifest = RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot })
    .find((candidate) => candidate.id === packageId);
  if (!manifest) throw new Error(`Package obrigatório ausente: ${packageId}.`);
  return manifest;
}

const paragraphManifest = manifestFor("aralearn.resource.paragraph", "content");

function paragraphInstance(id, text, slot = "content") {
  return normalizeInstance({
    id,
    packageId: paragraphManifest.id,
    version: paragraphManifest.version,
    slot,
    data: { text, languageTag: "pt-BR", textDirection: "auto" }
  });
}

function exampleContentInstance(manifest, id, data = null) {
  const authoring = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(manifest.id, manifest.version);
  return normalizeInstance({
    id,
    packageId: manifest.id,
    version: manifest.version,
    slot: "content",
    data: structuredClone(data || authoring.contract.example)
  });
}

/**
 * Limite de alcance da representação, escrito para quem estuda ler o exemplo. Cada frase ensina a
 * fronteira em linguagem de estudante — o que a representação comunica e qual outra leitura cabe
 * quando o objeto muda — sem colar `limitations` do manifesto nem expor package, renderer, contrato
 * ou processo de autoria. Package sem frase declarada interrompe a geração.
 */
const THEORY_SCOPE = Object.freeze({
  "aralearn.resource.paragraph": "Relações espaciais e comparações em colunas pedem outra representação; aqui, cada ideia independente ganha seu próprio trecho.",
  "aralearn.resource.code": "O trecho é lido e executado mentalmente, e o efeito das linhas depende da explicação que o acompanha.",
  "aralearn.resource.table": "Siglas, unidades e categorias precisam estar explicadas antes, e tabelas muito densas pedem recorte.",
  "aralearn.resource.annotated_text": "Cada observação precisa de um trecho preciso do texto como alvo.",
  "aralearn.resource.bpmn_process": "Coreografia e conversação entre participantes pedem outra representação, e processos muito extensos ficam mais legíveis decompostos em subprocessos.",
  "aralearn.resource.interlinear_gloss": "Cada abreviação precisa ser apresentada antes ou junto do primeiro uso, e a glosa acompanha a análise em vez de substituí-la.",
  "aralearn.resource.tree": "Relações muitos-para-muitos ou com mais de um pai pedem outra representação: a árvore exige um caminho único até a raiz.",
  "aralearn.resource.matrix": "Registros com colunas de atributos pedem uma tabela: aqui as posições das entradas participam da operação algébrica.",
  "aralearn.resource.reaction": "A equação mostra a transformação simbólica; a explicação microscópica ou energética fica em outra forma de descrição.",
  "aralearn.resource.flow": "Quando a sequência é apenas linear, prosa enumerada comunica melhor do que ramos e decisões.",
  "aralearn.resource.formula": "A leitura em palavras acompanha a expressão: símbolos sem leitura equivalente não comunicam a estrutura.",
  "aralearn.resource.plane": "O plano cobre duas dimensões; campos vetoriais, contornos e superfícies pedem outras representações.",
  "aralearn.resource.chart": "Poucos valores ficam mais claros em texto ou tabela, e distribuições pedem uma representação própria.",
  "aralearn.resource.software_system_context": "O contexto fica na fronteira externa: contêineres, componentes, classes e sequências temporais pedem outros níveis.",
  "aralearn.resource.software_container": "Aqui aparecem unidades executáveis e armazenamentos; classes, módulos internos e nós físicos ficam em outro nível de representação.",
  "aralearn.resource.system_internal_block": "Esta leitura cobre partes, portas e conectores internos; requisitos, sequência e estados pedem outras representações.",
  "aralearn.resource.graph": "Quando o desenho fica denso, o recorte ou a matriz de incidência comunicam melhor do que o nó-aresta completo.",
  "aralearn.resource.relation_map": "Interseção de conjuntos pede outro diagrama: aqui o foco são as incidências entre domínio e contradomínio.",
  "aralearn.resource.database_schema": "O esquema mostra a estrutura lógica; linhas de dados e o modelo conceitual têm representações próprias.",
  "aralearn.resource.memory_layout": "Os endereços do mapa usam a mesma base, e leituras longas se concentram nos intervalos que importam.",
  "aralearn.resource.network_topology": "As linhas mostram conexões, e não a simulação de sinais, colisões ou encaminhamento.",
  "aralearn.resource.packet_layout": "Campos extensos mantêm a largura natural e rolam na horizontal, com a explicação de cada campo na legenda.",
  "aralearn.resource.set_diagram": "O diagrama cobre até três conjuntos; mais do que isso pede uma representação própria de interseções.",
  "aralearn.resource.state_machine": "O foco é o percurso entre estados; comparar a função de transição inteira fica melhor na tabela de transição.",
  "aralearn.resource.truth_table": "A tabela cresce com o número de variáveis; com muitas delas, a leitura pede recorte.",
  "aralearn.resource.entity_relationship": "O modelo fica no nível conceitual: o esquema relacional com chaves já transformadas é outra representação.",
  "aralearn.resource.state_transition_table": "Conjuntos extensos de estados ou símbolos pedem recorte, e o percurso visual fica no diagrama de estados.",
  "aralearn.resource.call_stack": "Recursões profundas pedem recorte aos quadros que participam do raciocínio.",
  "aralearn.resource.audio": "A escuta depende do som estar disponível, e a alternativa textual acompanha cada faixa.",
  "aralearn.resource.calculator": "O cálculo real é aproximado e apoia a verificação: ele não substitui a justificativa nem resolve equações simbólicas.",
  "aralearn.resource.terminal_session": "O registro mostra a sessão observada; operar o sistema continua sendo prática no ambiente real, e o resultado pode variar em outra versão ou configuração.",
  "aralearn.response.choice": "A tarefa é reconhecer uma ou mais alternativas corretas entre opções plausíveis; produzir a resposta sem pistas é outra forma de responder.",
  "aralearn.response.gap": "A lacuna fica no lugar exato do conceito e aceita equivalentes declarados; respostas que exigem argumentação extensa pedem outra forma de responder.",
  "aralearn.response.ordering": "A ordem é reconstruída nas próprias expressões de leitura; diagramas e sequências arbitrárias não entram nesta forma de responder."
});

function theoryIntroduction(manifest) {
  const convention = manifest.academic?.conventions?.[0];
  const appropriateWhen = manifest.academic?.appropriateWhen?.[0];
  const scope = THEORY_SCOPE[manifest.id];
  if (!scope) throw new Error(`${manifest.id} não declara limite de leitura para a teoria.`);
  return [
    `${manifest.label}: ${manifest.purpose}`,
    appropriateWhen ? `É apropriado quando ${appropriateWhen}.` : "",
    convention ? `Na leitura, observe esta convenção: ${convention}.` : "",
    scope
  ].filter(Boolean).join(" ");
}

/**
 * Feedback da prática: cada package declara como explicar o resultado esperado usando os dados e a
 * resposta realmente materializados no exemplo. A explicação descreve o conteúdo ensinado
 * (semântica e notação do próprio exemplo) e nunca metadados editoriais do catálogo — finalidade,
 * adequação, limites de package, renderer ou contrato. Package sem explicação declarada interrompe
 * a geração, para que a fixture não volte a receber texto de bastidor por omissão.
 */
const PRACTICE_FEEDBACK = Object.freeze({
  "aralearn.resource.paragraph": ({ data, blanks }) =>
    `A lacuna recorta um termo da própria explicação: o trecho completo é "${data.text}", e "${blanks[0].answer}" é a palavra retirada que qualifica como as duas partes trocam mensagens.`,
  "aralearn.resource.code": ({ data, blanks }) =>
    `A lacuna fica no identificador da função, logo depois de "def": o trecho exibido está em ${data.language.toLocaleUpperCase("pt-BR") === "PYTHON" ? "Python" : data.language} e declara ${blanks[0].answer} para comparar o valor do meio com o alvo e reduzir o intervalo pela metade a cada iteração.`,
  "aralearn.resource.table": ({ data }) => {
    const [mechanism, signal, response, effect] = data.rows[0];
    return `A primeira linha cruza o mecanismo "${mechanism}" com o sinal observado "${signal}", a resposta principal "${response}" e o efeito esperado "${effect}": a lacuna recorta a coluna que nomeia o mecanismo.`;
  },
  "aralearn.resource.annotated_text": ({ data, blanks }) =>
    `A anotação "${data.annotations[0].label}" marca o trecho que nomeia quem inicia a comunicação, e no texto exibido esse trecho é "${blanks[0].answer}" — não a requisição anotada como "${data.annotations[1].label}".`,
  "aralearn.resource.bpmn_process": ({ data }) => {
    const task = data.nodes[1];
    const message = data.flows.find((flow) => flow.kind === "message");
    return `O elemento destacado é "${task.label}", a tarefa que o Cliente executa logo depois do evento inicial; dela parte o fluxo de mensagem rotulado "${message.label}" até a Organização.`;
  },
  "aralearn.resource.interlinear_gloss": ({ data, blanks }) =>
    `A forma destacada é "${blanks[0].answer}", alinhada à glosa "${data.units[0].gloss}" na primeira unidade. A tradução livre do trecho é "${data.translation}", e as abreviações ${data.abbreviations.map(({ code }) => code).join(", ")} ficam legendadas.`,
  "aralearn.resource.tree": ({ blanks }) =>
    `O nó destacado é a raiz da árvore binária de busca e recebe o rótulo "${blanks[0].answer}": dele partem os caminhos até 20 e 65 comparados na atividade. À esquerda ficam 20 com os filhos 10 e 30; à direita, 60 com 50 e 70, e 65 abaixo de 70.`,
  "aralearn.resource.matrix": ({ data, blanks }) => {
    const [first, second] = data.values.map((row) => row.map((entry) => entry));
    return `Na matriz ${data.name}, a primeira linha reúne ${first[0]} e a entrada que muda o sinal da componente horizontal, que é "${blanks[0].answer}". A segunda linha traz ${second[0]} e ${second[1]}, e a última coluna preserva o eixo perpendicular à rotação.`;
  },
  "aralearn.resource.reaction": ({ data, blanks }) => {
    const reactant = data.reactants[0];
    const product = data.products[0];
    return `A reação forma ${product.name} a partir de ${data.reactants.map(({ name }) => name).join(" e ")}: a fórmula do primeiro reagente é "${blanks[0].answer}", com coeficiente ${reactant.coefficient} e estado gasoso, e o produto ${product.formula} aparece com coeficiente ${product.coefficient} no estado líquido.`;
  },
  "aralearn.resource.flow": ({ data }) => {
    const items = data.structure.items;
    const decision = items.find((item) => item.kind === "if_then_else");
    return `O fluxograma começa no terminal "${items[0].text}" e segue para "${items[1].text}"; depois da leitura, a decisão "${decision.condition}" separa "${decision.thenBranch[0].text}" de "${decision.elseBranch[0].text}", e os dois ramos convergem no terminal "${items.at(-1).text}".`;
  },
  "aralearn.resource.formula": ({ correctOptions }) =>
    `A expressão contrai a derivada parcial de u índice i em relação a x índice j com o tensor T de índices i e j; por isso o termo correto é "${correctOptions[0].text}". A região Ω delimita a integral, f(u) é a função somada dentro dela e dV é o elemento de volume.`,
  "aralearn.resource.plane": ({ data, correctOptions }) => {
    const image = data.vectors.find(({ id }) => id === "ae1");
    return `O vetor e₁ sai da origem e termina em (1, 0); sua imagem pela transformação A é "${correctOptions[0].text}", que termina em (${image.to.join(", ")}). As demais alternativas designam o outro vetor da base, um ponto do objeto original ou a região transformada A(Q).`;
  },
  "aralearn.resource.chart": ({ data }) => {
    const [firstSeries, secondSeries] = data.series;
    return `As duas séries do gráfico são "${firstSeries.name}" e "${secondSeries.name}": o nome identifica qual arquitetura cada linha representa, por isso a primeira série fica com "${firstSeries.name}". O eixo vertical mede ${data.yAxis.label.toLocaleLowerCase("pt-BR")} em ${data.yAxis.unit}, e as barras mostram ${data.uncertainty.label.toLocaleLowerCase("pt-BR")}.`;
  },
  "aralearn.resource.software_system_context": ({ data }) =>
    `O sistema em foco no diagrama é "${data.system.label}", que ${data.system.description.replace(/\.$/u, "").toLocaleLowerCase("pt-BR")}. Estudante e Autor-pesquisador interagem com ele, enquanto o serviço de identidade e o serviço de modelo permanecem fora da fronteira.`,
  "aralearn.resource.software_container": ({ data }) => {
    const containers = data.containers.map(({ label }) => label);
    return `O primeiro contêiner do sistema ${data.system.label} é "${containers[0]}", responsável por renderizar autoria, estudo e recursos interativos. Depois dele vêm ${containers.slice(1).join(", ")}, ligados entre si e ao serviço de identidade.`;
  },
  "aralearn.resource.system_internal_block": ({ data }) => {
    const connector = data.connectors[0];
    const portLabel = (id) => data.ports.find((port) => port.id === id).label;
    const partLabel = (id) => data.parts.find((part) => part.id === id).label;
    return `O primeiro conector é "${connector.label}": ele liga a porta de saída "${portLabel(connector.fromPort)}" do ${partLabel(data.ports.find((port) => port.id === connector.fromPort).partId)} à porta de entrada "${portLabel(connector.toPort)}" da ${partLabel(data.ports.find((port) => port.id === connector.toPort).partId)}. Os outros conectores levam o comando de atuação e retornam o estado observado.`;
  },
  "aralearn.resource.graph": ({ data }) => {
    const bridge = data.edges.find(({ label }) => label === "ponte");
    return `O primeiro vértice do grafo é "${data.vertices[0].label}": os vértices aparecem rotulados de v1 a v8, e as arestas do primeiro ciclo passam por ele. A ponte liga ${bridge.from} a ${bridge.to} e separa os dois ciclos.`;
  },
  "aralearn.resource.relation_map": ({ data, blanks }) => {
    const imageLabels = data.highlight.relations.map((id) => {
      const relation = data.relations.find((candidate) => candidate.id === id);
      return data.rightSet.items.find(({ id: itemId }) => itemId === relation.to).label;
    });
    return `Na relação "${data.relationMeaning}", Ana se relaciona com ${imageLabels.map((label) => `"${label}"`).join(" e ")}; o primeiro elemento do contradomínio é "${blanks[0].answer}". A imagem de Ana reúne os elementos alcançados pelas setas que partem dela.`;
  },
  "aralearn.resource.database_schema": ({ data, blanks }) => {
    const relation = data.relations[0];
    return `A primeira relação do esquema é "${blanks[0].answer}", com a chave primária ${relation.attributes[0].name} e o atributo ${relation.attributes[1].name}. As demais relações trazem as chaves estrangeiras para cliente, pedido e produto, e o item do pedido preserva a chave composta.`;
  },
  "aralearn.resource.memory_layout": ({ data, blanks }) => {
    const segment = data.segments[0];
    return `O primeiro segmento do mapa começa em "${blanks[0].answer}" e termina em ${segment.end}: é o segmento de código, com instruções executáveis e somente leitura. Os endereços seguem em ordem crescente, na mesma base hexadecimal.`;
  },
  "aralearn.resource.network_topology": ({ data, blanks }) => {
    const [hub, repeater, switching] = data.devices.slice(2);
    const kindName = { hub: "hub", repeater: "repetidor", switch: "switch" };
    return `O primeiro equipamento é "${blanks[0].answer}", ligado ao ${kindName[hub.kind]} por um enlace Ethernet; o ${kindName[hub.kind]} e o ${kindName[repeater.kind]} apenas repetem sinais, e o ${kindName[switching.kind]} comuta quadros. As linhas mostram conexões, não tráfego simulado.`;
  },
  "aralearn.resource.packet_layout": ({ data, blanks }) => {
    const [first, second] = data.fields;
    return `O primeiro campo do cabeçalho TCP é "${blanks[0].answer}", com ${first.widthBits} bits, e identifica o processo emissor; ao lado dele fica "${second.label}", com a mesma largura. A leitura percorre as palavras de ${data.unitBits} bits na ordem de transmissão.`;
  },
  "aralearn.resource.set_diagram": ({ data, blanks }) => {
    const region = data.regions[0];
    return `O elemento destacado pertence à região "${region.label}", que reúne as linguagens presentes nos três conjuntos ao mesmo tempo: a primeira delas é "${blanks[0].answer}", e ${region.items[1]} também está nessa região. As demais regiões separam o que pertence a um ou dois conjuntos.`;
  },
  "aralearn.resource.state_machine": ({ data, blanks }) => {
    const [initial, second] = data.states;
    const acceptance = data.states.find(({ accepting }) => accepting);
    return `O estado inicial do autômato é "${blanks[0].answer}": a abertura passiva leva de ${initial.label} para ${second.label}, e o evento "${data.events[1].label}" leva de ${second.label} para ${data.states[2].label}. ${acceptance.label} é o único estado de aceitação neste recorte.`;
  },
  "aralearn.resource.truth_table": ({ data, blanks }) => {
    return `Na primeira linha da tabela-verdade, ${data.variables.join(" e ")} são ambos verdadeiros: a primeira valoração é "${blanks[0].answer}". Nessa linha, ${data.derivedColumns[0]} e ${data.derivedColumns[2]} recebem o mesmo resultado, como nas demais valorações.`;
  },
  "aralearn.resource.entity_relationship": ({ data, blanks }) => {
    const entity = data.entities[0];
    const enrollment = data.entities.at(-1);
    return `A primeira entidade do modelo é "${blanks[0].answer}", identificada por ${entity.attributes[0].name} e ligada a ${enrollment.name} pela relação "${data.relationships[0].label}". ${enrollment.name} também recebe "${data.relationships[1].label}" de ${data.entities[1].name} e guarda ${enrollment.attributes.at(-1).name}, resolvendo o muitos-para-muitos com um atributo próprio.`;
  },
  "aralearn.resource.state_transition_table": ({ data, blanks }) => {
    const blankRows = blanks.map(({ targetPath }) => {
      const index = Number(pathSegments(targetPath)[1]);
      return data.transitions[index];
    });
    const [firstBlank, secondBlank] = blankRows;
    const label = (id) => data.states.find((state) => state.id === id).label;
    const symbol = (id) => data.events.find((event) => event.id === id).label;
    const acceptance = data.states.find(({ accepting }) => accepting);
    return `Os dois destinos destacados são "${blanks[0].answer}": em ${label(firstBlank.from)}, o símbolo ${symbol(firstBlank.event)} mantém o autômato em ${label(firstBlank.to)}, e de ${label(secondBlank.from)} o símbolo ${symbol(secondBlank.event)} também retorna ao estado ${label(secondBlank.to)}. O único estado de aceitação é ${acceptance.label}.`;
  },
  "aralearn.resource.call_stack": ({ data, blanks }) => {
    const [base, caller, callee] = data.frames;
    return `O primeiro quadro da pilha é "${blanks[0].answer}", a chamada inicial na base, com a variável local ${base.fields[0].name} igual a ${base.fields[0].value} e a continuação "${base.continuation}". Acima dele ficam ${caller.functionName}, que aguarda ${callee.functionName}, e ${callee.functionName}.`;
  },
  "aralearn.resource.audio": ({ data, correctOptions }) =>
    `A faixa "${data.tracks[0].label}" traz "${data.tracks[0].alternative.text}"; a alternativa que corresponde a essa saudação é "${correctOptions[0].text}", e as demais descrevem outros atos de fala que não aparecem na gravação.`,
  "aralearn.resource.calculator": ({ correctOptions }) =>
    `A alternativa correta é "${correctOptions[0].text}": a expressão calcula √(3² + 4²) = √25 = 5, porque a diagonal é a hipotenusa do triângulo retângulo. Os catetos não se somam diretamente, e as demais alternativas descrevem um cateto, a soma dos catetos ou a soma dos quadrados.`,
  "aralearn.resource.terminal_session": ({ blanks }) =>
    `A primeira entrada da sessão é "${blanks[0].answer}": ela lista o arquivo e mostra que script.sh pertence ao usuário e ainda não tem permissão de execução. A tentativa seguinte é recusada com "Permission denied", e a permissão só é concedida por "chmod u+x script.sh".`,
  "aralearn.response.choice": ({ correctOptions }) =>
    `A alternativa correta é "${correctOptions[0].text}": o TCP entrega um fluxo de bytes confiável e ordenado e ajusta a taxa por controle de congestionamento. UDP não mantém conexão nem ordem, IP endereça e roteia datagramas, e DNS resolve nomes.`,
  "aralearn.response.gap": ({ blanks }) =>
    `O termo esperado é "${blanks[0].answer}": ele designa o conjunto de regras que permite a duas partes trocar mensagens de forma previsível, e a lacuna recorta o lugar em que esse conceito participa do trecho exibido.`,
  "aralearn.response.ordering": ({ targets }) =>
    `A ordem esperada é: ${targets.map(({ answer }, index) => `${index + 1}) "${answer}"`).join("; ")}. Cada frase encadeia a anterior: o cliente consulta o resolvedor recursivo, que pergunta ao servidor raiz, alcança o autoritativo e devolve a resposta.`
});

function practiceFeedback(manifest, { content = [], response }) {
  const explain = PRACTICE_FEEDBACK[manifest.id];
  if (typeof explain !== "function") {
    throw new Error(
      `${manifest.id} não declara explicação de feedback para a prática do catálogo.`
    );
  }
  return explain({
    manifest,
    data: content[0]?.data ?? null,
    content,
    response,
    blanks: response.blanks || [],
    targets: response.targets || [],
    correctOptions: (response.options || [])
      .filter(({ id }) => (response.answerIds || []).includes(id))
  });
}

function semanticChoiceResponse(id, manifest) {
  const choices = {
    "aralearn.resource.calculator": {
      question: "Estime a diagonal de um retângulo com lados 3 e 4. Use a expressão já preparada na calculadora para conferir: qual é o comprimento da diagonal?",
      options: [
        { id: "diagonal", text: "5 unidades de comprimento." },
        { id: "largest-side", text: "4 unidades de comprimento." },
        { id: "sum", text: "7 unidades de comprimento." },
        { id: "squares", text: "25 unidades de comprimento." }
      ],
      answerIds: ["diagonal"]
    },
    "aralearn.resource.audio": {
      question: "Ouça a faixa ou abra a alternativa textual. Qual é o sentido da saudação em inglês?",
      options: [
        { id: "morning", text: "Bom dia. Como você está?" },
        { id: "farewell", text: "Até logo. Nos vemos amanhã." },
        { id: "thanks", text: "Obrigado. O prazer foi meu." },
        { id: "night", text: "Boa noite. Durma bem." }
      ],
      answerIds: ["morning"]
    },
    "aralearn.resource.formula": {
      question: "Na expressão exibida, qual termo está contraído com a derivada parcial de uᵢ em relação a xⱼ?",
      options: [
        { id: "tensor", text: "O tensor Tⁱʲ" },
        { id: "function", text: "A função f(u)" },
        { id: "domain", text: "A região Ω" },
        { id: "measure", text: "O elemento de volume dV" }
      ],
      answerIds: ["tensor"]
    },
    "aralearn.resource.plane": {
      question: "No plano exibido, qual objeto é a imagem do vetor e₁ pela transformação A?",
      options: [
        { id: "ae1", text: "Ae₁" },
        { id: "e2", text: "e₂" },
        { id: "point", text: "p" },
        { id: "region", text: "A(Q)" }
      ],
      answerIds: ["ae1"]
    }
  }[manifest.id];
  if (!choices) return null;
  return normalizeInstance({
    id,
    packageId: "aralearn.response.choice",
    version: manifestFor("aralearn.response.choice", "response").version,
    slot: "response",
    data: {
      question: choices.question,
      selectionMode: "single",
      selectionCriterion: "correct",
      options: choices.options,
      answerIds: choices.answerIds
    }
  });
}

function gapResponse(instance, manifest, id, responseMode) {
  const requiredMode = responseMode === "choice" ? "gap" : "typing";
  const targets = RESOURCE_PACKAGE_REGISTRY.practiceTargets(instance)
    .filter((candidate) => candidate.modes.includes(requiredMode))
    .map((candidate) => ({
      ...candidate,
      value: readPath(instance.data, candidate.path),
      signature: targetLabelSignature(candidate.label)
    }))
    .map((candidate) => ({ ...candidate, answer: answerForField(candidate.value) }))
    .filter((candidate) => typeof candidate.value === "string" && candidate.answer);
  const blueprint = PRACTICE_BLUEPRINTS[manifest.id];
  const preferredPaths = blueprint?.targetPaths || (blueprint?.targetPath
    ? [blueprint.targetPath]
    : []);
  const selectedTargets = preferredPaths.length
    ? preferredPaths
      .map((preferredPath) => targets.find((candidate) => candidate.path === preferredPath))
      .filter(Boolean)
    : targets.slice(0, 1);
  if (!selectedTargets.length) return null;
  const distractorsFor = (target) => responseMode === "choice"
    ? (blueprint?.choiceValues || targets.map(({ answer }) => answer))
      .filter((answer) => answer !== target.answer)
      .filter((answer, index, values) => values.indexOf(answer) === index)
      .sort((left, right) => {
        const leftTarget = targets.find(({ answer }) => answer === left);
        const rightTarget = targets.find(({ answer }) => answer === right);
        if (!leftTarget || !rightTarget) return compareText(left, right);
        return Number(rightTarget.signature === target.signature) -
          Number(leftTarget.signature === target.signature) ||
          Math.abs(left.length - target.answer.length) -
          Math.abs(right.length - target.answer.length) ||
          compareText(leftTarget.path, rightTarget.path);
      })
      .slice(0, 3)
    : [];
  const preparedTargets = selectedTargets.map((target) => ({
    ...target,
    distractors: distractorsFor(target)
  }));
  if (responseMode === "choice" && preparedTargets.some(({ distractors }) => !distractors.length)) {
    return null;
  }
  return normalizeInstance({
    id,
    packageId: "aralearn.response.gap",
    version: manifestFor("aralearn.response.gap", "response").version,
    slot: "response",
    data: {
      prompt: `Complete ${preparedTargets.length > 1 ? "os campos destacados" : "o campo destacado"} em ${manifest.label}.`,
      blanks: preparedTargets.map((target, index) => ({
        id: preparedTargets.length > 1 ? `target-${index + 1}` : "target",
        targetInstanceId: instance.id,
        targetPath: target.path,
        label: target.label,
        responseMode,
        answer: target.answer,
        ...(responseMode === "choice"
          ? { distractors: target.distractors }
          : {})
      }))
    }
  });
}

function contentPackageStudyUnits(manifest, prefix, packageIndex) {
  const theoryExample = exampleContentInstance(manifest, `${prefix}-theory-example`);
  const practiceExample = exampleContentInstance(
    manifest,
    `${prefix}-practice-example`,
    PRACTICE_BLUEPRINTS[manifest.id]?.data
  );
  const preferredMode = packageIndex % 2 === 0 ? "choice" : "text";
  const alternateMode = preferredMode === "choice" ? "text" : "choice";
  const response = gapResponse(
    practiceExample,
    manifest,
    `${prefix}-practice-response`,
    preferredMode
  ) || gapResponse(
    practiceExample,
    manifest,
    `${prefix}-practice-response`,
    alternateMode
  ) || semanticChoiceResponse(`${prefix}-practice-response`, manifest);
  if (!response) {
    throw new Error(
      `${manifest.id} não possui prática interna materializável nem leitura semântica específica no curso do catálogo.`
    );
  }
  return [
    {
      id: `${prefix}-theory-card`,
      position: 1,
      title: `Como ler: ${manifest.label}`,
      role: "theory",
      content: [
        paragraphInstance(`${prefix}-theory-introduction`, theoryIntroduction(manifest)),
        theoryExample
      ],
      response: null,
      feedback: [],
      topics: [],
    },
    {
      id: `${prefix}-practice-card`,
      position: 2,
      title: `Pratique: ${manifest.label}`,
      role: "practice",
      content: [practiceExample],
      response,
      feedback: [paragraphInstance(
        `${prefix}-practice-feedback`,
        practiceFeedback(manifest, { content: [practiceExample], response: response.data }),
        "feedback"
      )],
      topics: [],
    }
  ];
}

function responsePackagePractice(manifest, prefix) {
  if (manifest.id === "aralearn.response.gap") {
    const content = paragraphInstance(
      `${prefix}-practice-content`,
      "O protocolo organiza regras para que duas partes troquem mensagens de forma previsível."
    );
    return {
      content: [content],
      response: normalizeInstance({
        id: `${prefix}-practice-response`,
        packageId: manifest.id,
        version: manifest.version,
        slot: "response",
        data: {
          prompt: "Complete o termo no lugar em que ele participa da explicação.",
          blanks: [{
            id: "protocol",
            targetInstanceId: content.id,
            targetPath: "text:protocol",
            label: "Conceito definido pelas regras de comunicação",
            responseMode: "text",
            answer: "protocolo"
          }]
        }
      })
    };
  }
  if (manifest.id === "aralearn.response.choice") {
    return {
      content: [],
      response: normalizeInstance({
        id: `${prefix}-practice-response`,
        packageId: manifest.id,
        version: manifest.version,
        slot: "response",
        data: {
          question: "Qual protocolo de transporte oferece fluxo de bytes confiável, ordenado e com controle de congestionamento?",
          selectionMode: "single",
          selectionCriterion: "correct",
          options: [
            { id: "tcp", text: "TCP" },
            { id: "udp", text: "UDP" },
            { id: "ip", text: "IP" },
            { id: "dns", text: "DNS" }
          ],
          answerIds: ["tcp"]
        }
      })
    };
  }
  if (manifest.id === "aralearn.response.ordering") {
    const steps = [
      { id: "resolver", text: "O cliente envia a consulta ao resolvedor recursivo" },
      { id: "root", text: "O resolvedor consulta um servidor raiz" },
      { id: "authoritative", text: "O resolvedor alcança o servidor autoritativo" },
      { id: "reply", text: "O resolvedor devolve a resposta ao cliente" }
    ];
    const content = steps.map(({ id, text }) => paragraphInstance(
      `${prefix}-practice-${id}`,
      text
    ));
    return {
      content,
      response: normalizeInstance({
        id: `${prefix}-practice-response`,
        packageId: manifest.id,
        version: manifest.version,
        slot: "response",
        data: {
          targets: steps.map(({ id, text }, index) => ({
            id,
            targetInstanceId: content[index].id,
            targetPath: "text",
            answer: text
          }))
        }
      })
    };
  }
  const authoring = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(manifest.id, manifest.version);
  return {
    content: [],
    response: normalizeInstance({
      id: `${prefix}-practice-response`,
      packageId: manifest.id,
      version: manifest.version,
      slot: "response",
      data: structuredClone(authoring.contract.example)
    })
  };
}

function responsePackageStudyUnits(manifest, prefix) {
  const practice = responsePackagePractice(manifest, prefix);
  return [
    {
      id: `${prefix}-theory-card`,
      position: 1,
      title: `Como funciona: ${manifest.label}`,
      role: "theory",
      content: [paragraphInstance(`${prefix}-theory-introduction`, theoryIntroduction(manifest))],
      response: null,
      feedback: [],
      topics: [],
    },
    {
      id: `${prefix}-practice-card`,
      position: 2,
      title: `Pratique: ${manifest.label}`,
      role: "practice",
      content: practice.content,
      response: practice.response,
      feedback: [paragraphInstance(
        `${prefix}-practice-feedback`,
        practiceFeedback(manifest, {
          content: practice.content,
          response: practice.response.data
        }),
        "feedback"
      )],
      topics: [],
    }
  ];
}

function catalogEntries() {
  const families = [...RESOURCE_CATALOG.families]
    .sort((left, right) => left.order - right.order || compareText(left.id, right.id));
  if (!families.length) {
    throw new Error("O curso compacto exige ao menos uma família no catálogo.");
  }
  const familyById = new Map(families.map((family) => [family.id, family]));
  if (familyById.size !== families.length) throw new Error("O catálogo contém ids de família duplicados.");

  const manifests = [
    ...RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "content" }),
    ...RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "response" })
  ]
    .sort((left, right) => compareText(left.id, right.id) || compareText(left.version, right.version));
  const packageKeys = new Set();
  const entries = manifests.map((manifest) => {
    const packageKey = `${manifest.id}@${manifest.version}`;
    if (packageKeys.has(packageKey)) throw new Error(`Package duplicado no registry: ${packageKey}.`);
    packageKeys.add(packageKey);
    const profile = RESOURCE_CATALOG.getProfile(manifest.id, manifest.version);
    if (!profile) throw new Error(`Package sem perfil no catálogo: ${packageKey}.`);
    if (!familyById.has(profile.primaryFamilyId)) {
      throw new Error(`Família primária desconhecida em ${packageKey}: ${profile.primaryFamilyId}.`);
    }
    if (!profile.familyIds.includes(profile.primaryFamilyId)) {
      throw new Error(`Família primária ausente de familyIds em ${packageKey}.`);
    }
    return { manifest, profile };
  });
  families.forEach((family) => {
    if (!entries.some(({ profile }) => profile.primaryFamilyId === family.id)) {
      throw new Error(`Família sem packages no curso: ${family.id}.`);
    }
  });
  return { families, entries };
}

function guide({ goal, include, exclude, notation, avoid }) {
  return { goal, include, exclude, notation, avoid };
}

function moduleForFamily(family, entries, moduleIndex) {
  const familyToken = identifierToken(family.id);
  const moduleId = `catalog-family-${familyToken}`;
  const lessonId = `${moduleId}-lesson`;
  const microsequences = entries.map(({ manifest }, packageIndex) => {
    const packageToken = identifierToken(manifest.id);
    const prefix = `catalog-${packageToken}`;
    const microsequenceId = `${prefix}-microsequence`;
    const studyUnits = manifest.slots.includes("content")
      ? contentPackageStudyUnits(manifest, prefix, packageIndex)
      : responsePackageStudyUnits(manifest, prefix);
    const microsequence = {
      id: microsequenceId,
      title: manifest.label,
      goal: `Compreender quando usar ${manifest.label} e experimentar sua interação canônica.`,
      role: "practice",
      dependsOn: [],
      covers: [manifest.id],
      checks: [
        "a representação comunica a estrutura pretendida",
        "a resposta interpreta os elementos apresentados na representação"
      ],
      errors: [],
      studyUnits
    };
    return microsequence;
  });
  return {
    id: moduleId,
    title: `${moduleIndex + 1}. ${family.label}`,
    guide: guide({
      goal: family.description,
      include: [`representações da família ${family.label}`],
      exclude: ["representações de outras famílias"],
      notation: ["significado dos símbolos e relações representadas"],
      avoid: ["escolher um recurso apenas pela aparência"]
    }),
    lessons: [{
      id: lessonId,
      title: `Recursos de ${family.label}`,
      guide: guide({
        goal: `Reconhecer e interpretar as representações de ${family.label}.`,
        include: ["leitura guiada e aplicação de cada representação"],
        exclude: ["repetições que não acrescentam uma nova relação"],
        notation: ["finalidade, convenção, limite e interação"],
        avoid: ["tratar a taxonomia como disciplina escolar rígida"]
      }),
      topics: [],
      microsequences
    }]
  };
}

export function buildResourceCatalogCourse() {
  const { families, entries } = catalogEntries();
  const modules = families.map((family, moduleIndex) => moduleForFamily(
    family,
    entries.filter(({ profile }) => profile.primaryFamilyId === family.id),
    moduleIndex
  ));
  const project = {
    contract: "aralearn.course.v1",
    scope: "course",
    courses: [{
      id: "aralearn-catalogo-recursos",
      title: "AraLearn: Catálogo de recursos",
      goal: "Conhecer, comparar e interpretar as representações e formas de resposta disponíveis no AraLearn.",
      modules
    }]
  };
  const validation = validateProjectDocument(project);
  if (!validation.ok) {
    throw new Error(`Curso de catálogo inválido:\n${JSON.stringify(validation.errors, null, 2)}`);
  }
  return validation.value;
}

export function serializeResourceCatalogCourse(project = buildResourceCatalogCourse()) {
  return `${JSON.stringify(project, null, 2)}\n`;
}

async function run() {
  const serialized = serializeResourceCatalogCourse();
  if (process.argv.includes("--check")) {
    let current;
    try {
      current = await fs.readFile(RESOURCE_CATALOG_COURSE_PATH, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error(
          `Fixture ausente: ${RESOURCE_CATALOG_COURSE_FILE_NAME}. Execute npm run resources:catalog-course.`,
          { cause: error }
        );
      }
      throw error;
    }
    if (current !== serialized) {
      throw new Error(`Fixture desatualizada: ${RESOURCE_CATALOG_COURSE_FILE_NAME}. Execute npm run resources:catalog-course.`);
    }
    console.log(`Fixture do curso de catálogo está atualizada: ${RESOURCE_CATALOG_COURSE_FILE_NAME}.`);
    return;
  }
  await fs.writeFile(RESOURCE_CATALOG_COURSE_PATH, serialized, "utf8");
  const course = JSON.parse(serialized).courses[0];
  const microsequenceCount = course.modules.reduce((total, moduleValue) => (
    total + moduleValue.lessons[0].microsequences.length
  ), 0);
  console.log(
    `Curso gerado em ${RESOURCE_CATALOG_COURSE_PATH}: ${course.modules.length} módulos, `
    + `${microsequenceCount} packages e ${microsequenceCount * 2} Unidades de estudo.`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
