# Criar e desenvolver Cursos por conversa

Este guia descreve o fluxo corrente de Autoria por um cliente conectado ao
Model Context Protocol (MCP). A conversa e a interface visual operam o mesmo
Curso vivo: não existe uma cópia “do assistente” para publicar depois.

## O que já funciona

O cliente pode, com a conta autorizada:

- listar e ler Cursos próprios;
- criar um Curso privado;
- alterar título, objetivo, orientações e estado de autoria;
- incluir, substituir ou excluir entidades didáticas em lotes;
- consultar e validar contratos de componentes;
- gerir perfil e acesso direto para Estudo.

Parametrização semântica por escopo, proveniência completa, observações
autorais, variantes experimentais e analytics de Autoria ainda não estão
implementados como fluxos completos. A conversa pode discutir esses assuntos,
mas não deve afirmar que os persistiu sem uma ferramenta correspondente.

## Antes da primeira conversa

1. Conecte o endpoint MCP do ambiente correto.
2. Autorize uma conta individual por OAuth.
3. Confirme que o cliente descobriu seis ferramentas e o recurso
   `aralearn://authoring/invariants`.
4. Faça uma leitura antes de qualquer alteração.

A conta nunca precisa receber uma chave administrativa. O servidor confere
propriedade em cada operação de Autoria.

## Começar pelo problema educacional

No primeiro pedido, descreva em linguagem natural:

- quem deverá aprender;
- o que deverá conseguir compreender ou fazer;
- conhecimentos prévios relevantes;
- conteúdo ou fontes disponíveis;
- restrições reais de tempo, linguagem ou acessibilidade;
- dúvidas que ainda exigem decisão humana.

Essas informações orientam o planejamento; não são justificativa para inventar
fontes, resultados de aprendizagem ou parâmetros que não foram acordados.

## Localizar ou criar o Curso

Peça ao cliente para procurar pelo título. Ele deve usar `listarCursos` e, se
houver homônimos, apresentar contexto suficiente para a escolha.

Se o Curso ainda não existir, `criarCurso` cria uma raiz privada com título,
objetivo e orientações. A operação usa um `requestId` estável: repetir a mesma
intenção depois de uma falha não deve produzir duplicatas.

Não há Workspace, Coleção, Trilha ou estágio de publicação a escolher. O Curso
criado é a mesma identidade que será aberta em Autoria e Estudo.

## Planejar antes de materializar

O estado autoral corrente conserva:

- **Partes**, agrupamentos operacionais que dimensionam a produção;
- **decisões**, escolhas relevantes já registradas;
- **mandato**, orientações de alto nível para a autoria.

Parte não substitui Módulo, Lição, Microssequência didática ou Unidade de
estudo. Ela limita uma iteração de produção a um conjunto manejável. A
quantidade pode ser ajustada ao Curso; não é uma regra pedagógica universal.

Antes de alterar, o cliente deve usar `lerCurso` na projeção adequada e
registrar a revisão recebida. `alterarCurso` aceita a escrita somente se essa
revisão ainda for corrente.

## Descobrir componentes sob demanda

O cliente não deve carregar todos os contratos da biblioteca no contexto. O
fluxo econômico é:

1. explorar famílias e facetas;
2. buscar candidatos pela intenção didática;
3. inspecionar poucos pacotes;
4. obter apenas os contratos necessários;
5. validar a composição proposta;
6. preparar uma prévia quando a decisão exigir inspeção visual.

Essa descoberta progressiva preserva contexto para o conteúdo e reduz o risco
de escolher um componente apenas pelo nome.

## Produzir por Parte

Uma Parte pode materializar várias entidades numa operação limitada. Para cada
iteração, o cliente deve:

1. reler planejamento, estrutura e revisão correntes;
2. declarar brevemente o que pretende produzir;
3. construir relações pai–filho e posições coerentes;
4. validar as Unidades e seus componentes;
5. enviar lotes de até 200 inclusões, substituições ou exclusões;
6. reler o Curso e resumir o resultado efetivamente persistido.

Uma resposta técnica bem-sucedida não prova qualidade pedagógica. Ela prova
que a transação respeitou o contrato e a revisão.

## Conferir visualmente

Depois de uma alteração:

1. abra o mesmo Curso em **Autoria**;
2. confira **Planejamento**, **Estrutura** e **Conteúdo**;
3. abra-o em **Estudo** para verificar o renderer e a navegação reais;
4. registre separadamente defeitos técnicos e decisões de conteúdo.

Estrutura e Conteúdo são hoje superfícies paginadas de inspeção. Edição
contextual completa, rolagem autoral contínua e o circuito de observação,
auditoria e correção ainda são trabalho futuro.

## Revisar, corrigir e continuar

Peça uma revisão com critério explícito, por exemplo coerência da progressão,
adequação da representação ou cobertura do objetivo. O cliente deve citar os
alvos encontrados, propor a menor mudança suficiente e aguardar decisão humana
quando houver escolha pedagógica real.

Para corrigir, ele relê o Curso, usa a nova revisão e altera somente as
entidades necessárias. Não deve criar uma versão imutável, publicar uma cópia
ou conservar um fluxo paralelo.

## Retomar em outra conversa

Uma nova sessão deve:

1. ler o recurso de invariantes;
2. localizar o Curso pelo identificador ou pela lista;
3. ler resumo, planejamento e páginas relevantes;
4. explicar em poucas linhas o estado encontrado;
5. só então propor a próxima operação.

O estado recuperável está no Curso. O prompt do cliente conserva invariantes e
regras de uso das ferramentas, não uma cópia mutável do planejamento.

## Recuperar falhas

- **Não autenticado:** refaça o OAuth; não troque por chave administrativa.
- **Curso não encontrado:** confirme conta, título e propriedade.
- **Conflito de revisão:** releia e reconcilie; não incremente a revisão à mão.
- **Pedido repetido:** reutilize o mesmo `requestId` apenas para a mesma
  intenção.
- **Entidade inválida:** confira pai, posição, identidade e contrato de
  componente antes de reenviar.
- **Resultado não aparece na interface:** releia o Curso, confira console e
  rede e verifique se a interface está no mesmo ambiente e conta.

Os contratos técnicos completos estão em [Autoria por MCP](autoria-mcp.md). O
[estado corrente](estado-atual-e-roadmap.md) distingue o que está conectado do
que continua em desenvolvimento.
