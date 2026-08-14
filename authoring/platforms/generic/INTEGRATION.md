# Integrar um cliente de autoria ao AraLearn

Este guia atende clientes que implementem Model Context Protocol remoto. O
servidor MCP é a superfície canônica de ferramentas: ele autentica a conta por
OAuth 2.1, verifica a operação concreta no banco e devolve dados estruturados.

O cliente não deve manter uma cópia paralela do curso como fonte de verdade.
Chat, cache e arquivos de conhecimento ajudam a formular ações; o workspace,
espaço persistente que guarda a árvore e sua revisão, continua sendo o estado
corrente.

## Requisitos do cliente

O cliente precisa oferecer:

- transporte Streamable HTTP para endpoint HTTPS;
- descoberta de protected resource;
- OAuth 2.1 com PKCE;
- armazenamento protegido de access e refresh tokens;
- ferramentas com schemas de entrada e saída;
- preservação de `requestId` e `expectedRevision` entre tentativa e resposta.

Endpoint:

```text
https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp
```

As capacidades efetivas não são claims confiadas ao cliente. O gateway as
resolve no banco em cada chamada para a conta autenticada.

## Conceitos de estado

### Entidade e caminho

Projeto, curso, módulo, lição, tópico, microssequência e card são entidades
correntes no PostgreSQL. Relações de pai e posição formam a árvore.
`entityPath` é a sequência completa de ids desde o curso até o alvo; não o
reduza ao último id.

### Revisão

Uma leitura devolve `expectedRevision`. A escrita só prossegue se essa revisão
ainda for atual. Esse controle impede que uma sessão apague silenciosamente a
alteração de outra.

### Identidade da tentativa

`requestId` identifica uma chamada para repetição segura. Gere-o antes da
escrita e repita-o somente com argumentos idênticos. Ele não substitui a
revisão.

### Artefato publicado

O workspace é relacional e incremental. O Storage recebe um artefato integral
imutável somente quando uma revisão é fixada para submissão ou distribuição.
Criar estrutura e cards já os torna visíveis em Trilhas; publicação não é
pré-condição de estudo.

## Conectar e testar o cliente

### Pré-condição

Implante o gateway, configure OAuth e use uma conta de teste com acesso a um
workspace não crítico.

### Passos

1. Registre o endpoint no cliente.
2. Conclua OAuth com a conta AraLearn.
3. Confira o registro de ferramentas e seus `outputSchema`.
4. Chame `listarWorkspacesDeAutoria`.
5. Leia um workspace em `view: "resume"`.
6. Faça uma leitura `outline` e outra `entity`.
7. Execute uma escrita mínima com a revisão lida.
8. Repita a chamada com o mesmo `requestId` e argumentos.
9. Tente uma escrita com revisão antiga e confirme o conflito.

### Resultado esperado

O replay devolve a mesma tentativa, a revisão antiga não sobrescreve a nova e
uma conta não lê o workspace de outra sem permissão.

### Offline e recuperação

MCP remoto não funciona offline. Após queda durante uma escrita, consulte
`resume` antes de criar uma nova tentativa. Os resumos de alterações não
reconstroem o documento integral e não devem ser usados para adivinhar a
revisão.

## Ciclo mínimo de autoria

1. Use `prepararAutoriaAraLearn` para obter orientação pertinente à intenção.
2. Se o workspace existir, leia `resume`; se não, crie-o vazio.
3. Leia somente o recorte necessário.
4. Planeje a árvore e crie a estrutura em lotes de até 40 entidades.
5. Apresente o plano à pessoa e aguarde aprovação.
6. Registre Partes, decisões e mandato em uma única operação
   `record_approved_plan`.
7. Descubra os resources e materialize uma microssequência por vez.
8. Revise microteorias, cobertura e quantidade de práticas.
9. Audite em leitura, registre achados compactos e repare apenas os aprovados.
10. Estude em Trilhas; fixe uma revisão somente quando houver intenção de
    submissão ou distribuição.

O `brief` contém apenas contexto estável e fontes. Para substituí-lo, releia o
valor completo e use `replace_stable_brief`. Partes, decisões, mandatos e
achados têm operações próprias e não pertencem ao `brief`.

## Descobrir e usar resources

Uma única ferramenta, `consultarBibliotecaDeResources`, organiza a descoberta:

1. `explore` apresenta famílias e facetas;
2. `search` procura pela intenção e informa cobertura `canonical`, `versatile`
   ou `substitute`;
3. `inspect` compara até oito perfis;
4. `contracts` entrega até quatro contratos exatos;
5. `validate_card` verifica o envelope montado;
6. `audit_representation` verifica adequação semântica, interação de resposta e
   legibilidade do feedback.

`preview_card` devolve `rendered: false`: é um descritor, não uma captura. Se a
cobertura for `substitute`, use o melhor candidato, informe brevemente o
`chatDisclosure` e preserve na decisão autoral qual representação seria ideal.
Não invente um schema nem tente obter todos os contratos em uma chamada.

## Gravar e corrigir

`salvarCardsNaMicrossequencia` recebe os envelopes completos dos cards de uma
unidade. Para correção pontual, use `salvarCardNoWorkspace` no card completo ou
`atualizarMetadadosDaEntidade` em curso, módulo, lição ou microssequência.

Depois da escrita:

1. guarde a revisão confirmada;
2. releia o alvo quando o resultado precisar de conferência;
3. apresente o efeito em linguagem humana;
4. não trate validação estrutural como aprovação pedagógica.

## Reorganizar e excluir

`reorganizarWorkspace` usa operações explícitas:

- `copy_entity` cria ids novos para raiz e descendentes, remapeia referências
  internas e preserva a origem;
- `move_entity` mantém a identidade, muda pai ou posição e remove a localização
  anterior atomicamente;
- `rename_entity`, `merge_microsequences`, `split_microsequence`,
  `promote_module` e `demote_course` tratam transformações delimitadas.

Origem e destino podem estar em cursos diferentes do mesmo workspace, mas
precisam de `entityPath` completos. Não há conteúdo mutável compartilhado entre
uma cópia e sua origem.

Exclusões usam `excluirDoWorkspace` com `delete_entity` ou
`delete_workspace`, sempre protegidas pela revisão atual. Não esconda uma
exclusão dentro de uma operação genérica.

## Comentários, auditoria e continuidade

Antes de uma auditoria, leia comentários de estudo com `list_comments` e notas
do workspace com `list_observations` e `kinds: ["note"]`. Achados formais
ativos aparecem em `resume`; o histórico pode ser paginado com
`kinds: ["audit_finding"]`.

Registre achados compactos com localização, categoria, gravidade, síntese e
reparo proposto. A pessoa decide quais serão corrigidos. Vincule uma correção
somente depois da escrita confirmada; depois, faça outra auditoria.

`link_comment_correction` liga um reparo a um comentário de estudo.
`link_finding_correction` liga um reparo a um achado formal. Esses vínculos não
são intercambiáveis.

## Submissão e Coleções

Para submeter, fixe o curso com `publicarCursoDoWorkspace` e
`target: "private"`. `submeterCursoParaRevisaoEditorial` aponta para o hash
exato sem duplicar o workspace. Pessoas revisoras autorizadas podem ler o
artefato, criar uma cópia editorial, pedir ajustes, rejeitar ou distribuí-lo.

Distribuir em Coleções usa `target: "catalog"` e `collectionId` e exige
capacidade editorial. Capacidade local no workspace não concede administração
global do catálogo.

## Diagnóstico

| Falha | Interpretação | Recuperação |
| --- | --- | --- |
| `401` ou consentimento ausente | Token inválido, expirado ou audience incorreta | Reinicie OAuth; não substitua o token por credencial administrativa. |
| `403` em uma operação específica | Conta autenticada, mas sem capacidade efetiva | Confirme papel, âmbito e operação solicitada. |
| Conflito de revisão | Outra sessão alterou o workspace | Releia o alvo e reconstrua a menor mutação. |
| Replay rejeitado | `requestId` foi repetido com argumentos diferentes | Gere um novo id para a nova intenção. |
| Resource não materializa | Contrato inventado, desatualizado ou envelope inválido | Refaça `inspect`, `contracts`, `validate_card` e `audit_representation`. |
| O cliente envia o documento inteiro a cada ajuste | Estado composto foi tratado como payload de mutação | Use comandos incrementais por entidade ou microssequência. |

O percurso humano está em
[Criar cursos pelo chat](../../../docs/criar-cursos-pelo-chat.md). O contrato de
transporte e autorização está em
[Gateway MCP de autoria](../../../docs/autoria-mcp.md).
