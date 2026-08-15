# Estado atual e agenda de desenvolvimento

Este documento distingue três tipos de afirmação:

- **implementado**: existe no código e possui verificação automatizada;
- **verificado tecnicamente**: o comportamento foi exercitado em ambiente de
  teste, mas isso não demonstra benefício educacional;
- **a investigar**: depende de estudo com pessoas, contextos e conteúdos reais.

A distinção evita transformar disponibilidade técnica em alegação de eficácia.
Um recurso pode funcionar corretamente e ainda precisar de avaliação de
compreensão, usabilidade ou aprendizagem.

## Síntese da versão atual

O AraLearn está disponível como aplicação web instalável e aplicativo Android.
As duas distribuições executam o mesmo núcleo e mantêm a largura de leitura
orientada a celulares. A conta dá acesso a Coleções, Trilhas, estudo, autoria,
workspaces e observações, conforme suas capacidades.

O produto possui duas atividades paralelas:

- **Estudo** apresenta o curso em microssequências, registra progresso local e
  permite observações situadas;
- **Autoria** permite criar, revisar e organizar o mesmo tipo de curso sem
  converter o conteúdo para uma estrutura intermediária incompatível.

Um curso incompleto já pode ser estudado. Publicação não significa “tornar o
rascunho visível”, mas fixar uma composição validada como artefato imutável e
apontar o catálogo para essa revisão.

## Capacidades implementadas

### Estudo

- navegação por curso, módulo, lição, microssequência e card;
- retomada pelo progresso funcional, sem inferir domínio ou proficiência;
- marcação **Rever** e observações vinculadas ao contexto estudado;
- funcionamento sem conexão depois do primeiro download do curso;
- fila local para sincronizar alterações quando a rede volta;
- tema claro ou escuro aplicado sem consulta remota;
- resposta e avanço pelo botão Play sem esperar tarefas de rede;
- ausência deliberada de telemetria de tempo, tentativas, acertos ou presença
  inferida.

O progresso informa onde a pessoa parou e quais cards concluiu. Ele não é nota,
diagnóstico cognitivo nem modelo de domínio. Essa limitação preserva uma
interpretação honesta dos dados disponíveis.

### Autoria contextual

- edição manual dos textos autorizados na própria representação;
- seleção visual de cards, microssequências e lições;
- assistência por modelo de linguagem para editar texto ou recompor um card;
- conversa limitada a oito turnos e histórico local de até nove versões de um
  card durante a sessão;
- desfazer, refazer e restaurar versões sem nova chamada ao provedor;
- validação de schema, semântica e revisão antes de persistir;
- escopo de escrita derivado da seleção feita pela pessoa.

O histórico curto da assistência existe para sustentar iterações imediatas. O
pedido, o contexto enviado e a resposta integral do provedor não são
persistidos. A decisão reduz armazenamento e exposição de conteúdo, mas impede
usar esse chat efêmero como registro longitudinal de pesquisa.

### Resources de card

O catálogo é composto por packages independentes do kernel. Cada package
declara contrato autoral, perfil acadêmico, capacidades de prática e renderer.
O catálogo atual contém trinta e dois packages, dos quais vinte e nove
materializam conteúdo e três materializam respostas.

Representações diagramáticas usam motores especializados quando isso reduz
medição manual de coordenadas: Graphviz/Viz.js para diferentes grafos e
diagramas; Vega e Vega-Lite para gráficos e planos; MathML para notação
matemática e científica. As bibliotecas são distribuídas com o aplicativo para
continuarem disponíveis sem conexão.

A quantidade atual não define uma cobertura universal das áreas do
conhecimento. Quando falta uma representação especializada, a autoria pode usar
um substituto declarado e registrar a lacuna do catálogo. A qualidade
acadêmica da escolha continua sujeita a revisão humana e avaliação no domínio.

### Persistência e publicação

