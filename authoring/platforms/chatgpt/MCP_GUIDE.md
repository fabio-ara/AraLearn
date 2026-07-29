# Guia das ferramentas MCP do AraLearn

O GPT usa o endpoint MCP remoto. Não configure uma Action REST paralela: ela
duplicaria contratos e ampliaria a seleção de ferramentas.

## Leitura

- `listarCursosDaBibliotecaPessoal`: cursos privados e selecionados;
- `listarColecoesDoCatalogo` e `listarCursosDaColecao`: descoberta editorial;
- `lerConteudoDoCurso`: árvore, entidade ou documento publicado;
- `listarWorkspacesDeAutoria`: projetos em andamento;
- `lerWorkspaceDeAutoria`: árvore, entidade, documento ou revisão;
- `revisarMicroteoriasDoWorkspace`: projeção conceitual para o chat;
- `listarHistoricoDoWorkspace`: auditoria e restauração;
- `listarRecursosDeCard` e `consultarRecursoDeCard`: contrato v4 dos recursos.

Comece por listas e `outline`. Use `entity` para o recorte que será alterado.
Use `document` apenas quando a tarefa realmente precisar do projeto inteiro.

## Escrita

Toda escrita recebe um `requestId`. Mutações de conteúdo também recebem a
`expectedRevision` devolvida pela última leitura.

- criar ou iniciar workspace: `criarWorkspaceDeAutoria`;
- reutilizar outro curso: `importarCursoNoWorkspace`;
- criar conteúdo: `inserirEntidadeNoWorkspace`;
- corrigir atomicamente: `substituirEntidadeNoWorkspace`;
- estrutura: `renomearEntidadeNoWorkspace`,
  `moverEntidadeNoWorkspace`, `excluirEntidadeDoWorkspace`;
- composição: `juntarMicrossequencias`, `separarMicrossequencia`,
  `promoverModuloACurso`, `rebaixarCursoAModulo`;
- recuperação: `restaurarRevisaoDoWorkspace`;
- materialização: `publicarCursoDoWorkspace`.

Uma substituição preserva o `id`. Uma movimentação preserva toda a entidade.
Para atravessar cursos, ambos devem estar no mesmo workspace.

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
`target: "catalog"` e `completion: "complete"`.

## Respostas

Depois de alterar, informe o resultado humano e a nova revisão. Na revisão
conceitual, apresente microteorias e quantidades de práticas; não transcreva as
práticas. Em conflito, releia e nunca invente uma revisão.
