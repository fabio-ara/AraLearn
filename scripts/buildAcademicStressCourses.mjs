import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateProjectDocument } from "../src/domain/aralearnProject.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../src/resources/packages/index.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(directory, "../tests/fixtures/pedagogy/academic-stress-courses.json");

const SOURCES = Object.freeze({
  ifsp: "https://spo.ifsp.edu.br/tads",
  ifspPpc: "https://spo.ifsp.edu.br/images/phocadownload/DOCUMENTOS_MENU_LATERAL_FIXO/GRADUACAO/ANALISE_DESENVOLVIMENTO_SISTEMAS/28_janeiro_2020/SPO_TADS_PPC_Reformulacao_v7julho2019_ATPDGRA_002_2019.pdf",
  dataprev: "https://conhecimento.fgv.br/sites/default/files/concursos/edital-dataprev_supe-versao-final.pdf",
  tcp: "https://www.rfc-editor.org/rfc/rfc9293.html",
  bpmn: "https://www.omg.org/spec/BPMN/2.0/About-BPMN/"
});

function normalizeInstance({ id, packageId, data, slot = "content", version = "1.0.0" }) {
  return RESOURCE_PACKAGE_REGISTRY.normalizeInstance({ id, package: packageId, version, data }, slot);
}

function example(id, packageId) {
  const manifest = RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "content" })
    .find(({ id: candidateId }) => candidateId === packageId);
  if (!manifest) throw new Error(`Resource acadêmico desconhecido: ${packageId}`);
  const data = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(packageId, manifest.version).contract.example;
  return normalizeInstance({ id, packageId, version: manifest.version, data, slot: "content" });
}

function paragraph(id, text) {
  return normalizeInstance({ id, packageId: "aralearn.resource.paragraph", data: { text, languageTag: "pt-BR", textDirection: "auto" } });
}

function table(id, columns, rows) {
  return normalizeInstance({ id, packageId: "aralearn.resource.table", data: { columns, rows } });
}

function feedback(id, text) {
  return normalizeInstance({ id, packageId: "aralearn.resource.paragraph", data: { text, languageTag: "pt-BR", textDirection: "auto" }, slot: "feedback" });
}

function choice(id, question, options, answerIds, selectionMode = "single") {
  return normalizeInstance({ id, packageId: "aralearn.response.choice", slot: "response", data: { question, selectionMode, selectionCriterion: "correct", options, answerIds } });
}

function gap(id, targetInstanceId, targetPath, answer, responseMode = "choice", distractors = []) {
  return normalizeInstance({ id, packageId: "aralearn.response.gap", slot: "response", data: { blanks: [{ id: `${id}-blank`, targetInstanceId, targetPath, label: "Complete o elemento na própria representação", responseMode, answer, ...(responseMode === "choice" ? { distractors } : {}) }] } });
}

function ordering(id, content) {
  return normalizeInstance({
    id,
    packageId: "aralearn.response.ordering",
    version: "3.0.0",
    slot: "response",
    data: {
      targets: content.map((instance, index) => ({
        id: `${id}-target-${index + 1}`,
        targetInstanceId: instance.id,
        targetPath: "text",
        answer: instance.data.text
      }))
    }
  });
}

function correspondenceGaps(id, content) {
  const answers = content.data.rows.map((row) => row[1]);
  return normalizeInstance({
    id,
    packageId: "aralearn.response.gap",
    slot: "response",
    data: {
      blanks: answers.map((answer, index) => ({
        id: `${id}-blank-${index + 1}`,
        targetInstanceId: content.id,
        targetPath: `rows[${index}][1]`,
        label: `Complete a correspondência ${index + 1}`,
        responseMode: "choice",
        answer,
        distractors: answers.filter((_, candidateIndex) => candidateIndex !== index)
      }))
    }
  });
}

function card({ id, position, title, content, response = null, feedbackItems = [], topics, sources }) {
  return { id, position, title, role: response ? "practice" : "theory", content, response, feedback: feedbackItems, topics, sources };
}