- IndexedDB conserva no dispositivo cursos, progresso e operações pendentes;
- PostgreSQL conserva identidades, relações, revisões e estado colaborativo;
- Supabase Storage conserva artefatos integrais e imutáveis de publicação;
- análises, parâmetros, conjuntos disponíveis, snapshots efetivos, blueprints
  v2 e manifestos possuem persistência relacional versionada própria;
- compare-and-swap impede sobrescrita silenciosa entre revisões concorrentes;
- chaves de idempotência tornam a repetição de uma requisição segura;
- hashes identificam o conteúdo exato submetido ou publicado;
- objetos sem referência tornam-se elegíveis à coleta de lixo.

Essa distribuição evita guardar uma cópia integral do curso para cada pequena
alteração e, ao mesmo tempo, permite demonstrar qual composição foi revisada ou
publicada.

### Workspaces e colaboração

- workspaces pessoais, de turma ou equipe;
- seis papéis locais com capacidades derivadas no servidor;
- convites, entrada, saída e transferência de propriedade;
- curso corrente acessível em Trilhas sem duplicação automática;
- observações de estudo e notas situadas;
- triagem, resposta e vínculo entre observação e correção confirmada;
- submissão, revisão editorial e publicação conforme autorização.

O papel não é uma permissão isolada gravada no token. Autenticação identifica a
conta; relações e estado do workspace determinam capacidades; cada operação é
autorizada novamente sobre seu alvo atual.

### Autoria remota

Clientes compatíveis podem conduzir autoria por MCP; um GPT personalizado usa
uma Action OpenAPI. Ambos atravessam o mesmo registro, os mesmos schemas e o
mesmo executor. A autenticação é individual por OAuth 2.1, e nenhuma superfície
recebe acesso administrativo direto ao banco.

O modelo consulta a biblioteca de resources progressivamente, recebe apenas os
contratos escolhidos, um por chamada, valida o card e pode auditar a adequação
da representação. A ferramenta agrupada `gerirDesenhoInstrucional` lê o slice
JIT de uma microssequência e opera análise, assignments, `ResourceSet`,
snapshot, blueprint e manifesto pelas mesmas regras persistentes do backend.
Continuidade estruturada conserva brief, planejamento, decisões, mandatos e
achados entre sessões sem armazenar o transcript inteiro.

## Núcleo persistente de desenho parametrizado

Uma análise bibliográfica focal fundamenta contratos versionados para
análise instrucional, parâmetros por escopo, valores efetivos, manifesto de
materialização e `ResourceSet`. A proposta preserva unidades e relações não
escalares, admite números somente com unidade e denominador explícitos e separa
disponibilidade, seleção e materialização de resources.

O núcleo da #103 promove esses contratos para validação de runtime, entidades
normalizadas no PostgreSQL e uma réplica fracionada no IndexedDB. Os artefatos
instrucionais são imutáveis e versionados; a revisão corrente do workspace,
CAS e idempotência coordenam cada gravação. O resolvedor segue
`workspace → course → module → lesson → microsequence`: o ancestral aplicável
mais próximo dentro da classe de autoridade vencedora substitui o valor
completo. A prioridade é lock, override manual, Auto e default; duplicidades do
mesmo modo no mesmo escopo falham e locks são verificados como gate separado.

`ResourceSet` conserva a disponibilidade exata de `package@version`; o
manifesto distingue a seleção autorizada e a instância efetivamente usada. O
blueprint pedagógico v2 permanece contextual por microssequência e recebe um
binding versionado com análise e snapshot, sem ser substituído por calibração
global. Um diff determinístico aponta divergências factuais entre referências,
passos, cobertura declarada e resources; ele não realiza a auditoria semântica.

Workspaces anteriores permanecem `unresolved` até uma análise explícita;
conteúdo já materializado é marcado `legacy_unrestricted`: o sistema não
inventa parâmetros nem disponibilidade retroativos. Parte continua unidade
operacional de coordenação e não integra a cadeia de herança dos parâmetros. A
réplica local permite consultar a última fatia sincronizada e enfileirar somente
override manual ou restauração de Auto;
ela nunca concede autoridade e revalida revisão, capacidade e locks ao voltar à
rede.

