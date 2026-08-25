# Vocabulário controlado do AraLearn

Este vocabulário permite usar palavras simples na interface sem misturar conceitos de produto, pesquisa, protocolos e infraestrutura. Cada entrada liga as formas encontradas no projeto aos termos de interface e de domínio, ao símbolo técnico adotado e à definição operacional. As definições, fontes e alternativas examinadas também estão disponíveis no [registro terminológico versionado](evidence/terminologia-canonica.v1.json).

## Como as camadas se relacionam

- **Interface e documentação:** linguagem ensinável às pessoas que estudam, criam cursos ou pesquisam.
- **Domínio e pesquisa:** conceitos com definição operacional; eventos observáveis não recebem nomes de processos cognitivos não medidos.
- **Código, banco, Storage e implantação:** símbolos de implementação; não criam um segundo conceito para o mesmo objeto.
- **MCP e assistente:** distinguem instruções de sistema, pedido da tarefa, recurso MCP, ferramenta e estado persistido do Curso.
- **Segurança e acessibilidade:** qualificam permissões e estados técnicos sem convertê-los em papéis institucionais ou cognição.

Um termo pode aparecer em várias camadas, mas conserva uma única definição. Termos de interface podem ser mais curtos que o símbolo técnico somente quando esta correspondência está registrada.

## Estatutos de decisão

- `manter`: o nome coincide com o conceito, dentro da definição registrada.
- `restringir`: o nome permanece apenas no sentido e nas camadas declarados.
- `substituído`: a forma anterior saiu do uso corrente e o termo canônico assumiu seu lugar.
- `retirado`: o nome ou símbolo não representa mais um conceito corrente.

As decisões registram quando um nome permanece com sentido delimitado, quando deve ser usado apenas numa camada e quando uma forma histórica foi substituída ou retirada.

## Termos

### Superfícies do produto

#### Estudo

Superfície em que uma pessoa acessa e realiza as atividades de um curso; não designa aprendizagem comprovada nem resultado educacional. Ao abrir um curso para praticar, a pessoa entra em Estudo e percorre as unidades sem que a tela afirme que houve aprendizagem.

**Domínio e implementação.** Estudo; equivalente internacional: study surface; símbolo: `study_surface`.

**Uso.** `restringir`. Distinguir de `aprendizagem`, `domínio`, `resultado de aprendizagem`.

**Base.** [decisão de produto](visao-do-produto.md).

#### Autoria

Atividade e superfície usadas para planejar, produzir, inspecionar, anotar, corrigir e investigar um curso e seus componentes. Na Autoria, a pessoa autora percorre o curso, abre uma unidade, consulta suas fontes e registra uma observação para correção.

**Domínio e implementação.** Autoria; equivalente internacional: authoring; símbolo: `authoring_surface`.

**Uso.** `manter`. Distinguir de `chat`, `publicação`, `administração`.

