# Autoria por Actions

Actions oferece no ChatGPT os mesmos dezessete casos de uso humanos do MCP. O
transporte muda; o curso, as regras de autorização e os efeitos permanecem os
mesmos.

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
- `salvar_mapa_curricular`;
- `salvar_parte`;
- `materializar_parte`;
- `ajustar_configuracao`;
- `registrar_observacao`;
- `aplicar_correcoes`;
- `manter_fonte`;
- `incorporar_pdf_como_fonte`.

Cada descrição informa quando usar e quando não usar a operação. Isso permite ao
modelo distinguir, por exemplo, salvar o mapa curricular de definir um lote de
produção, consultar observações de preparar uma revisão e manter metadados de
uma fonte de incorporar seu PDF.

## Referências humanas

O modelo identifica objetos por título, posição ou referência humana já vista.
O servidor resolve internamente identidades, concorrência e repetição segura.
Esses controles não aparecem como perguntas rotineiras para a pessoa autora.

Exemplos:

- `salvar_mapa_curricular` recebe o mapa completo, o público, os pré-requisitos
  e os itens de escopo; um rascunho pode ser revisto antes da aprovação;
- `salvar_parte` recebe título, intenção, progressão local e referências a
  microssequências que já pertencem ao mapa;
- `materializar_parte` recebe as unidades que concretizam o lote aprovado e
  distingue ideias introduzidas de ideias estabelecidas usadas ou retomadas;
- `ajustar_configuracao` reúne parâmetros pedagógicos e direção editorial;
- `manter_fonte` recebe somente as mudanças ou retiradas realmente solicitadas.

Para produzir conteúdo, `consultar_componentes` primeiro busca candidatos pela
função instrucional e depois lê o contrato exato apenas do componente escolhido.
O GPT não consulta o catálogo para variar a aparência.

Uma referência ambígua não é resolvida por acaso. A resposta orienta o GPT a
pedir um título ou posição mais específica.

## Planejamento e produção

O comportamento padrão segue três decisões distintas:

1. mapa curricular global;
2. progressão focal de um lote;
3. conteúdo materializado.

Primeiro, o GPT apresenta uma síntese de módulos, lições e microssequências e
oferece um link para o mapa completo. A pessoa autora pode alterar cobertura,
ordem, dependências ou profundidade. Somente a versão efetivamente inspecionável
pode ser marcada como aprovada.

Depois, partes agrupam o trabalho de produção. Elas não são pais curriculares e
seus limites podem mudar sem alterar o mapa. Para cada parte, o GPT apresenta a
progressão local, materializa depois da decisão e devolve um link para o
conteúdo real antes de seguir ao próximo lote.

A aprovação num nível não autoriza silenciosamente o nível seguinte. Decisões
rotineiras de redação e representação não viram perguntas; alterações
substantivas do currículo voltam à pessoa autora.

## Materialização e parâmetros

A preparação focal recupera o repertório acumulado do curso: ideias novas,
ideias estabelecidas que podem ser usadas e retomadas deliberadas. O teto de
novidades limita apenas introduções semanticamente novas em unidades
expositivas. Ele não exige a mesma quantidade em toda unidade nem transforma
cada ideia em uma tela.

O valor `default` de um parâmetro não representa um preset pedagógico fixo. Ele
autoriza a calibração contextual pelo GPT para cada microssequência ou unidade,
conforme conteúdo, função e público. Um valor deliberadamente fixado pelo
pesquisador prevalece e torna a condição observável.

Finalidade de concurso, formação profissional ou outra aplicação pode orientar
vocabulário e prática, mas não altera o caráter geral do AraLearn como ambiente
de pesquisa em design instrucional.

## Resultado comum

Todas as operações bem-sucedidas devolvem:

- `result`, com a consequência em linguagem curta;
- `deepLink`, quando existe um destino útil;
- `nextDecision`, quando uma decisão ainda é necessária.

O contexto completo pode permanecer estruturado para o modelo sem ser repetido
no chat. Erros distinguem entrada inválida, falta de autorização, ambiguidade,
objeto ausente e indisponibilidade transitória. Somente falhas retomáveis devem
ser repetidas.

## OAuth

O OpenAPI usa OAuth 2.0 com código de autorização. O backend valida token e
escopo em cada operação; a descrição OpenAPI não é a autoridade de autorização.
Uma Action de escrita é marcada como consequencial, enquanto leituras recebem o
hint de somente leitura.

Depois de trocar o contrato, substitua integralmente o OpenAPI no editor e salve
o GPT. Importar o schema e renovar o login OAuth são estados separados. A
importação real pertence ao corte publicado, não a cada mudança local.

## PDF anexado pelo ChatGPT

`incorporar_pdf_como_fonte` é a única operação com adaptação de transporte. O
ChatGPT fornece em runtime a referência temporária do arquivo anexado. O servidor
aceita somente um PDF, confere a origem autorizada, baixa com limite de tamanho e
não devolve a URL transitória.

O arquivo só é guardado quando a conversa deixa clara a intenção de mantê-lo
como fonte. Uma leitura pontual não deve chamar essa operação.

## Gerar e validar o OpenAPI

```powershell
npm run actions:openapi
npm run actions:openapi:check
npm run test:authoring:actions
```

O gerador projeta diretamente o catálogo compartilhado. A validação confere as
dezessete tarefas, OAuth, hints, limites, schemas importáveis, respostas e
intenções diretas, indiretas e negativas.

## Importar no ChatGPT

1. Gere e confira o arquivo.
2. Abra a configuração de Actions do GPT.
3. Substitua integralmente o OpenAPI anterior pelo arquivo corrente.
4. Confira as dezessete operações e salve a Action.
5. Crie uma conversa nova e conclua ou renove o OAuth quando necessário.
6. Comece retomando ou criando o curso.
7. Execute uma jornada completa antes de considerar o contrato publicado.

Publicar um arquivo novo não atualiza o schema já importado. Não mantenha duas
versões importadas para o mesmo GPT.

## Referências técnicas

- [OpenAI: otimizar metadata de ferramentas](https://developers.openai.com/plugins/guides/optimize-metadata)
- [OpenAI: referência de Apps e hints](https://developers.openai.com/plugins/reference)
- [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749)
