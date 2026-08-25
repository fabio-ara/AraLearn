# Fundamentos de pesquisa e governança científica

## Finalidade

O AraLearn pode ser examinado simultaneamente como:

1. **produto de software**, constituído por código, dados, contratos,
   interfaces e infraestrutura;
2. **artefato de design**, construído para responder a um conjunto de problemas
   e incorporar conhecimentos de projeto;
3. **intervenção educacional**, utilizada por pessoas em atividades de Estudo,
   Autoria e compartilhamento;
4. **objeto de investigação**, sobre o qual se formulam perguntas, hipóteses e
   avaliações.

Essas perspectivas se relacionam, mas não são equivalentes. Um teste pode
demonstrar que uma Unidade de estudo abre sem conexão; não demonstra que a disponibilidade local
melhora a aprendizagem. Uma fonte pode sustentar a plausibilidade de exemplos
resolvidos; não prova que uma microssequência concreta foi bem escrita. Uma
entrevista pode revelar como participantes compreenderam uma permissão; não
substitui um teste de isolamento do banco de dados.

Este documento ensina como separar essas formas de conhecimento, como organizar
uma investigação responsável e como manter a documentação auditável.

Nos trechos técnicos, **núcleo comum** significa a camada que coordena os
módulos do aplicativo; **pacote de componente**, o módulo versionado que reúne
contrato, validação e implementação de uma representação ou formato de
resposta; e **inteligência artificial (IA)**, os modelos e serviços usados para
auxiliar a autoria. **Local-first** designa a arquitetura em que a cópia local
sustenta a operação corrente e a sincronização remota ocorre fora do caminho
crítico da interação.

## O que significa governança científica

**Governança científica** é o conjunto de regras que controla como perguntas,
fontes, decisões, implementações, dados e conclusões são produzidos e
relacionados. Sua finalidade não é burocratizar o desenvolvimento; é impedir
que memória de produto, convicção de projetista e resultado empírico sejam
tratados como se fossem a mesma coisa.

No AraLearn, a governança precisa responder:

- de onde vem uma afirmação;
- em que contexto ela foi produzida;
- que decisão ela fundamenta e com qual grau de indireção;
- onde a decisão foi implementada;
- que teste demonstra a implementação;
- que avaliação poderia sustentar ou enfraquecer a hipótese;
- quais dados são necessários e quem pode acessá-los;
- que versão do artefato foi examinada;
- que limites impedem generalização indevida.

## Estados epistêmicos

“Epistêmico” refere-se ao estatuto de uma afirmação como conhecimento. O corpus
do AraLearn utiliza seis estados:

| Estado | Definição | Evidência necessária | Linguagem adequada |
| --- | --- | --- | --- |
| **evidência externa** | resultado ou argumento publicado fora do AraLearn | fonte identificável e limites de população, tarefa e método | “a revisão encontrou...”, “o estudo observou...” |
| **inferência teórica** | relação argumentada entre literatura e contexto do produto | encadeamento explícito e alternativas | “isso torna plausível...”, “pode ser relevante...” |
| **hipótese de design** | relação falseável entre contexto, mecanismo e resultado | comparação, medida e critério de revisão propostos | “a hipótese é que...” |
| **decisão de produto** | escolha pedagógica, normativa ou arquitetural vigente | problema, alternativas, fundamento e consequências | “o AraLearn adota...” |
| **propriedade implementada** | comportamento demonstrável do artefato | código, esquema de dados, teste, inspeção ou medição | “a versão implementa...” |
| **resultado empírico** | achado produzido em avaliação documentada | participantes ou corpus, procedimento, análise e incerteza | “nestas condições, observou-se...” |

### Por que essa separação é necessária

Considere a afirmação “o funcionamento sem conexão reduz o abandono”. Ela contém
duas relações distintas:

```text
conteúdo disponível sem rede
  → propriedade técnica demonstrável

disponibilidade sem rede
  → continuidade ou abandono
  → hipótese que exige população, comparação e medida
```

O teste de rede pode sustentar a primeira; não pode sustentar a segunda.
Expressões como “melhora”, “reduz”, “favorece” e “aumenta” precisam nomear
sujeito, comparação, resultado, contexto e fonte. Quando isso ainda não existe,
usa-se “pretende”, “pode” ou “hipótese a avaliar”.

## Objeto, contexto e delimitação

O objeto investigado é uma plataforma móvel e local-first para Estudo e Autoria
de Cursos organizados em Módulos, Lições, Microssequências didáticas e Unidades
de estudo com representações especializadas. O contexto prioritário inclui pessoas adultas que conciliam
trabalho e estudo, utilizam celular, enfrentam interrupções e podem perder
conectividade.

