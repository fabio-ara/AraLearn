# Correção ponta a ponta da integração de Autoria

Este documento é a fonte de verdade da correção corrente da Autoria integrada.
Ele preserva os requisitos de produto, arquitetura, compatibilidade, validação e
publicação que precisam permanecer válidos até a conclusão. Em retomadas após
compactação de contexto, deve ser relido antes de qualquer decisão nova ou
declaração de conclusão.

## Resultado final obrigatório

O trabalho termina somente quando o ambiente real usado pela pessoa autora
estiver funcionando de ponta a ponta:

```text
ChatGPT/GPT ── Actions ou MCP ── protocolo público de Autoria
                                      │
                                      ▼
                              adaptador de protocolo
                                      │
                                      ▼
                      backend e domínio interno do AraLearn
                                      │
                                      ▼
                    persistência, releitura e interface de Autoria
```

O resultado inclui o AraLearn, o frontend da Autoria, o backend, o protocolo
público, MCP, Actions, o GPT efetivamente configurado e a publicação real. Uma
implementação correta apenas no worktree ou em testes locais não satisfaz o
critério de conclusão.

## Falha concreta que originou a correção

O Curso real bloqueado é:

- ID: `003ba920-db66-4d21-8b79-f37c48304453`;
- título: `Dataprev: Gestão de Servidores`.

O ChatGPT conseguiu criar e ler o Curso, ler `instructional_plan` e obter
`expectedRevision = 1` e `expectedPlanVersion = 1`. A escrita com
`operation = "update_instructional_plan"` falhou nas tentativas:

- `planCommand.type = "set_overview"`;
- `planCommand.type = "update_overview"`.

As duas respostas tiveram `code = "invalid_course_authoring_plan_command"` e
mensagem `O comando do plano é inválido.`. Esses aliases não devem ser aceitos
apenas porque foram inventados pelo agente. O vocabulário canônico corrente usa
`planCommand.type = "update_plan"` para alterar a visão geral.

O problema não se limita ao erro do agente. O OpenAPI importado continha
variantes com `const`, mas a representação percebida pelo GPT apresentou
`planCommand.type` como `any`. Uma sessão MCP também apresentou um catálogo
achatado e um contrato antigo de `set_parameter`. Portanto, a correção precisa
abranger fonte canônica, projeções, importador, cache, deployment e identidade
do contrato servido.

## Protocolo público estável

A Autoria deve ter um protocolo público v1 explícito, estável e versionado. A
identidade corrente é `aralearn.authoring-protocol.v1`; uma versão de schema e
um fingerprint determinístico distinguem revisões compatíveis exatas.

As regras permanentes de versionamento são:

- uma refatoração do domínio interno não altera o protocolo público;
- uma mudança pública compatível pode permanecer em v1 com nova versão de
  schema e novo fingerprint;
- uma mudança pública incompatível exige nova versão principal pública;
- uma versão anterior permanece servida e adaptada durante a migração;
- um identificador de versão não pode ser reutilizado para semântica
  incompatível;
- mudanças incompatíveis acidentais em v1 devem bloquear merge e deploy.

O domínio continua livre para evoluir. Mudanças internas como a troca de
`origin: "automatic"` por outra representação não devem exigir reconfiguração
do GPT, Actions ou MCP enquanto a semântica pública permanecer igual. A
tradução pertence ao adaptador público v1.

## Uma autoridade, duas projeções

O catálogo público v1 é a autoridade dos nomes, campos, restrições, operações,
discriminadores e versões externos. Ele não deve ser gerado como consequência
acidental de tipos do domínio.

MCP e Actions derivam desse catálogo, mas são projeções próprias:

```text
protocolo público de Autoria v1
        ├── projeção MCP
        └── projeção Actions/OpenAPI
```

O schema MCP pode usar construções preservadas pelo cliente MCP. A projeção de
Actions deve compilar a mesma semântica para as construções que o importador do
ChatGPT realmente conserva. Não se presume que um único JSON Schema possa ser
entregue sem transformação aos dois consumidores.

