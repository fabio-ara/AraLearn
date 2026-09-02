# Autoria pelo MCP

O servidor MCP do AraLearn permite criar e revisar Cursos numa conversa. O GPT
trabalha com tarefas humanas, enquanto o servidor resolve identidades, versões
e repetição segura internamente.

O Curso vivo é a autoridade. A interface de Autoria, o MCP e Actions leem e
alteram o mesmo estado; não mantêm uma cópia paralela da conversa.

## Tarefas disponíveis

As dezesseis tarefas formam o catálogo público `aralearn.human-authoring-tasks`.

| Leitura | Quando usar |
| --- | --- |
| `retomar_curso` | localizar ou continuar um Curso pelo título |
| `consultar_planejamento` | ler a próxima Parte ou reabrir uma Parte anterior |
| `preparar_materializacao` | reunir inventário semântico, configuração e Fontes antes de produzir conteúdo |
| `consultar_configuracao` | ler parâmetros pedagógicos efetivos e direção editorial |
| `consultar_observacoes` | localizar Observações, geralmente as abertas |
| `preparar_revisao` | reunir também as StudyUnits afetadas por progressão, exemplos ou prática |
| `consultar_fontes` | localizar Fontes, Âncoras e proveniência |
| `consultar_componentes` | escolher representação quando a função instrucional ainda não indicar um componente claro |

| Escrita | Quando usar |
| --- | --- |
| `criar_curso` | criar um Curso privado após confirmar título e objetivo |
| `salvar_parte` | adicionar a próxima Parte aprovada ou revisar uma Parte anterior |
| `materializar_parte` | gravar as StudyUnits de uma Parte preparada e aprovada |
| `ajustar_configuracao` | definir valores pedagógicos ou direção editorial, ou restaurar herança |
| `registrar_observacao` | registrar o mesmo apontamento em uma ou várias StudyUnits |
| `aplicar_correcoes` | aplicar o conjunto coerente de correções já revisado |
| `manter_fonte` | salvar Fonte, Âncoras, verificação e vínculos de proveniência |
| `incorporar_pdf_como_fonte` | guardar um PDF anexado como Fonte ou vinculá-lo a uma Fonte existente |

Os nomes e schemas vêm de um único catálogo compartilhado com Actions. Não há
aliases para ferramentas antigas nem mega-comando que exponha a estrutura do
banco.

## Fluxo de conversa

Uma conversa de autoria normalmente segue este ciclo:

1. o GPT recolhe objetivo, público, conhecimentos prévios e restrições que
   realmente mudam a proposta;
2. consulta o Curso quando ele já existe;
3. propõe apenas a próxima Parte;
4. após a decisão da pessoa, salva essa Parte;
5. repete até o planejamento estar suficiente;
6. prepara e materializa uma Parte por vez;
7. devolve resultado, um link pertinente e no máximo uma próxima decisão.

Sete a doze Partes são uma heurística comum, não mínimo, máximo ou estrutura
curricular. Uma Parte é um lote operacional; Microssequência e StudyUnit são
objetos pedagógicos.

O GPT faz leituras necessárias sem pedir confirmação mecânica. Uma escrita
exige que a mudança concreta esteja compreensível e que haja uma decisão humana
quando ela ainda não foi dada.

## Análise instrucional e materialização

Antes de criar StudyUnits, `preparar_materializacao` traz somente o recorte
pertinente. O GPT inventaria cada novidade semântica que precisa ser aprendida,
incluindo conceitos auxiliares, relações, condições e operações intelectuais.

O teto de novas AnalysisUnits controla a distribuição, não o tamanho artificial
de cada unidade. Um teto menor pode exigir mais StudyUnits; conteúdo necessário
não é eliminado para atender extensão editorial.

`materializar_parte` recebe StudyUnits completas e suas aplicações de desenho.
O servidor valida propriedades determinísticas. Adequação semântica continua
dependendo de revisão pelo GPT ou pela pessoa autora.

## Configuração

Os quatro parâmetros pedagógicos são:

- teto de novas AnalysisUnits por StudyUnit expositiva;
- formas de explicação requeridas;
- mínimo de oportunidades distintas de prática por requisito de evidência;
- dimensões de variação requeridas para a prática.

O GPT os calibra a partir do contexto disponível no uso comum. Condições
explícitas continuam possíveis para comparação. Direção editorial é separada e
nunca autoriza comprimir conteúdo necessário.

## Observações, revisão e Fontes

`registrar_observacao` cria uma Observação por StudyUnit selecionada. Não existe
entidade permanente de lote. `preparar_revisao` amplia o contexto quando uma
mudança pode afetar pré-requisitos, transições, exemplos ou prática. Depois da
decisão, `aplicar_correcoes` grava as alterações e o GPT reinspeciona o resultado.

Fontes e Âncoras podem ser consultadas em qualquer fase. Uma Fonte permanece
contestável. O arquivo PDF só é persistido quando a intenção de guardá-lo está
inequívoca; leitura descartável não usa `incorporar_pdf_como_fonte`.

## Respostas e erros

Uma tarefa bem-sucedida devolve três campos de coordenação:

- `result`: o que aconteceu;
- `deepLink`: o destino útil no AraLearn, quando houver;
- `nextDecision`: uma única decisão seguinte, quando necessária.

Contexto estruturado pode acompanhar leituras sem ser repetido como dissertação
na conversa. Identidades do banco e controles de concorrência não fazem parte
dos argumentos públicos.

Ambiguidade entre títulos pede uma referência humana mais específica. Falhas
transitórias permitem retomar; recusa de autorização não é repetida como se
fosse indisponibilidade.

## Autenticação e autorização

O MCP usa OAuth 2.1. A conexão solicita o escopo autoral necessário e o servidor
volta a conferir pessoa, sessão, cliente e consentimento em cada chamada. Tarefas
de leitura e escrita são filtradas pelos escopos concedidos. Tokens do MCP não
são aceitos como sessão comum da interface.

O servidor anuncia metadata de autorização no próprio recurso protegido. Uma
conexão nova deve ser criada depois de uma mudança incompatível no catálogo.

## Verificação local

```powershell
npm run test:authoring:contract
npm run test:authoring:mcp
deno test --config supabase/functions/deno.json `
  supabase/functions/tests/aralearn-authoring-mcp.test.ts
```

Essas verificações conferem o catálogo exato, seleção por intenção,
desambiguação, autorização e paridade com Actions. A jornada em cliente real é
executada depois da publicação deliberada.

## Referências técnicas

- [Model Context Protocol](https://modelcontextprotocol.io/specification/latest)
- [OAuth 2.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [Protected Resource Metadata, RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)
