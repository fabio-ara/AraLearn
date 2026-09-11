# Autoria por Actions

[Actions](https://developers.openai.com/api/docs/actions/introduction) é o recurso
do [ChatGPT](https://chatgpt.com), uma aplicação externa ao AraLearn. Ele permite
a um assistente personalizado nesse serviço consultar dados e executar tarefas
por uma interface de programação, ou API. O arquivo OpenAPI descreve os
pedidos que esse cliente pode enviar. No AraLearn, ele oferece as mesmas tarefas
do [catálogo MCP](autoria-mcp.md#tarefas-disponíveis), com o mesmo conteúdo salvo
e as mesmas regras de autorização.

A pessoa autora orienta a produção e inspeciona os objetos e suas fontes no
aplicativo. O assistente executa as tarefas autorizadas; a declaração de revisão
humana permanece expressa e vinculada ao conteúdo inspecionado. O
[guia de autoria por conversa](criar-cursos-pelo-chat.md) apresenta esse percurso.

O arquivo importável está em
[`downloads/aralearn-chatgpt-action-openapi.yaml`](downloads/aralearn-chatgpt-action-openapi.yaml).

## Operações

As [tabelas de leituras e escritas do catálogo](autoria-mcp.md#tarefas-disponíveis)
definem as **54 tarefas semânticas** de Actions. O OpenAPI as oferece por
**30 operações HTTP**: 24 diretas e seis grupos contextuais. Uma operação HTTP
é o pedido enviado a um endereço do serviço; um grupo permite escolher entre
várias tarefas por esse mesmo endereço. Argumentos, validação e efeitos derivam
do catálogo comum ao MCP.

| Operação agrupada | Tarefas disponíveis |
| --- | --- |
| `acesso_do_curso` | `consultar_acesso`, `definir_visibilidade`, `alterar_acesso`, `definir_acesso_arquivos`, `definir_politica_revisao` |
| `estrutura_curricular` | `alterar_curso`, `excluir_curso`, `salvar_ramo_curricular`, `mover_ramo_curricular`, `duplicar_ramo_curricular`, `remover_ramo_curricular`, `reordenar_unidades` |
| `desenho_instrucional` | `consultar_repertorio_instrucional`, `manter_unidade_analise`, `manter_requisito_evidencia`, `vincular_repertorio_instrucional`, `registrar_aplicacoes_instrucionais`, `aplicar_configuracao_instrucional`, `ajustar_orientacao`, `ajustar_componentes` |
| `preferencias_de_autoria` | `consultar_preferencias_autoria`, `salvar_preferencias_autoria` |
| `perfis_de_autoria` | `consultar_perfis`, `salvar_perfil`, `excluir_perfil`, `prever_aplicacao_perfil`, `aplicar_perfil` |
| `observacoes_autorais` | `consultar_observacoes`, `registrar_observacao`, `editar_observacao` |

Cada grupo recebe `tarefa` e `argumentos`. O schema, que define os dados
aceitos, usa `oneOf` para permitir uma das alternativas e vincular cada nome
a seus argumentos específicos, com os mesmos campos obrigatórios e limites da
tarefa. Por exemplo, uma chamada a `acesso_do_curso` pode receber:

```json
{
  "tarefa": "consultar_acesso",
  "argumentos": { "curso": "Redes para iniciantes" }
}
```

As outras 24 tarefas mantêm seu próprio nome como operação e recebem os
argumentos diretamente. Isso inclui `incorporar_pdf_como_fonte` e
`guardar_audio`, cujo `openaiFileIdRefs` permanece na raiz do pedido. Nas
seções seguintes, os nomes designam tarefas; o agrupamento só determina a
forma de transportá-las.

Cada descrição informa quando usar e quando não usar a operação. Isso permite ao
modelo distinguir, por exemplo, salvar o mapa curricular de definir um lote de
produção, consultar observações de preparar uma revisão e manter metadados de
uma fonte de incorporar seu PDF.

## Referências humanas

As tarefas localizam cursos por título e objetos por título, posição ou
referência recebida numa leitura anterior. Uma referência é **opaca** quando o
cliente deve devolvê-la exatamente como a recebeu, sem interpretar seu conteúdo.
Ela identifica uma versão ou tentativa; o servidor confere novamente os direitos
da pessoa antes de agir. Títulos ambíguos exigem uma indicação mais precisa.

Os [fluxos comuns](fluxos-prompts-e-contratos.md) explicam como a intenção da
pessoa se relaciona com a tarefa escolhida. A
[estrutura por referência](estrutura-curricular-por-referencia.md) detalha
movimentação, cópia e remoção de ramos sem perda de suas relações.

## Planejamento e produção

O planejamento define a organização curricular. A explicação desenvolve o
texto-base com fontes de cada microssequência e pode ser produzida antes das
unidades, mesmo com mapa em rascunho. `salvar_explicacoes` conserva as unidades
existentes. Na produção de unidades, `materializar_parte` reutiliza as bases
salvas e recebe somente aquelas que também serão criadas ou alteradas.

Aprovação do mapa, autorização para produzir e revisão do conteúdo correspondem
a decisões diferentes da pessoa. O [percurso comum](fluxos-prompts-e-contratos.md#mapa-curricular-e-bases-explicativas)
relaciona essas etapas e a [referência de processo](fluxos-prompts-e-contratos.md#conservar-o-acordo-durante-a-retomada)
conserva o acordo de trabalho durante a retomada.

A ação **Debater com GPT**, rótulo atual do aplicativo, copia um pedido com o
endereço do objeto. O cliente conectado precisa ler esse objeto pelas operações
de Actions. Copiar o pedido abre a discussão; o conteúdo só muda mediante uma
operação autorizada.

## Materialização e parâmetros

A preparação recupera o repertório — conhecimentos cadastrados, planejados e
já desenvolvidos no percurso — e as escolhas aplicáveis ao lote. Uma escolha
automática exige um valor contextual e sua justificativa antes da produção.
Valores fixados e condições de pesquisa prevalecem. A configuração aplicada
registra as escolhas daquela produção e permanece distinta da intenção para
trabalho futuro. O [fluxo de produção](fluxos-prompts-e-contratos.md#repertório-acumulado)
e os [campos de configuração](aralearn-contract.md#campos-de-configuração-nos-canais)
desenvolvem essas relações.

## Perfis reutilizáveis

Perfis guardam escolhas para aplicação em cursos. A prévia mostra alcance e
exceções; a aplicação copia o que foi confirmado. Editar ou excluir o perfil
depois não altera os cursos que receberam uma cópia. As
[preferências de autoria](parametros-de-autoria.md) explicam perfil, padrão
pessoal e acordo de um trabalho em andamento.

## Observações, revisão e acesso

Observações são entradas ligadas ao conteúdo, com versões próprias. Uma
correção trata somente as versões integralmente atendidas e confirmadas por
releitura. A declaração humana de revisão registra uma decisão expressa sobre
a explicação ou unidade salva. O [fluxo de revisão](fluxos-prompts-e-contratos.md#observações-revisão-e-privacidade)
e as [regras de acesso](aralearn-contract.md#revisão-do-conteúdo) distinguem
essas operações de tornar um curso acessível e disponibilizar seus arquivos.

## Resultado comum

As operações devolvem `result`, com o resultado, e podem incluir `deepLink`,
para inspeção no aplicativo, e `nextDecision`, quando uma escolha ainda falta.
A resposta estruturada conserva os dados necessários ao cliente; a conversa
pode permanecer breve sem reduzir o conteúdo solicitado.

Uma continuação indica que há mais dados do mesmo recorte. O cliente recupera
as partes necessárias antes de considerar a leitura completa. O
[contrato de continuação](aralearn-contract.md#continuação-e-reconstrução-do-conteúdo)
explica como reconstruir o texto literal, inclusive na exportação.

Erros informam código, mensagem, diagnóstico limitado e `recovery`, com dados
para retomada. Se uma resposta se perder depois do envio, a mudança pode já
estar salva. A [recuperação da tentativa](fluxos-prompts-e-contratos.md#confirmar-o-resultado-e-recuperar-uma-interrupção)
usa o conteúdo e o recibo originais antes de decidir se há algo a repetir.

## OAuth

A conexão usa [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749) com código de
autorização. A pessoa autoriza o cliente, que recebe um token de acesso sem
receber a senha da conta. O servidor verifica esse token e seu escopo — as
operações permitidas — em cada chamada; o arquivo OpenAPI apenas descreve a
integração.

Uma operação de escrita recebe uma indicação para que o cliente peça
confirmação, chamada de marca consequencial. Uma operação direta de leitura
recebe `x-openai-isConsequential: false`. Um grupo que inclui
qualquer escrita é consequencial para todas as suas chamadas, inclusive quando
a tarefa selecionada é uma consulta. Os seis grupos correntes incluem escrita.
O mandato de continuidade não remove as confirmações do cliente. Em Actions,
`x-openai-isConsequential: true` exige confirmação antes da execução; o contrato
não usa uma marca de leitura para ocultar uma escrita.
[OpenAI: operações consequenciais](https://developers.openai.com/api/docs/actions/production#consequential-flag).

Depois de trocar o contrato, substitua integralmente o OpenAPI no editor e salve
o GPT. Importar o schema e renovar o login OAuth são estados separados. A importação precisa ser conferida na versão que será usada nas conversas.

## Arquivos da conversa

`incorporar_pdf_como_fonte` recebe um PDF; `guardar_audio` recebe WAV PCM,
áudio não comprimido, ou MP3 já existente. Cada tarefa aceita um arquivo de
até 20 MiB, isto é, 20 × 1.048.576 bytes. O ChatGPT
preenche `openaiFileIdRefs` com o descritor temporário da conversa. O servidor
confere origem, prazo, rótulo de formato (MIME) e bytes, bloqueia redirecionamentos e não devolve a
URL transitória. A adaptação é derivada do metadado da tarefa, com o mesmo
contrato humano do MCP.

O PDF só é guardado quando existe a intenção de mantê-lo como fonte; uma
leitura pontual não chama essa operação. Áudio pertence à biblioteca do curso;
sua ingestão não cria uma fonte de evidência, não sintetiza voz e não transcreve
o arquivo. `consultar_audios` recupera referências lógicas para reutilização em
uma conversa posterior. A [composição nos canais](ferramentas-calculo-e-consulta.md#composição-nos-canais-de-autoria)
relaciona essas referências aos componentes usados no conteúdo.

A documentação oficial permite até dez referências de arquivos recebidos, com
links válidos por cinco minutos; o AraLearn limita cada uma dessas tarefas a um
arquivo. O limite oficial de 10 MB por arquivo devolvido por uma Action trata da
direção de retorno, não substitui o limite de ingestão do produto.
[OpenAI: arquivos em Actions](https://developers.openai.com/api/docs/actions/sending-files).

## Limites verificados e orçamentos locais

Consulta às fontes oficiais reconferida em 11 de setembro de 2026:

| Item | Regra publicada |
| --- | --- |
| descrição e resumo de cada operação | até 300 caracteres em cada campo |
| descrição de parâmetro | até 700 caracteres |
| pedido e resposta de cada chamada | cada corpo com menos de 100.000 caracteres |
| duração de ida e volta | até 45 segundos |
| transporte | conexão criptografada com TLS 1.2 ou superior, porta 443 e certificado público válido |

Essas regras vêm de
[OpenAI: produção em Actions](https://developers.openai.com/api/docs/actions/production).
Elas não estabelecem, nessa página, o tamanho total aceito pelo editor de OpenAPI.
A importação real do artefato corrente continua sendo uma verificação distinta.

O contrato importável oferece 30 operações: 24 diretas e seis grupos tipados,
que conservam as 54 tarefas do catálogo 4.0.0. Essa organização permite
selecionar cada tarefa com seus próprios argumentos sem ampliar o número de
operações apresentado ao editor. A aceitação do arquivo pelo editor, a
publicação do assistente e a execução contra o serviço são verificações
distintas.

O gerador mede o artefato que será importado em unidades UTF-16 e bytes UTF-8.
Os orçamentos locais são 90.000 unidades UTF-16 para o JSON compacto e 180.000
para sua apresentação formatada. Definições compartilhadas evitam repetir
schemas, preservando as restrições e os exemplos de cada tarefa. Esses
orçamentos ajudam a controlar o tamanho do contrato; a aceitação pelo cliente
é verificada pela importação do próprio arquivo. As chamadas ao serviço têm
limites independentes, descritos a seguir.

UTF-8 é a codificação usada para transmitir o texto em bytes; UTF-16 é usada
para representar o texto no JavaScript. Essas contagens podem ser diferentes.
O servidor aplica uma proteção conservadora de 99.999 unidades UTF-16 ao JSON
completo recebido ou convertido em texto, pois a fonte não define a unidade Unicode de
“caractere”. A decodificação exige UTF-8 válido. A proteção de 512 KiB limita
memória local e o prazo interno é de 40 segundos; ambos são escolhas do
AraLearn. Os orçamentos locais do schema também não são limites oficiais.
Nenhuma dessas proteções trunca ou resume conteúdo silenciosamente: leitura
grande exige recorte ou paginação; uma escrita possivelmente concluída exige
releitura antes de recuperação. Medidas e aceitação do cliente seguem o
[roteiro dos canais](roteiro-aceitacao-humana-autoria.md#medição-e-prova-dos-canais).

Respostas extensas de preparo e inspeção usam a continuação comum aos canais.
Cada página conserva uma parte literal do conteúdo e a referência necessária
para obter a seguinte. A reunião das páginas recupera o documento completo;
o assistente precisa concluí-la antes de avaliar ou alterar o recorte. O
[contrato de continuação](aralearn-contract.md) descreve essa leitura, e a
[prova local dos canais](prova-local-canais-autoria.md) verifica a equivalência
entre os documentos recuperados por MCP e Actions.

Quando uma gravação fica sem resposta, é preciso distinguir a elaboração dos
argumentos, o envio ao serviço, a validação e a persistência. O relato da
conversa, isoladamente, não identifica em qual etapa houve a interrupção. A
releitura do recorte e o recibo da tentativa permitem conferir se a mudança foi
salva antes de recuperá-la. Os dados disponíveis no cliente delimitam o
diagnóstico: o tamanho de um documento exportado, por exemplo, não informa o
tamanho do pedido enviado. O [roteiro de aceitação](roteiro-aceitacao-humana-autoria.md)
orienta essa conferência na versão conectada efetivamente em uso.

## Gerar e validar o OpenAPI

```powershell
npm run actions:openapi
npm run actions:openapi:check
npm run test:authoring:actions
```

O gerador projeta o catálogo compartilhado com o
[mapeamento de transporte de Actions](../supabase/functions/_shared/aralearn-authoring/courseActionBindings.js).
A validação confere a correspondência exata das 54 tarefas, os seis grupos e as
24 operações diretas, o vínculo entre tarefa e argumentos, OAuth, confirmações,
limites, respostas e intenções diretas, indiretas e negativas. Referências de
arquivos permanecem nas duas operações diretas de ingestão.

## Importar no ChatGPT

1. Gere e confira o arquivo.
2. Abra a configuração de Actions do GPT.
3. Substitua integralmente o OpenAPI anterior pelo arquivo corrente.
4. Confira as 30 operações, incluindo os seis grupos que preservam as 54 tarefas, e salve a Action.
5. Crie uma conversa nova e conclua ou renove o OAuth quando necessário.
6. Comece retomando ou criando o curso.
7. Execute uma jornada completa antes de considerar o contrato publicado.

A reimportação é necessária quando o documento OpenAPI muda. Uma correção
interna que preserve esse contrato, como um ajuste no retorno de autenticação
OAuth, não exige importar o arquivo novamente. Publicar um novo arquivo no
repositório não substitui o que já foi importado no cliente; a atualização
substitui integralmente a versão anterior.

## Referências técnicas

- [OpenAI: descrições e metadados das ferramentas](https://developers.openai.com/plugins/guides/optimize-metadata)
- [OpenAI: referência de apps e indicações para o cliente](https://developers.openai.com/plugins/reference)
- [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749)
