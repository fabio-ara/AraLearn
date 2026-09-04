# Autoria pelo MCP

O servidor MCP do AraLearn permite criar e revisar cursos numa conversa. O GPT
trabalha com tarefas humanas; o servidor resolve identidades, concorrência e
repetição segura internamente.

O curso vivo é a autoridade. A interface de autoria, o MCP e Actions leem e
alteram o mesmo estado, sem manter uma cópia paralela da conversa.

## Tarefas disponíveis

As dezessete tarefas formam o catálogo público
`aralearn.human-authoring-tasks`.

| Leitura | Quando usar |
| --- | --- |
| `retomar_curso` | localizar ou continuar um curso pelo título |
| `consultar_planejamento` | ler o mapa curricular completo e, quando pertinente, uma parte operacional |
| `preparar_materializacao` | reunir o recorte aprovado, o repertório acumulado e a configuração antes de produzir conteúdo |
| `consultar_configuracao` | ler parâmetros pedagógicos, alvos editoriais e direção editorial efetivos |
| `consultar_observacoes` | localizar observações, geralmente as abertas |
| `preparar_revisao` | reunir também unidades afetadas por progressão, exemplos ou prática |
| `consultar_fontes` | localizar fontes, âncoras e proveniência |
| `consultar_componentes` | buscar representações pela função e ler o contrato exato do componente escolhido |

| Escrita | Quando usar |
| --- | --- |
| `criar_curso` | criar um curso privado após confirmar título e objetivo |
| `salvar_mapa_curricular` | salvar ou aprovar o mapa completo, sem produzir unidades de estudo |
| `salvar_parte` | agrupar microssequências já previstas num lote operacional e registrar sua progressão local |
| `materializar_parte` | gravar as unidades de estudo de uma parte preparada |
| `ajustar_configuracao` | definir parâmetros pedagógicos, alvos editoriais ou direção editorial, ou restaurar herança |
| `registrar_observacao` | registrar o mesmo apontamento em uma ou várias unidades |
| `aplicar_correcoes` | aplicar o conjunto coerente de correções já revisado |
| `manter_fonte` | salvar ou retirar fonte, PDFs, âncoras, verificação e vínculos de proveniência |
| `incorporar_pdf_como_fonte` | guardar um PDF anexado como fonte ou vinculá-lo a uma fonte existente |

Os schemas vêm do mesmo catálogo projetado para Actions. Não há aliases para
ferramentas antigas nem um comando genérico que exponha a estrutura do banco.

No MCP, o PDF anexado chega como o objeto oficial de arquivo gerido pelo
ChatGPT. Nome, caminho local ou URL digitada não substituem esse objeto; o
servidor aceita somente a origem temporária autorizada e valida os bytes antes
de persistir a fonte.

## Fluxo de conversa

Uma conversa de autoria normalmente segue esta ordem:

1. o GPT reúne objetivo, público, conhecimentos prévios, escopo e fontes que
   realmente mudam a proposta;
2. propõe o mapa curricular completo: módulos, lições e microssequências;
3. oferece uma síntese curta e um link para inspecionar o mapa inteiro;
4. salva ajustes como rascunho e só marca o mapa como aprovado após a decisão
   sobre aquela versão inspecionável;
5. define uma parte apenas como lote de produção, sem mudar o currículo;
6. apresenta a progressão focal desse lote;
7. após a decisão local, prepara e materializa as unidades;
8. devolve o resultado, um link pertinente e no máximo uma próxima decisão;
9. repete o ciclo focal para o lote seguinte.

A aprovação do mapa não aprova conteúdo futuro. A aprovação da progressão de uma
parte não aprova automaticamente cada formulação ou exercício. Decisões
rotineiras de redação e representação não exigem nova pergunta; mudanças
substantivas de cobertura, ordem ou profundidade voltam à pessoa autora.

Uma parte é um lote operacional. Módulo, lição e microssequência formam a
arquitetura curricular. Alterar limites de uma parte não deve, por si só, alterar
essa arquitetura.

## Repertório e materialização

Antes de produzir unidades, `preparar_materializacao` traz somente o recorte
pertinente e o repertório acumulado do percurso. O GPT distingue ideias novas,
ideias já estabelecidas que serão utilizadas e ideias deliberadamente retomadas.
Conceitos auxiliares, relações, condições, procedimentos e operações também
entram no repertório quando forem necessários para aprender o percurso.
O mesmo recorte informa, para cada microssequência, os itens de escopo cuja
cobertura precisa ser distribuída entre as unidades do lote.

O teto de novidades controla quantas ideias semanticamente novas uma unidade
expositiva introduz. Ele não exige uma quantidade exata, não transforma prática
em exposição e não autoriza alterar artificialmente a granularidade das ideias.