**Base.** [padrão externo](https://www.w3.org/TR/ATAG20/); [decisão de produto](visao-do-produto.md).

#### Pesquisa

Superfície e conjunto de operações para configurar estudos, inspecionar medidas e exportar dados; não certifica validade científica por si só. Em Pesquisa, uma pessoa pesquisadora configura uma comparação e exporta medidas com seus dados brutos e metadados.

**Domínio e implementação.** Pesquisa; equivalente internacional: research; símbolo: `research_surface`.

**Uso.** `restringir`. Distinguir de `analytics`, `experimento`, `relatório`.

**Base.** [decisão de produto](analytics-instrucionais.md).

### Estrutura instrucional

#### Curso

Objeto instrucional vivo e identificável que reúne estrutura, conteúdo, desenho, fontes, observações, parâmetros e estado de autoria, sem exigir estágio de publicação para ser utilizável. Um curso de japonês conserva o mesmo identificador enquanto o plano, as fontes, as unidades e as observações são revistos.

**Domínio e implementação.** Curso; equivalente internacional: course; símbolo: `course`.

**Uso.** `restringir`. Distinguir de `workspace`, `publicação`, `artefato`.

**Base.** [decisão de produto](arquitetura.md).

#### Módulo

Agrupamento curricular de lições dentro de um curso, usado quando há uma organização didática justificável nesse nível. O módulo “Escrita em hiragana” reúne lições relacionadas, mas não corresponde a uma Parte de autoria.

**Domínio e implementação.** Módulo; equivalente internacional: module; símbolo: `course_module`.

**Uso.** `manter`. Distinguir de `Parte de autoria`, `unidade de estudo`, `package`.

**Base.** [definição própria](vocabulario-controlado.md).

#### Lição

Unidade curricular de um módulo que organiza uma progressão didática coerente em uma ou mais microssequências. A lição “Vogais” organiza microssequências que apresentam, praticam e retomam os cinco sinais.

**Domínio e implementação.** Lição; equivalente internacional: lesson; símbolo: `lesson`.

**Uso.** `manter`. Distinguir de `Parte`, `microssequência`, `sessão`.

**Base.** [definição própria](vocabulario-controlado.md).

#### Microssequência didática

Construto próprio do AraLearn: conjunto ordenado de unidades de estudo orientado a um objetivo instrucional delimitado, sem quantidade fixa. Uma microssequência didática pode articular explicação, exemplo e prática sobre は, sem impor um número fixo de unidades.

**Domínio e implementação.** Microssequência didática; equivalente internacional: didactic microsequence; símbolo: `didactic_microsequence`.

**Uso.** `restringir`; formas técnicas ou históricas: `microssequência`. Distinguir de `parágrafo`, `subtópico automático`, `Parte`.

**Base.** [definição própria](vocabulario-controlado.md); [evidência acadêmica](https://doi.org/10.5209/clac.96949).

#### Unidade de estudo

Menor unidade persistida, ordenável, endereçável e renderizável apresentada em Estudo e Autoria; pode ser somente expositiva ou também conter solicitação de resposta e retorno. Na rolagem móvel, cada Unidade de estudo ocupa um passo da sequência; uma pode só explicar e outra pode pedir resposta e oferecer retorno.

**Domínio e implementação.** Unidade de estudo; equivalente internacional: study unit; símbolo: `study_unit`.

**Uso.** `restringir`; formas técnicas ou históricas: `card`. Distinguir de `flashcard`, `tela`, `objeto de aprendizagem`, `parágrafo`.

**Base.** [definição própria](vocabulario-controlado.md); [evidência acadêmica](https://doi.org/10.1016/S0959-4752(02)00017-8).

#### Item de prática de recuperação

Unidade específica organizada em torno de pista e resposta para praticar recuperação da memória; não designa qualquer unidade de estudo. Uma Unidade de estudo pede a tradução de uma expressão antes de mostrar a resposta e o retorno, constituindo um item de prática de recuperação.

**Domínio e implementação.** Item de prática de recuperação; equivalente internacional: retrieval practice item; símbolo: `retrieval_practice_item`.

**Uso.** `restringir`; formas técnicas ou históricas: `flashcard`. Distinguir de `AraLearn`, `curso`, `unidade teórica`, `unidade de estudo`.

**Base.** [evidência acadêmica](https://doi.org/10.1097/ACM.0000000000005968).

### Discurso e organização textual

#### Gênero discursivo

Forma recorrente de ação social reconhecida em uma situação comunicativa, adotada aqui na linhagem socioretórica de Miller; gênero comunicativo ou textual exige qualificação teórica própria. Uma Unidade de estudo pode realizar o Gênero discursivo explicação quando seu propósito e sua situação recorrente organizam a ação comunicativa, independentemente de ser texto ou diagrama.

**Domínio e implementação.** Gênero discursivo; equivalente internacional: discourse genre; símbolo: `discourse_genre`.

**Uso.** `restringir`; formas técnicas ou históricas: `gênero de produto`. Distinguir de `gênero comunicativo sem qualificação`, `gênero textual`, `classe de produto`, `tipo de unidade`, `mídia`, `flashcard`.

**Base.** [evidência acadêmica](https://doi.org/10.1080/00335638409383686); [evidência acadêmica](https://journals.aom.org/doi/10.5465/amr.1992.4279545).

#### Segmento discursivo

Trecho delimitado segundo critério declarado, como intenção discursiva, relação retórica, subtópico, proposição ou função informacional; não existe fronteira universal independente do método. Uma explicação longa pode ser dividida em Segmentos discursivos coerentes sem presumir que cada segmento seja um parágrafo ou conceito.

**Domínio e implementação.** Segmento discursivo; equivalente internacional: discourse segment; símbolo: `discourse_segment`.

**Uso.** `restringir`; formas técnicas ou históricas: `unidade discursiva`, `segmento semântico`. Distinguir de `parágrafo`, `conceito`, `unidade de estudo`, `microssequência`.

**Base.** [evidência acadêmica](https://aclanthology.org/J97-1005/); [evidência acadêmica](https://doi.org/10.5209/clac.96949).

#### Parágrafo

Unidade gráfica e textual que contribui para a organização do texto, mas cuja fronteira não garante unidade conceitual, retórica ou instrucional. Uma representação textual pode conter dois Parágrafos dentro da mesma Unidade de estudo quando a organização discursiva o exigir.

**Domínio e implementação.** Parágrafo; equivalente internacional: paragraph unit; símbolo: `text_paragraph`.

**Uso.** `restringir`. Distinguir de `segmento semântico`, `unidade de estudo`, `conceito`.

**Base.** [evidência acadêmica](https://doi.org/10.5209/clac.96949).

### Representações e componentes

#### Representação externa

Forma perceptível pela qual conteúdo ou relações são apresentados, como texto, fórmula, tabela, gráfico, diagrama, código ou áudio. Uma mesma ideia pode aparecer como texto, diagrama ou áudio; cada forma observável é registrada como representação externa.

**Domínio e implementação.** Representação externa; equivalente internacional: external representation; símbolo: `external_representation`.

**Uso.** `restringir`; formas técnicas ou históricas: `resource`, `recurso de card`. Distinguir de `MCP Resource`, `ativo de mídia`, `formato de resposta`, `pacote de componente`.

**Base.** [evidência acadêmica](https://doi.org/10.1016/j.learninstruc.2006.03.001).

#### Componente didático

Capacidade modular instalada que produz uma representação externa, um formato de resposta ou ambos para uma Unidade de estudo, sem se confundir com a instância renderizada nem com seu pacote técnico. O componente de escolha apresenta alternativas em um formato de resposta selecionável; cada uso gera uma instância dentro de uma Unidade de estudo.

**Domínio e implementação.** Componente didático; equivalente internacional: instructional component; símbolo: `instructional_component`.

**Uso.** `restringir`. Distinguir de `representação externa`, `formato de resposta`, `pacote de componente`, `componente de interface`.

**Base.** [definição própria](vocabulario-controlado.md); [observação técnica](componentes-didaticos.md).

#### Formato de resposta

Estrutura pela qual a pessoa responde a uma atividade e pela qual a resposta pode ser interpretada ou receber retorno. Uma atividade pode aceitar escolha, texto digitado ou ordenação; o Formato de resposta declara essa estrutura sem definir o conteúdo.

**Domínio e implementação.** Formato de resposta; equivalente internacional: response format; símbolo: `response_format`.

**Uso.** `restringir`; formas técnicas ou históricas: `response resource`, `response package`. Distinguir de `representação externa`, `resposta do estudante`, `retorno`.

**Base.** [observação técnica](componentes-didaticos.md).

#### Ativo de mídia

Arquivo binário ou documento armazenado e referenciado por uma representação, como imagem, áudio, vídeo ou anexo. Um arquivo de imagem ou áudio persistido no Storage é um Ativo de mídia referenciado por uma representação.

**Domínio e implementação.** Ativo de mídia; equivalente internacional: media asset; símbolo: `media_asset`.

**Uso.** `restringir`; formas técnicas ou históricas: `arquivo de mídia`, `media asset`. Distinguir de `representação externa`, `fonte`, `artefato de curso`.

**Base.** [padrão externo](https://www.rfc-editor.org/rfc/rfc3986.html).

#### Pacote de componente

Unidade técnica versionada que reúne contrato, esquema, validação e implementação de uma representação ou formato de resposta. Um Pacote de componente agrupa o contrato e o código distribuível de um componente, sem incorporar o conteúdo de cada curso.

**Domínio e implementação.** Pacote de componente; equivalente internacional: component package; símbolo: `component_package`.

**Uso.** `restringir`; formas técnicas ou históricas: `resource package`, `package de resource`. Distinguir de `representação externa`, `MCP Resource`, `módulo curricular`.

**Base.** [observação técnica](componentes-didaticos.md).

#### Nomes intermediários abolidos da biblioteca

Registro histórico dos dois símbolos intermediários já retirados da superfície MCP de descoberta de componentes. Os nomes consultarRecursosDeCard e consultarPackagesDeCard aparecem somente nesta ficha de formas abolidas; nenhuma ferramenta MCP corrente deve expô-los.

**Domínio e implementação.** Nomes intermediários abolidos da biblioteca; equivalente internacional: abolished resource discovery tools; símbolo: `abolished_resource_discovery_tools`.

**Uso.** `retirado`; formas técnicas ou históricas: `consultarRecursosDeCard`, `consultarPackagesDeCard`. Distinguir de `MCP Resource`, `knowledge base`, `catálogo público de cursos`.

**Base.** [evidência histórica](vocabulario-controlado.md).

#### Biblioteca de componentes didáticos

Ferramenta única de descoberta e inspeção seletiva dos componentes instalados, com busca por intenção e leitura do contrato exato de cada componente. O assistente consulta seletivamente a biblioteca para descobrir quais componentes didáticos estão instalados antes de planejar uma unidade.

**Domínio e implementação.** Biblioteca de componentes didáticos; equivalente internacional: didactic component library tool; símbolo: `consultarBibliotecaDeComponentesDidaticos`.

**Uso.** `substituído`; formas técnicas ou históricas: `consultarBibliotecaDeResources`. Distinguir de `MCP Resource`, `knowledge base`, `catálogo público de cursos`.

**Base.** [observação técnica](componentes-didaticos.md).

#### Relação entre representações

Relação semântica declarada entre representações, como complementaridade, especialização, redundância, exemplificação ou interferência potencial. Texto e diagrama de uma unidade podem ser complementares; a Relação entre representações explicita o vínculo sem declarar equivalência automática.

**Domínio e implementação.** Relação entre representações; equivalente internacional: interrepresentational relation; símbolo: `representation_relation`.

**Uso.** `restringir`; formas técnicas ou históricas: `multimodalidade`. Distinguir de `tipo MIME`, `coocorrência`, `equivalência automática`.

**Base.** [evidência acadêmica](https://doi.org/10.1016/j.learninstruc.2006.03.001); [evidência acadêmica](https://doi.org/10.1177/1470357205055928).

#### Transformação entre representações

Mapeamento documentado entre representação de origem e destino com registro do conteúdo preservado, acrescentado, omitido ou reinterpretado. Ao converter uma explicação verbal em diagrama, a Transformação entre representações registra escolhas e perdas possíveis.

**Domínio e implementação.** Transformação entre representações; equivalente internacional: representation transformation; símbolo: `representation_transformation`.

**Uso.** `restringir`; formas técnicas ou históricas: `tradutibilidade entre texto e visual`. Distinguir de `tradução sem perda`, `conversão de arquivo`, `redundância`.

**Base.** [evidência acadêmica](https://doi.org/10.1177/1470357205055928); [padrão externo](https://www.w3.org/TR/prov-dm/).

### Processo de autoria

#### Parte de autoria

Unidade operacional configurável que agrupa planejamento, materialização, auditoria e revisão para tornar a produção pelo assistente manejável; não acrescenta nível à hierarquia didática. O assistente pode planejar, produzir e auditar em uma mesma Parte de autoria várias microssequências que caibam no contexto disponível.

**Domínio e implementação.** Parte de autoria; equivalente internacional: authoring part; símbolo: `authoring_part`.

**Uso.** `restringir`; formas técnicas ou históricas: `Parte`. Distinguir de `módulo`, `lição`, `lote de materialização`, `versão`.

**Base.** [decisão de produto](guia-professor-autor.md).

#### Plano instrucional vivo

Estado revisável que explicita objetivos, organização, cobertura, progressão, prática, representações previstas, fontes e critérios de conclusão da materialização. O plano de um curso registra objetivos e organização prevista, mas pode ser ampliado quando a autoria revela que um tópico exige mais desenvolvimento.

**Domínio e implementação.** Plano instrucional vivo; equivalente internacional: living instructional plan; símbolo: `instructional_plan`.

**Uso.** `restringir`; formas técnicas ou históricas: `planejamento`. Distinguir de `prompt`, `blueprint imutável`, `curso materializado`.

**Base.** [decisão de produto](guia-professor-autor.md).

#### Produção

Transformação controlada do plano e do estado autoral em unidades de estudo persistidas, renderizáveis e novamente auditáveis. Na interface, a pessoa acompanha a Produção; no domínio, cada transformação de uma Parte planejada em unidades persistidas e auditáveis é uma Materialização.

**Domínio e implementação.** Materialização; equivalente internacional: materialization; símbolo: `course_materialization`.

**Uso.** `restringir`; formas técnicas ou históricas: `materialização`. Distinguir de `publicação`, `geração de texto`, `release`.

**Base.** [definição própria](guia-professor-autor.md).

#### Auditoria instrucional

Exame explícito e rastreável que confronta plano, parâmetros, fontes, materialização e critérios, produzindo achados sem alterar automaticamente o curso. Depois de produzir uma Parte, a Auditoria instrucional compara unidades, objetivos, parâmetros, fontes e observações e gera achados verificáveis.

**Domínio e implementação.** Auditoria instrucional; equivalente internacional: instructional audit; símbolo: `instructional_audit`.

**Uso.** `restringir`; formas técnicas ou históricas: `auditoria`. Distinguir de `correção`, `teste automatizado`, `aprovação`.

**Base.** [decisão de produto](auditoria-de-conformidade-instrucional.md).

#### Correção autoral

Alteração autorizada do curso em resposta a um achado ou observação, seguida de verificação independente do resultado. Uma Correção autoral altera uma unidade por causa de um achado ou observação e registra o vínculo com a razão da mudança.

**Domínio e implementação.** Correção autoral; equivalente internacional: authoring correction; símbolo: `authoring_correction`.

**Uso.** `restringir`; formas técnicas ou históricas: `reparo`. Distinguir de `auditoria`, `revisão`, `resolução do achado`.

**Base.** [decisão de produto](auditoria-de-conformidade-instrucional.md).

#### Revisão autoral

Leitura e reconsideração humana ou assistida de conteúdo e desenho, que pode ou não resultar em alteração. A pessoa autora relê uma Parte já materializada e decide manter, comentar ou solicitar correção de uma unidade.

**Domínio e implementação.** Revisão autoral; equivalente internacional: authoring review; símbolo: `authoring_review`.

**Uso.** `restringir`; formas técnicas ou históricas: `revisão de conteúdo`. Distinguir de `versão de estado`, `auditoria`, `correção`.

**Base.** [definição própria](auditoria-de-conformidade-instrucional.md).

#### Versão de estado

Contador monotônico usado para detectar concorrência e ordenar mutações; não é uma revisão editorial nem uma cópia integral do curso. Antes de uma alteração composta, uma Versão de estado permite identificar exatamente qual estado do curso foi analisado e qual resultou da mudança.

**Domínio e implementação.** Versão de estado; equivalente internacional: state version; símbolo: `state_version`.

**Uso.** `restringir`; formas técnicas ou históricas: `revision`, `revisão CAS`. Distinguir de `revisão autoral`, `versão de contrato`, `checkpoint`.

**Base.** [observação técnica](arquitetura.md).

### Evidência, anotação e proveniência

#### Fonte

Entidade identificável da qual uma afirmação, representação ou transformação deriva, com identidade e versão quando disponíveis. Um artigo, livro, documento interno ou entrevista usado para sustentar uma afirmação é registrado como Fonte identificável.

**Domínio e implementação.** Fonte; equivalente internacional: source; símbolo: `source_entity`.

**Uso.** `restringir`. Distinguir de `citação`, `âncora`, `proveniência`, `ativo de mídia`.

**Base.** [padrão externo](https://www.w3.org/TR/prov-dm/).

#### Âncora de fonte

Localizador preciso de um trecho ou região dentro de uma fonte, como página, intervalo, seletor, fragmento ou timestamp. Uma afirmação da unidade aponta para a página 42 e o trecho correspondente de uma Fonte por meio de uma Âncora de fonte.

**Domínio e implementação.** Âncora de fonte; equivalente internacional: source anchor; símbolo: `source_anchor`.

**Uso.** `restringir`; formas técnicas ou históricas: `âncora`, `ancoragem`. Distinguir de `fonte`, `citação`, `evidência`.

**Base.** [padrão externo](https://www.w3.org/TR/annotation-model/); [padrão externo](https://www.rfc-editor.org/rfc/rfc3986.html).

#### Proveniência

Registro das entidades, atividades, agentes, derivações e versões envolvidos na produção ou transformação de conteúdo e dados. Ao corrigir uma unidade, o AraLearn registra que uma pessoa ou ferramenta realizou a atividade usando determinadas fontes e produzindo novo estado.

**Domínio e implementação.** Proveniência; equivalente internacional: provenance; símbolo: `provenance_record`.

**Uso.** `restringir`. Distinguir de `histórico de chat`, `citação`, `log`, `autoria comprovada`.

**Base.** [padrão externo](https://www.w3.org/TR/prov-dm/).

#### Observação

Anotação com corpo e alvo endereçável, autoria, motivação e estado; na interface, o rótulo simples “Observação” é mapeado explicitamente para este conceito de domínio. Na interface aparece “Observação”; ao enviá-la sobre uma unidade específica, o domínio registra uma Anotação ancorada com corpo, alvo, autoria e motivação.

**Domínio e implementação.** Anotação ancorada; equivalente internacional: anchored annotation; símbolo: `anchored_annotation`.

**Uso.** `restringir`; formas técnicas ou históricas: `comentário`. Distinguir de `achado de auditoria`, `mensagem de chat`, `nota privada sem alvo`.

**Base.** [padrão externo](https://www.w3.org/TR/annotation-model/); [decisão de produto](observacoes-pedagogicas.md).

#### Achado de auditoria

Afirmação estruturada, verificável e situada produzida por uma auditoria, com regra, alvo, evidência, estado e decisão separados. A Auditoria registra que uma afirmação não possui âncora suficiente como um Achado de auditoria, distinto da observação que pode tê-lo motivado.

**Domínio e implementação.** Achado de auditoria; equivalente internacional: audit finding; símbolo: `audit_finding`.

**Uso.** `restringir`; formas técnicas ou históricas: `finding`, `achado`. Distinguir de `anotação ancorada`, `erro confirmado`, `correção`.

**Base.** [decisão de produto](auditoria-de-conformidade-instrucional.md).

#### Citação bibliográfica

Representação bibliográfica usada para identificar e apresentar uma fonte segundo uma convenção acadêmica. Uma Fonte acadêmica recebe autores, título, ano, DOI e demais elementos necessários para gerar uma Citação bibliográfica verificável.

**Domínio e implementação.** Citação bibliográfica; equivalente internacional: scholarly citation; símbolo: `scholarly_citation`.

**Uso.** `restringir`; formas técnicas ou históricas: `citação`. Distinguir de `fonte`, `âncora`, `proveniência`.

**Base.** [definição própria](criar-cursos-pelo-chat.md).

### Parâmetros e regras

#### Parâmetro de desenho instrucional

Propriedade controlável do desenho com definição versionada, esquema, escopos admitidos, origem, valor efetivo e limitações explícitas. O teto de novas unidades de análise por Unidade expositiva é um Parâmetro de desenho instrucional com inteiro positivo, escopos e origem declarados.

**Domínio e implementação.** Parâmetro de desenho instrucional; equivalente internacional: instructional design parameter; símbolo: `design_parameter`.

**Uso.** `restringir`; formas técnicas ou históricas: `parâmetro`. Distinguir de `configuração técnica`, `métrica`, `restrição editorial`.

**Base.** [definição própria](desenho-instrucional-parametrizado.md).

#### Configuração técnica

Valor que altera operação ou integração do software sem representar, por si, uma propriedade pedagógica pesquisada. Um limite de bytes aceito pelo Storage é uma Configuração técnica e não deve aparecer como escolha pedagógica.

**Domínio e implementação.** Configuração técnica; equivalente internacional: technical configuration; símbolo: `technical_configuration`.

**Uso.** `restringir`; formas técnicas ou históricas: `configuração`. Distinguir de `parâmetro de desenho instrucional`, `política`, `condição experimental`.

**Base.** [observação técnica](vocabulario-controlado.md).

#### Política aplicável

Regra versionada que permite, restringe ou exige comportamento e que é efetivamente aplicada por uma fronteira do sistema. A Política de componentes registra catálogo, disponibilidade, exclusões e preferências e é imposta na mesma transação da materialização.

**Domínio e implementação.** Política aplicável; equivalente internacional: enforced policy; símbolo: `enforced_policy`.

**Uso.** `restringir`; formas técnicas ou históricas: `policy`, `política`. Distinguir de `preferência`, `parâmetro`, `documentação sem execução`.

**Base.** [observação técnica](desenho-instrucional-parametrizado.md).

#### Valor padrão

Valor explicitamente definido e versionado que se aplica na ausência de atribuição mais específica; não é uma recomendação universal. Sem atribuição aplicável, o teto de novas unidades usa o Valor padrão 2 e mostra origem system_default, sem criar uma linha herdada.

**Domínio e implementação.** Valor padrão; equivalente internacional: default value; símbolo: `default_value`.

**Uso.** `restringir`; formas técnicas ou históricas: `default`. Distinguir de `auto`, `herança`, `melhor prática`.

**Base.** [definição própria](desenho-instrucional-parametrizado.md).

#### Herança calculada

Resultado do resolvedor que aplica um valor de escopo ancestral quando não existe atribuição de maior autoridade no alvo; não é uma atribuição gravada. Uma Microssequência mostra o valor efetivo herdado da Lição ou do Curso e informa o escopo fonte sem copiar a atribuição.

**Domínio e implementação.** Herança calculada; equivalente internacional: resolved inheritance; símbolo: `resolved_inheritance`.

**Uso.** `restringir`; formas técnicas ou históricas: `herança`. Distinguir de `cópia`, `default`, `sobrescrita`.

**Base.** [definição própria](desenho-instrucional-parametrizado.md).

#### Sobrescrita explícita

Atribuição intencional em um escopo que substitui integralmente o valor herdado segundo a regra de autoridade declarada. A pessoa define para uma microssequência um valor diferente do curso; a Sobrescrita explícita fica registrada naquele escopo.

**Domínio e implementação.** Sobrescrita explícita; equivalente internacional: explicit override; símbolo: `explicit_override`.

**Uso.** `restringir`; formas técnicas ou históricas: `sobrescrita`, `override`. Distinguir de `edição do default`, `herança`, `lock de pesquisa`.

**Base.** [definição própria](desenho-instrucional-parametrizado.md).

#### Orientação de autoria

Revisão imutável do texto original de uma orientação, ligada a um Curso, escopo, origem, ator, canal e revisão do Curso. Uma orientação da Lição complementa a orientação do Curso; a leitura efetiva preserva os dois textos e suas revisões na ordem estrutural.

**Domínio e implementação.** Revisão de orientação de autoria; equivalente internacional: authoring guidance revision; símbolo: `course_authoring_guidance_revision`.

**Uso.** `restringir`; formas técnicas ou históricas: `orientação autoral`, `guidance`. Distinguir de `prompt`, `campo do plano`, `interpretação automatizada`.

**Base.** [definição própria](desenho-instrucional-parametrizado.md).

#### Interpretação da orientação

Leitura estruturada, versionada e separada de uma revisão exata de orientação, com resumo, diretivas, divergências e perguntas. A interpretação registra uma diretiva prefer e uma pergunta para a revisão exata sem alterar uma palavra do texto original.

**Domínio e implementação.** Interpretação da orientação; equivalente internacional: authoring guidance interpretation; símbolo: `course_authoring_guidance_interpretation`.

**Uso.** `restringir`; formas técnicas ou históricas: `interpretação de orientação`. Distinguir de `orientação original`, `raciocínio privado`, `resposta do modelo`.

**Base.** [definição própria](desenho-instrucional-parametrizado.md).

#### Política de componentes

Política completa e versionada por escopo que fixa catálogo, disponibilidade, referências permitidas, excluídas e preferidas e é imposta na materialização. Uma Lição permite somente referências declaradas, exclui um pacote e prefere outro; a exclusão vence e o uso real ainda precisa ser validado.

**Domínio e implementação.** Política de componentes do Curso; equivalente internacional: course component policy; símbolo: `course_component_policy`.

**Uso.** `restringir`. Distinguir de `catálogo`, `componente usado`, `parâmetro pedagógico`.

**Base.** [definição própria](desenho-instrucional-parametrizado.md).

#### Densidade conceitual operacionalizada

Construto de pesquisa calculado a partir de unidades semânticas anotadas e de um denominador explícito, segundo esquema, versão e procedimento de validação declarados. A pesquisa define e mede quantas unidades conceituais relevantes aparecem em determinada extensão, em vez de usar “densidade” como impressão informal.

**Domínio e implementação.** Densidade conceitual operacionalizada; equivalente internacional: operationalized conceptual density; símbolo: `conceptual_density_measure`.

**Uso.** `restringir`; formas técnicas ou históricas: `densidade conceitual`. Distinguir de `quantidade de caracteres`, `complexidade textual`, `carga cognitiva`.

**Base.** [evidência acadêmica](https://doi.org/10.1037/0033-295X.85.5.363); [evidência acadêmica](https://doi.org/10.1037/0003-066X.50.9.741).

#### Extensão editorial

Contagem observável de caracteres, palavras, linhas, altura, duração ou volume de dados usada para ergonomia, edição ou limites técnicos, sem inferência pedagógica automática. O AraLearn registra caracteres, palavras, duração ou dimensão visual como Extensão editorial, separada da densidade conceitual.

**Domínio e implementação.** Extensão editorial; equivalente internacional: editorial extent; símbolo: `editorial_extent`.

**Uso.** `restringir`; formas técnicas ou históricas: `limite de caracteres`. Distinguir de `densidade conceitual`, `dificuldade`, `completude`, `qualidade`.

**Base.** [evidência acadêmica](https://doi.org/10.1080/01449290410001715714).

### Desenho e mensuração de pesquisa

#### Variante comparável

Curso independente criado de um ponto comum de planejamento, com diferenças declaradas de parâmetros ou política de componentes. Não cria condição, participantes, atribuição, medida, desfecho ou inferência causal. A mesma origem e o mesmo plano geram as variantes A e B, com densidades conceituais diferentes e identificadores próprios.

**Domínio e implementação.** Variante comparável; equivalente internacional: comparable course variant; símbolo: `course_variant_comparison`.

**Uso.** `manter`; formas técnicas ou históricas: `variante`. Distinguir de `experimento`, `condição experimental`, `versão de estado`, `ramificação Git`.

**Base.** [decisão de produto](experimentos-instrucionais-parametrizados.md): A capacidade local cria variantes comparáveis, sem ativar Experimento, participantes, atribuição, medidas ou análise causal.

#### Experimento

Protocolo de pesquisa que compara condições mediante fatores, atribuição, medidas e análise previamente declarados; a estrutura técnica não garante validade causal. Um experimento, se vier a ser implementado, compara condições previamente definidas, participantes elegíveis, medidas e um plano de análise documentado.

**Domínio e implementação.** Experimento; equivalente internacional: experiment; símbolo: `research_experiment`.

**Uso.** `restringir`. Distinguir de `variante comparável`, `teste A/B informal`, `analytics`.

**Base.** [decisão de produto](experimentos-instrucionais-parametrizados.md): A capacidade local cria variantes comparáveis, sem ativar Experimento, participantes, atribuição, medidas ou análise causal; [evidência acadêmica](https://www.cengage.com/c/experimental-and-quasi-experimental-designs-for-generalized-causal-inference-2e-shadish-cook-campbell/9780395615560/): Fundamenta desenho experimental, quase-experimental e validade causal; não implica que o esquema técnico do AraLearn garanta um experimento válido.

#### Condição experimental

Combinação declarada de níveis de fatores à qual uma participação é vinculada em um experimento. Não é criada por Variante comparável. Em um futuro Experimento, a Condição experimental A poderia aplicar menor densidade conceitual e a B maior densidade, mantendo os demais fatores definidos.

**Domínio e implementação.** Condição experimental; equivalente internacional: experimental condition; símbolo: `experimental_condition`.

**Uso.** `restringir`; formas técnicas ou históricas: `condição`. Distinguir de `variante comparável`, `parâmetro isolado`, `grupo de acesso`.

**Base.** [definição própria](experimentos-instrucionais-parametrizados.md): A capacidade local de variantes comparáveis explicita que diferenças declaradas não criam Condição experimental.

#### Medida observada

Valor obtido por instrumento ou procedimento declarado, antes de qualquer interpretação como indicador de um construto. O tempo registrado entre abertura e resposta é uma Medida observada; ainda não é interpretação de atenção ou aprendizagem.

**Domínio e implementação.** Medida observada; equivalente internacional: observed measure; símbolo: `observed_measure`.

**Uso.** `restringir`; formas técnicas ou históricas: `medida`. Distinguir de `métrica calculada`, `indicador`, `construto`.

**Base.** [evidência acadêmica](https://doi.org/10.1037/0003-066X.50.9.741).

#### Métrica calculada

Resultado operacional regenerável de fórmula versionada aplicada a fatos ou medidas, como contagem, razão ou agregação, com unidade e denominador explícitos; só constitui medida de construto quando houver modelo e validade declarados. A mediana do tempo por Unidade de estudo é uma Métrica calculada a partir dos eventos exportáveis e de uma fórmula versionada.

**Domínio e implementação.** Métrica calculada; equivalente internacional: computed metric; símbolo: `computed_metric`.

**Uso.** `restringir`; formas técnicas ou históricas: `métrica`, `Analytics`. Distinguir de `medida observada`, `indicador`, `atenção`, `aprendizagem`.

**Base.** [evidência acadêmica](https://doi.org/10.1037/0003-066X.50.9.741); [decisão de produto](analytics-instrucionais.md).

#### Indicador de pesquisa

Interpretação declarada de uma ou mais medidas para uma finalidade analítica específica, com inferências permitidas e proibidas. Uma taxa de observações resolvidas pode servir como Indicador de pesquisa quando sua interpretação e limitações são declaradas.

**Domínio e implementação.** Indicador de pesquisa; equivalente internacional: research indicator; símbolo: `research_indicator`.

**Uso.** `restringir`; formas técnicas ou históricas: `indicador`. Distinguir de `métrica`, `desfecho`, `prova`.

**Base.** [padrão externo](https://www.testingstandards.net/).

#### Resultado avaliado

Variável escolhida como resultado de interesse de um estudo e definida antes da interpretação quando o desenho exigir; a interface apresenta seu valor ou síntese como Resultado avaliado. Desempenho numa avaliação posterior pode ser uma Variável de resultado; a interface apresenta a medida correspondente como Resultado avaliado, com instrumento e momento declarados.

**Domínio e implementação.** Variável de resultado; equivalente internacional: outcome variable; símbolo: `outcome_variable`.

**Uso.** `restringir`; formas técnicas ou históricas: `outcome`. Distinguir de `métrica`, `indicador`, `resultado de uma função`.

**Base.** [padrão externo](https://www.testingstandards.net/).

### Organização, acesso e distribuição

#### Curso em autoria

O próprio curso vivo enquanto está sendo planejado e materializado; a pessoa não precisa compreender um recipiente abstrato separado. O que antes aparecia como Workspace passa a ser tratado como o próprio Curso em autoria, sem uma estrutura organizacional opaca adicional.

**Domínio e implementação.** Curso em autoria; equivalente internacional: course under authoring; símbolo: `authoring_course`.

**Uso.** `substituído`; formas técnicas ou históricas: `Workspace`, `workspace de autoria`. Distinguir de `organização`, `tenant`, `projeto`, `pasta`.

**Base.** [decisão de produto](estado-atual-e-roadmap.md).

#### Biblioteca pessoal

Conjunto de cursos acessíveis à pessoa, separado de propriedade, compartilhamento e eventual ordenação curricular. A Biblioteca pessoal lista os cursos que pertencem à pessoa ou aos quais ela recebeu acesso, sem determinar uma sequência de estudo.

**Domínio e implementação.** Biblioteca pessoal; equivalente internacional: personal library; símbolo: `personal_course_library`.

**Uso.** `substituído`; formas técnicas ou históricas: `Trilha`, `Trilhas`. Distinguir de `sequência curricular`, `permissão`, `coleção`.

**Base.** [decisão de produto](estado-atual-e-roadmap.md).

#### Catálogo público de cursos

Índice de cursos tornados públicos por decisão explícita; organização de catálogo não concede nem substitui acesso privado direto. O Catálogo público de cursos lista somente cursos disponibilizados explicitamente ao público, sem controlar propriedade ou acesso privado.

**Domínio e implementação.** Catálogo público de cursos; equivalente internacional: public course catalog; símbolo: `public_course_catalog`.

**Uso.** `retirado`; formas técnicas ou históricas: `Coleção`, `Coleções`. Distinguir de `biblioteca pessoal`, `permissão`, `propriedade`.

**Base.** [decisão de produto](estado-atual-e-roadmap.md).

#### Disponibilização pública

Operação explícita que torna uma versão do curso acessível publicamente; não é estágio obrigatório da autoria ou condição para estudo privado. A pessoa proprietária decide disponibilizar publicamente um curso vivo; isso altera seu alcance, não cria um estado editorial imutável.

**Domínio e implementação.** Disponibilização pública; equivalente internacional: public course availability; símbolo: `public_course_release`.

**Uso.** `restringir`; formas técnicas ou históricas: `publicação`. Distinguir de `materialização`, `salvamento`, `curso pronto`.

**Base.** [decisão de produto](arquitetura.md).

#### Artefato de conteúdo

Representação serializada e identificável por conteúdo usada para armazenamento ou distribuição; não é o curso vivo completo. Um arquivo exportado ou uma representação produzida é um Artefato de conteúdo; não é automaticamente o Curso vivo completo.

**Domínio e implementação.** Artefato de conteúdo; equivalente internacional: content artifact; símbolo: `content_artifact`.

**Uso.** `restringir`; formas técnicas ou históricas: `artefato`. Distinguir de `curso`, `versão de estado`, `proveniência`.

**Base.** [observação técnica](arquitetura.md).

#### Ponto de recuperação

Marco operacional criado para permitir retomada ou restauração controlada de trabalho técnico; não é revisão de conteúdo nem versão pública. Antes de uma operação composta, o sistema cria um Ponto de recuperação para restaurar o estado se a operação falhar.

**Domínio e implementação.** Ponto de recuperação; equivalente internacional: recovery checkpoint; símbolo: `recovery_checkpoint`.

**Uso.** `restringir`; formas técnicas ou históricas: `checkpoint`. Distinguir de `versão de estado`, `release`, `revisão autoral`.

**Base.** [observação técnica](implantacao.md).

### Identidade e autorização

#### Pessoa usuária

Pessoa identificada no produto por uma conta; o registro de autenticação não resume sua identidade humana. O perfil mínimo exibe nome e avatar da Pessoa usuária sem transformar a plataforma em rede social.

**Domínio e implementação.** Pessoa usuária; equivalente internacional: user; símbolo: `user_account`.

**Uso.** `restringir`; formas técnicas ou históricas: `usuário`. Distinguir de `perfil`, `ator técnico`, `proprietário`.

**Base.** [decisão de produto](privacidade.md).

#### Pessoa autora

Pessoa que participa intencionalmente do planejamento, produção, revisão ou correção de um curso; autoria não decorre apenas de executar uma mutação técnica. A Pessoa autora planeja, comenta e revisa o curso; ela pode ou não ser sua proprietária.

**Domínio e implementação.** Pessoa autora; equivalente internacional: course author; símbolo: `course_author`.

**Uso.** `restringir`; formas técnicas ou históricas: `autor`. Distinguir de `proprietário`, `agente`, `operador`.

**Base.** [decisão de produto](privacidade.md).

#### Pessoa pesquisadora

Pessoa responsável por decisões, instrumentos ou análises de uma pesquisa; não recebe automaticamente propriedade ou acesso a todo curso. A Pessoa pesquisadora define condições e analisa dados, função que pode coexistir com autoria na mesma conta.

**Domínio e implementação.** Pessoa pesquisadora; equivalente internacional: researcher; símbolo: `researcher`.

**Uso.** `restringir`; formas técnicas ou históricas: `pesquisador`. Distinguir de `autor`, `administrador`, `participante`.

**Base.** [decisão de produto](privacidade.md).

#### Pessoa estudante

Pessoa que acessa o curso para estudar ou participar de uma investigação, com consentimento e papel de pesquisa separados quando aplicável. A Pessoa estudante acessa um curso compartilhado, pratica e pode registrar observações sobre unidades específicas.

**Domínio e implementação.** Pessoa estudante; equivalente internacional: learner; símbolo: `student`.

**Uso.** `restringir`; formas técnicas ou históricas: `estudante`. Distinguir de `participante de pesquisa`, `membro`, `usuário genérico`.

**Base.** [decisão de produto](privacidade.md).

#### Pessoa proprietária do curso

Pessoa com autoridade primária sobre o curso e sobre a concessão de acesso, sem implicar autoria exclusiva de todo conteúdo. A Pessoa proprietária controla o acesso ao curso e pode compartilhá-lo diretamente com outras pessoas.

**Domínio e implementação.** Pessoa proprietária do curso; equivalente internacional: course owner; símbolo: `course_owner`.

**Uso.** `restringir`; formas técnicas ou históricas: `proprietário`. Distinguir de `autor`, `administrador`, `criador original`.

**Base.** [decisão de produto](privacidade.md).

#### Pessoa com acesso

Pessoa à qual foi concedido acesso explícito a um curso, com permissões delimitadas; não pressupõe organização institucional. Ao compartilhar um curso com outra pessoa, o registro de acesso identifica diretamente a Pessoa com acesso e suas permissões.

**Domínio e implementação.** Pessoa com acesso; equivalente internacional: course access grantee; símbolo: `course_access_grantee`.

**Uso.** `restringir`; formas técnicas ou históricas: `membro`. Distinguir de `proprietário`, `autor`, `membro de organização`.

**Base.** [decisão de produto](privacidade.md).

#### Papel de acesso

Rótulo técnico que agrupa responsabilidades ou permissões de acesso; não deve ser exposto como governança necessária para compartilhar um curso. Um Papel de acesso agrupa permissões estritamente necessárias, sem representar cargo ou hierarquia institucional.

**Domínio e implementação.** Papel de acesso; equivalente internacional: access role; símbolo: `access_role`.

**Uso.** `substituído`; formas técnicas ou históricas: `role`. Distinguir de `permissão efetiva`, `identidade`, `cargo institucional`.

**Base.** [decisão de produto](privacidade.md).

#### Permissão efetiva

Autorização concreta para executar uma operação sobre um alvo e estado específicos, derivada e revalidada no ponto de uso. A interface habilita uma ação somente quando a Permissão efetiva calculada autoriza aquela pessoa naquele curso.

**Domínio e implementação.** Permissão efetiva; equivalente internacional: effective permission; símbolo: `effective_permission`.

**Uso.** `substituído`; formas técnicas ou históricas: `capability`. Distinguir de `papel de acesso`, `feature flag`, `propriedade`.

**Base.** [observação técnica](privacidade.md).

### Arquitetura de software

#### Núcleo de execução de componentes

Núcleo técnico pequeno que valida envelopes, resolve pacotes e coordena protocolos comuns sem conhecer tipos concretos de representação. O Núcleo de execução valida o manifesto e coordena a renderização de componentes, sem incorporar conteúdo ou regras pedagógicas específicas.

**Domínio e implementação.** Núcleo de execução de componentes; equivalente internacional: component runtime core; símbolo: `component_runtime_core`.

**Uso.** `restringir`; formas técnicas ou históricas: `kernel`. Distinguir de `sistema operacional`, `catálogo`, `engine de layout`.

**Base.** [observação técnica](componentes-didaticos.md).

#### Ambiente de execução

Código e dependências necessários para executar um contrato em determinada plataforma; não inclui automaticamente autoria, persistência e catálogo. O Ambiente de execução carrega e renderiza componentes no cliente sem ser confundido com o motor que transforma dados.

**Domínio e implementação.** Ambiente de execução; equivalente internacional: runtime; símbolo: `runtime_environment`.

**Uso.** `restringir`; formas técnicas ou históricas: `runtime`. Distinguir de `engine`, `aplicativo`, `núcleo`.

**Base.** [observação técnica](vocabulario-controlado.md).

#### Motor

Componente que executa um algoritmo ou transformação substantiva bem delimitada; não é nome genérico para qualquer serviço. O Motor aplica uma transformação definida, como validar uma resposta, mas não representa toda a aplicação.

**Domínio e implementação.** Motor; equivalente internacional: engine; símbolo: `processing_engine`.

**Uso.** `restringir`; formas técnicas ou históricas: `engine`. Distinguir de `runtime`, `adapter`, `serviço`.

**Base.** [observação técnica](vocabulario-controlado.md).

#### Adaptador

Componente de fronteira que traduz entre contratos sem assumir a regra de negócio traduzida. Um Adaptador converte a forma usada pelo domínio para a API de Storage ou banco, mantendo essa fronteira explícita.

**Domínio e implementação.** Adaptador; equivalente internacional: adapter; símbolo: `boundary_adapter`.

**Uso.** `restringir`; formas técnicas ou históricas: `adapter`. Distinguir de `serviço de domínio`, `fallback`, `alias`.

**Base.** [observação técnica](vocabulario-controlado.md).

#### Repositório de estado

Componente que lê e grava estado em uma fronteira de persistência declarada; não é o estado em si nem necessariamente a fonte canônica. O Repositório de estado lê e grava dados de autoria; ele não é sinônimo do serviço Supabase Storage.

**Domínio e implementação.** Repositório de estado; equivalente internacional: store; símbolo: `state_repository`.

**Uso.** `restringir`; formas técnicas ou históricas: `store`. Distinguir de `banco de dados`, `estado`, `cache`.

**Base.** [observação técnica](arquitetura.md).

#### Catálogo

Projeção consultável de itens disponíveis e de seus metadados; não é o registro de execução nem a coleção de dados completos. Um Catálogo permite consultar metadados e localizar componentes ou cursos sem assumir propriedade nem sequência.

**Domínio e implementação.** Catálogo; equivalente internacional: catalog; símbolo: `queryable_catalog`.

**Uso.** `restringir`; formas técnicas ou históricas: `catalog`. Distinguir de `registry`, `biblioteca pessoal`, `MCP Resource`.

**Base.** [observação técnica](componentes-didaticos.md).

### Interação e cognição

#### Começar, continuar ou retomar

Ação contextual que inicia uma unidade, continua a sequência corrente ou retoma uma posição anterior; o rótulo deve refletir o estado real. O botão inicial mostra Começar, Continuar ou Retomar conforme o progresso real, em vez do rótulo genérico Play.

**Domínio e implementação.** Ação de entrada no Estudo; equivalente internacional: study entry action; símbolo: `study_entry_action`.

**Uso.** `restringir`; formas técnicas ou históricas: `Play`. Distinguir de `reprodução de mídia`, `rolagem`, `avanço automático`.

**Base.** [hipótese de produto](sistema-visual.md).

#### Rolagem vertical

Deslocamento contínuo da viewport no eixo vertical, distinto do gesto físico que o iniciou e da mudança curricular entre unidades. No celular, a pessoa desliza a página para cima e percorre rapidamente as Unidades de estudo em Rolagem vertical.

**Domínio e implementação.** Rolagem vertical; equivalente internacional: vertical scrolling; símbolo: `vertical_scroll`.

**Uso.** `restringir`; formas técnicas ou históricas: `rolar`, `scroll`. Distinguir de `deslize`, `avançar`, `feed`.

**Base.** [evidência acadêmica](https://doi.org/10.1007/s11145-022-10328-9).

#### Gesto de deslize

Gesto de entrada observável executado sobre uma superfície, sem inferência automática sobre intenção ou processo cognitivo. Um movimento de dedo reconhecido como Gesto de deslize pode avançar a interface, mas não prova uma operação cognitiva.

**Domínio e implementação.** Gesto de deslize; equivalente internacional: swipe gesture; símbolo: `swipe_input_gesture`.

**Uso.** `restringir`; formas técnicas ou históricas: `deslizar`, `swipe`. Distinguir de `rolagem`, `avanço`, `ação epistêmica`.

**Base.** [definição própria](vocabulario-controlado.md).

#### Navegação do curso

Mudança de posição ou escopo dentro da estrutura do curso, com destino e estado explícitos, independentemente do gesto usado. Na interface, a pessoa usa a Navegação do curso para saltar à próxima microssequência; o evento de domínio registra uma Navegação curricular com origem e destino.

**Domínio e implementação.** Navegação curricular; equivalente internacional: curricular navigation; símbolo: `curricular_navigation`.

**Uso.** `restringir`; formas técnicas ou históricas: `avançar`, `navegar`, `explorar`, `retomar`. Distinguir de `rolagem`, `deslize`, `aprendizagem`.

**Base.** [definição própria](sistema-visual.md).

#### Operação-alvo da tarefa

Definição terminológica própria do AraLearn para a transformação que a tarefa exige da pessoa sobre o conteúdo; o contrato e a resposta são observáveis, mas o rótulo não afirma observação direta de uma operação mental. Uma atividade pode solicitar comparar duas representações; “comparar” é a Operação-alvo da tarefa, independentemente do toque usado para responder.

**Domínio e implementação.** Operação-alvo da tarefa; equivalente internacional: target task operation; símbolo: `taskOperations`, `taskOperationIds`, `task_operation.*`.

**Uso.** `substituído`; formas técnicas ou históricas: `gesto cognitivo`, `cognitiveOperations`. Distinguir de `gesto de entrada`, `atenção`, `processo cognitivo medido`, `ação epistêmica`.

**Base.** [definição própria](vocabulario-controlado.md): Fixa o rótulo e a definição operacional adotados no domínio do AraLearn; [evidência acadêmica](https://doi.org/10.1207/s15516709cog1804_1): Sustenta apenas a distinção entre ações pragmáticas e epistêmicas; não fundamenta o rótulo operação-alvo da tarefa.

#### Atenção

Família de processos seletivos internos e externos que exige operacionalização e instrumento próprios; não é evento de visibilidade ou duração. Uma pesquisa pode definir Atenção como construto e escolher múltiplas medidas; um scroll isolado não recebe esse rótulo.

**Domínio e implementação.** Atenção; equivalente internacional: attention construct; símbolo: `attention_construct`.

**Uso.** `restringir`. Distinguir de `tempo de tela`, `foco de teclado`, `rolagem`, `engajamento`.

**Base.** [evidência acadêmica](https://doi.org/10.1146/annurev.psych.093008.100427).

#### Engajamento

Construto multidimensional cuja dimensão comportamental, cognitiva ou afetiva deve ser declarada e medida com evidência de validade. A pesquisa declara como Engajamento será inferido de diferentes evidências, sem renomear mera abertura de tela como engajamento.

**Domínio e implementação.** Engajamento; equivalente internacional: engagement construct; símbolo: `engagement_construct`.

**Uso.** `restringir`. Distinguir de `clique`, `tempo`, `atenção`, `conclusão`.

**Base.** [evidência acadêmica](https://doi.org/10.1016/j.compedu.2015.09.005).

#### Foco do controle

Estado técnico, conforme o modelo de foco do HTML, que determina qual controle recebe entrada de teclado ou tecnologia assistiva; não mede atenção psicológica. Quando a caixa de observação se torna o elemento ativo para teclado, ela recebe Foco do controle; isso não demonstra atenção da pessoa.

**Domínio e implementação.** Foco do controle; equivalente internacional: focus state; símbolo: `focus_state`.

**Uso.** `restringir`; formas técnicas ou históricas: `foco`. Distinguir de `atenção`, `engajamento`, `seleção`.

**Base.** [padrão externo](https://html.spec.whatwg.org/multipage/interaction.html#focus).

#### Sequência vertical de inspeção

Fluxo finito e curricularmente ordenado para percorrer unidades de estudo na Autoria, com posição, hierarquia, retomada e marcos explícitos. Na Autoria móvel, uma Sequência vertical de inspeção permite percorrer unidade por unidade e abrir detalhes somente quando necessário.

**Domínio e implementação.** Sequência vertical de inspeção; equivalente internacional: vertical inspection sequence; símbolo: `vertical_inspection_sequence`.

**Uso.** `manter`. Distinguir de `feed`, `rolagem infinita`, `evidência de compreensão`.

**Base.** [hipótese de produto](sistema-visual.md); [evidência acadêmica](https://doi.org/10.1007/s11145-022-10328-9).

#### Feed social

Fluxo digital continuamente abastecido, usado aqui apenas como antecedente comparativo; não descreve a sequência curricular finita do AraLearn. O feed do X serve como comparação histórica de rolagem e segmentação, mas não como modelo pedagógico ou evidência de eficácia.

**Domínio e implementação.** Feed social; equivalente internacional: social feed; símbolo: `social_content_feed`.

**Uso.** `restringir`; formas técnicas ou históricas: `feed`. Distinguir de `sequência vertical de inspeção`, `curso`, `navegação curricular`.

**Base.** [evidência histórica](vocabulario-controlado.md); [evidência acadêmica](https://doi.org/10.1145/3491102.3501899).

#### Ação epistêmica

Ação externa realizada para revelar informação ou simplificar o trabalho cognitivo, usada somente quando essa função tiver sido demonstrada na tarefa. Anotar uma contradição para facilitar o raciocínio pode ser modelado como Ação epistêmica quando a análise distingue ação observável e processo mental.

**Domínio e implementação.** Ação epistêmica; equivalente internacional: epistemic action; símbolo: `epistemic_action`.

**Uso.** `restringir`. Distinguir de `toque`, `swipe`, `operação-alvo da tarefa`, `qualquer interação`.

**Base.** [evidência acadêmica](https://doi.org/10.1207/s15516709cog1804_1).

### Assistente, MCP e estado

#### Instruções de sistema

Camada estável reservada a invariantes, segurança, limites de autoridade e protocolo de uso das ferramentas; não contém estado corrente do curso nem manual científico mutável. As Instruções de sistema mantêm regras invariantes de segurança e de uso das ferramentas; o plano mutável do curso fica fora delas.

**Domínio e implementação.** Instruções de sistema; equivalente internacional: system instructions; símbolo: `system_instructions`.

**Uso.** `restringir`; formas técnicas ou históricas: `system prompt`, `system instructions`. Distinguir de `prompt de tarefa`, `knowledge base`, `estado de autoria do curso`.

**Base.** [decisão de produto](assistencia-por-ia.md).

#### Prompt de tarefa

Instrução contextual de uma execução ou turno; pode referenciar estado persistido, mas não se torna o registro autorizado desse estado. Ao pedir auditoria de uma Parte, a solicitação e seus limites formam o Prompt de tarefa daquela execução.

**Domínio e implementação.** Prompt de tarefa; equivalente internacional: task prompt; símbolo: `task_prompt`.

**Uso.** `restringir`; formas técnicas ou históricas: `prompt`. Distinguir de `instruções de sistema`, `estado persistido`, `ferramenta`.

**Base.** [definição própria](assistencia-por-ia.md).

#### Base de referência estável

Conteúdo relativamente estável de referência recuperável sob demanda, como critérios, ciência, exemplos e limitações; não contém planejamento ou observações correntes do curso. A Base de referência estável contém documentação durável sobre ferramentas e métodos, não o planejamento mutável de um curso.

**Domínio e implementação.** Base de referência estável; equivalente internacional: knowledge base; símbolo: `knowledge_base`.

**Uso.** `restringir`; formas técnicas ou históricas: `knowledge base`, `knowledge JIT`. Distinguir de `RAG`, `estado de autoria do curso`, `instruções de sistema`.

**Base.** [decisão de produto](assistencia-por-ia.md).

#### Estado de autoria do curso

Estado persistido e editável do curso que reúne planejamento, parâmetros, fontes, observações, materialização e dados de pesquisa e que é compartilhado por interface, MCP e Actions. O planejamento, os parâmetros, as fontes e as observações de um curso compõem seu Estado de autoria, lido pela interface, pelas ferramentas MCP e pelas operações de Actions.

**Domínio e implementação.** Estado de autoria do curso; equivalente internacional: course authoring state; símbolo: `course_authoring_state`.

**Uso.** `manter`; formas técnicas ou históricas: `estado autoral dinâmico`. Distinguir de `workspace`, `histórico de chat`, `knowledge base`, `prompt`.

**Base.** [decisão de produto](assistencia-por-ia.md).

#### Geração aumentada por recuperação

Processo em que uma consulta recupera explicitamente itens de um corpus indexado e os fornece à geração, com registro do corpus e da recuperação. Uma execução só é descrita como RAG quando consulta um corpus indexado e incorpora os resultados recuperados ao contexto de geração.

**Domínio e implementação.** Geração aumentada por recuperação; equivalente internacional: retrieval-augmented generation; símbolo: `retrieval_augmented_generation`.

**Uso.** `restringir`; formas técnicas ou históricas: `RAG`. Distinguir de `knowledge base`, `MCP Resource`, `leitura direta de estado`, `busca simples`.

**Base.** [evidência acadêmica](https://arxiv.org/abs/2005.11401).

#### Configuração do assistente

Conjunto versionado de modelo, instruções, ferramentas, políticas de recuperação e parâmetros operacionais que pode constituir fator experimental. Uma pesquisa versiona duas Configurações do assistente para comparar instruções ou estratégias de ferramenta sob condições controladas.

**Domínio e implementação.** Configuração do assistente; equivalente internacional: agent configuration; símbolo: `agent_configuration`.

**Uso.** `restringir`; formas técnicas ou históricas: `agent configuration`, `configuração do agente`. Distinguir de `estado de autoria do curso`, `perfil da pessoa`, `prompt isolado`.

**Base.** [decisão de produto](assistencia-por-ia.md).

#### Resource MCP

Primitiva do protocolo pela qual um servidor expõe dados ou contexto identificados por URI para leitura orientada pela aplicação. Uma ferramenta cliente lê um Resource MCP exposto pelo servidor; ele não é um componente visual armazenado dentro de uma unidade.

**Domínio e implementação.** Resource MCP; equivalente internacional: mcp resource; símbolo: `mcp_resource`.

**Uso.** `restringir`; formas técnicas ou históricas: `MCP Resource`. Distinguir de `representação externa`, `knowledge base`, `tool`, `arquivo de Storage`.

**Base.** [padrão externo](https://modelcontextprotocol.io/specification/2025-11-25/server/resources).

#### Ferramenta MCP

Operação tipada exposta pelo servidor para o modelo solicitar uma ação ou consulta sob autorização e contrato explícitos. O assistente chama uma Ferramenta MCP para registrar uma anotação ou materializar uma Parte, produzindo efeito verificável no estado persistido.

**Domínio e implementação.** Ferramenta MCP; equivalente internacional: mcp tool; símbolo: `mcp_tool`.

**Uso.** `restringir`; formas técnicas ou históricas: `tool`. Distinguir de `MCP Resource`, `prompt`, `estado persistido`, `capacidade`.

**Base.** [padrão externo](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

#### Assistência por IA

Sessão contextual em que um sistema de inteligência artificial ajuda a discutir, planejar, preparar, validar e pré-visualizar uma alteração tipada antes de a pessoa decidir aplicá-la ao rascunho do objeto corrente. Na Unidade de estudo, a pessoa abre Assistência por IA, discute o pedido, confirma um plano e só aplica a proposta depois de conferir a prévia no renderer real.

**Domínio e implementação.** Assistência contextual por modelo de linguagem; equivalente internacional: contextual AI assistance for authoring (descrição técnica própria); símbolo: `course_provider_assistance`.

**Uso.** `restringir`; formas técnicas ou históricas: `Assistência por API`. Distinguir de `API`, `provider`, `MCP`, `Actions`, `chat genérico`.

**Base.** [decisão de produto](assistencia-por-ia.md): Define a sessão contextual, a confirmação humana e a separação entre provider, API, MCP e Actions; [padrão externo](https://www.nist.gov/itl/ai-risk-management-framework): Sustenta somente a distinção geral entre sistema de inteligência artificial e os mecanismos técnicos que o disponibilizam; não prescreve o rótulo da interface.
