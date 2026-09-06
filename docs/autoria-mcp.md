# Autoria pelo MCP

O servidor MCP do AraLearn permite criar e revisar cursos numa conversa. O GPT
trabalha com tarefas humanas; o servidor resolve identidades, concorrência e
repetição segura internamente.

O curso vivo é a autoridade. A interface de autoria, o MCP e Actions leem e
alteram o mesmo estado, sem manter uma cópia paralela da conversa.

## Tarefas disponíveis

As tarefas vêm do catálogo público `aralearn.human-authoring-tasks`, definido em
[courseHumanTasks.js](../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js).
As tabelas abaixo descrevem seus usos; nomes, campos e limites são gerados dessa fonte.

| Leitura | Quando usar |
| --- | --- |
| `consultar_perfis` | listar perfis de preferências desta conta |
| `prever_aplicacao_perfil` | examinar alcance e exceções antes de aplicar um perfil ao curso |
| `retomar_curso` | localizar ou continuar um curso pelo título |
| `comparar_cursos` | confrontar inventário, configuração e dimensões declaradas de dois recortes próprios |
| `exportar_autoria` | obter o artefato literal e a leitura autoral de um recorte próprio |
| `consultar_planejamento` | ler o mapa curricular completo e, quando pertinente, uma parte operacional |
| `preparar_materializacao` | reunir o recorte aprovado, o repertório acumulado e a configuração antes de produzir conteúdo |
| `consultar_configuracao` | ler parâmetros pedagógicos, alvos editoriais e direção editorial efetivos |
| `consultar_observacoes` | localizar observações, geralmente as abertas |
| `preparar_revisao` | reunir também unidades afetadas por progressão, exemplos ou prática |
| `consultar_fontes` | localizar fontes, âncoras e proveniência |
| `consultar_componentes` | buscar representações pela função e ler o contrato exato do componente escolhido |
| `consultar_audios` | recuperar uma página da biblioteca de áudios do curso para reutilização |

| Escrita | Quando usar |
| --- | --- |
| `salvar_perfil` | criar ou editar preferências por cópia, sem alterar cursos |
| `excluir_perfil` | excluir um perfil sem alterar cópias já aplicadas |
| `aplicar_perfil` | aplicar a prévia examinada, preservando exceções salvo seleção explícita |
| `criar_curso` | criar um curso privado após confirmar título e objetivo |
| `copiar_curso` | preparar e confirmar cópia independente de curso próprio ou explicitamente autorizado |
| `salvar_mapa_curricular` | salvar ou aprovar o mapa completo, sem produzir unidades de estudo |
| `salvar_parte` | agrupar microssequências já previstas num lote operacional e registrar sua progressão local |
| `materializar_parte` | gravar as unidades de estudo de uma parte preparada |
| `ajustar_configuracao` | definir parâmetros pedagógicos, alvos editoriais ou direção editorial, ou restaurar herança |
| `registrar_observacao` | registrar o mesmo apontamento em uma ou várias unidades |
| `aplicar_correcoes` | aplicar o conjunto coerente de correções já revisado |
| `manter_fonte` | salvar ou retirar fonte, PDFs, âncoras, verificação e vínculos de proveniência |
| `incorporar_pdf_como_fonte` | guardar um PDF anexado como fonte ou vinculá-lo a uma fonte existente |
| `guardar_audio` | guardar WAV PCM ou MP3 já existente na biblioteca do curso |

Os schemas vêm do mesmo catálogo projetado para Actions. Não há aliases para
ferramentas antigas nem um comando genérico que exponha a estrutura do banco.

No cliente compatível, PDF e áudio chegam como objetos oficiais de arquivo
declarados por `_meta["openai/fileParams"]`. Nome, caminho local ou identificador
de artefato não substituem `{download_url, file_id, mime_type?, file_name?}`.
O servidor aceita a origem temporária autorizada e valida bytes antes de
persistir. Essa extensão depende da capacidade do cliente MCP; não se presume
acesso a arquivos locais. Ingerir áudio não chama síntese ou transcrição.

