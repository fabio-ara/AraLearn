# Guia das ferramentas MCP do AraLearn

O Plugin usa o endpoint MCP remoto para autoria estrutural. O Chatbot
personalizado usa uma Action OpenAPI gerada do mesmo registro de ferramentas.

## Preparação contextual

- `prepararAutoriaAraLearn`: antes de criar, ampliar, revisar
  pedagogicamente, reorganizar ou publicar, recupera um brief curto a partir
  da intenção, do alvo, dos resources previstos e do contexto útil da conversa.

O servidor também anuncia instruções de uso na inicialização e publica
conhecimentos de fluxo, pedagogia, resources e segurança como resources MCP.
Esses mecanismos complementam os schemas das ferramentas; não substituem
validação, autorização nem leitura do estado atual.

## Leitura

- `listarCursosDaBibliotecaPessoal`: cursos privados e selecionados;
- `listarColecoesDoCatalogo` e `listarCursosDaColecao`: descoberta do catálogo
  publicado disponível a qualquer autor, sem conceder publicação;
- `lerConteudoDoCurso`: árvore, entidade ou documento publicado;
- `listarWorkspacesDeAutoria`: projetos em andamento;
- `lerWorkspaceDeAutoria`: árvore, entidade, documento ou revisão;
- `revisarMicroteoriasDoWorkspace`: projeção conceitual para o chat;
- `listarHistoricoDoWorkspace`: auditoria e restauração;
- `listarRecursosDeCard` e `consultarRecursoDeCard`: catálogo e contrato v4;
  a consulta detalhada inclui critérios pedagógicos, regras semânticas e o
  `authoringSchema` estrutural do recurso.

Comece por listas e `outline`. Use `entity` para o recorte que será alterado.
Use `document` apenas quando a tarefa realmente precisar do projeto inteiro.
Copie o `entityPath` devolvido pela leitura; ele é a sequência de ids desde o
curso até a entidade. Não reduza a referência ao último id.

## Escrita

Toda escrita recebe um `requestId`. Mutações de conteúdo também recebem a
`expectedRevision` devolvida pela última leitura.

- criar ou iniciar workspace: `criarWorkspaceDeAutoria`;
- reutilizar outro curso: `importarCursoNoWorkspace`, escolhendo um
  `workspaceCourseId` novo para a raiz importada;
- criar conteúdo: `inserirEntidadeNoWorkspace`;
- corrigir atomicamente: `substituirEntidadeNoWorkspace`;
- estrutura: `renomearEntidadeNoWorkspace`,
  `moverEntidadeNoWorkspace`, `excluirEntidadeDoWorkspace`;
- composição: `juntarMicrossequencias`, `separarMicrossequencia`,
  `promoverModuloACurso`, `rebaixarCursoAModulo`;
- recuperação: `restaurarRevisaoDoWorkspace`;
- materialização: `publicarCursoDoWorkspace`.

Uma substituição preserva o `id`. Uma movimentação preserva toda a entidade.
Para atravessar cursos, ambos devem estar no mesmo workspace e origem e
destino devem ser informados por seus caminhos estruturais.

## Publicação

Use:

```json
{
  "target": "private",
  "completion": "partial",
  "publicationMode": "create"
}
```

para uma prévia privada testável.

Atualização acrescenta `existingCourseId` e `expectedContentHash`. Catálogo usa
`target: "catalog"`, `completion: "complete"` e `collectionId`.

## Respostas

Cada ferramenta anuncia um `outputSchema` fechado para seu `data`: listas
incluem itens e cursor tipados; leituras incluem seus metadados de controle;
gravações incluem a revisão confirmada; publicação e exclusão têm recibos
próprios. Nunca suponha campos que não estejam na resposta anunciada.

Abertura estrutural existe somente dentro de `content`, quando foi solicitada
uma entidade ou o documento canônico integral, e dentro de `definition`, que
contém o contrato canônico variável de um `resource`. A árvore `outline`, a
projeção `microtheories` e todos os campos de controle são fechados. Falhas
usam o mesmo ramo `{ ok: false, requestId, error }` em todas as ferramentas.

Depois de alterar, informe o resultado humano e a nova revisão. Na revisão
conceitual, apresente microteorias e quantidades de práticas; não transcreva as
práticas. Em conflito, releia e nunca invente uma revisão.