Essa prioridade é uma **delimitação de design**, não uma descrição empírica de
todos os usuários. Cada avaliação precisa caracterizar sua própria população,
incluindo experiência com tecnologia, domínio de conhecimento, dispositivo,
condições de rede e contexto de uso.

O problema de pesquisa não se reduz a disponibilizar conteúdo. Ele envolve:

- construir explicações profundas sem pressupostos ocultos;
- dividir o percurso sem fragmentar relações;
- escolher representações apropriadas às operações;
- articular teoria, prática, feedback e retomada;
- sustentar Estudo em condições móveis e sem conexão;
- permitir autoria assistida sem transferir responsabilidade à IA;
- delimitar propriedade e acesso sem vigilância ou poder difuso;
- manter custo, armazenamento e manutenção proporcionais.

## Pergunta orientadora e subproblemas

Uma pergunta ampla capaz de organizar o programa é:

> Como projetar e avaliar uma plataforma móvel, local-first e orientada por
> representações para apoiar estudo e autoria em condições de tempo fragmentado
> e conectividade variável, preservando coerência pedagógica, agência humana e
> responsabilidade no uso de IA?

Essa pergunta deve ser decomposta em estudos delimitados:

1. **progressão didática:** em que condições a distribuição de explicação,
   exemplo, prática e feedback sustenta compreensão, retenção e transferência?
2. **representação:** quando uma representação especializada ajuda a executar uma
   operação sem introduzir gramática visual ou carga desnecessária?
3. **continuidade:** como disponibilidade local, sincronização e marco de
   retomada afetam a capacidade de continuar após interrupção?
4. **autoria assistida:** como catálogo, contrato, escopo e reversibilidade
   afetam erro de alvo, qualidade e controle humano?
5. **governança:** que formas de propriedade, acesso, dados e intervenções são legítimas e úteis sem
   converter rastros ambíguos em diagnóstico?
6. **frugalidade:** como custo, armazenamento, volume transferido e manutenção evoluem sem
   comprometer segurança, acessibilidade e rigor?

Essas perguntas podem ser investigadas separadamente. Colocá-las num único
estudo produziria unidades, medidas e explicações rivais demais para uma análise
coerente.

## Design-Based Research

Construir o AraLearn ao longo do tempo não transforma sua genealogia em método
de pesquisa. Um episódio só pode ser situado em DBR ou DSR quando pergunta,
contexto, versão do artefato, procedimento, dados e contribuição foram
declarados de modo compatível com a tradição metodológica. Classificar
retroativamente toda iteração como pesquisa apagaria a diferença entre memória
do projeto e investigação documentada.

### Conceito

Design-Based Research (DBR) é uma tradição de investigação de intervenções
educacionais em contextos autênticos. Ela articula análise do problema,
desenho, implementação, observação e revisão, buscando compreender como a
intervenção opera em condições concretas e produzir conhecimentos de design
transferíveis com limites explícitos ([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased)).

DBR não significa simplesmente “desenvolver iterativamente”. Um ciclo precisa
ter:

- problema educacional situado;
- conjectura ou mecanismo explícito;
- intervenção descrita e versionada;
- participação de atores relevantes;
- dados coerentes com a pergunta;
- análise de processo, resultado e casos negativos;
- revisão da intervenção e da explicação.

### Aplicação ao AraLearn

- **Problema:** decisões didáticas e de uso só podem ser compreendidas no
  contexto em que pessoas estudam, retomam, interpretam e revisam.
- **Alternativas:** avaliação laboratorial isolada, coleta de satisfação ou
  ciclos situados com mecanismos declarados.
- **Enquadramento possível:** episódios futuros ou documentados podem usar DBR
  para investigar progressão, representações, feedback, retomada cotidiana,
  observações e práticas de autoria em contexto quando cumprirem as condições
  metodológicas acima.
- **Fundamentação:** DBR relaciona teoria, desenho e prática sem presumir que a
  intervenção funcione da mesma forma em todos os ambientes
  ([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased)).
- **Operacionalização:** cada ciclo registra contexto, versão, conjectura C–M–O,
  processo, resultados, rivais, efeitos adversos e revisão.
- **Consequências:** mudanças no produto tornam-se parte da explicação, e não
  ruído ocultado.
- **Limites:** resultados permanecem situados; abstração exige comparação entre
  ciclos e justificativa de transferência.

## Design Science Research

### Conceito