function topic(id, label, kind, checks, errors) { return { id, label, kind, checks, errors }; }
function guide(goal, include, exclude, notation, avoid) { return { goal, include, exclude, notation, avoid }; }

function microsequence({ id, title, goal, role, cards, covers, dependsOn = [] }) {
  return { id, title, goal, role, dependsOn, covers, checks: ["o estudante encontra o fundamento antes da notação densa", "a prática cobra somente objetos já ensinados", "a representação acrescenta informação ao raciocínio"], errors: ["siglas ou convenções sem introdução", "mais de um núcleo conceitual novo no mesmo card", "recurso usado apenas como decoração"], cards };
}

function moduleValue({ id, title, goal, topics, microsequences }) {
  const didacticGuide = guide(goal, ["situação concreta", "vocabulário antes da notação", "explicação progressiva", "prática guiada e transferência"], ["resumo enciclopédico", "tabela de siglas como primeira explicação"], ["notação canônica da área", "rótulos completos", "uma representação por intenção"], ["presumir repertório técnico", "compactar para reduzir número de cards"]);
  return { id, title, guide: didacticGuide, lessons: [{ id: `${id}-lesson`, title, guide: didacticGuide, topics, microsequences }] };
}

const algorithmCode = example("ifsp-alg-code", "aralearn.resource.code");
function algorithmTrace(id) {
  return normalizeInstance({
    id,
    packageId: "aralearn.resource.table",
    data: {
      prompt: "Acompanhe a busca binária por 23 no vetor [4, 8, 15, 16, 23, 42]. A tabela registra o estado depois de cada ação.",
      caption: "Estado da busca binária por passo",
      layout: "wide",
      columns: ["Ação executada", "início", "fim", "meio", "valor[meio]", "Condição", "Saída"],
      rows: [
        ["Inicializar o intervalo", "0", "5", "2", "15", "15 < 23", "Descartar posições 0 a 2"],
        ["Mover início para meio + 1", "3", "5", "4", "23", "23 = 23", "Encontrado no índice 4"],
        ["Encerrar e devolver a posição", "3", "5", "4", "23", "Resultado definido", "4"]
      ]
    }
  });
}
const algorithmTraceCard = algorithmTrace("ifsp-alg-trace");
const algorithmGapContent = algorithmTrace("ifsp-alg-gap-content");
const algorithmOrderingContent = [
  paragraph("ifsp-alg-order-middle", "Calcular o índice central do intervalo"),
  paragraph("ifsp-alg-order-compare", "Comparar o valor central com o alvo"),
  paragraph("ifsp-alg-order-reduce", "Reduzir o intervalo conforme a comparação")
];
const algorithms = moduleValue({
  id: "ifsp-algorithms",
  title: "Algoritmos: do problema à execução",
  goal: "Ensinar a um iniciante o que é algoritmo e como acompanhar busca binária sem exigir programação prévia.",
  topics: [topic("alg-problem", "Problema, entrada e saída", "concept", ["distingue objetivo de procedimento"], ["confunde código com algoritmo"]), topic("alg-state", "Estado de execução", "representation", ["prevê valores após uma instrução"], ["salta alterações intermediárias"]), topic("alg-binary", "Busca binária", "procedure", ["mantém e reduz intervalo válido"], ["aplica sem dados ordenados"])],
  microsequences: [
    microsequence({ id: "alg-foundation", title: "Por que um algoritmo existe", goal: "Situar algoritmo como procedimento finito que transforma entrada em saída.", role: "explain", covers: ["alg-problem"], cards: [
      card({ id: "alg-1", position: 1, title: "Antes do código", content: [paragraph("alg-1-text", "Imagine uma lista de nomes e a tarefa de descobrir se “Lia” aparece nela. O problema declara o que se deseja obter; um algoritmo descreve uma sequência finita e não ambígua de passos para produzir essa resposta a partir da lista recebida.")], topics: ["alg-problem"], sources: [SOURCES.ifsp, SOURCES.ifspPpc] }),
      card({ id: "alg-2", position: 2, title: "Entrada, estado e saída", content: [paragraph("alg-2-text", "A lista e o nome procurado são entradas. Durante a execução, posições e valores mudam: esse conjunto momentâneo é o estado. A posição encontrada, ou a indicação de ausência, é a saída. Separar essas três ideias permite compreender uma execução antes de dominar a sintaxe de uma linguagem.")], topics: ["alg-problem", "alg-state"], sources: [SOURCES.ifspPpc] }),
      card({ id: "alg-3", position: 3, title: "Busca em lista ordenada", content: [paragraph("alg-3-text", "Se os valores estão ordenados, comparar o alvo com o elemento central informa em qual metade ele ainda pode estar. A busca binária conserva um intervalo possível e descarta apenas a metade que não pode conter o alvo.")], topics: ["alg-binary"], sources: [SOURCES.ifspPpc] })
    ] }),
    microsequence({ id: "alg-representation", title: "Do procedimento ao estado", goal: "Ler código e rastreamento como representações complementares.", role: "explain", dependsOn: ["alg-foundation"], covers: ["alg-state", "alg-binary"], cards: [
      card({ id: "alg-4", position: 1, title: "O procedimento em Python", content: [algorithmCode], topics: ["alg-binary"], sources: [SOURCES.ifspPpc] }),
      card({ id: "alg-5", position: 2, title: "O mesmo procedimento em execução", content: [algorithmTraceCard], topics: ["alg-state", "alg-binary"], sources: [SOURCES.ifspPpc] })
    ] }),
    microsequence({ id: "alg-practice", title: "Reconstruir e transferir", goal: "Praticar estado, ordem e invariantes em situações já fundamentadas.", role: "practice", dependsOn: ["alg-representation"], covers: ["alg-state", "alg-binary"], cards: [
      card({ id: "alg-6", position: 1, title: "Complete o estado", content: [algorithmGapContent], response: gap("alg-6-response", algorithmGapContent.id, "rows[1][3]", "4", "text"), feedbackItems: [feedback("alg-6-feedback", "O índice central é 4 depois que o início passa a 3 e o fim permanece 5.")], topics: ["alg-state"], sources: [SOURCES.ifspPpc] }),
      card({ id: "alg-7", position: 2, title: "Ordene os gestos de uma iteração", content: algorithmOrderingContent, response: ordering("alg-7-response", algorithmOrderingContent), feedbackItems: [feedback("alg-7-feedback", "Primeiro se escolhe o centro; a comparação fornece a informação que permite reduzir o intervalo.")], topics: ["alg-binary"], sources: [SOURCES.ifspPpc] }),
      card({ id: "alg-8", position: 3, title: "Condição de uso", content: [], response: choice("alg-8-response", "Em qual situação a busca binária pode descartar metade dos candidatos com segurança?", [{ id: "ordered", text: "Os valores estão ordenados segundo o mesmo critério da comparação." }, { id: "distinct", text: "Todos os valores são necessariamente diferentes." }, { id: "short", text: "A lista contém menos de dez valores." }, { id: "memory", text: "A lista ocupa posições contíguas de memória." }], ["ordered"]), feedbackItems: [feedback("alg-8-feedback", "A ordenação é o fundamento lógico do descarte; tamanho, unicidade e posição física não bastam.")], topics: ["alg-binary"], sources: [SOURCES.ifspPpc] })
    ] })
  ]
});

