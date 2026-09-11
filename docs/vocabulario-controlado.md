# Vocabulário controlado do AraLearn

Uma mesma coisa pode ter um nome legível no aplicativo e um identificador no código. Por exemplo, a unidade de estudo é uma etapa do percurso; `study_unit` é o nome usado para representá-la na implementação. Este vocabulário relaciona esses nomes, explica seu significado e indica as fontes. Ele ajuda quem escreve, desenvolve ou pesquisa o AraLearn a reconhecer quando duas palavras se referem ao mesmo objeto e quando representam conceitos diferentes.

## Como consultar

Cada entrada começa pelo significado e por um exemplo. Em **Domínio e implementação**, aparecem o conceito representado, seu equivalente em inglês e o identificador técnico. **Uso** indica a escolha terminológica e as palavras que poderiam causar confusão. **Base** aponta para a definição adotada pelo projeto ou para uma fonte externa.

Os nomes visíveis no aplicativo conservam a grafia dos rótulos. Na prosa, nomes comuns como curso, explicação e unidade de estudo ficam em minúsculas, conforme os [princípios editoriais](principios-editoriais.md). O [registro terminológico](evidence/terminologia-canonica.v1.json) conserva também as alternativas examinadas e os motivos de cada escolha.

## Escolhas terminológicas

- `manter`: o nome coincide com o conceito, dentro da definição registrada.
- `restringir`: o nome permanece apenas no sentido e nos contextos de uso declarados.
- `substituído`: a forma anterior saiu do uso corrente e o termo canônico assumiu seu lugar.
- `retirado`: o nome ou símbolo não representa mais um conceito corrente.

Os contextos de uso distinguem, por exemplo, a interface, a documentação e o código. Um nome técnico pode continuar necessário na implementação mesmo quando o aplicativo apresenta um rótulo mais simples.

## Termos

### Superfícies do produto

#### Estudo

Área do aplicativo em que a pessoa percorre o curso, lê explicações, consulta fontes e realiza atividades. O progresso registra a continuidade do percurso; verificar aprendizagem exige evidência própria. Ao abrir um curso para praticar, a pessoa entra em Estudo e percorre as unidades sem que a tela afirme que houve aprendizagem.

**Domínio e implementação.** Estudo; equivalente internacional: study surface; símbolo: `study_surface`.

**Uso.** `restringir`. Distinguir de `aprendizagem`, `domínio`, `resultado de aprendizagem`.

**Base.** [decisão de produto](visao-do-produto.md).

#### Autoria

Atividade e superfície usadas para planejar, produzir, inspecionar, anotar, corrigir e investigar um curso e seus componentes. Na Autoria, a pessoa autora percorre o curso, abre uma unidade, consulta suas fontes e registra uma observação para correção.

**Domínio e implementação.** Autoria; equivalente internacional: authoring; símbolo: `authoring_surface`.

**Uso.** `manter`. Distinguir de `chat`, `publicação`, `administração`.

