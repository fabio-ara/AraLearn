# Mapa da documentação

A documentação do AraLearn foi organizada para que a pessoa aprenda o produto
antes de encontrar seus detalhes internos. Não é necessário começar pelo
glossário nem conhecer previamente educação, bancos de dados ou integração de
modelos de linguagem.

Cada percurso abaixo tem uma ordem sugerida. Capítulos conceituais apresentam
o problema, definem os termos, comparam alternativas, justificam a decisão e
indicam consequências e evidências. Guias operacionais apresentam
pré-requisitos, passos, resultado esperado e recuperação de falhas. Os
[princípios editoriais](principios-editoriais.md) explicam como esses gêneros e
tipos de evidência são separados.

## Começar a usar

Para conhecer o produto e realizar tarefas, leia:

1. [Visão do produto](visao-do-produto.md) — problema educacional, público,
   compromissos e limites;
2. [Uso do aplicativo](uso-do-app.md) — conta, Coleções, Trilhas, cards,
   conexão e sincronização;
3. [Guia do estudante](guia-estudante.md) — primeiro percurso de estudo,
   retomada, marca Rever e observações;
4. [Solução de problemas](solucao-de-problemas.md) — diagnóstico por sintoma e
   recuperação segura.

Quando a tarefa envolver outra responsabilidade:

| Objetivo | Guia |
| --- | --- |
| corrigir cards, criar conteúdo e acompanhar observações | [Guia do professor e autor](guia-professor-autor.md) |
| convidar pessoas e administrar papéis | [Guia de administração de workspace](guia-administracao-workspace.md) |
| instalar, testar ou modificar o sistema | [Guia do desenvolvedor](guia-desenvolvedor.md) |
| formular e avaliar uma investigação sobre o artefato | [Guia de investigação](guia-pesquisador.md) |

## Estudar o modelo pedagógico

Este percurso parte do problema de ensinar sem pressupostos ocultos e avança
até as proposições avaliáveis:

1. [Modelo didático](modelo-didatico.md) — microssequência, microteoria,
   prática e progressão;
2. [Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md)
   — unidades defensáveis, parâmetros locais, `ResourceSet` e limites de
   interpretação;
3. [Revisão de literatura](revisao-de-literatura.md) — bases, controvérsias e
   lacunas;
4. [Quadro teórico](quadro-teorico.md) — construtos, mecanismos e relações
   propostas;
5. [Fundamentação pedagógica dos recursos](fundamentacao-pedagogica-dos-resources.md)
   — quando uma representação visual é justificada;
6. [Estado de estudo não punitivo](estado-de-estudo-nao-punitivo.md) — retomada,
   autorregulação e dados que deliberadamente não são coletados;
7. [Observações pedagógicas](observacoes-pedagogicas.md) — feedback situado sem
   converter interação em vigilância.

Para consulta, use o [glossário de construtos](glossario-construtos.md). A
[matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md)
liga cada decisão à literatura, à implementação e à forma prevista de
avaliação.

## Estudar a engenharia

Este percurso ensina por que os dados e responsabilidades foram separados do
modo atual:

1. [Arquitetura](arquitetura.md) — componentes, fronteiras e fontes de
   autoridade;
2. [Persistência relacional e sincronização](persistencia-relacional.md) —
   IndexedDB, banco relacional, armazenamento de objetos, réplica e outbox;
3. [Supabase: desenvolvimento e implantação](supabase.md) — banco, Auth,
   Storage, funções, migrations e políticas de acesso;
4. [Contrato público de conteúdo](aralearn-contract.md) — por que o conteúdo
   usa envelopes e schemas versionados;
5. [Recursos de card](recursos-de-card.md) — kernel, packages, catálogo,
   validação e renderização;
6. [Sistema visual](sistema-visual.md) — tipografia, temas, responsividade e
   acessibilidade;
7. [Privacidade](privacidade.md) — finalidade dos dados, retenção e limites de
   acesso.

O [glossário técnico](glossario-tecnico.md) é uma referência para distinções
precisas. A [matriz de conformidade técnica](matriz-conformidade-tecnica.md)
mostra onde as propriedades descritas podem ser verificadas no código, nos
schemas, nas migrations e nos testes.

## Estudar a autoria de cursos

Comece pela tarefa em linguagem comum e só depois avance para os protocolos:

1. [Criar cursos pelo chat](criar-cursos-pelo-chat.md) — planejar, construir,
   auditar, reparar e continuar;