Desde a #104, essas operações estão expostas pelo MCP e pela Action por uma
única ferramenta coesa. A integração recupera knowledge por intenção, trabalha
uma microssequência por vez e retoma pelo workspace, sem depender do chat. A
interface responsiva de Autoria continua pertencendo à #105, e o ciclo completo
de findings, decisão, reparo e reauditoria pertence à #106. Schemas,
persistência e testes demonstram coerência técnica no escopo coberto, não
validade educacional nem adequação dos valores escolhidos.

O fundamento, o fluxo e os limites estão em [Desenho instrucional
parametrizado](desenho-instrucional-parametrizado.md).

## O que foi verificado tecnicamente

A suíte automatizada cobre, entre outros aspectos:

- contratos de curso, card e packages;
- paridade entre o runtime do navegador e o runtime das Edge Functions;
- renderização em larguras móveis, nos temas claro e escuro;
- lacunas independentes dentro de resources compostos;
- hidratação de Graphviz e Vega sob a política de segurança de conteúdo;
- retomada, avanço e troca de tema sem dependência da rede;
- concorrência, idempotência e autorização relacional;
- geração dos pacotes de integração e do aplicativo Android;
- integridade das fixtures do catálogo;
- contratos promovidos e referências internas do desenho instrucional em corpus
  multidomínio;
- resolução por escopo, precedência de locks, autorização por `ResourceSet`,
  binding do blueprint v2, diff factual e projeção legada explícita;
- cache fracionado e fila não canônica de desenho no IndexedDB, incluindo
  isolamento por conta, concorrência entre instâncias e revalidação remota.
- seleção JIT de knowledge, registro público da tool agrupada, contratos de
  resource unitários e regressão de engenharia A–H para orientação, variação
  Auto, override manual e lock de pesquisa.

Esses testes sustentam afirmações de conformidade da implementação. Não
demonstram que uma microssequência produz aprendizagem maior, que um diagrama é
compreendido por todos os públicos ou que uma assistência reduz efetivamente o
trabalho de autoria.

Na sequência de Autoria, a regressão intermediária é proporcional ao escopo de
cada issue; a #103 concentra contratos, domínio, SQL/PG emulado e IndexedDB, e
a #104 concentra prompt, knowledge, MCP/Action, catálogo restrito e pacotes
distribuídos. Falhas focadas precisam ser resolvidas na própria etapa. A
regressão integral entre código, banco, integrações, UI e distribuições fica
concentrada no fechamento da #109, conforme o requisito normativo da sequência.

## Limitações conhecidas

### Evidência educacional

Ainda não há evidência empírica suficiente para atribuir ganhos de aprendizagem
ao AraLearn. A relação entre microteoria, prática, retomada e compreensão é uma
hipótese de design apoiada por literatura, não um resultado causal já medido.
As unidades, limites e parâmetros propostos para a autoria também são
operacionalizações do AraLearn e hipóteses a avaliar; suas contagens não medem
carga cognitiva, domínio, fidelidade ou qualidade.

### Cobertura disciplinar

O catálogo possui representações gerais e packages especializados, com maior
densidade inicial em computação e matemática. Áreas como linguística,
biologia, química e ciências humanas requerem avaliação sistemática das
notações utilizadas e, quando necessário, novos packages.

### Avaliação de usabilidade

Testes geométricos detectam recortes, sobreposições e problemas de interação,
mas não substituem observação de pessoas. A compreensão dos papéis, a clareza
das observações e a leitura de diagramas densos precisam ser estudadas em
condições reais.

### Dependências remotas

Estudar conteúdo já baixado não depende da rede. Login inicial, aquisição de um
curso ainda ausente, convites, sincronização, assistência por API e publicação
dependem dos serviços remotos. O aplicativo precisa comunicar essa fronteira
sem bloquear operações que são estritamente locais.

### Limites de armazenamento

