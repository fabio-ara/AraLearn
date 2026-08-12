# Integração genérica de autoria

Use o MCP remoto do AraLearn como única superfície de ferramentas. O servidor
autentica cada chamada por OAuth 2.1, resolve no banco as permissões efetivas
da conta e devolve `structuredContent`.

## Estado e ciclo mínimo

O PostgreSQL conserva uma entidade corrente por projeto, curso, módulo, lição,
tópico, microssequência e card. O servidor compõe o documento v4 quando
precisa ler, validar ou publicar e grava somente as partes modificadas por cada
comando. O Storage recebe o artefato canônico imutável na publicação.

1. chame `prepararAutoriaAraLearn` para a intenção e, se o workspace já existir, chame
   `lerWorkspaceDeAutoria` com `view: "resume"`; o chat não é estado;
2. liste cursos ou workspaces e leia primeiro `outline`;
3. leia somente a entidade necessária e conserve seu `entityPath` completo;
4. registre a árvore planejada em lotes pequenos com
   `criarEstruturaNoWorkspace`;
5. após a aprovação, use uma única `record_approved_plan` com todas as Partes
   por ids de microssequências, decisões e o mandato humano;
6. consulte o catálogo compacto com `consultarPackagesDeCard`, escolha os packages pela operação cognitiva, solicite somente seus contratos versionados e salve os cards
   de uma microssequência por vez com `salvarCardsNaMicrossequencia`; nunca
   envie um curso populado inteiro;
7. para corrigir, use `atualizarMetadadosDaEntidade` ou
   `salvarCardNoWorkspace`;
8. conserve a nova revisão e use `microtheories` para revisão humana;
9. audite depois de consultar `list_comments` e `list_observations` com
   `kinds: ["note"]`; achados ativos já vêm em `resume`; registre
   achados compactos, repare somente os aprovados e reaudite;
10. estude em Trilhas sem publicar; somente para submissão, fixe o artefato
   privado com `publicarCursoDoWorkspace`, ou distribua em Coleções quando a
   conta puder e a pessoa pedir.

O `brief` contém somente contexto estável e fontes. Para alterá-lo, releia o
valor completo e use `gerirContinuidadeDaAutoria` com
`replace_stable_brief`; não grave ali partes, decisões, mandatos ou achados.

O documento integral é uma visão composta, não o estado que o cliente deve
reenviar em toda alteração. `listarAlteracoesRecentesDoWorkspace` oferece
apenas resumos pequenos de até 200 eventos recentes.

## Idempotência

Gere um `requestId` estável antes da chamada. Repita-o somente com argumentos
idênticos. Não confunda esse identificador com `expectedRevision`: o primeiro
recupera uma chamada; o segundo protege contra escrita concorrente.

## Cópia e movimento

`reorganizarWorkspace` recebe uma operação estrutural explícita. Use
`copy_entity` para criar ids para a nova raiz e seus descendentes, remapear
referências internas e preservar a origem. Use `move_entity` para manter a
identidade, trocar pai ou posição e remover a localização anterior
atomicamente. Origem e destino podem estar em cursos diferentes do mesmo
workspace; use sempre seus `entityPath` completos. Não há compartilhamento de
conteúdo mutável entre os locais. Exclusões usam `excluirDoWorkspace` com
`delete_entity` ou `delete_workspace`, sempre com a `expectedRevision` lida,
nunca uma operação estrutural genérica.

## Âmbitos privado e editorial

O plano e as partes materializadas aparecem e podem ser testados em Trilhas sem
publicação. “Publicado” significa somente fixado para submissão ou distribuído,
nunca condição para estudar. Para submeter, `publicarCursoDoWorkspace` com `target: "private"`
fixa o artefato; `submeterCursoParaRevisaoEditorial` aponta para o hash exato,
sem criar outro artefato, e aceita também conteúdo parcial. Conforme as
capacidades da conta, a mesma integração pode listar os próprios envios ou a
fila, ler o artefato submetido, criar uma cópia editorial independente, pedir
ajustes, rejeitar e organizar o curso em uma Coleção. O envio não
expõe outros conteúdos privados.

## Permissões efetivas

- `authoring:read` / `authoring:private:read`;
- `authoring:write` / `authoring:private:write`;
- `catalog:read`, `catalog:submit`, `catalog:review`, `catalog:publish` e
  `catalog:manage`, conforme a função da conta.

Esses identificadores pertencem ao modelo de autorização do banco. Eles não
são escopos OAuth solicitados ao provedor nem claims do access token. O
catálogo recebe somente revisão completa; o workspace em Trilhas pode continuar
parcial.

Consulte o percurso para pessoas autoras em
[Criar cursos pelo chat](../../../docs/criar-cursos-pelo-chat.md) e o contrato
de integração em [Gateway MCP de autoria](../../../docs/autoria-mcp.md).