2. [Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md)
   — análise, parâmetros e manifesto propostos antes da implementação;
3. [Auditoria de conformidade instrucional](auditoria-de-conformidade-instrucional.md)
   — fatos estruturais, revisão semântica, decisão humana, reparo e reauditoria;
4. [Autoria e publicação do catálogo](autoria-do-catalogo.md) — workspace,
   revisão humana, submissão e publicação;
5. [Assistência por modelo de linguagem](assistencia-por-ia.md) — seleção,
   conversa, versões locais, autoridade e limites;
6. [Fluxos, instruções e contratos](fluxos-prompts-e-contratos.md) — como texto
   livre é separado de operações estruturadas;
7. [Autoria por Model Context Protocol](autoria-mcp.md) — descoberta de
   ferramentas, autenticação, chamadas e robustez.

O [plano de controle e artefatos](plano-de-controle-e-artefatos.md) aprofunda a
composição econômica de workspaces e publicações imutáveis. [Workspaces
educacionais](workspaces-educacionais.md) explica a colaboração e a gestão de
papéis pelo ponto de vista de quem usa o produto.

Os arquivos em [`authoring/`](../authoring/README.md) são materiais
operacionais para configurar assistentes e clientes. Eles derivam da mesma
arquitetura, mas sua função é instruir a execução por máquinas; não substituem
os capítulos didáticos acima.

## Avaliar o artefato

Este percurso separa fundamentação, hipótese, propriedade implementada e
resultado empírico:

1. [Fundamentos de pesquisa e governança](fundamentos-pesquisa-e-governanca.md);
2. [Contribuição e originalidade](contribuicao-originalidade.md);
3. [Protocolo de avaliação](protocolo-avaliacao-artefato.md);
4. [Auditoria acadêmica dos recursos](auditoria-academica-dos-resources.md);
5. [Auditoria do front-end](auditoria-front-end.md).

O [estado do produto](estado-atual-e-roadmap.md) informa o que está
implementado, o que ainda requer estabilização e quais questões permanecem
abertas, sem tratar teste de software como evidência de aprendizagem.

## Operar e implantar

| Assunto | Documento |
| --- | --- |
| ambientes suportados, configuração e publicação | [Implantação](implantacao.md) |
| uso dos serviços gerenciados e evolução do schema remoto | [Supabase](supabase.md) |
| estrutura do repositório, testes e contribuições | [Guia do desenvolvedor](guia-desenvolvedor.md) |
| recebimento de conteúdo compartilhado no Android | [Importação por compartilhamento](integrations/android-share-import.md) |
| automação local de desenvolvimento | [Integração com Codex CLI](integrations/codex-cli.md) |

## Referência completa

| Documento | Função principal |
| --- | --- |
| [Princípios editoriais](principios-editoriais.md) | critérios de clareza, profundidade e evidência |
| [Glossário técnico](glossario-tecnico.md) | termos de computação e contratos |
| [Glossário de construtos](glossario-construtos.md) | termos pedagógicos e metodológicos |
| [Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md) | análise científica, parâmetros, contratos e persistência interna |
| [Auditoria de conformidade instrucional](auditoria-de-conformidade-instrucional.md) | checks determinísticos, juízo semântico, findings e reauditoria |
| [Contrato público](aralearn-contract.md) | formatos canônicos de conteúdo |
| [Recursos de card](recursos-de-card.md) | catálogo de representações e arquitetura de packages |
| [Matriz de conformidade técnica](matriz-conformidade-tecnica.md) | afirmação técnica e ponto de verificação |
| [Matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md) | fundamento, decisão e avaliação |
| [Estado do produto](estado-atual-e-roadmap.md) | capacidades, limites e próximos ciclos |
| [Referências bibliográficas](referencias.md) | fontes citadas, em formato legível e com ligações persistentes |
| [Fonte BibTeX](referencias.bib) | metadados canônicos para processadores e gerenciadores bibliográficos |

## Como interpretar uma afirmação

- Uma referência bibliográfica sustenta a relação com a literatura, não a
  eficácia específica do AraLearn.
- Um teste automatizado sustenta uma propriedade de software sob as condições
  testadas, não um resultado educacional.
- Uma decisão de design informa problema, alternativas e consequências.
- Uma hipótese informa como poderá ser refutada ou sustentada por dados.

Essa distinção permite usar a documentação tanto para operar o sistema quanto
para estudar criticamente suas escolhas.