const erDiagram = example("ifsp-db-er", "aralearn.resource.entity_relationship");
const relationalSchema = example("ifsp-db-schema", "aralearn.resource.database_schema");
const erGapContent = example("ifsp-db-er-gap", "aralearn.resource.entity_relationship");
const databaseCorrespondenceContent = table(
  "ifsp-db-correspondence",
  ["Símbolo", "Função"],
  [
    ["PK", "Identificar univocamente uma tupla"],
    ["FK", "Referenciar chave de outra relação"],
    ["NULL permitido", "Admitir ausência de valor"]
  ]
);
const databases = moduleValue({
  id: "ifsp-databases", title: "Modelagem de dados: do domínio às relações", goal: "Distinguir modelo conceitual, modelo lógico e dados sem confundir suas notações.",
  topics: [topic("db-conceptual", "Modelo conceitual", "concept", ["reconhece entidades e cardinalidades"], ["trata entidade como tabela pronta"]), topic("db-relational", "Modelo relacional", "representation", ["segue PK e FK"], ["confunde linhas com esquema"]), topic("db-transform", "Transformação entre modelos", "procedure", ["resolve muitos-para-muitos por relação associativa"], ["perde atributo do relacionamento"])],
  microsequences: [
    microsequence({ id: "db-foundation", title: "Três níveis que não são a mesma coisa", goal: "Situar domínio, esquema, transformação e instância antes das notações.", role: "explain", covers: ["db-conceptual", "db-relational", "db-transform"], cards: [
      card({ id: "db-1", position: 1, title: "Comece pelo domínio", content: [paragraph("db-1-text", "Uma escola precisa registrar estudantes, turmas e matrículas. Antes de pensar em tabelas, o modelo conceitual descreve quais objetos do domínio existem, quais propriedades importam e como eles se relacionam.")], topics: ["db-conceptual"], sources: [SOURCES.ifsp, SOURCES.ifspPpc] }),
      card({ id: "db-2", position: 2, title: "O desenho conceitual", content: [erDiagram], topics: ["db-conceptual", "db-transform"], sources: [SOURCES.ifspPpc] }),
      card({ id: "db-3", position: 3, title: "Depois vem o modelo lógico", content: [paragraph("db-3-text", "No modelo relacional, cada relação possui atributos e uma chave que identifica tuplas. Uma chave estrangeira preserva uma referência entre relações. Ela não é uma seta genérica: seus valores devem corresponder à chave referenciada, salvo quando a nulabilidade permite ausência.")], topics: ["db-relational"], sources: [SOURCES.ifspPpc] }),
      card({ id: "db-4", position: 4, title: "O esquema relacional", content: [relationalSchema], topics: ["db-relational", "db-transform"], sources: [SOURCES.ifspPpc] })
    ] }),
    microsequence({ id: "db-practice", title: "Transformar sem decorar", goal: "Praticar a função de entidade associativa, PK e FK.", role: "practice", dependsOn: ["db-foundation"], covers: ["db-conceptual", "db-relational", "db-transform"], cards: [
      card({ id: "db-5", position: 1, title: "Complete o relacionamento", content: [erGapContent], response: gap("db-5-response", erGapContent.id, "relationships[0].label", "realiza", "choice", ["contém", "substitui"]), feedbackItems: [feedback("db-5-feedback", "O rótulo deve formar uma proposição compreensível no domínio: estudante realiza matrícula.")], topics: ["db-conceptual"], sources: [SOURCES.ifspPpc] }),
      card({ id: "db-6", position: 2, title: "Complete a função de cada símbolo", content: [databaseCorrespondenceContent], response: correspondenceGaps("db-6-response", databaseCorrespondenceContent), feedbackItems: [feedback("db-6-feedback", "Os três sinais descrevem propriedades distintas: identidade, referência e admissibilidade de ausência.")], topics: ["db-relational"], sources: [SOURCES.ifspPpc] }),
      card({ id: "db-7", position: 3, title: "Preserve o fato histórico", content: [], response: choice("db-7-response", "Por que ITEM_PEDIDO conserva preco_venda se PRODUTO já possui preco_atual?", [{ id: "history", text: "Para preservar o preço efetivamente praticado quando o pedido foi feito." }, { id: "duplicate", text: "Porque toda tabela deve repetir todos os atributos relacionados." }, { id: "foreign", text: "Porque preço é sempre uma chave estrangeira." }, { id: "null", text: "Para permitir que o produto não tenha identificador." }], ["history"]), feedbackItems: [feedback("db-7-feedback", "Preço atual pode mudar; o item registra um fato histórico do pedido.")], topics: ["db-transform"], sources: [SOURCES.ifspPpc] })
    ] })
  ]
});