O projeto opera com orçamento restrito de banco e Storage. Artefatos imutáveis,
projeções compactas, retenções específicas e coleta de lixo reduzem o consumo,
mas o crescimento do catálogo e de workspaces precisa ser medido continuamente.
A [medição reproduzível do payload parametrizado](evidence/parameterized-authoring-storage-budget-2026-08-15.json)
cobre um cenário sintético de 500 microssequências; não estima páginas, índices
ou custo real de produção.

## Agenda de avaliação e desenvolvimento

### Prioridade 1 — uso cotidiano

- observar retomada em trajetos curtos e conexão instável;
- testar alternância entre web e Android;
- verificar compreensão do estado offline e da fila de sincronização;
- acompanhar acessibilidade e gestos em telas pequenas;
- medir tempo de resposta local sob limitação de CPU.

### Prioridade 2 — qualidade pedagógica

- avaliar se cards de teoria partem de premissas compreensíveis para iniciantes;
- verificar progressão conceitual sem condensação excessiva;
- medir cobertura e diversidade das práticas;
- comparar a representação escolhida com convenções da área;
- observar transferência entre o que foi explicado e o que foi praticado.
- testar se unidades, relações e requisitos explícitos revelam compressão e
  desalinhamento sem induzir fragmentação ou falsa precisão.

### Prioridade 3 — autoria e revisão

- avaliar o esforço necessário para produzir e revisar cursos extensos;
- testar a continuidade entre sessões e a compreensão dos mandatos;
- comparar reparos locais e recomposições estruturais;
- estudar confiança, contestação e reversão das sugestões do modelo;
- verificar se observações de estudantes apoiam correções sem se tornarem
  vigilância comportamental.
- expor o núcleo já integrado ao MCP e à Action pela interface responsiva, com
  linguagem simples e exposição progressiva;
- avaliar `ResourceSet` com disponibilidade, seleção e uso real auditados
  separadamente, inclusive quando não houver representação adequada.

### Prioridade 4 — infraestrutura

- acompanhar crescimento do PostgreSQL e do Storage;
- testar coleta de lixo e restauração operacional;
- medir payloads, contexto e custo dos fluxos de autoria;
- ampliar testes de concorrência e falhas parciais;
- avaliar recuperação semântica e evolução do catálogo sem acoplamento ao
  kernel.

## Perguntas abertas

- A organização em microssequências melhora a retomada depois de interrupções?
- A combinação entre microteoria e práticas variadas reduz premissas ocultas?
- Limites locais de novidade e coordenação ajudam a encontrar compressão sem
  se transformar em scores artificiais?
- Requisitos de explicação e evidência são compreendidos e corrigidos por
  autores de diferentes áreas?
- `ResourceSet` permite condições reproduzíveis sem produzir equivalência
  falsa entre representações?
- Resources especializados melhoram a interpretação de estruturas complexas?
- A autoria assistida reduz trabalho mecânico sem reduzir a responsabilidade
  editorial humana?
- A proveniência registrada é suficiente para reconstruir decisões sem guardar
  conversas integrais?
- A arquitetura de artefatos imutáveis mantém custo sustentável quando o
  catálogo e o número de workspaces crescem?

Essas perguntas orientam avaliação; não antecipam resultados. O
[Protocolo de avaliação do artefato](protocolo-avaliacao-artefato.md) descreve
como separar verificação técnica, inspeção especializada e investigação com
participantes. A [Matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md)
liga construtos, decisões, implementação, testes e evidências esperadas.

## Como acompanhar o estado

O estado publicado deve ser lido em conjunto com:

- [Visão do produto](visao-do-produto.md), para a finalidade e o escopo;
- [Arquitetura](arquitetura.md), para os componentes;
- [Modelo didático](modelo-didatico.md), para as hipóteses pedagógicas;
- [Matriz de conformidade técnica](matriz-conformidade-tecnica.md), para a
  evidência verificável da implementação;
- [Plano de controle e artefatos](plano-de-controle-e-artefatos.md), para os
  procedimentos operacionais.

O histórico cronológico de versões pertence ao [`CHANGELOG.md`](../CHANGELOG.md).
Este documento descreve apenas o estado corrente e as lacunas que permanecem
relevantes.
