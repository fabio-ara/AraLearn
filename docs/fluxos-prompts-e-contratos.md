# Fluxos e contratos de geração

O AraLearn separa duas fronteiras de autoria:

- o GPT externo com MCP lê e reorganiza cursos, módulos, lições,
  microssequências e cards em workspaces versionados;
- a assistência local por API repara um card ou resources escolhidos e cria
  um único card por pedido.

Cada chamada possui um schema fechado. A resposta é compilada e validada em
memória antes de virar uma prévia; nenhuma resposta do serviço é gravada
diretamente.

No manifesto, `atomic-card-assistance` nomeia esse fluxo local por API.
`atomic-resource-authoring` nomeia separadamente a consulta de contratos e as
mutações de workspace da autoria remota pelo GPT com MCP. Uma capacidade não é
alias nem fallback da outra.

## Assistência atômica local por API

O ponto de partida é sempre uma microssequência. Se a operação for reparo, um
card existente também precisa estar selecionado. A pessoa autora escolhe
explicitamente:

- `repair` no card inteiro;
- `repair` em um ou mais recursos do card;
- `create` antes ou depois do card atual;
- `create` no fim da microssequência;
- `create` dentro de uma nova microssequência posterior.

O runtime não possui operação para reconstruir todos os cards da
microssequência. Pedidos maiores são decompostos em mudanças pequenas que podem
ser avaliadas e aplicadas separadamente.

Não existe pipeline local para planejar ou gerar a árvore do curso. Essas
operações, inclusive leitura, combinação e movimentação de partes entre cursos,
ocorrem no workspace remoto por MCP.

### Contexto somente leitura

O pacote `aralearn.card-assistance-context.v1` contém o caminho selecionado,
objetivos, guias, dependências, tópicos, checks, o card atual e um recorte
limitado dos vizinhos. Anexos autorizados entram como trechos limitados e
permanecem apenas na memória da chamada.

Curso completo, credenciais, prompt, anexos e prévia não são persistidos junto
ao conteúdo. O alvo gravável aparece separado do contexto somente leitura.

### Reparo de recursos

Cada recurso recebe uma identidade de alvo:

- `main` para o recurso principal de card simples;
- `response` para a prática contextual por escolha em recurso não `choice`;
- `after:text` para o texto posterior canônico do card;
- `body:<id>` para um bloco do corpo de `composite`;
- `after:<id>` para um recurso de apoio em `afterBlocks`.

O serviço recebe somente os alvos selecionados como graváveis, além do pedido e
do contexto delimitado de leitura, e devolve exatamente uma substituição para
cada `targetId`.

```json
{
  "replacements": [
    {
      "targetId": "body:exemplo-1",
      "value": {
        "id": "exemplo-1",
        "kind": "paragraph",
        "value": "Exemplo corrigido e autocontido."
      },
      "gaps": []
    }
  ]
}
```

O compilador preserva o card e todos os recursos não selecionados. Identidades,
tipo de recurso e posição não podem ser trocados nessa operação. O card inteiro
é um escopo de reparo separado e não usa `targetId`.

### Reparo do card inteiro e criação

Essas operações usam duas chamadas curtas:

1. `card_assistance_representation` escolhe uma combinação permitida de
   `resource`, `kind` e `exercise`;
2. `card_assistance_build` recebe o schema exato daquela combinação e constrói
   um único card.

Em reparo, a representação atual é preferida quando o pedido não exige troca.
Na criação, o AraLearn aloca o ID e a posição; o modelo apenas preenche o
conteúdo autorizado. Criar uma nova microssequência também usa ID, dependência
e posição determinados localmente.

Para `new_microsequence`, a persistência admite exatamente uma microssequência
nova na lição selecionada. O escopo gravável contém somente a nova subárvore e
o campo `position` das microssequências irmãs existentes; a ordem relativa
dessas irmãs não pode mudar. Qualquer outra alteração é recusada.

Lacunas são escritas na linguagem formal de autoria com `{gap:id}` e uma lista
`gaps`. O compilador resolve os alvos e produz o card v4; não há parser de
prosa, HTML ou campos numerados.

## Validação, repetição e prévia

Uma falha estrutural permite no máximo uma nova tentativa do mesmo alvo, com a
mensagem da validação. O pipeline não refaz cards vizinhos e não troca
silenciosamente de provider, modelo ou representação.

Antes de mostrar a prévia, o AraLearn valida:

- o schema exato do recurso;
- combinações de `resource`, `kind` e `exercise`;
- IDs e posições;
- lacunas e opções de resposta;
- referências internas de recursos visuais;
- o contrato integral do projeto resultante;
- a ausência de alterações fora do alvo.

A prévia `aralearn.card-assistance-preview.v1` contém somente:

- o fingerprint SHA-256 do escopo lido;
- um `changeSet` mínimo;
- diagnósticos sem conteúdo do curso.

Ao aplicar, o runtime calcula novamente o fingerprint. Se o contexto mudou
durante a chamada, a prévia fica obsoleta e é recusada. Uma prévia descartada
não produz escrita.

## Linguagem formal da autoria externa

A autoria por workspace usa a mesma linguagem JSON de recursos. O agente
escolhe um recurso conhecido e preenche somente os campos definidos para ele.
O compilador confere referências, posições, lacunas e combinações de recurso,
tipo e exercício antes de traduzir a proposta para o contrato v4.

O workspace remoto pode organizar partes maiores e publicar revisões
incompletas para teste privado. No chat, a revisão conceitual pode mostrar
somente as microteorias e a quantidade de práticas. Consulte
[Gateway MCP de autoria](autoria-mcp.md).

## Responsabilidade autoral

Saída estruturada reduz ambiguidade, mas não torna uma resposta correta por si
só. A pessoa autora decide se aplica a prévia, e a publicação no catálogo
continua sujeita à validação e à permissão editorial.