const tcpPacket = example("dataprev-tcp-packet", "aralearn.resource.packet_layout");
const tcpState = example("dataprev-tcp-state", "aralearn.resource.state_machine");
const networkTopology = example("dataprev-tcp-topology", "aralearn.resource.network_topology");
const packetGapContent = example("dataprev-tcp-gap", "aralearn.resource.packet_layout");
const networkCorrespondenceContent = table(
  "dataprev-tcp-correspondence",
  ["Objeto", "Representação"],
  [
    ["Largura e posição do campo Janela", "Layout de pacote"],
    ["Transição até ESTABLISHED", "Diagrama de estados"],
    ["Ligação entre firewall e DMZ", "Topologia de rede"]
  ]
);
const networking = moduleValue({
  id: "dataprev-networking", title: "TCP: serviço, segmento e estado", goal: "Ensinar TCP do zero e conectar serviço percebido, campos do segmento, estados e caminho na rede.",
  topics: [topic("tcp-service", "Serviço de transporte", "concept", ["distingue fluxo de bytes e datagrama"], ["confunde TCP com aplicação"]), topic("tcp-header", "Cabeçalho TCP", "representation", ["localiza sequência, ACK e janela"], ["decora bit sem função"]), topic("tcp-state", "Estado da conexão", "concept", ["relaciona evento e transição"], ["trata estado como etapa linear"]), topic("tcp-path", "Caminho e papéis na rede", "representation", ["distingue enlace e processo"], ["confunde topologia com grafo abstrato"])],
  microsequences: [
    microsequence({ id: "tcp-foundation", title: "O problema resolvido pelo transporte", goal: "Situar aplicação, transporte e fluxo de bytes antes de mostrar números e siglas.", role: "explain", covers: ["tcp-service"], cards: [
      card({ id: "tcp-1", position: 1, title: "Duas aplicações distantes", content: [paragraph("tcp-1-text", "Um processo envia bytes em um computador e outro processo precisa recebê-los em outro. IP encaminha pacotes entre hosts, mas não oferece sozinho à aplicação a conversa confiável, ordenada e identificada por portas que este exemplo exige.")], topics: ["tcp-service"], sources: [SOURCES.dataprev, SOURCES.tcp] }),
      card({ id: "tcp-2", position: 2, title: "O que TCP oferece", content: [paragraph("tcp-2-text", "TCP apresenta às aplicações um fluxo confiável de bytes. Para sustentar essa abstração, numera bytes, confirma o que chegou, retransmite perdas e controla quanto pode permanecer em trânsito. O fluxo não preserva fronteiras das chamadas de envio da aplicação.")], topics: ["tcp-service"], sources: [SOURCES.dataprev, SOURCES.tcp] }),
      card({ id: "tcp-3", position: 3, title: "Conexão não é um fio", content: [paragraph("tcp-3-text", "Uma conexão TCP é estado mantido nas duas extremidades: endereços e portas identificam os pontos, enquanto números de sequência, confirmações e janelas evoluem com os eventos. Pacotes intermediários podem seguir caminhos diferentes; a conexão é uma relação lógica entre os processos.")], topics: ["tcp-service", "tcp-state"], sources: [SOURCES.tcp] })
    ] }),
    microsequence({ id: "tcp-representations", title: "Três perguntas, três representações", goal: "Usar layout de pacote, máquina de estados e topologia somente para os objetos que cada qual representa.", role: "explain", dependsOn: ["tcp-foundation"], covers: ["tcp-header", "tcp-state", "tcp-path"], cards: [
      card({ id: "tcp-4", position: 1, title: "Onde a informação está no segmento", content: [tcpPacket], topics: ["tcp-header"], sources: [SOURCES.dataprev, SOURCES.tcp] }),
      card({ id: "tcp-5", position: 2, title: "Como eventos mudam a conexão", content: [tcpState], topics: ["tcp-state"], sources: [SOURCES.dataprev, SOURCES.tcp] }),
      card({ id: "tcp-6", position: 3, title: "Por onde a comunicação passa", content: [networkTopology], topics: ["tcp-path"], sources: [SOURCES.dataprev] })
    ] }),
    microsequence({ id: "tcp-practice", title: "Recuperar, distinguir e transferir", goal: "Praticar campos, estados e papéis sem exigir informação não ensinada.", role: "practice", dependsOn: ["tcp-representations"], covers: ["tcp-header", "tcp-state", "tcp-path"], cards: [
      card({ id: "tcp-7", position: 1, title: "Localize a confirmação", content: [packetGapContent], response: gap("tcp-7-response", packetGapContent.id, "fields[3].label", "Número de confirmação", "choice", ["Porta de origem", "Ponteiro urgente"]), feedbackItems: [feedback("tcp-7-feedback", "O número de confirmação indica o próximo octeto esperado pelo receptor.")], topics: ["tcp-header"], sources: [SOURCES.tcp] }),
      card({ id: "tcp-8", position: 2, title: "Complete a representação de cada objeto", content: [networkCorrespondenceContent], response: correspondenceGaps("tcp-8-response", networkCorrespondenceContent), feedbackItems: [feedback("tcp-8-feedback", "Cada representação responde a uma pergunta diferente: estrutura binária, comportamento por estado ou conectividade física/lógica.")], topics: ["tcp-header", "tcp-state", "tcp-path"], sources: [SOURCES.dataprev, SOURCES.tcp] }),
      card({ id: "tcp-9", position: 3, title: "Transfira para um caso novo", content: [], response: choice("tcp-9-response", "Um receptor recebeu continuamente até o byte 5000 e anuncia que espera o próximo. Qual campo expressa diretamente essa informação?", [{ id: "ack", text: "Número de confirmação" }, { id: "source", text: "Porta de origem" }, { id: "checksum", text: "Checksum" }, { id: "offset", text: "Data Offset" }], ["ack"]), feedbackItems: [feedback("tcp-9-feedback", "A confirmação é cumulativa e informa o próximo octeto esperado.")], topics: ["tcp-header"], sources: [SOURCES.tcp] })
    ] })
  ]
});