O backend continua estrito e é a autoridade final de validação. Limitações de
um cliente não autorizam ampliar o backend com aliases inventados.

## Adaptador entre protocolo e domínio

As chamadas MCP e Actions devem chegar ao mesmo adaptador do protocolo público
v1. Esse adaptador:

- valida o envelope público e campos exclusivos da operação;
- converte a representação pública para o comando interno corrente;
- preserva autorização, propriedade do Curso e tratamento de dados sensíveis;
- preserva `requestId` e idempotência;
- preserva CAS por `expectedRevision`, `expectedPlanVersion` e versões
  específicas das operações;
- preserva deep links;
- não expõe tipos internos como autoridade pública;
- permite que o domínio seja refatorado sem mudar o contrato v1.

## Unions discriminados e operações

Nenhum union discriminado público pode aparecer ao GPT com `type: any`. Cada
variante precisa ter discriminador literal preservado por representação que o
importador suporte, preferencialmente `type: string` com `enum` singleton
quando `const` for degradado.

Isso vale, no mínimo, para:

- `planCommand`;
- `designCommand`;
- `sourceCommand`;
- `annotationCommand`;
- `auditCommand`;
- `variantCommand`;
- `materializationCommand`;
- operações e vistas equivalentes em `alterarCurso`, `lerCurso` e
  `consultarComponentesDidaticos`.

`alterarCurso` precisa expor formas inteligíveis e exclusivas para:

- `update_instructional_plan`;
- `update_course_design`;
- `update_course_sources`;
- `update_anchored_annotations`;
- `update_audit_cycle`;
- `update_course_variants`;
- `commit_course_composition`;
- `advance_part_materialization`.

Cada forma explicita campos obrigatórios e proibidos, CAS e command associado.

`planCommand` preserva `update_plan`, operações de plan items, `add_part`,
`update_part`, `remove_part`, `reorder_parts`, `split_part`, `join_parts` e as
operações de microssequência. A forma não pode ser achatada a ponto de esconder
quais campos pertencem a cada variante.

`designCommand` preserva `automatic`, `explicit` e herança/clear, inclusive a
relação entre `parameterId` e o tipo de `value`. O adaptador traduz essa forma
estável para o domínio interno.

`materializationCommand` distingue estruturalmente `start`, `record_step` e
`finish`, com seus campos essenciais.

`lerCurso` trata cada `view` como variante semântica, incluindo diferenças de
`expectedRevision`, `scope`, `mode`, paginação, identificadores obrigatórios e
campos proibidos.

`consultarComponentesDidaticos` preserva, entre outras regras, um único package
em `contracts`, o `studyUnitJson` exigido pelas operações que o consomem e o par
`courseId`/`studyUnitId` opcional e indivisível da prévia.

## Projeção de Actions e perda de condicionais

A política anterior removia todos os `allOf` para compactar o OpenAPI. Toda
regra removida ou transformada precisa ser classificada como:

1. validação exclusivamente defensiva do servidor;
2. informação útil, mas dispensável para construir a chamada;
3. informação necessária para o agente construir uma chamada válida.

Regras da categoria 3 devem sobreviver na projeção pública, compiladas para
unions ou variantes explícitas compatíveis com o importador. Não se restaura
`allOf` indiscriminadamente e não se remove semântica apenas para reduzir bytes.
O gerador deve falhar quando surgir uma condicional não classificada ou não
projetada.

O teste empírico do importador deve abranger `const`, `enum` singleton,
`oneOf`, referências, `components.schemas`/`$defs`, condicionais e objetos
discriminados aninhados. A decisão compatível adotada precisa ficar documentada
para não ser revertida por uma futura simplificação.

## Identidade e paridade de deployment

MCP, Action e OpenAPI publicado precisam expor a mesma identidade determinística
do contrato, com informações equivalentes a:

```json
{
  "contract": "aralearn.authoring-protocol.v1",
  "schemaVersion": "1.0.0",
  "schemaHash": "sha256:..."
}
```

Timestamp não é identidade de contrato. O fingerprint deve permitir distinguir
imediatamente repositório, MCP implantado, Action implantada, OpenAPI publicado
e cópia importada pelo GPT. Os smokes de deployment devem comparar o artefato
esperado com o schema e os metadados realmente servidos, e não apenas nomes de
ferramentas.

Uma conexão ou GPT com snapshot antigo deve ser reconectado, reconfigurado ou
recriado quando necessário. Antes de recriar, a configuração útil deve ser
preservada. O GPT final precisa apontar para a versão correta do serviço.

## Proteção permanente em CI

Merge e deploy devem ser bloqueados quando uma refatoração interna causar:

- remoção de ferramenta ou operação pública;
- remoção ou troca de discriminador;
- campo obrigatório novo numa variante existente;
- proibição de campo antes aceito;
- estreitamento incompatível de enum, tipo ou limite;
- perda de regra necessária na projeção MCP ou Actions;
- divergência entre catálogo, fingerprint, artefato e schema servido.

Snapshots aprovados são acrescentados por versão e comparados semanticamente;
não devem ser sobrescritos silenciosamente. O detector de compatibilidade também
precisa ter testes próprios que demonstrem as classes de quebra acima. Os
vocabulários de paridade devem ser extraídos da autoridade canônica, não copiados
manualmente em testes.

## Jornadas obrigatórias

Testes locais e publicados devem usar as fronteiras públicas, sem chamar RPC ou
função interna para contornar MCP ou Action.

Planejamento por Action e, quando aplicável, MCP:

```text
ler instructional_plan
→ capturar courseRevision e planVersion
→ enviar update_plan válido
→ reler e confirmar persistência e incremento
→ enviar add_part válido
→ reler e confirmar Parte, posição e versões
```

Design:

```text
ler course_design
→ set_parameter automatic
→ reler e confirmar resolução persistida
→ set_parameter explicit
→ reler e confirmar origem e valor
```

Componentes:

- executar `contracts` com exatamente um package;
- executar `preview_study_unit` com alvo e JSON válidos;
- provar que chamadas estruturalmente inválidas são recusadas antes do backend
  quando a projeção permitir.

Materialização:

```text
start → record_step → finish → reler
```

A jornada publicada final deve reproduzir pelo GPT efetivamente configurado a
leitura e escrita do Curso real bloqueado, inclusive `update_plan` e criação de
pelo menos uma Parte, seguida de releitura que confirme persistência, revisão,
planVersion e deep links. `requestId` repetido deve continuar idempotente e CAS
obsoleto deve continuar recusado.

## OpenAPI efetivamente consumido pelo ChatGPT

Validar o arquivo gerado ou AJV não basta. Depois da publicação, o OpenAPI deve
ser importado no GPT real e sua representação efetiva deve ser inspecionada no
Preview. É necessário confirmar:

- discriminadores literais, sem `type: any`;
- argumentos gerados para `update_plan`, `add_part`, design e materialização;
- endpoint, OAuth e versão/fingerprint corretos;
- leitura, mutação e releitura reais.

Se a configuração atual impedir atualização confiável, é autorizado atualizar
a Action, reconfigurar integrações ou recriar o GPT e o vínculo MCP necessário.

## Frontend da Autoria

A correção já iniciada da interface permanece parte da entrega:

- o Curso não é desmontado durante refresh;
- `focus` e `visibilitychange` não provocam flicker;
- conteúdo corrente permanece visível enquanto sincroniza;
- um indicador compacto de sincronização segue a gramática de Estudos;
- textos excessivamente instrucionais e de bastidor são removidos;
- a identidade visual permanece transversal entre Estudos e Autoria;
- atualização concorrente não apaga rascunho ou intenção da pessoa autora.

A interface deve ser validada no Chrome real, em tamanhos móveis e desktop,
claro e escuro quando pertinente. Teste automatizado não substitui inspeção da
jornada real.