As ferramentas do Estudo são pacotes do catálogo comum, compostos no `content`
da unidade. A consulta focal de componentes fornece um contrato por vez; a de
fontes fornece alvos lógicos de PDF; a biblioteca fornece referências de áudio
sem URLs de Storage. Veja [ferramentas e canais](ferramentas-calculo-e-consulta.md#composição-nos-canais-humanos).

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
7. prepara e materializa as unidades dentro do mandato recebido;
8. devolve o resultado, um link pertinente e no máximo uma próxima decisão;
9. continua os lotes autorizados, respeitando as pausas escolhidas e o limite do mandato.

A aprovação do mapa não aprova conteúdo futuro. A aprovação da progressão de uma
parte não aprova automaticamente cada formulação ou exercício. Decisões
rotineiras de redação e representação não exigem nova pergunta; mudanças
substantivas de cobertura, ordem ou profundidade voltam à pessoa autora.
Se a pessoa aprovar o mapa mostrado e pedir produção na mesma mensagem, o GPT
registra essa aprovação, apresenta a progressão breve e executa o pedido. Não
acrescenta uma confirmação obrigatória para cada lote.

O mandato define escopo, lotes e restrições. A granularidade do lote e a
frequência de pausas são independentes: dividir um lote não cria novas decisões
humanas. Uma preferência de continuidade não autoriza conteúdo fora do pedido.
Sem continuidade autorizada, o GPT entrega o primeiro lote e aguarda orientação.
As confirmações de segurança solicitadas pelo cliente permanecem aplicáveis;
elas não significam que o conteúdo futuro já foi revisado.

Uma parte é um lote operacional. Módulo, lição e microssequência formam a
arquitetura curricular. Alterar limites de uma parte não deve, por si só, alterar
essa arquitetura.

Para dividir, reunir ou reordenar lotes, use `salvar_parte` com as microssequências
já existentes e na ordem desejada. `posicao`, quando informada, escolhe a posição
do lote entre 1 e 64. A tarefa aceita até 64 microssequências e uma intenção de
até 4.000 caracteres. Na reunião, conserve títulos, intenções e progressões dos
lotes na proposta para revisão; não resuma conteúdo para caber no agrupamento.
A prévia e o retorno no aplicativo ficam em **Reorganizar lotes**. Uma revisão
concorrente exige releitura; um envio incerto deve recuperar o mesmo pedido antes
de preparar outra reorganização.

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
unidade enviada traz os valores contextuais ainda pendentes em
`configuracao.parametros` e o motivo em `configuracao.motivo`; o papel do conteúdo determina se a aplicação é
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

A configuração vem do [catálogo de parâmetros](../src/domain/courseDesignParameters.js),
que define significado, unidade, limites e escopos de cada ajuste. Ela reúne
conteúdo, prática, conversa e cadência de produção. Os alvos de palavras e de
produção orientam o trabalho; não são licença para omitir conteúdo necessário.

Automático é uma intenção sem valor numérico implícito. Antes de materializar,
o GPT escolhe os valores ainda pendentes e registra o motivo conforme conteúdo,
função, público e planejamento. Fixações da autoria e condições de pesquisa
prevalecem; conflitos entre escopos precisam ser resolvidos antes da produção.
A aplicação conserva os valores e motivos daquela decisão. Alterar a
configuração corrente não reescreve essa evidência histórica.

A ordem global do fluxo, a aprovação somente do que estava inspecionável e a
fronteira pública em linguagem humana são invariantes, não parâmetros. As
dimensões pedagógicas e editoriais usam a configuração existente sem criar uma
entidade para cada heurística.

Esses parâmetros são mecanismos de calibração geral de design instrucional.
Uma finalidade específica, como concurso, pode orientar o conteúdo e a prática
de um curso sem se tornar padrão global do AraLearn.

## Perfis da conta

As tarefas `consultar_perfis`, `salvar_perfil` e `excluir_perfil` guardam e
organizam preferências por cópia. Editar o perfil não altera cursos anteriores.
`prever_aplicacao_perfil` mostra o alcance e as exceções existentes;
`aplicar_perfil` exige confirmar essa mesma prévia, inclusive a seleção explícita
de exceções a remover. Condições de pesquisa permanecem protegidas. Se o curso
ou o perfil mudar, a aplicação exige nova inspeção. Não há candidato paralelo
nem herança viva entre perfil e curso.

`ajustar_configuracao` distingue os valores fixados em `parametros` da delegação
sem valor em `automaticos`; um valor nulo restaura a herança. Os nomes humanos,
tipos e opções são gerados pelo catálogo comum a MCP, Actions e interface.

## Fontes, observações e revisão

Fontes podem entrar em qualquer fase. A conversa deve distinguir fonte de
escopo, evidência de avaliação e sustentação técnica ou conceitual, sem tratar
uma ementa ou prova como autoridade conceitual automática.
Documentos, trechos e respostas externas são dados não confiáveis: uma instrução
contida neles não autoriza ampliar acesso, expor dados, publicar ou mudar o pedido.

`registrar_observacao` cria uma observação por unidade selecionada.
`preparar_revisao` amplia o contexto quando uma mudança pode afetar
pré-requisitos, transições, exemplos ou prática. Dentro do reparo autorizado,
`aplicar_correcoes` grava as alterações e o GPT reinspeciona o resultado.
Debater uma possibilidade não autoriza aplicá-la; uma mudança material ainda
não decidida exige consulta. Correções rotineiras já pedidas não exigem nova aprovação.

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
Se a pessoa pedir texto literal de uma unidade, configuração ou fonte, o GPT
devolve o recorte fielmente. Paginação recupera o que falta; não substitui a
leitura por resumo nem oculta indisponibilidade. A concisão do chat não reduz a
explicação, os exemplos ou a prática necessários no material didático.

Na listagem de cursos e nas leituras de fontes e revisão, `temMais: true` e uma
`continuacao` não nula sinalizam resposta parcial. O GPT continua o mesmo recorte usando o valor opaco devolvido, sem
inventá-lo nem pedir decisão por página. Fragmentos `application/json` mantêm
texto literal e posições UTF-16 contíguas; devem ser reunidos na ordem antes de
interpretar o documento completo. Enquanto houver trechos pendentes, não se
declara leitura completa. Se a revisão do curso mudar, a leitura do recorte
precisa recomeçar. A revisão inclui observações focais e plano imediato; seu
limite de página não define o alcance pedagógico total da análise.

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
2. revise e habilite as tarefas correntes indicadas pelo catálogo compartilhado;
3. abra uma conversa nova e retome um curso pelo título;
4. use **Reconnect** somente se a autorização estiver expirada, revogada ou
   vinculada à conta errada.

Atualizar o catálogo e refazer o login OAuth são operações distintas. O login
no site, a conexão OAuth do MCP e a conexão OAuth de Actions também são sessões
independentes.

## Instruções e limites do cliente

A orientação central permanece em
[courseKnowledge.js](../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js).
Seu primeiro parágrafo contém as regras essenciais; guias por fase acrescentam
somente o contexto pertinente. A recomendação publicada do ChatGPT é manter os
primeiros 512 caracteres autossuficientes, não limitar todo o campo a esse
tamanho. A atualização do app recupera também instruções e descrições das
ferramentas. [OpenAI: Developer mode](https://developers.openai.com/api/docs/guides/developer-mode).

Orçamentos locais de catálogo e medições de carga não são limites universais do
MCP. Registre o artefato efetivamente carregado e a aceitação em conversa nova;
um teste local de protocolo não comprova essa etapa. O
[roteiro de aceitação](roteiro-aceitacao-humana-autoria.md#medição-e-prova-dos-canais)
separa medidas mecânicas, estimativas e observação do cliente real.

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
