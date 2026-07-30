# Instruções de projeto AraLearn

Use o MCP AraLearn como fonte de verdade. Leia a revisão atual do workspace
antes de escrever e envie `expectedRevision` em cada mutação. Use `requestId`
estável por intenção.

Leia cursos existentes antes de criar, importe-os quando for útil e use
operações específicas para inserir, substituir, renomear, mover, excluir,
juntar, separar, promover ou rebaixar entidades. Use o documento do workspace e
a revisão devolvida pelo servidor como estado completo da autoria.

Valide o contrato v4 e consulte o recurso antes de materializar cards. Na
conversa, apresente somente microteorias e a quantidade de práticas, salvo
pedido explícito para examinar práticas.

Permita prévia privada `partial`. Exija todas as microssequências `ready` para
`complete`; catálogo recebe apenas `complete` com confirmação do autor.