Design Science Research (DSR) investiga a construção e a avaliação de artefatos
destinados a resolver problemas relevantes, além do conhecimento de design que
esses artefatos incorporam ([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)). A contribuição pode ser o próprio artefato, um método, uma
arquitetura, um princípio ou conhecimento sobre condições de sucesso e falha.

Gregor e Hevner propõem posicionar a contribuição conforme a maturidade do
problema e da solução ([Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning)). O quadro FEDS ajuda a
planejar avaliações formativas ou somativas, artificiais ou naturalísticas
([Venable et al. (2016)](referencias.md#ref-venable2016feds)).

### Aplicação ao AraLearn

- **Problema:** o produto articula núcleo comum, pacotes de componente, contratos, armazenamento,
  sincronização, autoria e governança; é necessário demonstrar correção,
  utilidade e custo sem confundir esses resultados.
- **Alternativas:** relatar apenas implementação, executar testes sem argumento
  de design ou organizar problema, objetivo, construção, demonstração,
  avaliação e contribuição.
- **Enquadramento possível:** episódios futuros ou documentados podem usar DSR
  para investigar arquitetura de componentes, contratos, persistência
  local-first, delimitação de autoria, validação e frugalidade quando a
  contribuição de design e a estratégia de avaliação estiverem explícitas.
- **Fundamentação:** DSR oferece estrutura para relacionar relevância,
  rigor, artefato e avaliação ([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm); [Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning)).
- **Operacionalização:** requisitos verificáveis, versão identificada, cenário
  nominal e adverso, comparação, medição e decisão de manter, alterar ou
  remover.
- **Consequências:** testes e medições tornam-se evidência do artefato, enquanto
  resultados educacionais permanecem em episódios próprios.
- **Limites:** construir software de qualidade não constitui automaticamente
  pesquisa em DSR; é preciso explicitar contribuição e avaliação.

## Relação entre DBR e DSR

DBR e DSR são complementares, não sinônimos. A primeira parte de um problema
educacional situado e investiga uma intervenção em contexto; a segunda parte
de um problema de projeto e investiga a construção e a avaliação de um
artefato. No AraLearn, as duas perspectivas podem compartilhar episódios e
dados, mas não compartilham automaticamente a mesma pergunta nem o mesmo tipo
de conclusão.

```text
DBR
problema educacional situado
  → intervenção
  → uso em contexto
  → explicação e princípio educacional

DSR
problema do artefato
  → construção
  → demonstração e avaliação
  → contribuição de design
```

As duas tradições podem examinar a mesma versão, mas usam os dados para
perguntas diferentes. Um teste visual demonstra que rótulos não se sobrepõem;
uma tarefa com participantes informa se a relação foi interpretada; uma medida
posterior informa retenção. Nenhum desses resultados substitui os demais.

### O que cada registro permite afirmar

- **Genealogia do artefato** relata experiências e problemas que antecederam
  uma decisão. Ela explica origem, não método nem efeito.
- **Decisão de engenharia** registra problema, alternativas e mecanismo
  adotado. Pode existir fora de qualquer estudo.
- **Ciclo de desenho** relaciona uma versão, um problema observado e uma
  revisão. Iteração, por si, ainda não caracteriza DBR ou DSR.
- **Avaliação técnica** verifica contrato, segurança, geometria, desempenho ou
  outro comportamento do artefato em condições declaradas.
- **Avaliação de usabilidade** examina se pessoas específicas alcançam
  objetivos específicos em contexto identificado.
- **Investigação educacional** precisa definir constructo ou resultado, tarefa,
  instrumento, população, comparação quando pertinente e limites de
  inferência.
- **Episódio DBR** acrescenta problema educacional situado, conjectura,
  intervenção, atores relevantes, análise do processo e revisão da explicação.
- **Episódio DSR** acrescenta problema de design, contribuição pretendida,
  demonstração, avaliação e abstração responsável do conhecimento produzido.

Um mesmo episódio pode fornecer evidência a mais de uma trilha, desde que cada
pergunta e conclusão permaneça identificável. O rótulo metodológico não amplia
o alcance dos dados.

## Fundamentos que orientam o desenho

### Carga, segmentação e representação

A teoria da carga cognitiva destaca demandas introduzidas pelo desenho
([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). O quadro DeFT examina
funções e tarefas de representações externas ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). Evidências de
contiguidade e segmentação sustentam atenção à integração, mas não tornam
qualquer Unidade curta ou imagem pedagogicamente adequada
([Ginns (2006)](referencias.md#ref-ginns2006contiguity); [Rey et al. (2019)](referencias.md#ref-rey2019segmenting)).

**Decisão:** uma representação especializada só se justifica quando preserva uma
estrutura acadêmica relevante. **Hipótese:** seleção por operação e
representação canônica podem reduzir tradução mental. **Limite:** essa relação
precisa ser comparada por tarefa e domínio.

### Aquisição inicial, recuperação e distribuição

Exemplos resolvidos e retirada gradual podem favorecer novatos em determinadas
tarefas ([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples); [Renkl et al. (2004)](referencias.md#ref-renkl2004fading)). Recuperação e
distribuição possuem suporte amplo, com efeitos condicionados por conteúdo,
formato, intervalo e medida ([Cepeda et al. (2006)](referencias.md#ref-cepeda2006distributed); [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval); [Carpenter et al. (2022)](referencias.md#ref-carpenter2022spacing)). Intercalação possui moderadores
próprios ([Brunmair e Richter (2019)](referencias.md#ref-brunmair2019interleaving)).

**Decisão:** planejamento antecede a quantidade de Unidades de estudo; prática é escolhida
pela operação e retomada não segue intervalo universal. **Hipótese:** uma
microssequência coerente pode articular apoio, produção, feedback e retomada.
**Limite:** resultados imediatos, posteriores e de transferência permanecem
separados.

### Agência e feedback

Autorregulação inclui planejamento, desempenho, monitoramento e reflexão
([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated); [Panadero (2017)](referencias.md#ref-panadero2017selfregulated)). Controle oferecido
pela tecnologia apresenta efeitos heterogêneos ([Karich et al. (2014)](referencias.md#ref-karich2014learnercontrol)).
Feedback depende de informação, interpretação e ação
([Hattie e Timperley (2007)](referencias.md#ref-hattie2007feedback); [Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy); [Morris et al. (2021)](referencias.md#ref-morris2021formative)).

**Decisão:** o estudo não converte tentativas e ajuda em punição ou diagnóstico;
autoria e revisão permanecem reversíveis. **Hipótese:** feedback específico e
controle compreensível podem apoiar ação posterior. **Limite:** nenhum efeito
sobre ansiedade ou autonomia é presumido.

### IA e governança de dados

Lewis et al. definem geração aumentada por recuperação como uma arquitetura em
que informação recuperada condiciona a geração
([Lewis et al. (2020)](referencias.md#ref-lewis2020rag)). Recuperação não garante
factualidade: erros e formas de mitigação variam entre tarefas de geração
([Ji et al. (2023)](referencias.md#ref-ji2023hallucination)). A interação entre
pessoas e IA requer comunicação de limites, correção e controle
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)). Orientações de risco destacam responsabilidade
e proteção de dados ([UNESCO (2023)](referencias.md#ref-unesco2023genai); [Autio et al. (2024)](referencias.md#ref-nist2024genai)). A análise de dados
educacionais, também conhecida como *learning analytics*, exige finalidade,
transparência e proporcionalidade ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)).

**Decisão:** contexto, escopo, validação e responsabilidade permanecem
explícitos; dados só entram quando ligados a pergunta e intervenção. **Hipótese:**
essa arquitetura pode reduzir deriva e vigilância indevida. **Limite:** esquema de dados
válido e coleta mínima não demonstram qualidade ou confiança.

## Proveniência bibliográfica

O arquivo [`referencias.bib`](referencias.bib) é a fonte bibliográfica
canônica. Uma referência entra nele depois da conferência de autoria, título,
ano e identificador persistente. Repositórios históricos, notas e buscas podem
servir à descoberta, mas não se tornam evidência externa sem conferência da
fonte original.

Uma revisão reproduzível futura deve registrar o protocolo fora do código do
produto: bases, expressões de busca, datas, critérios, duplicatas, seleção, avaliação
crítica e fluxograma ([Peters et al. (2024)](referencias.md#ref-peters2024scoping); [Tricco et al. (2018)](referencias.md#ref-tricco2018prismascr)).

### Proveniência das Fontes de um Curso

A bibliografia desta documentação e as Fontes usadas num Curso cumprem funções
diferentes. Dentro do produto, uma Fonte possui identidade estável e revisões;
uma Âncora localiza página, tempo, fragmento de endereço ou trecho textual numa
revisão exata; e uma atribuição liga essa Âncora a um item do plano ou a uma
Unidade de estudo. A relação declara se a Fonte informa ou sustenta o alvo, ou
se o alvo foi adaptado ou citado a partir dela. O histórico não é reescrito
quando surge outra revisão.

Essa cadeia permite localizar o material usado e reconstruir a decisão
autoral. Ela não demonstra que a Fonte é verdadeira, que a atribuição é
pertinente ou que o conteúdo derivado é fiel. Essas conclusões exigem leitura,
julgamento disciplinar e, quando fizerem parte da pergunta, avaliação própria.

## Governança de decisões

### Registro mínimo

Toda decisão relevante deve responder, em documento versionado:

1. **problema:** qual situação requer decisão;
2. **alternativas e requisitos:** que soluções eram plausíveis e o que não
   poderia ser perdido;
3. **decisão:** o que foi adotado;
4. **fundamentação:** que literatura, norma, evidência técnica ou valor a
   sustenta;
5. **operacionalização:** onde aparece no produto e como será verificada;
6. **consequências:** benefícios esperados, custos e dependências;
7. **limites e evidência:** o que ainda não se sabe e que achado exigiria
   revisão.

### Rastreabilidade separada

Uma mudança deixa rastros diferentes:

- justificação conceitual e pedagógica na documentação pública;
- decisão operacional e incidentes no registro operacional apropriado;
- implementação no código, contratos e esquemas de dados;
- conformidade em testes e medições técnicas;
- avaliação em protocolo, instrumentos e dados autorizados.

Não se deve inventar retrospectivamente uma justificativa para legitimar uma
decisão já tomada. Quando a evidência é indireta, isso precisa ser dito; quando
uma hipótese falha, a documentação deve registrar a revisão.

## Governança de dados e ética

Antes de coletar um dado, devem ser definidos:

- pergunta e finalidade;
- construto ou resultado;
- unidade de análise;
- manifestação observada;
- interpretações permitidas e proibidas;
- explicações alternativas;
- intervenção possível;
- acesso, retenção, exclusão e descarte;
- custo de armazenamento e risco;
- informação e consentimento necessários.

Quando uma investigação brasileira em Ciências Humanas e Sociais estiver no
escopo da Resolução CNS nº 510/2016, informação, consentimento ou assentimento,
privacidade, confidencialidade, retirada e proteção diante de riscos seguem a
norma aplicável
([Conselho Nacional de Saúde (2016)](referencias.md#ref-cns2016resolucao510)).
Essa autoridade é normativa; não demonstra que uma medida seja válida nem que
uma intervenção produza aprendizagem.

Cliques, tempo e conclusão não entram apenas por estarem disponíveis. A ética
integra o desenho da análise de dados desde a definição da finalidade
([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics); [Tsai e Martinez-Maldonado (2022)](referencias.md#ref-tsai2022humancentered)). Dados de pesquisa devem permanecer separados do banco
operacional sempre que o desenho e o risco assim exigirem.

### Governança de variantes comparáveis

O AraLearn pode criar de dois a oito Cursos independentes a partir de um mesmo
planejamento. A relação preserva o planejamento comum, as revisões de vínculo e
as diferenças declaradas de parâmetros ou da política de componentes. Cada
Curso derivado permanece editável e mantém composição, acesso, estado pessoal,
Observações e revisões próprios.

Essa capacidade permite reconstituir a origem comum e verificar diferenças
declaradas, observadas ou surgidas depois. Ela não cria participantes,
atribuição, aleatorização, consentimento, desfecho nem análise causal. A origem
`research_condition` de um parâmetro também registra apenas proveniência; ela
não bloqueia alterações e não constitui condição experimental.

Quando uma investigação usa variantes, o protocolo externo precisa fixar a
pergunta, a população, as revisões efetivamente expostas, os invariantes, a
regra de atribuição, os instrumentos, os dados ausentes e a análise. A
comparação técnica ajuda a descrever a intervenção, mas não garante equivalência
semântica, fidelidade de exposição ou validade causal. Consulte [Variantes
comparáveis de um Curso](experimentos-instrucionais-parametrizados.md).

## Limitações atuais do programa

- a revisão bibliográfica é narrativa e não exaustiva;
- o público prioritário ainda precisa ser caracterizado em cada estudo;
- não há evidência consolidada de eficácia educacional do AraLearn;
- validade entre áreas do conhecimento, níveis de formação e instituições
  permanece aberta;
- modelos, provedores e instruções de IA podem mudar entre avaliações;
- qualidade visual, esquema de dados e testes não demonstram compreensão;
- frugalidade precisa ser medida longitudinalmente;
- autoria coletiva, poder institucional e participação exigem estudos próprios;
- resultados negativos e mecanismos removidos precisam ser preservados para
  evitar viés de sobrevivência.

## Mapa do corpus acadêmico

| Função | Documento | Limite principal |
| --- | --- | --- |
| síntese do conhecimento externo | [Revisão de literatura](revisao-de-literatura.md) | revisão narrativa, não exaustiva |
| modelo conceitual e hipóteses | [Quadro teórico](quadro-teorico.md) | proposições ainda não são resultados |
| definições operacionais | [Glossário de construtos](glossario-construtos.md) | nomes do produto não se tornam construtos universais |
| teoria, decisão, código e avaliação | [Matriz de rastreabilidade](matriz-rastreabilidade-pedagogica.md) | teste técnico não demonstra aprendizagem |
| desenho de episódios | [Protocolo de avaliação](protocolo-avaliacao-artefato.md) | precisa ser particularizado e aprovado quando houver participantes |
| justificativa dos componentes | [Fundamentação pedagógica das representações](fundamentacao-pedagogica-dos-resources.md) | representação correta ainda exige avaliação de compreensão |
| contribuição possível | [Contribuição e originalidade](contribuicao-originalidade.md) | originalidade e superioridade não são presumidas |
| bibliografia canônica | [`referencias.bib`](referencias.bib) | presença na lista não determina força da evidência |

## Governança dos fatos e das métricas

A área **Pesquisa** projeta fatos correntes de atividade, materialização,
desenho, Fontes, Observações, auditorias e variantes. A consulta é exclusiva da
pessoa proprietária e omite identidades de conta, endereços de correio
eletrônico, texto bruto de Observações e cópias integrais de conteúdo.

Uma métrica só entra no produto com pergunta, definição, unidade, derivação,
denominador, tratamento de ausências, interpretação permitida e limite. A
definição é versionada. As métricas correntes contam fatos por conjunto, tipo e
estado dentro de um recorte explícito; elas não medem aprendizagem, atenção,
esforço ou qualidade. Um desfecho de pesquisa exige protocolo, consentimento,
instrumento e finalidade próprios. A exportação sem dados identificadores reduz
a exposição, mas não dispensa retenção, controle de acesso nem direito de
retirada. O produto
não escolhe teste estatístico nem emite conclusão causal automaticamente.

## Conceitos mínimos para interpretar uma investigação

Um **evento** é uma ocorrência observável registrada com tipo, instante,
objeto, contexto e proveniência. Ele não é automaticamente uma medida: abrir
uma tela, concluir uma materialização ou registrar uma Observação só ganha
significado analítico depois que pergunta e regra de interpretação forem
declaradas.

O **denominador** é o conjunto de oportunidades ao qual uma contagem se refere.
“Duas correções”, por exemplo, muda de significado se o denominador for duas,
vinte ou duzentas Unidades elegíveis. O denominador precisa declarar inclusões,
exclusões, ausências, filtros e instante de corte.

**Confiabilidade** descreve a consistência de escores, classificações ou
observações sob fontes de variação pertinentes, como itens, ocasiões e
avaliadores. Ela não equivale a validade. Um instrumento pode produzir valores
consistentes e ainda sustentar uma interpretação incorreta; validade concerne
ao argumento que liga evidência, interpretação e uso na população e na tarefa
de interesse ([Messick (1995)](referencias.md#ref-messick1995validity);
[American Educational Research Association et al. (2014)](referencias.md#ref-aera2014standards)).

Uma **associação** indica que duas variáveis variam juntas nas condições
observadas. **Confundimento** ocorre quando uma causa alternativa influencia a
condição e o desfecho, oferecendo outra explicação para a associação. Inferir
causalidade exige um desenho e pressupostos capazes de enfrentar seleção,
história, mensuração, perdas, contaminação e outras explicações rivais
([Shadish et al. (2002)](referencias.md#ref-shadish2002experimental)).

Num **desenho experimental**, a atribuição aleatória é usada para formar
condições comparáveis em expectativa. Num **desenho quase experimental**, a
intervenção é estudada sem atribuição aleatória, recorrendo a comparação,
temporalidade, modelagem e pressupostos adicionais para sustentar a inferência.
Criar Variantes no AraLearn não realiza nenhum dos dois: ainda faltam
participantes, atribuição, exposição, instrumentos, desfechos e análise.

**Validade externa** trata do argumento para transferir uma conclusão entre
pessoas, tarefas, contextos, versões e momentos. **Generalização** não é um selo
recebido por usar amostra grande nem uma promessa de universalidade; depende de
quais dimensões mudam e de por que o mecanismo deveria permanecer aplicável.
Resultados sobre uma ocupação, instituição ou Curso precisam conservar seus
limites antes de orientar outro contexto.

<!-- referências locais: início -->

## Referências

- [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval): Pooja K. Agarwal; Ludmila D. Nunes; Janell R. Blunt (2021). **Retrieval Practice Consistently Benefits Student Learning: A Systematic Review of Applied Research in Schools and Classrooms.** *Educational Psychology Review*, 33(4), p. 1409–1453.
- [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft): Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198.
- [American Educational Research Association et al. (2014)](referencias.md#ref-aera2014standards): American Educational Research Association; American Psychological Association; National Council on Measurement in Education (2014). **Standards for Educational and Psychological Testing.** Washington, DC, American Educational Research Association.
- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Autio et al. (2024)](referencias.md#ref-nist2024genai): Chloe Autio; Reva Schwartz; Jesse Dunietz; Shomik Jain; Martin Stanley; Elham Tabassi; Patrick Hall; Kamie Roberts (2024). **Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile.** National Institute of Standards and Technology, NIST AI 600-1.
- [Brunmair e Richter (2019)](referencias.md#ref-brunmair2019interleaving): Markus Brunmair; Tobias Richter (2019). **Similarity Matters: A Meta-Analysis of Interleaved Learning and Its Moderators.** *Psychological Bulletin*, 145(11), p. 1029–1052.
- [Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy): David Carless; David Boud (2018). **The Development of Student Feedback Literacy: Enabling Uptake of Feedback.** *Assessment & Evaluation in Higher Education*, 43(8), p. 1315–1325.
- [Carpenter et al. (2022)](referencias.md#ref-carpenter2022spacing): Shana K. Carpenter; Steven C. Pan; Andrew C. Butler (2022). **The Science of Effective Learning with Spacing and Retrieval Practice.** *Nature Reviews Psychology*, 1, p. 496–511.
- [Cepeda et al. (2006)](referencias.md#ref-cepeda2006distributed): Nicholas J. Cepeda; Harold Pashler; Edward Vul; John T. Wixted; Doug Rohrer (2006). **Distributed Practice in Verbal Recall Tasks: A Review and Quantitative Synthesis.** *Psychological Bulletin*, 132(3), p. 354–380.
- [Conselho Nacional de Saúde (2016)](referencias.md#ref-cns2016resolucao510): Conselho Nacional de Saúde (2016). **Resolução nº 510, de 7 de abril de 2016.** Conselho Nacional de Saúde.
- [Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased): Design-Based Research Collective (2003). **Design-Based Research: An Emerging Paradigm for Educational Inquiry.** *Educational Researcher*, 32(1), p. 5–8.
- [Ginns (2006)](referencias.md#ref-ginns2006contiguity): Paul Ginns (2006). **Integrating Information: A Meta-Analysis of the Spatial Contiguity and Temporal Contiguity Effects.** *Learning and Instruction*, 16(6), p. 511–525.
- [Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning): Shirley Gregor; Alan R. Hevner (2013). **Positioning and Presenting Design Science Research for Maximum Impact.** *MIS Quarterly*, 37(2), p. 337–355.
- [Hattie e Timperley (2007)](referencias.md#ref-hattie2007feedback): John Hattie; Helen Timperley (2007). **The Power of Feedback.** *Review of Educational Research*, 77(1), p. 81–112.
- [Hevner et al. (2004)](referencias.md#ref-hevner2004designscience): Alan R. Hevner; Salvatore T. March; Jinsoo Park; Sudha Ram (2004). **Design Science in Information Systems Research.** *MIS Quarterly*, 28(1), p. 75–105.
- [Ji et al. (2023)](referencias.md#ref-ji2023hallucination): Ziwei Ji; Nayeon Lee; Rita Frieske; Tiezheng Yu; Dan Su; Yan Xu; Etsuko Ishii; Ye Jin Bang; Andrea Madotto; Pascale Fung (2023). **Survey of Hallucination in Natural Language Generation.** *ACM Computing Surveys*, 55(12), p. 1–38.
- [Karich et al. (2014)](referencias.md#ref-karich2014learnercontrol): Angela C. Karich; Matthew K. Burns; Kathrin E. Maki (2014). **Updated Meta-Analysis of Learner Control Within Educational Technology.** *Review of Educational Research*, 84(3), p. 392–410.
- [Lewis et al. (2020)](referencias.md#ref-lewis2020rag): Patrick Lewis; Ethan Perez; Aleksandra Piktus; Fabio Petroni; Vladimir Karpukhin; Naman Goyal; Heinrich Küttler; Mike Lewis; Wen-tau Yih; Tim Rocktäschel; Sebastian Riedel; Douwe Kiela (2020). **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.** In: *Advances in Neural Information Processing Systems*, vol. 33, p. 9459–9474.
- [Messick (1995)](referencias.md#ref-messick1995validity): Samuel Messick (1995). **Validity of Psychological Assessment: Validation of Inferences from Persons' Responses and Performances as Scientific Inquiry into Score Meaning.** *American Psychologist*, 50(9), p. 741–749.
- [Morris et al. (2021)](referencias.md#ref-morris2021formative): Rebecca Morris; Thomas Perry; Lindsey Wardle (2021). **Formative Assessment and Feedback for Learning in Higher Education: A Systematic Review.** *Review of Education*, 9(3), p. e3292.
- [Panadero (2017)](referencias.md#ref-panadero2017selfregulated): Ernesto Panadero (2017). **A Review of Self-Regulated Learning: Six Models and Four Directions for Research.** *Frontiers in Psychology*, 8, p. 422.
- [Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical): Abelardo Pardo; George Siemens (2014). **Ethical and Privacy Principles for Learning Analytics.** *British Journal of Educational Technology*, 45(3), p. 438–450.
- [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm): Ken Peffers; Tuure Tuunanen; Marcus A. Rothenberger; Samir Chatterjee (2007). **A Design Science Research Methodology for Information Systems Research.** *Journal of Management Information Systems*, 24(3), p. 45–77.
- [Peters et al. (2024)](referencias.md#ref-peters2024scoping): Micah D. J. Peters; Christina Godfrey; Patricia McInerney; Zachary Munn; Andrea C. Tricco; Hanan Khalil (2024). **Scoping Reviews.** In: *JBI Manual for Evidence Synthesis*, JBI.
- [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics): Paul Prinsloo; Sharon Slade (2017). **Ethics and Learning Analytics: Charting the (Un)Charted.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 49–57.
- [Renkl et al. (2004)](referencias.md#ref-renkl2004fading): Alexander Renkl; Robert K. Atkinson; Cornelia S. Große (2004). **How Fading Worked Solution Steps Works: A Cognitive Load Perspective.** *Instructional Science*, 32, p. 59–82.
- [Rey et al. (2019)](referencias.md#ref-rey2019segmenting): Günter Daniel Rey; Maik Beege; Steve Nebel; Maria Wirzberger; Tobias H. Schmitt; Sascha Schneider (2019). **A Meta-Analysis of the Segmenting Effect.** *Educational Psychology Review*, 31, p. 389–419.
- [Shadish et al. (2002)](referencias.md#ref-shadish2002experimental): William R. Shadish; Thomas D. Cook; Donald T. Campbell (2002). **Experimental and Quasi-Experimental Designs for Generalized Causal Inference.** 2. ed., Houghton Mifflin.
- [Sweller (1988)](referencias.md#ref-sweller1988cognitiveload): John Sweller (1988). **Cognitive Load During Problem Solving: Effects on Learning.** *Cognitive Science*, 12(2), p. 257–285.
- [Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples): John Sweller; Graham A. Cooper (1985). **The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra.** *Cognition and Instruction*, 2(1), p. 59–89.
- [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture): John Sweller; Jeroen J. G. van Merriënboer; Fred G. W. C. Paas (1998). **Cognitive Architecture and Instructional Design.** *Educational Psychology Review*, 10, p. 251–296.
- [Tricco et al. (2018)](referencias.md#ref-tricco2018prismascr): Andrea C. Tricco; Erin Lillie; Wasifa Zarin; Kelly K. O'Brien; Heather Colquhoun; Danielle Levac; David Moher; Micah D. J. Peters; Tanya Horsley; Laura Weeks; Susanne Hempel; et al. (2018). **PRISMA Extension for Scoping Reviews (PRISMA-ScR): Checklist and Explanation.** *Annals of Internal Medicine*, 169(7), p. 467–473.
- [Tsai e Martinez-Maldonado (2022)](referencias.md#ref-tsai2022humancentered): Yi-Shan Tsai; Roberto Martinez-Maldonado (2022). **Human-Centered Approaches to Data-Informed Feedback.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 213–222.
- [UNESCO (2023)](referencias.md#ref-unesco2023genai): UNESCO (2023). **Guidance for Generative AI in Education and Research.** UNESCO.
- [Venable et al. (2016)](referencias.md#ref-venable2016feds): John Venable; Jan Pries-Heje; Richard Baskerville (2016). **FEDS: A Framework for Evaluation in Design Science Research.** *European Journal of Information Systems*, 25(1), p. 77–89.
- [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased): Feng Wang; Michael J. Hannafin (2005). **Design-Based Research and Technology-Enhanced Learning Environments.** *Educational Technology Research and Development*, 53(4), p. 5–23.
- [Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated): Barry J. Zimmerman (2002). **Becoming a Self-Regulated Learner: An Overview.** *Theory Into Practice*, 41(2), p. 64–70.

<!-- referências locais: fim -->
