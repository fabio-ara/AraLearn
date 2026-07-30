# Autoria AraLearn v4

Este diretório contém instruções, conhecimento e contratos para autoria por
MCP, para o Chatbot personalizado e para reparo/criação atômicos de cards por
LLM no aplicativo. O Plugin MCP e a Action do Chatbot usam o mesmo registro de
ferramentas, as mesmas permissões de conta e o mesmo executor de autoria
estrutural extensa. Cada superfície usa o fluxo OAuth compatível com seu
cliente.

## Arquitetura

- o contrato público é `aralearn.contract` v4;
- workspaces são documentos de projeto privados no Storage;
- cada alteração cria snapshot imutável e avança um ponteiro por
  compare-and-swap;
- o banco mantém somente controle, histórico e ponteiros;
- um workspace pode conter vários cursos para recombinação;
- publicação seleciona um curso e cria uma revisão privada ou editorial.

O contrato operacional é o próprio documento v4 validado e sua revisão; não há
estado de execução paralelo ao workspace.

## Experiência de autoria

O GPT pode listar e ler cursos, workspaces e qualquer nível estrutural. Pode
inserir, substituir, renomear, mover, excluir, juntar ou separar conteúdo e
converter módulo em curso ou curso em módulo.

A revisão no chat mostra microteorias e contagens de práticas. As práticas
continuam no documento e podem ser lidas sob demanda.

Cursos incompletos podem ser publicados como prévia privada `partial`.
Publicação `complete` e catálogo exigem todas as microssequências `ready`.

## Pastas

- `core/`: fluxo, estados, qualidade, fontes e segurança;
- `knowledge/`: contrato, recursos e decisões didáticas;
- `platforms/`: instruções específicas;
- `schemas/`: contratos de mutação/publicação e
  `workspace-envelope.schema.json`, que valida somente o envelope do documento
  v4; a árvore e os cards continuam sob os contratos canônicos dos resources;
- `examples/`: exemplos do workspace v4.

Execute `npm run authoring:packages` para regenerar os pacotes e
`npm run test:authoring-packages` para validá-los.
