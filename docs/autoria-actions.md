# Autoria por Actions

Actions oferece no ChatGPT os mesmos dezesseis casos de uso humanos do MCP. O
transporte muda; Curso, regras de autorização e efeitos permanecem os mesmos.

O OpenAPI publicável está em
[`downloads/aralearn-chatgpt-action-openapi.yaml`](downloads/aralearn-chatgpt-action-openapi.yaml).

## Operações

As leituras são:

- `retomar_curso`;
- `consultar_planejamento`;
- `preparar_materializacao`;
- `consultar_configuracao`;
- `consultar_observacoes`;
- `preparar_revisao`;
- `consultar_fontes`;
- `consultar_componentes`.

As escritas são:

- `criar_curso`;
- `salvar_parte`;
- `materializar_parte`;
- `ajustar_configuracao`;
- `registrar_observacao`;
- `aplicar_correcoes`;
- `manter_fonte`;
- `incorporar_pdf_como_fonte`.

Cada descrição informa quando usar e quando não usar a operação. Isso permite ao
modelo distinguir, por exemplo, consultar Observações de preparar uma revisão,
ou manter metadados de uma Fonte de incorporar seu PDF.

## Argumentos humanos

O modelo identifica objetos por título, posição ou referência humana já vista.
O servidor resolve internamente identidades, versões e repetição segura. Esses
controles não aparecem como perguntas rotineiras para a pessoa autora.

Exemplos:

- `consultar_planejamento` recebe Curso e, opcionalmente, uma Parte;
- `salvar_parte` recebe Curso, título, intenção e Microssequências completas;
  a referência de Parte só aparece ao revisar uma posição anterior;
- `registrar_observacao` recebe Curso, StudyUnits e texto;
- `ajustar_configuracao` reúne parâmetros pedagógicos e direção editorial sem
  transformá-los num único catálogo;
- `manter_fonte` recebe somente as alterações bibliográficas, Âncoras ou
  vínculos realmente solicitados.

Uma referência ambígua não é resolvida por acaso. A resposta orienta o GPT a
pedir um título ou posição mais específica.

## Resultado comum

Todas as operações bem-sucedidas devolvem:

- `result`, com a consequência em linguagem curta;
- `deepLink`, quando existe um destino útil;
- `nextDecision`, quando uma decisão ainda é necessária.

O corpo não envolve esse resultado num envelope de compatibilidade. Erros
distinguem entrada inválida, falta de autorização, ambiguidade, objeto ausente e
indisponibilidade transitória. Somente falhas retomáveis devem ser repetidas.

## OAuth

O OpenAPI usa OAuth 2.0 com código de autorização. O backend valida o token e o
escopo em cada operação; a descrição OpenAPI não é a autoridade de autorização.
Uma Action de escrita é marcada como consequencial, enquanto leituras recebem o
hint de somente leitura.

Depois de trocar o contrato, salve novamente o OpenAPI no GPT e conecte uma
conta em conversa nova. Essa importação real pertence ao corte publicado, não a
cada mudança local.

## PDF anexado pelo ChatGPT

`incorporar_pdf_como_fonte` é a única operação com adaptação de transporte. O
schema público apresenta `openaiFileIdRefs`; o ChatGPT fornece em runtime a
referência temporária do arquivo anexado. O servidor aceita somente um PDF,
confere a origem temporária autorizada, baixa com limite de tamanho e remove a
URL transitória antes de validar a tarefa humana.

O arquivo só é guardado quando a conversa deixa clara a intenção de mantê-lo
como Fonte. Uma leitura pontual de PDF não deve chamar essa operação.

## Planejamento e coordenação

O comportamento padrão é incremental:

1. reunir contexto mínimo;
2. propor uma Parte;
3. aguardar aprovação ou ajuste;
4. salvar a Parte;
5. reler o planejamento;
6. propor a próxima Parte.

Uma resposta de coordenação não reproduz todo o plano nem o conteúdo já aberto
no AraLearn. Ela apresenta a mudança, um link e uma decisão.

## Gerar e validar o OpenAPI

```powershell
npm run actions:openapi
npm run actions:openapi:check
npm run test:authoring:actions
```

O gerador projeta diretamente o catálogo humano compartilhado. A validação
confere as dezesseis tarefas, OAuth, hints, limites de tamanho, schemas
importáveis, respostas e um conjunto de intenções diretas, indiretas e
negativas.

## Importar no ChatGPT

1. Gere e confira o arquivo.
2. Abra a configuração de Actions do GPT.
3. Substitua integralmente o OpenAPI anterior pelo arquivo corrente.
4. Salve a Action.
5. Crie uma conversa nova e refaça o OAuth.
6. Comece por `retomar_curso` ou `criar_curso`, conforme a intenção.
7. Execute uma jornada completa antes de considerar o contrato publicado.

Não mantenha duas versões importadas para o mesmo GPT.

## Referências técnicas

- [OpenAI: otimizar metadata de ferramentas](https://developers.openai.com/plugins/guides/optimize-metadata)
- [OpenAI: referência de Apps e hints](https://developers.openai.com/plugins/reference)
- [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749)