`materializar_parte` recebe unidades completas e sua aplicação de desenho. Cada
unidade enviada traz os quatro valores pedagógicos e os dois alvos editoriais
calibrados para seu contexto; o papel do conteúdo determina se a aplicação é
expositiva, prática ou mista, sem uma segunda declaração. Uma atividade
formativa pode permanecer sem requisito formal; quando uma prática precisa de
um requisito novo, seu texto entra no inventário já existente. O servidor
valida propriedades determinísticas. Suficiência, progressão, ausência de
saltos e adequação das representações continuam dependendo da produção e da
revisão pedagógica.

O GPT deve fazer uma leitura sequencial antes de concluir o lote. Uma sequência
pode ser dividida quando estiver densa demais ou fundida quando a navegação tiver
virado fragmentação textual. Não existe quantidade-alvo de unidades.

## Configuração para uso e pesquisa

O catálogo corrente reúne quatro parâmetros pedagógicos:

- teto de ideias novas por unidade expositiva;
- formas de explicação requeridas;
- mínimo de oportunidades distintas de prática por requisito;
- dimensões de variação requeridas para a prática.

E dois alvos editoriais quantitativos flexíveis:

- palavras por resposta de autoria;
- palavras por unidade de estudo.

No estado `default`, o GPT precisa calibrar automaticamente esses valores para
cada microssequência ou unidade conforme conteúdo, função e público; não aplica
um preset fixo. Pesquisadores podem fixar condições explícitas para comparação,
e essas definições prevalecem. Direção editorial permanece separada e nunca
autoriza comprimir conhecimento necessário. Os alvos de palavras também não são
limites: podem ser ultrapassados e não autorizam ocultar decisões nem compactar
conteúdo.

A ordem global do fluxo, a aprovação somente do que estava inspecionável e a
fronteira pública em linguagem humana são invariantes, não parâmetros. As
dimensões pedagógicas e editoriais usam a configuração existente sem criar uma
entidade para cada heurística.

Esses parâmetros são mecanismos de calibração geral de design instrucional.
Uma finalidade específica, como concurso, pode orientar o conteúdo e a prática
de um curso sem se tornar padrão global do AraLearn.

## Fontes, observações e revisão

Fontes podem entrar em qualquer fase. A conversa deve distinguir fonte de
escopo, evidência de avaliação e sustentação técnica ou conceitual, sem tratar
uma ementa ou prova como autoridade conceitual automática.

`registrar_observacao` cria uma observação por unidade selecionada.
`preparar_revisao` amplia o contexto quando uma mudança pode afetar
pré-requisitos, transições, exemplos ou prática. Depois da decisão,
`aplicar_correcoes` grava as alterações e o GPT reinspeciona o resultado.

O arquivo PDF só é persistido quando a intenção de guardá-lo está inequívoca.
Uma leitura descartável não usa `incorporar_pdf_como_fonte`.

## Respostas e erros

Uma tarefa bem-sucedida devolve:

- `result`: o que aconteceu;
- `deepLink`: o destino útil no AraLearn, quando houver;
- `nextDecision`: uma única decisão seguinte, quando necessária.

O contexto estruturado pode acompanhar leituras sem ser despejado no chat.
Identidades do banco, nomes de campos e controles de concorrência não fazem
parte da conversa normal.

Ambiguidade entre títulos pede uma referência humana mais específica. Falhas
transitórias permitem retomar; recusa de autorização não é repetida como se
fosse indisponibilidade.

## Autenticação e atualização

O MCP usa OAuth 2.1. A conexão solicita o escopo autoral necessário e o servidor
volta a conferir pessoa, sessão, cliente e consentimento em cada chamada.

O endereço hospedado do servidor é:

`https://jrfkphuhcseqmratijjr.supabase.co/functions/v1/aralearn-authoring-mcp`

Depois de uma publicação que altere o catálogo:

1. use **Refresh** no app AraLearn nas configurações do ChatGPT;
2. revise e habilite as dezessete tarefas correntes;
3. abra uma conversa nova e retome um curso pelo título;
4. use **Reconnect** somente se a autorização estiver expirada, revogada ou
   vinculada à conta errada.

Atualizar o catálogo e refazer o login OAuth são operações distintas. O login
no site, a conexão OAuth do MCP e a conexão OAuth de Actions também são sessões
independentes.

## Verificação local

```powershell
npm run test:authoring:contract
npm run test:authoring:mcp
deno test --config supabase/functions/deno.json `
  supabase/functions/tests/aralearn-authoring-mcp.test.ts
```

Essas verificações conferem catálogo, seleção por intenção, desambiguação,
autorização e paridade com Actions. A jornada em cliente real é executada depois
da publicação deliberada.

## Referências técnicas

- [Model Context Protocol](https://modelcontextprotocol.io/specification/latest)
- [OAuth 2.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [Protected Resource Metadata, RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)