**Base.** [padrão externo](https://www.w3.org/TR/ATAG20/); [decisão de produto](visao-do-produto.md).

#### Dados de autoria

Área de consulta ao conteúdo e às escolhas de autoria de um curso. A pessoa escolhe o que comparar, como ideias novas ou distribuição da prática, e a parte do curso a examinar. As contagens descrevem o material salvo; verificar aprendizagem exige uma avaliação com estudantes. Em Dados de autoria, a pessoa escolhe a dimensão Novidade declarada e compara quantas ideias novas foram registradas nas unidades. Pode consultar as definições usadas na contagem e exportar o curso com sua análise.

**Domínio e implementação.** análise dos dados de autoria; equivalente internacional: authoring analytics; símbolo: `authoring_analytics`.

**Uso.** `restringir`; formas técnicas ou históricas: `Analytics`. Distinguir de `Pesquisa`, `experimento`, `painel administrativo`.

**Base.** [decisão de produto](analytics-instrucionais.md).

### Estrutura instrucional

#### Curso

Objeto identificado que reúne o percurso curricular, o conteúdo, as fontes e os registros de autoria. Pode ser revisto ao longo do tempo; sua disponibilidade para outras pessoas depende das regras de acesso e de revisão aplicáveis. Um curso de japonês conserva o mesmo identificador enquanto o plano, as fontes, as unidades e as observações são revistos.

**Domínio e implementação.** Curso; equivalente internacional: course; símbolo: `course`.

**Uso.** `restringir`. Distinguir de `workspace`, `publicação`, `artefato`.

**Base.** [decisão de produto](arquitetura.md).

#### Módulo

Agrupamento curricular de lições dentro de um curso, usado quando há uma organização didática justificável nesse nível. O módulo “Escrita em hiragana” reúne lições relacionadas, mas não corresponde a uma parte de autoria.

**Domínio e implementação.** Módulo; equivalente internacional: module; símbolo: `course_module`.

**Uso.** `manter`. Distinguir de `Parte de autoria`, `unidade de estudo`, `package`.

**Base.** [definição própria](vocabulario-controlado.md).

#### Lição

Unidade curricular de um módulo que organiza uma progressão didática coerente em uma ou mais microssequências. A lição “Vogais” organiza microssequências que apresentam, praticam e retomam os cinco sinais.

**Domínio e implementação.** Lição; equivalente internacional: lesson; símbolo: `lesson`.

**Uso.** `manter`. Distinguir de `Parte`, `microssequência`, `sessão`.

**Base.** [definição própria](vocabulario-controlado.md).

#### Microssequência didática

Termo operacional do AraLearn para um objetivo instrucional delimitado, sua posição e dependências no curso, sua base explicativa e suas unidades de estudo ordenadas. O planejamento e a base podem existir antes da produção das unidades; não há quantidade fixa de unidades. Uma microssequência didática pode articular explicação, exemplo e prática sobre は, sem impor um número fixo de unidades.

**Domínio e implementação.** Microssequência didática; equivalente internacional: didactic microsequence; símbolo: `didactic_microsequence`.

**Uso.** `restringir`; formas técnicas ou históricas: `microssequência`. Distinguir de `parágrafo`, `subtópico automático`, `Parte`.

**Base.** [definição própria](modelo-didatico.md); [Pons Bordería e Borreguero Zuloaga (2024)](referencias.md#ref-ponsborderia2024unidades): Delimita unidades discursivas e critérios de segmentação textual; não define a entidade persistida microssequência didática do AraLearn.

#### Unidade de estudo

Etapa ordenada de um percurso de estudo, salva com identidade própria e acessível para estudo e inspeção autoral. Pode desenvolver conteúdo, solicitar uma resposta, oferecer retorno ou reunir essas funções numa composição coerente. Na rolagem móvel, cada unidade de estudo ocupa um passo da sequência; uma pode só explicar e outra pode pedir resposta e oferecer retorno.

**Domínio e implementação.** Unidade de estudo; equivalente internacional: study unit; símbolo: `study_unit`.

**Uso.** `restringir`; formas técnicas ou históricas: `card`. Distinguir de `flashcard`, `tela`, `objeto de aprendizagem`, `parágrafo`.

**Base.** [definição própria](modelo-didatico.md); [Schnotz e Bannert (2003)](referencias.md#ref-schnotz2003representations): Discute representações externas e sua interação; não define unidade de estudo nem persistência no AraLearn.

#### Explicação

Conteúdo previamente autorado por microssequência para desenvolver conceitos, pressupostos, exemplos, relações e limites necessários ao objetivo. Suas unidades dão acesso à mesma base pelo comando Explicação; abrir o apoio lê o conteúdo salvo, sem nova geração ou progresso automático. Durante uma prática, o estudante abre Explicação e consulta um exemplo resolvido da mesma microssequência. A base tem fontes e revisão próprias; sua leitura não responde à atividade nem conclui a unidade.

**Domínio e implementação.** Base explicativa da microssequência; equivalente internacional: shared authored explanation (termo operacional do AraLearn); símbolo: `explanation`.

**Uso.** `restringir`; formas técnicas ou históricas: `base explicativa`, `explicação compartilhada`. Distinguir de `unidade de estudo`, `forma de explicação`, `resposta gerada no momento`, `revisão humana declarada`.

**Base.** [decisão de produto](explicacao-e-revisao-humana.md); [observação técnica](https://github.com/fabio-ara/AraLearn/blob/main/src/domain/courseExplanation.js).

#### Item de prática de recuperação

Unidade específica organizada em torno de pista e resposta para praticar recuperação da memória; não designa qualquer unidade de estudo. Uma unidade de estudo pede a tradução de uma expressão antes de mostrar a resposta e o retorno, constituindo um item de prática de recuperação.

**Domínio e implementação.** Item de prática de recuperação; equivalente internacional: retrieval practice item; símbolo: `retrieval_practice_item`.

**Uso.** `restringir`; formas técnicas ou históricas: `flashcard`. Distinguir de `AraLearn`, `curso`, `unidade teórica`, `unidade de estudo`.

**Base.** [Barrison et al. (2025)](referencias.md#ref-barrison2025flashcards).

### Discurso e organização textual

#### Gênero discursivo

Forma recorrente de ação social reconhecida em uma situação comunicativa, adotada aqui na linhagem socioretórica de Miller; gênero comunicativo ou textual exige qualificação teórica própria. Uma investigação de gênero examina a finalidade, a interlocução e os usos recorrentes do material. Chamar uma unidade de “explicação” ou apresentá-la num cartão não basta para identificar um gênero discursivo.

**Domínio e implementação.** Gênero discursivo; equivalente internacional: discourse genre; símbolo: `discourse_genre`.

**Uso.** `restringir`; formas técnicas ou históricas: `gênero de produto`. Distinguir de `gênero comunicativo sem qualificação`, `gênero textual`, `classe de produto`, `tipo de unidade`, `mídia`, `flashcard`.

**Base.** [Miller (1984)](referencias.md#ref-miller1984genre); [Yates e Orlikowski (1992)](referencias.md#ref-yates1992genres).

#### Segmento discursivo

Trecho delimitado segundo critério declarado, como intenção discursiva, relação retórica, subtópico, proposição ou função informacional; não existe fronteira universal independente do método. Uma explicação longa pode ser dividida em segmentos discursivos coerentes sem presumir que cada segmento seja um parágrafo ou conceito.

**Domínio e implementação.** Segmento discursivo; equivalente internacional: discourse segment; símbolo: `discourse_segment`.

**Uso.** `restringir`; formas técnicas ou históricas: `unidade discursiva`, `segmento semântico`. Distinguir de `parágrafo`, `conceito`, `unidade de estudo`, `microssequência`.

**Base.** [Passonneau e Litman (1997)](referencias.md#ref-passonneau1997segmentation); [Pons Bordería e Borreguero Zuloaga (2024)](referencias.md#ref-ponsborderia2024unidades).

#### Parágrafo

Unidade gráfica e textual que contribui para a organização do texto, mas cuja fronteira não garante unidade conceitual, retórica ou instrucional. Uma representação textual pode conter dois parágrafos dentro da mesma unidade de estudo quando a organização discursiva o exigir.

**Domínio e implementação.** Parágrafo; equivalente internacional: paragraph unit; símbolo: `text_paragraph`.

**Uso.** `restringir`. Distinguir de `segmento semântico`, `unidade de estudo`, `conceito`.

**Base.** [Pons Bordería e Borreguero Zuloaga (2024)](referencias.md#ref-ponsborderia2024unidades).

### Representações e componentes

#### Representação externa

Forma perceptível pela qual conteúdo ou relações são apresentados, como texto, fórmula, tabela, gráfico, diagrama, código ou áudio. Uma ideia pode ser apresentada como texto, diagrama ou áudio. A escolha da representação externa depende das relações que precisam ser percebidas e da tarefa do estudante.

**Domínio e implementação.** Representação externa; equivalente internacional: external representation; símbolo: `external_representation`.

**Uso.** `restringir`; formas técnicas ou históricas: `resource`, `recurso de card`. Distinguir de `MCP Resource`, `ativo de mídia`, `formato de resposta`, `pacote de componente`.

**Base.** [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft).

#### Componente didático

Capacidade modular instalada que produz uma representação externa, um formato de resposta ou ambos para uma unidade de estudo, sem se confundir com a instância renderizada nem com seu pacote técnico. O componente de escolha apresenta alternativas em um formato de resposta selecionável; cada uso gera uma instância dentro de uma unidade de estudo.

**Domínio e implementação.** Componente didático; equivalente internacional: instructional component; símbolo: `instructional_component`.

**Uso.** `restringir`. Distinguir de `representação externa`, `formato de resposta`, `pacote de componente`, `componente de interface`.

**Base.** [definição própria](vocabulario-controlado.md); [observação técnica](componentes-didaticos.md).

#### Formato de resposta

Estrutura pela qual a pessoa responde a uma atividade e pela qual a resposta pode ser interpretada ou receber retorno. Uma atividade pode aceitar escolha, texto digitado ou ordenação; o formato de resposta declara essa estrutura sem definir o conteúdo.

**Domínio e implementação.** Formato de resposta; equivalente internacional: response format; símbolo: `response_format`.

**Uso.** `restringir`; formas técnicas ou históricas: `response resource`, `response package`. Distinguir de `representação externa`, `resposta do estudante`, `retorno`.

**Base.** [observação técnica](componentes-didaticos.md).

#### Ativo de mídia

Arquivo binário ou documento armazenado e referenciado por uma representação, como imagem, áudio, vídeo ou anexo. Um arquivo de áudio incorporado ao curso é armazenado e referenciado por uma faixa do componente de áudio. O arquivo é o ativo de mídia; o componente fornece os controles para escutá-lo.

**Domínio e implementação.** Ativo de mídia; equivalente internacional: media asset; símbolo: `media_asset`.

**Uso.** `restringir`; formas técnicas ou históricas: `arquivo de mídia`, `media asset`. Distinguir de `representação externa`, `fonte`, `artefato de curso`.

**Base.** [padrão externo](https://www.rfc-editor.org/rfc/rfc3986.html).

#### Pacote de componente

Unidade técnica versionada que reúne contrato, esquema, validação e implementação de uma representação ou formato de resposta. Um pacote de componente agrupa o contrato e o código distribuível de um componente, sem incorporar o conteúdo de cada curso.

**Domínio e implementação.** Pacote de componente; equivalente internacional: component package; símbolo: `component_package`.

**Uso.** `restringir`; formas técnicas ou históricas: `resource package`, `package de resource`. Distinguir de `representação externa`, `MCP Resource`, `módulo curricular`.

**Base.** [observação técnica](componentes-didaticos.md).

#### Nomes intermediários abolidos da biblioteca

Registro histórico dos dois símbolos intermediários já retirados da superfície MCP de descoberta de componentes. Os nomes consultarRecursosDeCard e consultarPackagesDeCard aparecem somente nesta ficha de formas abolidas; nenhuma ferramenta MCP corrente deve expô-los.

**Domínio e implementação.** Nomes intermediários abolidos da biblioteca; equivalente internacional: abolished resource discovery tools; símbolo: `abolished_resource_discovery_tools`.

**Uso.** `retirado`; formas técnicas ou históricas: `consultarRecursosDeCard`, `consultarPackagesDeCard`. Distinguir de `MCP Resource`, `knowledge base`, `catálogo público de cursos`.

**Base.** [evidência histórica](vocabulario-controlado.md).

#### Biblioteca de componentes didáticos

Ferramenta de descoberta e inspeção seletiva dos componentes instalados. Recebe busca, função pretendida e filtros humanos; uma consulta focal recupera o contrato do componente escolhido. O assistente usa consultar_componentes para procurar uma representação adequada à operação planejada; depois consulta o componente escolhido antes de compor a unidade.

**Domínio e implementação.** Biblioteca de componentes didáticos; equivalente internacional: didactic component library tool; símbolo: `consultar_componentes`.

**Uso.** `substituído`; formas técnicas ou históricas: `consultarBibliotecaDeResources`. Distinguir de `MCP Resource`, `knowledge base`, `catálogo público de cursos`.

**Base.** [observação técnica](componentes-didaticos.md).

#### Relação entre representações

Relação semântica declarada entre representações, como complementaridade, especialização, redundância, exemplificação ou interferência potencial. Texto e diagrama de uma unidade podem ser complementares; a relação entre representações explicita o vínculo sem declarar equivalência automática.

**Domínio e implementação.** Relação entre representações; equivalente internacional: interrepresentational relation; símbolo: `representation_relation`.

**Uso.** `restringir`; formas técnicas ou históricas: `multimodalidade`. Distinguir de `tipo MIME`, `coocorrência`, `equivalência automática`.

**Base.** [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft); [Martinec e Salway (2005)](referencias.md#ref-martinec2005imagetext).

#### Transformação entre representações

Mapeamento documentado entre representação de origem e destino com registro do conteúdo preservado, acrescentado, omitido ou reinterpretado. Ao converter uma explicação verbal em diagrama, a transformação entre representações registra escolhas e perdas possíveis.

**Domínio e implementação.** Transformação entre representações; equivalente internacional: representation transformation; símbolo: `representation_transformation`.

**Uso.** `restringir`; formas técnicas ou históricas: `tradutibilidade entre texto e visual`. Distinguir de `tradução sem perda`, `conversão de arquivo`, `redundância`.

**Base.** [Martinec e Salway (2005)](referencias.md#ref-martinec2005imagetext); [padrão externo](https://www.w3.org/TR/prov-dm/).

### Processo de autoria

#### Parte de autoria

Agrupamento operacional de microssequências já previstas no mapa do curso para organizar produção e revisão. Seu tamanho é ajustável e não acrescenta nível à hierarquia didática. O assistente pode planejar, produzir e auditar em uma mesma parte de autoria várias microssequências que caibam no contexto disponível.

**Domínio e implementação.** Parte de autoria; equivalente internacional: authoring part; símbolo: `authoring_part`.

**Uso.** `restringir`; formas técnicas ou históricas: `Parte`. Distinguir de `módulo`, `lição`, `lote de materialização`, `versão`.

**Base.** [decisão de produto](guia-professor-autor.md).

#### Plano instrucional vivo

Estado revisável que explicita objetivos, organização, cobertura, progressão, prática, representações previstas, fontes e critérios de conclusão da materialização. O plano de um curso registra objetivos e organização prevista, mas pode ser ampliado quando a autoria revela que um tópico exige mais desenvolvimento.

**Domínio e implementação.** Plano instrucional vivo; equivalente internacional: living instructional plan; símbolo: `instructional_plan`.

**Uso.** `restringir`; formas técnicas ou históricas: `planejamento`. Distinguir de `prompt`, `blueprint imutável`, `curso materializado`.

**Base.** [decisão de produto](guia-professor-autor.md).

#### Produção

Produção e gravação das unidades de estudo de um recorte autorizado, com configuração aplicada e conteúdo disponível para inspeção. Reutiliza as bases explicativas salvas e mantém a revisão humana de cada objeto independente. Depois da autorização do recorte, o assistente produz suas unidades e fornece acesso ao conteúdo salvo. A pessoa pode inspecioná-lo; a produção não declara revisão humana.

**Domínio e implementação.** Materialização; equivalente internacional: materialization; símbolo: `course_materialization`.

**Uso.** `restringir`; formas técnicas ou históricas: `materialização`. Distinguir de `publicação`, `geração de texto`, `release`.

**Base.** [definição própria](guia-professor-autor.md).

#### Revisão

Releitura de observações, conteúdo e contexto pedagogicamente afetado que produz uma proposta antes de qualquer alteração do curso. Ao receber uma observação sobre uma unidade, o assistente relê também os pré-requisitos, exemplos e práticas afetados antes de propor correções.

**Domínio e implementação.** Revisão contextual; equivalente internacional: contextual authoring review; símbolo: `contextual_authoring_review`.

**Uso.** `restringir`; formas técnicas ou históricas: `revisão contextual`, `revisão autoral`. Distinguir de `correção aplicada`, `teste automatizado`, `aprovação automática`.

**Base.** [decisão de produto](auditoria-de-conformidade-instrucional.md).

#### Correção autoral

Conjunto autorizado de alterações em resposta a uma revisão ou observação, seguido de reinspeção do resultado corrente. Depois de aprovar a proposta, a pessoa aplica correções às unidades realmente afetadas e as reinspeciona no Conteúdo.

**Domínio e implementação.** Correção autoral; equivalente internacional: authoring correction; símbolo: `authoring_correction`.

**Uso.** `restringir`; formas técnicas ou históricas: `reparo`. Distinguir de `revisão contextual`, `revisão`, `resolução da Observação`.

**Base.** [decisão de produto](auditoria-de-conformidade-instrucional.md).

#### Revisão autoral

Inspeção humana de uma base explicativa ou unidade de estudo salva, com declaração expressa vinculada ao conteúdo examinado. A declaração pode ser registrada ou retirada por objeto; geração, edição e correção assistidas não a produzem automaticamente. A pessoa autora inspeciona uma explicação e suas fontes e declara sua revisão. As unidades daquela microssequência mantêm registros próprios; uma alteração material deixa desatualizada a declaração do objeto afetado.

**Domínio e implementação.** Revisão autoral; equivalente internacional: authoring review; símbolo: `content_review`.

**Uso.** `restringir`; formas técnicas ou históricas: `revisão de conteúdo`. Distinguir de `revisão contextual`, `versão de estado`, `correção aplicada`, `edição humana`, `marca pessoal Rever`.

**Base.** [decisão de produto](explicacao-e-revisao-humana.md); [observação técnica](https://github.com/fabio-ara/AraLearn/blob/main/src/domain/courseContentReview.js).

#### Versão de estado

Contador monotônico usado para detectar concorrência e ordenar mutações; não é uma revisão editorial nem uma cópia integral do curso. Antes de uma alteração composta, uma versão de estado permite identificar exatamente qual estado do curso foi analisado e qual resultou da mudança.

**Domínio e implementação.** Versão de estado; equivalente internacional: state version; símbolo: `state_version`.

**Uso.** `restringir`; formas técnicas ou históricas: `revision`, `revisão CAS`. Distinguir de `revisão autoral`, `versão de contrato`, `checkpoint`.

**Base.** [observação técnica](arquitetura.md).

### Evidência, anotação e proveniência

#### Fonte

Entidade identificável da qual uma afirmação, representação ou transformação deriva, com identidade e versão quando disponíveis. Um artigo, livro, documento interno ou entrevista usado para sustentar uma afirmação é registrado como fonte identificável.

**Domínio e implementação.** Fonte; equivalente internacional: source; símbolo: `source_entity`.

**Uso.** `restringir`. Distinguir de `citação`, `âncora`, `proveniência`, `ativo de mídia`.

**Base.** [padrão externo](https://www.w3.org/TR/prov-dm/).

#### Âncora de fonte

Localizador preciso de um trecho ou região dentro de uma fonte, como página, intervalo, seletor, fragmento ou timestamp. Uma afirmação da unidade aponta para a página 42 e o trecho correspondente de uma fonte por meio de uma âncora de fonte.

**Domínio e implementação.** Âncora de fonte; equivalente internacional: source anchor; símbolo: `source_anchor`.

**Uso.** `restringir`; formas técnicas ou históricas: `âncora`, `ancoragem`. Distinguir de `fonte`, `citação`, `evidência`.

**Base.** [padrão externo](https://www.w3.org/TR/annotation-model/); [padrão externo](https://www.rfc-editor.org/rfc/rfc3986.html).

#### Proveniência

Registro das entidades, atividades, agentes, derivações e versões envolvidos na produção ou transformação de conteúdo e dados. Ao corrigir uma unidade, o AraLearn registra que uma pessoa ou ferramenta realizou a atividade usando determinadas fontes e produzindo novo estado.

**Domínio e implementação.** Proveniência; equivalente internacional: provenance; símbolo: `provenance_record`.

**Uso.** `restringir`. Distinguir de `histórico de chat`, `citação`, `log`, `autoria comprovada`.

**Base.** [padrão externo](https://www.w3.org/TR/prov-dm/).

#### Observação

Anotação com corpo e alvo endereçável, autoria, motivação e estado; na interface, o rótulo simples “Observação” é mapeado explicitamente para este conceito de domínio. Na interface aparece “Observação”; ao enviá-la sobre uma unidade específica, o domínio registra uma anotação ancorada com corpo, alvo, autoria e motivação.

**Domínio e implementação.** Anotação ancorada; equivalente internacional: anchored annotation; símbolo: `anchored_annotation`.

**Uso.** `restringir`; formas técnicas ou históricas: `comentário`. Distinguir de `achado de revisão`, `mensagem de chat`, `nota privada sem alvo`.

**Base.** [padrão externo](https://www.w3.org/TR/annotation-model/); [decisão de produto](observacoes-pedagogicas.md).

#### Problema encontrado

Problema concreto identificado na revisão corrente, acompanhado de evidência e proposta, sem criar uma identidade histórica permanente. A revisão identifica que uma representação condensou uma relação necessária e propõe uma forma mais adequada antes da correção.

**Domínio e implementação.** Achado de revisão; equivalente internacional: review finding; símbolo: `review_finding`.

**Uso.** `restringir`; formas técnicas ou históricas: `achado de revisão`, `finding`. Distinguir de `anotação ancorada`, `erro confirmado`, `correção`.

**Base.** [decisão de produto](auditoria-de-conformidade-instrucional.md).

#### Citação bibliográfica

Representação bibliográfica usada para identificar e apresentar uma fonte segundo uma convenção acadêmica. Uma fonte acadêmica recebe autores, título, ano, DOI e demais elementos necessários para gerar uma citação bibliográfica verificável.

**Domínio e implementação.** Citação bibliográfica; equivalente internacional: scholarly citation; símbolo: `scholarly_citation`.

**Uso.** `restringir`; formas técnicas ou históricas: `citação`. Distinguir de `fonte`, `âncora`, `proveniência`.

**Base.** [definição própria](criar-cursos-pelo-chat.md).

### Parâmetros e regras

#### Parâmetro de desenho instrucional

Propriedade controlável do desenho com definição versionada, esquema, escopos admitidos, origem, valor efetivo e limitações explícitas. O teto de novas unidades de análise por Unidade expositiva é um parâmetro de desenho instrucional com inteiro positivo, escopos e origem declarados.

**Domínio e implementação.** Parâmetro de desenho instrucional; equivalente internacional: instructional design parameter; símbolo: `design_parameter`.

**Uso.** `restringir`; formas técnicas ou históricas: `parâmetro`. Distinguir de `configuração técnica`, `métrica`, `restrição editorial`.

**Base.** [definição própria](desenho-instrucional-parametrizado.md).

#### Configuração técnica

Valor que altera operação ou integração do software sem representar, por si, uma propriedade pedagógica pesquisada. Um limite de bytes aceito pelo Storage é uma configuração técnica e não deve aparecer como escolha pedagógica.

**Domínio e implementação.** Configuração técnica; equivalente internacional: technical configuration; símbolo: `technical_configuration`.

**Uso.** `restringir`; formas técnicas ou históricas: `configuração`. Distinguir de `parâmetro de desenho instrucional`, `política`, `condição experimental`.

**Base.** [observação técnica](vocabulario-controlado.md).

#### Política aplicável

Regra versionada que permite, restringe ou exige comportamento e que é efetivamente aplicada por uma fronteira do sistema. A política de componentes registra catálogo, disponibilidade, exclusões e preferências e é imposta na mesma transação da materialização.

**Domínio e implementação.** Política aplicável; equivalente internacional: enforced policy; símbolo: `enforced_policy`.

**Uso.** `restringir`; formas técnicas ou históricas: `policy`, `política`. Distinguir de `preferência`, `parâmetro`, `documentação sem execução`.

**Base.** [observação técnica](desenho-instrucional-parametrizado.md).

#### Valor de fallback do catálogo

Valor de referência versionado conservado no catálogo como recurso técnico quando necessário. Não substitui a escolha contextual exigida nos parâmetros delegados ao assistente nem constitui recomendação universal. O catálogo conserva 2 como valor de referência do teto. No modo automático, o assistente ainda escolhe e justifica o valor conforme a microssequência ou unidade antes de produzir.

**Domínio e implementação.** Valor de fallback do catálogo; equivalente internacional: catalog fallback value; símbolo: `default_value`.

**Uso.** `restringir`. Distinguir de `estado default`, `calibração automática`, `herança`, `melhor prática`.

**Base.** [definição própria](desenho-instrucional-parametrizado.md).

#### Herança calculada

Resultado do resolvedor que aplica um valor de escopo ancestral quando não existe atribuição de maior autoridade no alvo; não é uma atribuição gravada. Uma microssequência mostra o valor efetivo herdado do curso e informa o escopo fonte sem copiar a definição.

**Domínio e implementação.** Herança calculada; equivalente internacional: resolved inheritance; símbolo: `resolved_inheritance`.

**Uso.** `restringir`; formas técnicas ou históricas: `herança`. Distinguir de `cópia`, `default`, `sobrescrita`.

**Base.** [definição própria](desenho-instrucional-parametrizado.md).

#### Parâmetro definido

Atribuição intencional em um escopo que substitui integralmente o valor herdado segundo a regra de autoridade declarada. A pessoa define para uma microssequência um valor diferente do curso; Analytics conta esse parâmetro definido no estado corrente.

**Domínio e implementação.** Definição explícita de parâmetro; equivalente internacional: explicit override; símbolo: `explicit_override`.

**Uso.** `restringir`; formas técnicas ou históricas: `definição explícita`. Distinguir de `edição do default`, `herança`, `lock de pesquisa`.

**Base.** [definição própria](desenho-instrucional-parametrizado.md).

#### Direção editorial

Orientação qualitativa corrente de extensão, estilo, títulos ou organização, separada do catálogo 1.2.1 de doze decisões de conteúdo, prática, extensão, conversa e produção e incapaz de eliminar conteúdo necessário. Uma microssequência pede parágrafos curtos; quando o conteúdo necessário cresce, a produção cria mais unidades de estudo em vez de o comprimir para caber no alvo de palavras.

**Domínio e implementação.** Direção editorial; equivalente internacional: editorial direction; símbolo: `course_authoring_guidance`.

**Uso.** `restringir`; formas técnicas ou históricas: `orientação editorial`. Distinguir de `parâmetro pedagógico`, `alvo editorial quantitativo`, `prompt persistido`, `limite de conteúdo`.

**Base.** [definição própria](desenho-instrucional-parametrizado.md).

#### Calibração automática

Escolha contextual dos valores delegados ao assistente, conforme público, tarefa, conteúdo e função. Respeita os escopos e as doze decisões do catálogo corrente, as atribuições explícitas e a configuração aplicada que deve ser preservada na revisão. Com público e tarefa conhecidos, o assistente calibra as escolhas automáticas do escopo. Um teto fixado pela pessoa autora permanece; definir o tamanho de um lote organiza a produção sem determinar a extensão pedagógica do curso.

**Domínio e implementação.** Calibração automática de parâmetros; equivalente internacional: automatic parameter calibration; símbolo: `automatic_parameter_calibration`.

**Uso.** `restringir`. Distinguir de `preset fixo`, `valor de fallback do catálogo`, `condição fixada`, `questionário obrigatório`.

**Base.** [definição própria](desenho-instrucional-parametrizado.md).

#### Política de componentes

Política corrente por escopo que fixa catálogo, disponibilidade, referências permitidas, excluídas e preferidas e é imposta na materialização. Uma lição permite somente referências declaradas, exclui um pacote e prefere outro; a exclusão vence e o uso real ainda precisa ser validado.

**Domínio e implementação.** Política de componentes do curso; equivalente internacional: course component policy; símbolo: `course_component_policy`.

**Uso.** `restringir`. Distinguir de `catálogo`, `componente usado`, `parâmetro pedagógico`.

**Base.** [definição própria](desenho-instrucional-parametrizado.md).

#### Medida de densidade conceitual

Medida obtida pela aplicação de uma métrica versionada a unidades semânticas anotadas e a um denominador explícito; a interpretação exige definição e validação próprias do construto pretendido. Uma investigação define o construto, anota unidades semânticas, fixa o denominador e aplica a métrica versionada; o valor calculado é uma medida, não o construto.

**Domínio e implementação.** Medida de densidade conceitual; equivalente internacional: conceptual density measure; símbolo: `conceptual_density_measure`.

**Uso.** `restringir`; formas técnicas ou históricas: `densidade conceitual`. Distinguir de `quantidade de caracteres`, `complexidade textual`, `carga cognitiva`.

**Base.** [Kintsch e van Dijk (1978)](referencias.md#ref-kintsch1978model); [Messick (1995)](referencias.md#ref-messick1995validity).

#### Extensão editorial

Contagem observável de caracteres, palavras, linhas, altura, duração ou volume de dados usada para ergonomia, edição ou limites técnicos, sem inferência pedagógica automática. Contagem de palavras e altura apresentada são medidas diferentes de extensão editorial. Uma comparação registra como cada uma foi obtida; uma dimensão visual não medida permanece ausente.

**Domínio e implementação.** Extensão editorial; equivalente internacional: editorial extent; símbolo: `editorial_extent`.

**Uso.** `restringir`; formas técnicas ou históricas: `limite de caracteres`. Distinguir de `densidade conceitual`, `dificuldade`, `completude`, `qualidade`.

**Base.** [Dyson (2004)](referencias.md#ref-dyson2004layout).

### Desenho e mensuração de pesquisa

#### Condição

Curso privado independente cuja configuração e invariantes foram explicitamente registrados para uma comparação deliberada. Dois cursos preservam o mesmo inventário semântico e fixam tetos 1 e 2 para comparar a distribuição de unidades de estudo.

**Domínio e implementação.** Condição em curso independente; equivalente internacional: independent course condition; símbolo: `independent_course_condition`.

**Uso.** `restringir`; formas técnicas ou históricas: `condição autoral`, `comparação de condições`. Distinguir de `experimento`, `condição experimental`, `variante persistida`, `versão de estado`.

**Base.** [decisão de produto](experimentos-instrucionais-parametrizados.md): Condições são produzidas em cursos independentes, sem entidade de Variante nem promessa de experimento, atribuição ou análise causal.

#### Experimento

Protocolo de pesquisa que compara condições mediante fatores, atribuição, medidas e análise previamente declarados; a estrutura técnica não garante validade causal. Um experimento, se vier a ser implementado, compara condições previamente definidas, participantes elegíveis, medidas e um plano de análise documentado.

**Domínio e implementação.** Experimento; equivalente internacional: experiment; símbolo: `research_experiment`.

**Uso.** `restringir`. Distinguir de `condição autoral em Curso independente`, `teste A/B informal`, `analytics`.

**Base.** [decisão de produto](experimentos-instrucionais-parametrizados.md): Cursos configurados para comparação não ativam experimento, participantes, atribuição, medidas ou análise causal; [Shadish et al. (2002)](referencias.md#ref-shadish2002experimental): Fundamenta desenho experimental, quase-experimental e validade causal; não implica que o esquema técnico do AraLearn garanta um experimento válido.

#### Condição experimental

Combinação declarada de níveis de fatores atribuída, segundo o protocolo, a uma pessoa, grupo ou outra unidade definida pelo experimento. Não é criada apenas por configurar um curso. Em um futuro experimento, a condição experimental A poderia usar um nível de apoio e a B outro, mantendo os demais fatores definidos.

**Domínio e implementação.** Condição experimental; equivalente internacional: experimental condition; símbolo: `experimental_condition`.

**Uso.** `restringir`; formas técnicas ou históricas: `condição`. Distinguir de `condição autoral`, `parâmetro isolado`, `grupo de acesso`.

**Base.** [definição própria](experimentos-instrucionais-parametrizados.md): Cursos independentes com configurações declaradas não criam uma condição experimental governada.

#### Medida observada

Valor obtido por instrumento ou procedimento declarado, antes de qualquer interpretação como indicador de um construto. Se uma pesquisa medir o tempo entre uma abertura e uma resposta, o valor será uma medida observada desse intervalo; sua interpretação como atenção ou aprendizagem exigirá fundamentação adicional.

**Domínio e implementação.** Medida observada; equivalente internacional: observed measure; símbolo: `observed_measure`.

**Uso.** `restringir`; formas técnicas ou históricas: `medida`. Distinguir de `métrica calculada`, `indicador`, `construto`.

**Base.** [Messick (1995)](referencias.md#ref-messick1995validity).

#### Métrica calculada

Resultado operacional regenerável de fórmula versionada aplicada a fatos ou medidas, como contagem, razão ou agregação, com unidade e denominador explícitos; só constitui medida de construto quando houver modelo e validade declarados. A soma de oportunidades de prática num escopo é uma métrica calculada a partir do estado corrente das unidades de estudo e dos requisitos de evidência.

**Domínio e implementação.** Métrica calculada; equivalente internacional: computed metric; símbolo: `computed_metric`.

**Uso.** `restringir`; formas técnicas ou históricas: `métrica`. Distinguir de `medida observada`, `indicador`, `atenção`, `aprendizagem`.

**Base.** [Messick (1995)](referencias.md#ref-messick1995validity); [decisão de produto](analytics-instrucionais.md).

#### Indicador de pesquisa

Interpretação declarada de uma ou mais medidas para uma finalidade analítica específica, com inferências permitidas e proibidas. Uma taxa de observações resolvidas pode servir como indicador de pesquisa quando sua interpretação e limitações são declaradas.

**Domínio e implementação.** Indicador de pesquisa; equivalente internacional: research indicator; símbolo: `research_indicator`.

**Uso.** `restringir`; formas técnicas ou históricas: `indicador`. Distinguir de `métrica`, `desfecho`, `prova`.

**Base.** [padrão externo](https://www.testingstandards.net/).

#### Resultado avaliado

Variável escolhida como resultado de interesse de um estudo e definida conforme o protocolo da pesquisa. Desempenho numa avaliação posterior é um exemplo; o termo não afirma a existência de coleta ou painel de resultados de aprendizagem no aplicativo. Uma pesquisa pode escolher o desempenho numa tarefa posterior como resultado avaliado, declarando instrumento, momento e procedimento. A quantidade de unidades concluídas no aplicativo não substitui essa medida.

**Domínio e implementação.** Variável de resultado; equivalente internacional: outcome variable; símbolo: `outcome_variable`.

**Uso.** `restringir`; formas técnicas ou históricas: `outcome`. Distinguir de `métrica`, `indicador`, `resultado de uma função`.

**Base.** [padrão externo](https://www.testingstandards.net/).

### Organização, acesso e distribuição

#### Curso em autoria

O próprio curso vivo enquanto está sendo planejado e materializado; a pessoa não precisa compreender um recipiente abstrato separado. O que antes aparecia como Workspace passa a ser tratado como o próprio curso em autoria, sem uma estrutura organizacional opaca adicional.

**Domínio e implementação.** Curso em autoria; equivalente internacional: course under authoring; símbolo: `authoring_course`.

**Uso.** `substituído`; formas técnicas ou históricas: `Workspace`, `workspace de autoria`. Distinguir de `organização`, `tenant`, `projeto`, `pasta`.

**Base.** [decisão de produto](estado-atual-e-roadmap.md).

#### Biblioteca pessoal

Conjunto de cursos acessíveis à pessoa, separado de propriedade, compartilhamento e eventual ordenação curricular. A biblioteca pessoal lista os cursos que pertencem à pessoa ou aos quais ela recebeu acesso, sem determinar uma sequência de estudo.

**Domínio e implementação.** Biblioteca pessoal; equivalente internacional: personal library; símbolo: `personal_course_library`.

**Uso.** `substituído`; formas técnicas ou históricas: `Trilha`, `Trilhas`. Distinguir de `sequência curricular`, `permissão`, `coleção`.

**Base.** [decisão de produto](estado-atual-e-roadmap.md).

#### Catálogo público de cursos

Índice de cursos tornados públicos por decisão explícita; organização de catálogo não concede nem substitui acesso privado direto. O catálogo público de cursos lista somente cursos disponibilizados explicitamente ao público, sem controlar propriedade ou acesso privado.

**Domínio e implementação.** Catálogo público de cursos; equivalente internacional: public course catalog; símbolo: `list_courses_v1`.

**Uso.** `substituído`; formas técnicas ou históricas: `Coleção`, `Coleções`. Distinguir de `biblioteca pessoal`, `permissão`, `propriedade`.

**Base.** [decisão de produto](estado-atual-e-roadmap.md).

#### Disponibilização pública

Decisão explícita do proprietário que permite a visitantes estudar o mesmo curso mutável sem concessão privada direta. A política de arquivos é confirmada separadamente; tornar o curso público não concede edição nem cria uma versão imutável. O proprietário confirma o acesso público e a política de arquivos; visitantes podem estudar o curso, enquanto a edição continua exclusiva do proprietário.

**Domínio e implementação.** Disponibilização pública; equivalente internacional: public course availability; símbolo: `courses.visibility`.

**Uso.** `restringir`; formas técnicas ou históricas: `publicação`. Distinguir de `materialização`, `salvamento`, `curso pronto`.

**Base.** [decisão de produto](estado-atual-e-roadmap.md).

#### Registro de versão publicada retirado

Registro separado de uma versão publicada de curso, retirado do runtime. O acesso público corrente é uma política do próprio curso mutável e não depende desse registro. Tornar um curso público altera sua política de acesso sem criar public_course_release ou congelar uma versão.

**Domínio e implementação.** Registro de versão publicada retirado; equivalente internacional: retired course release record; símbolo: `public_course_release`.

**Uso.** `retirado`; formas técnicas ou históricas: `registro de versão publicada`. Distinguir de `disponibilização pública`, `cópia independente`, `revisão para concorrência`.

**Base.** [decisão de produto](estado-atual-e-roadmap.md).

#### Artefato de conteúdo

Representação serializada e identificável por conteúdo usada para armazenamento ou distribuição; não é o curso vivo completo. Um arquivo exportado ou uma representação produzida é um artefato de conteúdo; não é automaticamente o curso vivo completo.

**Domínio e implementação.** Artefato de conteúdo; equivalente internacional: content artifact; símbolo: `content_artifact`.

**Uso.** `restringir`; formas técnicas ou históricas: `artefato`. Distinguir de `curso`, `versão de estado`, `proveniência`.

**Base.** [observação técnica](arquitetura.md).

#### Ponto de recuperação

Marco operacional criado para permitir retomada ou restauração controlada de trabalho técnico; não é revisão de conteúdo nem versão pública. Numa operação de manutenção, a equipe pode conservar o estado anterior e o recibo necessário à recuperação. Esse marco técnico não declara revisão do conteúdo nem disponibiliza o curso ao público.

**Domínio e implementação.** Ponto de recuperação; equivalente internacional: recovery checkpoint; símbolo: `recovery_checkpoint`.

**Uso.** `restringir`; formas técnicas ou históricas: `checkpoint`. Distinguir de `versão de estado`, `release`, `revisão autoral`.

**Base.** [observação técnica](implantacao.md).

### Identidade e autorização

#### Pessoa usuária

Pessoa identificada no produto por uma conta; o registro de autenticação não resume sua identidade humana. O perfil mínimo exibe nome e avatar da pessoa usuária sem transformar a plataforma em rede social.

**Domínio e implementação.** Pessoa usuária; equivalente internacional: user; símbolo: `user_account`.

**Uso.** `restringir`; formas técnicas ou históricas: `usuário`. Distinguir de `perfil`, `ator técnico`, `proprietário`.

**Base.** [decisão de produto](privacidade.md).

#### Pessoa autora

Pessoa que participa intencionalmente do planejamento, produção, revisão ou correção de um curso; autoria não decorre apenas de executar uma mutação técnica. A pessoa autora planeja, comenta e revisa o curso; ela pode ou não ser sua proprietária.

**Domínio e implementação.** Pessoa autora; equivalente internacional: course author; símbolo: `course_author`.

**Uso.** `restringir`; formas técnicas ou históricas: `autor`. Distinguir de `proprietário`, `agente`, `operador`.

**Base.** [decisão de produto](privacidade.md).

#### Pessoa pesquisadora

Pessoa responsável por decisões, instrumentos ou análises de uma pesquisa; não recebe automaticamente propriedade ou acesso a todo curso. A pessoa pesquisadora define condições e analisa dados, função que pode coexistir com autoria na mesma conta.

**Domínio e implementação.** Pessoa pesquisadora; equivalente internacional: researcher; símbolo: `researcher`.

**Uso.** `restringir`; formas técnicas ou históricas: `pesquisador`. Distinguir de `autor`, `administrador`, `participante`.

**Base.** [decisão de produto](privacidade.md).

#### Pessoa estudante

Pessoa que acessa o curso para estudar ou participar de uma investigação, com consentimento e papel de pesquisa separados quando aplicável. A pessoa estudante acessa um curso compartilhado, pratica e pode registrar observações sobre unidades específicas.

**Domínio e implementação.** Pessoa estudante; equivalente internacional: learner; símbolo: `student`.

**Uso.** `restringir`; formas técnicas ou históricas: `estudante`. Distinguir de `participante de pesquisa`, `membro`, `usuário genérico`.

**Base.** [decisão de produto](privacidade.md).

#### Pessoa proprietária do curso

Pessoa com autoridade primária sobre o curso e sobre a concessão de acesso, sem implicar autoria exclusiva de todo conteúdo. A Pessoa proprietária controla o acesso ao curso e pode compartilhá-lo diretamente com outras pessoas.

**Domínio e implementação.** Pessoa proprietária do curso; equivalente internacional: course owner; símbolo: `course_owner`.

**Uso.** `restringir`; formas técnicas ou históricas: `proprietário`. Distinguir de `autor`, `administrador`, `criador original`.

**Base.** [decisão de produto](privacidade.md).

#### Pessoa com acesso

Pessoa à qual foi concedido acesso explícito a um curso, com permissões delimitadas; não pressupõe organização institucional. Ao compartilhar um curso com outra pessoa, o registro de acesso identifica diretamente a pessoa com acesso e suas permissões.

**Domínio e implementação.** Pessoa com acesso; equivalente internacional: course access grantee; símbolo: `course_access_grantee`.

**Uso.** `restringir`; formas técnicas ou históricas: `membro`. Distinguir de `proprietário`, `autor`, `membro de organização`.

**Base.** [decisão de produto](privacidade.md).

#### Papel de acesso

Rótulo técnico que agrupa responsabilidades ou permissões de acesso; não deve ser exposto como governança necessária para compartilhar um curso. Um papel de acesso agrupa permissões estritamente necessárias, sem representar cargo ou hierarquia institucional.

**Domínio e implementação.** Papel de acesso; equivalente internacional: access role; símbolo: `access_role`.

**Uso.** `substituído`; formas técnicas ou históricas: `role`. Distinguir de `permissão efetiva`, `identidade`, `cargo institucional`.

**Base.** [decisão de produto](privacidade.md).

#### Permissão efetiva

Autorização concreta para executar uma operação sobre um alvo e estado específicos, derivada e revalidada no ponto de uso. A interface habilita uma ação somente quando a permissão efetiva calculada autoriza aquela pessoa naquele curso.

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

Código e dependências necessários para executar um contrato em determinada plataforma; não inclui automaticamente autoria, persistência e catálogo. O ambiente de execução carrega e renderiza componentes no cliente sem ser confundido com o motor que transforma dados.

**Domínio e implementação.** Ambiente de execução; equivalente internacional: runtime; símbolo: `runtime_environment`.

**Uso.** `restringir`; formas técnicas ou históricas: `runtime`. Distinguir de `engine`, `aplicativo`, `núcleo`.

**Base.** [observação técnica](vocabulario-controlado.md).

#### Motor

Componente que executa um algoritmo ou transformação substantiva bem delimitada; não é nome genérico para qualquer serviço. O motor aplica uma transformação definida, como validar uma resposta, mas não representa toda a aplicação.

**Domínio e implementação.** Motor; equivalente internacional: engine; símbolo: `processing_engine`.

**Uso.** `restringir`; formas técnicas ou históricas: `engine`. Distinguir de `runtime`, `adapter`, `serviço`.

**Base.** [observação técnica](vocabulario-controlado.md).

#### Adaptador

Componente de fronteira que traduz entre contratos sem assumir a regra de negócio traduzida. Um adaptador converte a forma usada pelo domínio para a API de Storage ou banco, mantendo essa fronteira explícita.

**Domínio e implementação.** Adaptador; equivalente internacional: adapter; símbolo: `boundary_adapter`.

**Uso.** `restringir`; formas técnicas ou históricas: `adapter`. Distinguir de `serviço de domínio`, `fallback`, `alias`.

**Base.** [observação técnica](vocabulario-controlado.md).

#### Repositório de estado

Componente que lê e grava estado em uma fronteira de persistência declarada; não é o estado em si nem necessariamente a fonte canônica. O repositório de estado lê e grava dados de autoria; ele não é sinônimo do serviço Supabase Storage.

**Domínio e implementação.** Repositório de estado; equivalente internacional: store; símbolo: `state_repository`.

**Uso.** `restringir`; formas técnicas ou históricas: `store`. Distinguir de `banco de dados`, `estado`, `cache`.

**Base.** [observação técnica](arquitetura.md).

#### Catálogo

Projeção consultável de itens disponíveis e de seus metadados; não é o registro de execução nem a coleção de dados completos. Um catálogo permite consultar metadados e localizar componentes ou cursos sem assumir propriedade nem sequência.

**Domínio e implementação.** Catálogo; equivalente internacional: catalog; símbolo: `queryable_catalog`.

**Uso.** `restringir`; formas técnicas ou históricas: `catalog`. Distinguir de `registry`, `biblioteca pessoal`, `MCP Resource`.

**Base.** [observação técnica](componentes-didaticos.md).

### Interação e cognição

#### Abrir

Ação de entrada que abre o curso selecionado pela lista de módulos; posições salvas não mudam o nome nem pulam silenciosamente a hierarquia. O botão inicial mostra Abrir em qualquer estado de progresso e entra no curso pela lista de módulos.

**Domínio e implementação.** Ação de entrada no Estudo; equivalente internacional: study entry action; símbolo: `study_entry_action`.

**Uso.** `restringir`. Distinguir de `reprodução de mídia`, `rolagem`, `avanço automático`.

**Base.** [hipótese de produto](sistema-visual.md).

#### Rolagem vertical

Deslocamento contínuo da viewport no eixo vertical, distinto do gesto físico que o iniciou e da mudança curricular entre unidades. No celular, a pessoa desliza a página para cima e percorre rapidamente as unidades de estudo em rolagem vertical.

**Domínio e implementação.** Rolagem vertical; equivalente internacional: vertical scrolling; símbolo: `vertical_scroll`.

**Uso.** `restringir`; formas técnicas ou históricas: `rolar`, `scroll`. Distinguir de `deslize`, `avançar`, `feed`.

**Base.** [Haverkamp et al. (2023)](referencias.md#ref-haverkamp2023screens).

#### Gesto de deslize

Gesto de entrada observável executado sobre uma superfície, sem inferência automática sobre intenção ou processo cognitivo. Um movimento de dedo reconhecido como gesto de deslize pode avançar a interface, mas não prova uma operação cognitiva.

**Domínio e implementação.** Gesto de deslize; equivalente internacional: swipe gesture; símbolo: `swipe_input_gesture`.

**Uso.** `restringir`; formas técnicas ou históricas: `deslizar`, `swipe`. Distinguir de `rolagem`, `avanço`, `ação epistêmica`.

**Base.** [definição própria](vocabulario-controlado.md).

#### Navegação do curso

Mudança de posição ou escopo dentro da estrutura do curso, com destino e estado explícitos, independentemente do gesto usado. Na interface, a pessoa usa a navegação do curso para saltar à próxima microssequência; o evento de domínio registra uma navegação curricular com origem e destino.

**Domínio e implementação.** Navegação curricular; equivalente internacional: curricular navigation; símbolo: `curricular_navigation`.

**Uso.** `restringir`; formas técnicas ou históricas: `avançar`, `navegar`, `explorar`, `retomar`. Distinguir de `rolagem`, `deslize`, `aprendizagem`.

**Base.** [definição própria](sistema-visual.md).

#### Operação-alvo da tarefa

Definição terminológica própria do AraLearn para a transformação que a tarefa exige da pessoa sobre o conteúdo; o contrato e a resposta são observáveis, mas o rótulo não afirma observação direta de uma operação mental. Uma atividade pode solicitar comparar duas representações; “comparar” é a operação-alvo da tarefa, independentemente do toque usado para responder.

**Domínio e implementação.** Operação-alvo da tarefa; equivalente internacional: target task operation; símbolo: `taskOperations`, `taskOperationIds`, `task_operation.*`.

**Uso.** `substituído`; formas técnicas ou históricas: `gesto cognitivo`, `cognitiveOperations`. Distinguir de `gesto de entrada`, `atenção`, `processo cognitivo medido`, `ação epistêmica`.

**Base.** [definição própria](vocabulario-controlado.md): Fixa o rótulo e a definição operacional adotados no domínio do AraLearn; [Kirsh e Maglio (1994)](referencias.md#ref-kirshmaglio1994epistemic): Sustenta apenas a distinção entre ações pragmáticas e epistêmicas; não fundamenta o rótulo operação-alvo da tarefa.

#### Atenção

Família de processos seletivos internos e externos que exige operacionalização e instrumento próprios; não é evento de visibilidade ou duração. Uma pesquisa pode definir atenção como construto e escolher múltiplas medidas; um scroll isolado não recebe esse rótulo.

**Domínio e implementação.** Atenção; equivalente internacional: attention construct; símbolo: `attention_construct`.

**Uso.** `restringir`. Distinguir de `tempo de tela`, `foco de teclado`, `rolagem`, `engajamento`.

**Base.** [Chun et al. (2011)](referencias.md#ref-chun2011attention).

#### Engajamento

Construto multidimensional cuja dimensão comportamental, cognitiva ou afetiva deve ser declarada e medida com evidência de validade. A pesquisa declara como engajamento será inferido de diferentes evidências, sem renomear mera abertura de tela como engajamento.

**Domínio e implementação.** Engajamento; equivalente internacional: engagement construct; símbolo: `engagement_construct`.

**Uso.** `restringir`. Distinguir de `clique`, `tempo`, `atenção`, `conclusão`.

**Base.** [Henrie et al. (2015)](referencias.md#ref-henrie2015engagement).

#### Foco do controle

Estado técnico, conforme o modelo de foco do HTML, que determina qual controle recebe entrada de teclado ou tecnologia assistiva; não mede atenção psicológica. Quando a caixa de observação se torna o elemento ativo para teclado, ela recebe foco do controle; isso não demonstra atenção da pessoa.

**Domínio e implementação.** Foco do controle; equivalente internacional: focus state; símbolo: `focus_state`.

**Uso.** `restringir`; formas técnicas ou históricas: `foco`. Distinguir de `atenção`, `engajamento`, `seleção`.

**Base.** [padrão externo](https://html.spec.whatwg.org/multipage/interaction.html#focus).

#### Sequência vertical de inspeção

Fluxo finito e curricularmente ordenado para percorrer unidades de estudo na Autoria, com posição, hierarquia, retomada e marcos explícitos. Na Autoria móvel, uma sequência vertical de inspeção permite percorrer unidade por unidade e abrir detalhes somente quando necessário.

**Domínio e implementação.** Sequência vertical de inspeção; equivalente internacional: vertical inspection sequence; símbolo: `vertical_inspection_sequence`.

**Uso.** `manter`. Distinguir de `feed`, `rolagem infinita`, `evidência de compreensão`.

**Base.** [hipótese de produto](sistema-visual.md); [Haverkamp et al. (2023)](referencias.md#ref-haverkamp2023screens).

#### Feed social

Fluxo digital continuamente abastecido, usado aqui apenas como antecedente comparativo; não descreve a sequência curricular finita do AraLearn. O feed do X serve como comparação histórica de rolagem e segmentação, mas não como modelo pedagógico ou evidência de eficácia.

**Domínio e implementação.** Feed social; equivalente internacional: social feed; símbolo: `social_content_feed`.

**Uso.** `restringir`; formas técnicas ou históricas: `feed`. Distinguir de `sequência vertical de inspeção`, `curso`, `navegação curricular`.

**Base.** [evidência histórica](vocabulario-controlado.md); [Baughan et al. (2022)](referencias.md#ref-baughan2022dissociation).

#### Ação epistêmica

Ação externa realizada para revelar informação ou simplificar o trabalho cognitivo, usada somente quando essa função tiver sido demonstrada na tarefa. Anotar uma contradição para facilitar o raciocínio pode ser modelado como ação epistêmica quando a análise distingue ação observável e processo mental.

**Domínio e implementação.** Ação epistêmica; equivalente internacional: epistemic action; símbolo: `epistemic_action`.

**Uso.** `restringir`. Distinguir de `toque`, `swipe`, `operação-alvo da tarefa`, `qualquer interação`.

**Base.** [Kirsh e Maglio (1994)](referencias.md#ref-kirshmaglio1994epistemic).

### Assistente, MCP e estado

#### Instruções de sistema

Camada estável reservada a invariantes, segurança, limites de autoridade e protocolo de uso das ferramentas; não contém estado corrente do curso nem manual científico mutável. As instruções de sistema mantêm regras invariantes de segurança e de uso das ferramentas; o plano mutável do curso fica fora delas.

**Domínio e implementação.** Instruções de sistema; equivalente internacional: system instructions; símbolo: `system_instructions`.

**Uso.** `restringir`; formas técnicas ou históricas: `system prompt`, `system instructions`. Distinguir de `prompt de tarefa`, `knowledge base`, `estado de autoria do curso`.

**Base.** [decisão de produto](assistencia-por-ia.md).

#### Prompt de tarefa

Instrução contextual de uma execução ou turno; pode referenciar estado persistido, mas não se torna o registro autorizado desse estado. Ao pedir auditoria de uma parte, a solicitação e seus limites formam o prompt de tarefa daquela execução.

**Domínio e implementação.** Prompt de tarefa; equivalente internacional: task prompt; símbolo: `task_prompt`.

**Uso.** `restringir`; formas técnicas ou históricas: `prompt`. Distinguir de `instruções de sistema`, `estado persistido`, `ferramenta`.

**Base.** [definição própria](assistencia-por-ia.md).

#### Base de referência estável

Conteúdo relativamente estável de referência recuperável sob demanda, como critérios, ciência, exemplos e limitações; não contém planejamento ou observações correntes do curso. A base de referência estável contém documentação durável sobre ferramentas e métodos, não o planejamento mutável de um curso.

**Domínio e implementação.** Base de referência estável; equivalente internacional: knowledge base; símbolo: `knowledge_base`.

**Uso.** `restringir`; formas técnicas ou históricas: `knowledge base`, `knowledge JIT`. Distinguir de `RAG`, `estado de autoria do curso`, `instruções de sistema`.

**Base.** [decisão de produto](assistencia-por-ia.md).

#### Estado de autoria do curso

Estado salvo do curso que reúne planejamento, conteúdo, configuração, fontes, observações e registros de produção e revisão. Interface, MCP e Actions consultam e alteram esse estado pelas operações autorizadas; dados de aprendizagem não são inferidos dessas operações. O planejamento, os parâmetros, as fontes e as observações de um curso compõem seu Estado de autoria, lido pela interface, pelas ferramentas MCP e pelas operações de Actions.

**Domínio e implementação.** Estado de autoria do curso; equivalente internacional: course authoring state; símbolo: `course_authoring_state`.

**Uso.** `manter`; formas técnicas ou históricas: `estado autoral dinâmico`. Distinguir de `workspace`, `histórico de chat`, `knowledge base`, `prompt`.

**Base.** [decisão de produto](assistencia-por-ia.md).

#### Geração aumentada por recuperação

Processo em que uma consulta recupera explicitamente itens de um corpus indexado e os fornece à geração, com registro do corpus e da recuperação. Uma execução só é descrita como RAG quando consulta um corpus indexado e incorpora os resultados recuperados ao contexto de geração.

**Domínio e implementação.** Geração aumentada por recuperação; equivalente internacional: retrieval-augmented generation; símbolo: `retrieval_augmented_generation`.

**Uso.** `restringir`; formas técnicas ou históricas: `RAG`. Distinguir de `knowledge base`, `MCP Resource`, `leitura direta de estado`, `busca simples`.

**Base.** [Lewis et al. (2020)](referencias.md#ref-lewis2020rag).

#### Configuração do assistente

Conjunto versionado de modelo, instruções, ferramentas, políticas de recuperação e parâmetros operacionais que pode constituir fator experimental. Uma pesquisa versiona duas configurações do assistente para comparar instruções ou estratégias de ferramenta sob condições controladas.

**Domínio e implementação.** Configuração do assistente; equivalente internacional: agent configuration; símbolo: `agent_configuration`.

**Uso.** `restringir`; formas técnicas ou históricas: `agent configuration`, `configuração do agente`. Distinguir de `estado de autoria do curso`, `perfil da pessoa`, `prompt isolado`.

**Base.** [decisão de produto](assistencia-por-ia.md).

#### Resource MCP

Primitiva do protocolo pela qual um servidor expõe dados ou contexto identificados por URI para leitura orientada pela aplicação. Uma ferramenta cliente lê um Resource MCP exposto pelo servidor; ele não é um componente visual armazenado dentro de uma unidade.

**Domínio e implementação.** Resource MCP; equivalente internacional: mcp resource; símbolo: `mcp_resource`.

**Uso.** `restringir`; formas técnicas ou históricas: `MCP Resource`. Distinguir de `representação externa`, `knowledge base`, `tool`, `arquivo de Storage`.

**Base.** [padrão externo](https://modelcontextprotocol.io/specification/2025-11-25/server/resources).

#### Ferramenta MCP

Operação tipada exposta pelo servidor para o modelo solicitar uma ação ou consulta sob autorização e contrato explícitos. O assistente chama uma ferramenta MCP para registrar uma anotação ou materializar uma parte, produzindo efeito verificável no estado persistido.

**Domínio e implementação.** Ferramenta MCP; equivalente internacional: mcp tool; símbolo: `mcp_tool`.

**Uso.** `restringir`; formas técnicas ou históricas: `tool`. Distinguir de `MCP Resource`, `prompt`, `estado persistido`, `capacidade`.

**Base.** [padrão externo](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

#### Assistência por IA

Sessão contextual em que um sistema de inteligência artificial ajuda a discutir, planejar, preparar, validar e pré-visualizar uma alteração tipada antes de a pessoa decidir aplicá-la ao rascunho do objeto corrente. Na unidade de estudo, a pessoa abre Assistência por IA, discute o pedido, confirma um plano e só aplica a proposta depois de conferir a prévia na apresentação real do aplicativo.

**Domínio e implementação.** Assistência contextual por modelo de linguagem; equivalente internacional: contextual AI assistance for authoring (descrição técnica própria); símbolo: `course_provider_assistance`.

**Uso.** `restringir`; formas técnicas ou históricas: `Assistência por API`. Distinguir de `API`, `provedor`, `MCP`, `Actions`, `chat genérico`.

**Base.** [decisão de produto](assistencia-por-ia.md): Define a sessão contextual, a confirmação humana e a separação entre provedor, API, MCP e Actions; [padrão externo](https://www.nist.gov/itl/ai-risk-management-framework): Sustenta somente a distinção geral entre sistema de inteligência artificial e os mecanismos técnicos que o disponibilizam; não prescreve o rótulo da interface.

<!-- referências locais: início -->

## Referências

- [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft): Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198.
- [Barrison et al. (2025)](referencias.md#ref-barrison2025flashcards): Philip D. Barrison; Emily A. Balczewski; Emily Capellari; Zach Landis-Lewis; Alexandra H. Vinson (2025). **Electronic Flashcards in Health Professions Education: A Scoping Review.** *Academic Medicine*, 100(4), p. 497–506.
- [Baughan et al. (2022)](referencias.md#ref-baughan2022dissociation): Amanda Baughan; Mingrui Ray Zhang; Raveena Rao; Kai Lukoff; Anastasia Schaadhardt; Lisa D. Butler; Alexis Hiniker (2022). **I Don't Even Remember What I Read: How Design Influences Dissociation on Social Media.** In: *Proceedings of the 2022 CHI Conference on Human Factors in Computing Systems*, ACM, p. 1–13.
- [Chun et al. (2011)](referencias.md#ref-chun2011attention): Marvin M. Chun; Julie D. Golomb; Nicholas B. Turk-Browne (2011). **A Taxonomy of External and Internal Attention.** *Annual Review of Psychology*, 62(1), p. 73–101.
- [Dyson (2004)](referencias.md#ref-dyson2004layout): Mary C. Dyson (2004). **How Physical Text Layout Affects Reading from Screen.** *Behaviour & Information Technology*, 23(6), p. 377–393.
- [Haverkamp et al. (2023)](referencias.md#ref-haverkamp2023screens): Ymkje E. Haverkamp; Ivar Bråten; Natalia Latini; Ladislao Salmerón (2023). **Is It the Size, the Movement, or Both? Investigating Effects of Screen Size and Text Movement on Processing, Understanding, and Motivation When Students Read Informational Text.** *Reading and Writing*, 36(7), p. 1589–1608.
- [Henrie et al. (2015)](referencias.md#ref-henrie2015engagement): Curtis R. Henrie; Lisa R. Halverson; Charles R. Graham (2015). **Measuring Student Engagement in Technology-mediated Learning: A Review.** *Computers & Education*, 90, p. 36–53.
- [Kintsch e van Dijk (1978)](referencias.md#ref-kintsch1978model): Walter Kintsch; Teun A. van Dijk (1978). **Toward a Model of Text Comprehension and Production.** *Psychological Review*, 85(5), p. 363–394.
- [Kirsh e Maglio (1994)](referencias.md#ref-kirshmaglio1994epistemic): David Kirsh; Paul Maglio (1994). **On Distinguishing Epistemic from Pragmatic Action.** *Cognitive Science*, 18(4), p. 513–549.
- [Lewis et al. (2020)](referencias.md#ref-lewis2020rag): Patrick Lewis; Ethan Perez; Aleksandra Piktus; Fabio Petroni; Vladimir Karpukhin; Naman Goyal; Heinrich Küttler; Mike Lewis; Wen-tau Yih; Tim Rocktäschel; Sebastian Riedel; Douwe Kiela (2020). **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.** In: *Advances in Neural Information Processing Systems*, vol. 33, p. 9459–9474.
- [Martinec e Salway (2005)](referencias.md#ref-martinec2005imagetext): Radan Martinec; Andrew Salway (2005). **A System for Image–Text Relations in New (and Old) Media.** *Visual Communication*, 4(3), p. 337–371.
- [Messick (1995)](referencias.md#ref-messick1995validity): Samuel Messick (1995). **Validity of Psychological Assessment: Validation of Inferences from Persons' Responses and Performances as Scientific Inquiry into Score Meaning.** *American Psychologist*, 50(9), p. 741–749.
- [Miller (1984)](referencias.md#ref-miller1984genre): Carolyn R. Miller (1984). **Genre as Social Action.** *Quarterly Journal of Speech*, 70(2), p. 151–167.
- [Passonneau e Litman (1997)](referencias.md#ref-passonneau1997segmentation): Rebecca J. Passonneau; Diane J. Litman (1997). **Discourse Segmentation by Human and Automated Means.** *Computational Linguistics*, 23(1), p. 103–139.
- [Pons Bordería e Borreguero Zuloaga (2024)](referencias.md#ref-ponsborderia2024unidades): Salvador Pons Bordería; Margarita Borreguero Zuloaga (2024). **Unidades discursivas del texto escrito: revisión crítica del estado de la cuestión y directrices para una nueva propuesta.** *Círculo de Lingüística Aplicada a la Comunicación*, 99, p. 7–21.
- [Schnotz e Bannert (2003)](referencias.md#ref-schnotz2003representations): Wolfgang Schnotz; Maria Bannert (2003). **Construction and Interference in Learning from Multiple Representation.** *Learning and Instruction*, 13(2), p. 141–156.
- [Shadish et al. (2002)](referencias.md#ref-shadish2002experimental): William R. Shadish; Thomas D. Cook; Donald T. Campbell (2002). **Experimental and Quasi-Experimental Designs for Generalized Causal Inference.** 2. ed., Houghton Mifflin.
- [Yates e Orlikowski (1992)](referencias.md#ref-yates1992genres): Joanne Yates; Wanda J. Orlikowski (1992). **Genres of Organizational Communication: A Structurational Approach to Studying Communication and Media.** *Academy of Management Review*, 17(2), p. 299–326.

<!-- referências locais: fim -->