const bpmn = example("dataprev-bpmn-process", "aralearn.resource.bpmn_process");
const bpmnGapContent = example("dataprev-bpmn-gap", "aralearn.resource.bpmn_process");
const bpmnOrderingContent = [
  paragraph("dataprev-bpmn-order-register", "Registrar solicitação"),
  paragraph("dataprev-bpmn-order-analyze", "Analisar requisitos"),
  paragraph("dataprev-bpmn-order-decide", "Verificar se os dados estão completos"),
  paragraph("dataprev-bpmn-order-issue", "Emitir decisão")
];
const businessProcess = moduleValue({
  id: "dataprev-bpmn", title: "BPMN: responsabilidade, decisão e mensagem", goal: "Introduzir BPMN a partir de um processo reconhecível antes de exigir leitura da notação.",
  topics: [topic("bpmn-responsibility", "Participantes e raias", "concept", ["localiza responsável"], ["confunde raia com etapa"]), topic("bpmn-flow", "Fluxos BPMN", "representation", ["distingue sequência e mensagem"], ["faz sequência cruzar pool"]), topic("bpmn-gateway", "Gateway exclusivo", "concept", ["interpreta condições mutuamente exclusivas"], ["trata gateway como tarefa"])],
  microsequences: [
    microsequence({ id: "bpmn-foundation", title: "Antes dos símbolos", goal: "Situar processo, participante, responsabilidade e decisão.", role: "explain", covers: ["bpmn-responsibility", "bpmn-flow", "bpmn-gateway"], cards: [
      card({ id: "bpmn-1", position: 1, title: "Um processo atravessa responsabilidades", content: [paragraph("bpmn-1-text", "Em um atendimento, cliente e organização participam do mesmo resultado, mas não executam as mesmas atividades. BPMN separa participantes em pools e pode subdividir a responsabilidade interna em raias. Pool e raia respondem a “quem?”, não a “em que ordem?”.")], topics: ["bpmn-responsibility"], sources: [SOURCES.dataprev, SOURCES.bpmn] }),
      card({ id: "bpmn-2", position: 2, title: "Duas espécies de fluxo", content: [paragraph("bpmn-2-text", "O fluxo de sequência liga elementos dentro de um participante e informa a ordem do processo. Entre participantes, o fluxo de mensagem representa comunicação. Misturar os dois apagaria a fronteira de responsabilidade que a notação foi criada para preservar.")], topics: ["bpmn-flow"], sources: [SOURCES.dataprev, SOURCES.bpmn] }),
      card({ id: "bpmn-3", position: 3, title: "A decisão exclusiva", content: [paragraph("bpmn-3-text", "Um gateway exclusivo escolhe um entre caminhos alternativos conforme condições. Ele não executa trabalho: apenas controla a divergência ou a convergência do fluxo. As condições pertencem às saídas, como “Sim” e “Não”.")], topics: ["bpmn-gateway"], sources: [SOURCES.dataprev, SOURCES.bpmn] }),
      card({ id: "bpmn-4", position: 4, title: "O processo completo", content: [bpmn], topics: ["bpmn-responsibility", "bpmn-flow", "bpmn-gateway"], sources: [SOURCES.dataprev, SOURCES.bpmn] })
    ] }),
    microsequence({ id: "bpmn-practice", title: "Ler sem decorar figuras", goal: "Praticar responsabilidade, decisão e tipo de fluxo no próprio diagrama.", role: "practice", dependsOn: ["bpmn-foundation"], covers: ["bpmn-responsibility", "bpmn-flow", "bpmn-gateway"], cards: [
      card({ id: "bpmn-5", position: 1, title: "Complete a condição", content: [bpmnGapContent], response: gap("bpmn-5-response", bpmnGapContent.id, "flows[5].label", "Sim", "choice", ["Não", "mensagem"]), feedbackItems: [feedback("bpmn-5-feedback", "A condição “Sim” conduz da verificação de completude à emissão da decisão.")], topics: ["bpmn-gateway"], sources: [SOURCES.bpmn] }),
      card({ id: "bpmn-6", position: 2, title: "Escolha o fluxo correto", content: [], response: choice("bpmn-6-response", "Qual fluxo deve representar a solicitação enviada do pool Cliente ao pool Organização?", [{ id: "message", text: "Fluxo de mensagem, porque cruza participantes." }, { id: "sequence", text: "Fluxo de sequência, porque toda seta indica sequência." }, { id: "association", text: "Uma associação sem direção, porque não há comunicação." }, { id: "gateway", text: "Um gateway paralelo, porque há dois pools." }], ["message"]), feedbackItems: [feedback("bpmn-6-feedback", "Fluxo de sequência permanece dentro do participante; a comunicação entre pools usa fluxo de mensagem.")], topics: ["bpmn-flow"], sources: [SOURCES.bpmn] }),
      card({ id: "bpmn-7", position: 3, title: "Ordene o caminho quando os dados estão completos", content: bpmnOrderingContent, response: ordering("bpmn-7-response", bpmnOrderingContent), feedbackItems: [feedback("bpmn-7-feedback", "A ordenação reproduz apenas o caminho “Sim”; o retorno para complemento pertence ao outro ramo.")], topics: ["bpmn-gateway", "bpmn-flow"], sources: [SOURCES.bpmn] })
    ] })
  ]
});

const project = {
  contract: "aralearn.library.v1", scope: "course", courses: [
    { id: "academic-ifsp-tads", title: "Laboratório acadêmico — TADS IFSP São Paulo", goal: "Testar progressão autossuficiente e representações canônicas em recortes do PPC de TADS.", modules: [algorithms, databases] },
    { id: "academic-dataprev-2026", title: "Laboratório acadêmico — Dataprev 2026", goal: "Testar progressão para iniciantes e prática densa em recortes do conteúdo programático oficial.", modules: [networking, businessProcess] }
  ]
};

const validation = validateProjectDocument(project);
if (!validation.ok) throw new Error(`Corpus acadêmico inválido:\n${JSON.stringify(validation.errors, null, 2)}`);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(validation.value, null, 2)}\n`, "utf8");
const cardCount = validation.value.courses.flatMap(({ modules }) => modules).flatMap(({ lessons }) => lessons).flatMap(({ microsequences }) => microsequences).flatMap(({ cards }) => cards).length;
console.log(`Cursos acadêmicos gerados em ${outputPath}: ${validation.value.courses.length} cursos, ${cardCount} cards.`);
