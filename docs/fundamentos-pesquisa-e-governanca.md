# Fundamentos de pesquisa e governança científica

## Finalidade

O AraLearn pode ser examinado simultaneamente como:

1. **produto de software**, constituído por código, dados, contratos,
   interfaces e infraestrutura;
2. **artefato de design**, construído para responder a um conjunto de problemas
   e incorporar conhecimentos de projeto;
3. **intervenção educacional**, utilizada por pessoas em atividades de estudo,
   autoria e colaboração;
4. **objeto de investigação**, sobre o qual se formulam perguntas, hipóteses e
   avaliações.

Essas perspectivas se relacionam, mas não são equivalentes. Um teste pode
demonstrar que um card abre offline; não demonstra que a disponibilidade local
melhora a aprendizagem. Uma fonte pode sustentar a plausibilidade de exemplos
resolvidos; não prova que uma microssequência concreta foi bem escrita. Uma
entrevista pode revelar como participantes compreenderam uma permissão; não
substitui um teste de isolamento do banco de dados.

Este documento ensina como separar essas formas de conhecimento, como organizar
uma investigação responsável e como manter a documentação auditável.

Nos trechos técnicos, **kernel** significa o núcleo comum que coordena o
aplicativo; **package**, um módulo de recurso com contrato e renderização
próprios; **workspace**, um espaço de trabalho com membros e permissões locais;
e **inteligência artificial (IA)**, os modelos e serviços usados para auxiliar
autoria. **Local-first** designa a arquitetura em que a cópia local sustenta a
operação corrente e a sincronização remota ocorre fora do caminho crítico da
interação.

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

Considere a afirmação “o funcionamento offline reduz o abandono”. Ela contém
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

O objeto investigado é uma plataforma móvel e local-first para estudo e autoria
de cursos organizados em percursos, microssequências, cards e representações
especializadas. O contexto prioritário inclui pessoas adultas que conciliam
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
- sustentar estudo em condições móveis e offline;
- permitir autoria assistida sem transferir responsabilidade à IA;
- coordenar pessoas e permissões sem vigilância ou poder global;
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
2. **representação:** quando um recurso especializado ajuda a executar uma
   operação sem introduzir gramática visual ou carga desnecessária?
3. **continuidade:** como disponibilidade local, sincronização e marco de
   retomada afetam a capacidade de continuar após interrupção?
4. **autoria assistida:** como catálogo, contrato, escopo e reversibilidade
   afetam erro de alvo, qualidade e controle humano?
5. **governança:** que papéis, dados e intervenções são legítimos e úteis sem
   converter rastros ambíguos em diagnóstico?
6. **frugalidade:** como custo, armazenamento, payload e manutenção evoluem sem
   comprometer segurança, acessibilidade e rigor?

Essas perguntas podem ser investigadas separadamente. Colocá-las num único
estudo produziria unidades, medidas e explicações rivais demais para uma análise
coerente.

## Design-Based Research

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
- **Decisão:** usar DBR para investigar progressão, representações, feedback,
  retomada cotidiana, observações e práticas de autoria em contexto.
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
problema e da solução ([Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning)). O framework FEDS ajuda a
planejar avaliações formativas ou somativas, artificiais ou naturalísticas
([Venable et al. (2016)](referencias.md#ref-venable2016feds)).

### Aplicação ao AraLearn

- **Problema:** o produto combina kernel, packages, contratos, armazenamento,
  sincronização, autoria e governança; é necessário demonstrar correção,
  utilidade e custo sem confundir esses resultados.
- **Alternativas:** relatar apenas implementação, executar testes sem argumento
  de design ou organizar problema, objetivo, construção, demonstração,
  avaliação e contribuição.
- **Decisão:** usar DSR para investigar arquitetura de recursos, contratos,
  persistência local-first, delimitação de autoria, validação e frugalidade.
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

## Fundamentos que orientam o desenho

### Carga, segmentação e representação

A teoria da carga cognitiva destaca demandas introduzidas pelo desenho
([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). O quadro DeFT examina
funções e tarefas de representações externas ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). Evidências de
contiguidade e segmentação sustentam atenção à integração, mas não tornam
qualquer card curto ou imagem pedagogicamente adequado
([Ginns (2006)](referencias.md#ref-ginns2006contiguity); [Rey et al. (2019)](referencias.md#ref-rey2019segmenting)).

**Decisão:** um recurso especializado só se justifica quando preserva uma
estrutura acadêmica relevante. **Hipótese:** seleção por operação e
representação canônica podem reduzir tradução mental. **Limite:** essa relação
precisa ser comparada por tarefa e domínio.

### Aquisição inicial, recuperação e distribuição

Exemplos resolvidos e retirada gradual podem favorecer novatos em determinadas
tarefas ([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples); [Renkl et al. (2004)](referencias.md#ref-renkl2004fading)). Recuperação e
distribuição possuem suporte amplo, com efeitos condicionados por conteúdo,
formato, intervalo e medida ([Cepeda et al. (2006)](referencias.md#ref-cepeda2006distributed); [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval); [Carpenter et al. (2022)](referencias.md#ref-carpenter2022spacing)). Intercalação possui moderadores
próprios ([Brunmair e Richter (2019)](referencias.md#ref-brunmair2019interleaving)).

**Decisão:** planejamento antecede a quantidade de cards; prática é escolhida
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

Recuperação pode condicionar a geração, mas não garante factualidade
([Lewis et al. (2020)](referencias.md#ref-lewis2020rag)). Interação humano–IA requer comunicação de limites, correção e
controle ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)). Orientações de risco destacam responsabilidade
e proteção de dados ([UNESCO (2023)](referencias.md#ref-unesco2023genai); [Autio et al. (2024)](referencias.md#ref-nist2024genai)). Learning analytics exige
finalidade, transparência e proporcionalidade ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)).

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
produto: bases, strings, datas, critérios, duplicatas, seleção, avaliação
crítica e fluxograma ([Peters et al. (2024)](referencias.md#ref-peters2024scoping); [Tricco et al. (2018)](referencias.md#ref-tricco2018prismascr)).

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

Cliques, tempo e conclusão não entram apenas por estarem disponíveis. Ética é
parte do desenho de analytics, não etapa posterior
([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics); [Tsai e Martinez-Maldonado (2022)](referencias.md#ref-tsai2022humancentered)). Dados de pesquisa devem permanecer separados do banco
operacional sempre que o desenho e o risco assim exigirem.

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
| justificativa dos recursos | [Fundamentação pedagógica dos recursos](fundamentacao-pedagogica-dos-resources.md) | representação correta ainda exige avaliação de compreensão |
| contribuição possível | [Contribuição e originalidade](contribuicao-originalidade.md) | originalidade e superioridade não são presumidas |
| bibliografia canônica | [`referencias.bib`](referencias.bib) | presença na lista não determina força da evidência |