## Git, publicação e condição de parada

As mudanças devem ser commitadas, enviadas, integradas na branch correta e
implantadas. O ambiente publicado precisa ser verificado após o deploy. Não se
encerra com alterações importantes apenas locais, em branch não integrada ou
com configuração antiga no GPT.

Se uma credencial ou permissão realmente impedir uma etapa, o trabalho para
somente nesse ponto e solicita a menor intervenção humana capaz de desbloquear
a continuação.

## Checklist de aceite

Marcar um item somente após evidência correspondente no estado efetivamente
publicado. A conclusão exige todos os itens aplicáveis marcados.

- [ ] Causa raiz do `invalid_course_authoring_plan_command` demonstrada.
- [ ] Protocolo público `aralearn.authoring-protocol.v1` é a autoridade canônica.
- [ ] Catálogo público não depende de enums ou tipos internos do domínio.
- [ ] Adaptador v1 traduz a forma pública para o domínio corrente.
- [ ] Estratégia de versionamento e preservação de versões antigas está implementada.
- [ ] Snapshot e diff semântico bloqueiam breaking changes acidentais em CI.
- [ ] Fingerprint determinístico confere com o catálogo canônico.
- [ ] MCP deriva da autoridade v1 e publica identidade/fingerprint corretos.
- [ ] Actions deriva da autoridade v1 e publica identidade/fingerprint corretos.
- [ ] OpenAPI não perde regras necessárias anteriormente expressas por `allOf`.
- [ ] `planCommand` expõe todas as variantes com discriminadores literais.
- [ ] `designCommand`, `sourceCommand`, `annotationCommand`, `auditCommand` e
      `variantCommand` expõem discriminadores literais.
- [ ] `materializationCommand` expõe `start`, `record_step` e `finish` de forma estrutural.
- [ ] `lerCurso` expressa as diferenças obrigatórias entre vistas.
- [ ] `consultarComponentesDidaticos` expressa corretamente `contracts` e prévia.
- [ ] Backend continua recusando aliases e payloads incompatíveis.
- [ ] `requestId`, idempotência, CAS e deep links permanecem corretos.
- [ ] Testes derivados confirmam paridade semântica MCP ↔ Actions.
- [ ] Jornada MCP local cobre plano/Parte, design, componentes e materialização.
- [ ] Jornada Actions local cobre plano/Parte, design, componentes e materialização.
- [ ] Chamadas negativas são recusadas no schema antes do backend quando possível.
- [ ] Smokes detectam deployment MCP, Action ou OpenAPI defasado.
- [ ] OpenAPI publicado foi importado no GPT final.
- [ ] Preview do GPT mostra discriminadores literais, sem `type: any`.
- [ ] GPT final usa endpoint, OAuth, versão e fingerprint corretos.
- [ ] Curso `003ba920-db66-4d21-8b79-f37c48304453` foi lido pela fronteira pública real.
- [ ] `update_plan` foi executado e relido no Curso real com incremento correto.
- [ ] `add_part` foi executado e relido no Curso real com posição e versão corretas.
- [ ] Repetição de `requestId` e CAS obsoleto foram validados sem regressão.
- [ ] Refresh da Autoria preserva o Curso e não apresenta o flicker descrito.
- [ ] Indicador de sincronização e textos compactos seguem a identidade de Estudos.
- [ ] Frontend foi validado no Chrome real sem regressão visual ou pedagógica.
- [ ] Testes unitários, integração, E2E e smokes relevantes estão verdes.
- [ ] Commits foram criados sem misturar trabalho estranho ao recorte.
- [ ] Push e integração/merge foram concluídos.
- [ ] MCP, Action, Pages/OpenAPI e demais superfícies necessárias foram implantados.
- [ ] Ambiente publicado corresponde aos fingerprints e artefatos esperados.
- [ ] Fluxo real ChatGPT → Action/MCP → AraLearn → releitura funciona de ponta a ponta.
