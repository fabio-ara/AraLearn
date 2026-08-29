# Auditoria e correções do Curso

O ciclo de auditoria examina uma Unidade de estudo diante do plano, dos
parâmetros, da intenção representacional, das Fontes, das Âncoras e das
Observações selecionadas. Ele registra critérios e evidências, identifica
achados e permite corrigir um recorte do Curso. O resultado da correção precisa
ser verificado numa nova rodada.

A auditoria descreve o que foi examinado numa revisão. Ela não atribui nota ao
Curso nem mede aprendizagem, compreensão, proficiência, atenção ou carga
cognitiva. Uma rodada sem achados significa que os critérios registrados
receberam os resultados apresentados naquele contexto.

## Objetos do ciclo

```text
Observação situada, quando houver
→ contexto corrente da Unidade
→ rodada com critérios e evidências
→ achado diante de reprovação ou incerteza
→ proposta focal de correção
→ aplicação confirmada
→ nova rodada de verificação
→ resolução ou reabertura do achado
```

Cada objeto cumpre uma função:

- **Observação** preserva uma manifestação situada;
- **rodada** conserva os critérios aplicados, os resultados e as evidências;
- **achado** identifica uma divergência ou incerteza;
- **correção** registra a proposta, o estado anterior e o estado pretendido;
- **verificação** confronta novamente o critério depois da mudança;
- **reversão** restaura o estado anterior quando a correção aplicada ainda é o
  estado corrente.

Responder ou resolver uma Observação registra triagem. Abrir um achado registra
um diagnóstico. Aplicar uma correção modifica o Curso. Somente uma nova rodada
pode sustentar a resolução do achado.

## Contexto focal

Antes de registrar uma rodada, o servidor recompõe o contexto da Unidade para a
pessoa proprietária. O recorte contém:

- identidade, versão e impressão digital da Unidade;
- caminho curricular e Microssequência;
- itens do plano atribuídos ao alvo;
- parâmetros e orientações efetivos;
- intenção representacional e componentes usados;
- Fontes, Âncoras e relações correntes;
- até 12 Observações selecionadas.

Uma impressão digital liga o comando a esse contexto. Mudança de Curso,
Unidade, plano, desenho, proveniência ou Observação exige nova leitura.

## Quatro dimensões

Cada critério avaliado conserva identidade e versão do método, resultado,
adequação, evidência pública e referências pertinentes. As dimensões são:

| Dimensão | Responsabilidade |
| --- | --- |
| `structural_conformance` | verificar de modo determinístico contrato, identidade e estrutura |
| `pedagogical_quality` | examinar correspondência entre intenção, explicação, prática e público |
| `factual_quality` | confrontar afirmações com evidência localizável |
| `editorial_quality` | examinar clareza, consistência e apresentação do recorte |

Os resultados possíveis são:

- `passed`, quando o critério foi atendido;
- `failed`, quando há divergência identificada;
- `uncertain`, quando a evidência disponível não permite decidir;
- `not_applicable`, quando o critério não se aplica ao objeto;
- `not_checked`, quando o critério não foi examinado.

A pessoa ou o cliente registra as três dimensões que dependem de julgamento. O
servidor acrescenta a verificação estrutural. Um resultado `not_checked`
permanece distinto de aprovação.

## Evidência factual

Resultado factual positivo exige uma Fonte ativa, uma revisão exata e uma
Âncora corrente no contexto focal. A relação `supported_by` pode sustentar uma
afirmação. `quoted_from` atesta a origem de uma citação e só atende ao critério
`quotation_fidelity`; repetir corretamente uma frase não demonstra sua verdade.

O AraLearn verifica identidade, revisão, relação e localização. Qualidade da
Fonte, autoria científica e competência disciplinar de quem avaliou dependem
de procedimentos externos ao contrato.

## Rodadas e achados

Uma rodada é imutável e possui tipo `audit` ou `verification`. Ela registra
origem humana ou automática, método, revisão do Curso, contexto, alvo, critérios
e quantidade de achados. Instruções enviadas ao modelo e raciocínio privado não
integram esse registro.

Rodadas sem achados continuam disponíveis na lista. Assim, a interface
distingue uma Unidade examinada sem divergência de uma Unidade ainda não
examinada. Listas de rodadas e achados aceitam paginação e filtro opcional pela
Unidade; o detalhe de uma rodada apresenta todos os critérios e suas evidências.

Um resultado `failed` ou `uncertain` pode abrir um achado. Seus estados são:

```text
open → awaiting_verification → resolved
  │              │                 │
  └→ dismissed   └→ open           └→ open
```

`awaiting_verification` informa que uma correção foi aplicada. `dismissed`
conserva a decisão de não prosseguir. Uma verificação `still_open`, uma
reabertura ou uma reversão devolve o achado a `open`.

## Correção focal

Uma correção substitui apenas o conteúdo e as atribuições de Fontes da Unidade
observada. Ela preserva identidade, pai, posição e campos relacionais. A
proposta registra justificativa e dois estados:

- `before`, com o conteúdo e a proveniência realmente lidos;
- `after`, com o conteúdo proposto e Fontes e Âncoras ativas.

Cada lado recebe uma impressão digital. Proposta sem diferença é recusada.
Ajustar ou rejeitar cria uma nova versão da mesma correção, preservando as
anteriores. Os estados são `proposed`, `rejected`, `applied`, `verified` e
`rolled_back`.

A aplicação exige que a Unidade, sua versão e a proveniência ainda correspondam
ao estado `before`. Conteúdo, Fontes, versão da Unidade, revisão do Curso,
evento e recibo confirmam ou revertem na mesma transação.

Depois da aplicação, a verificação relê a Unidade. O resultado `resolved` exige
que o critério focal tenha passado; `still_open` exige reprovação ou incerteza.
A reversão (`rollback`) só é aceita enquanto o conteúdo e a proveniência ainda
correspondem ao estado aplicado. Ela restaura `before`, cria nova versão da
correção e reabre o achado, sem apagar o histórico anterior.

## Relação com Observações

Um achado pode apontar para versões exatas de Observações. O vínculo preserva a
origem situada, sem copiar texto, pseudônimo ou identidade da pessoa. A
Observação continua sendo manifestação, e não evidência factual ou autorização
para corrigir.

Quando uma Observação é retirada, o achado a apresenta como indisponível e sem
endereço. Depois da remoção física do registro redigido, o vínculo desaparece;
rodada, achado e correção permanecem.

Na verificação, `resolved` resolve e `still_open` reabre atomicamente as
Observações vinculadas cujo estado exige essa transição. A resposta não deixa
uma segunda decisão pendente em `suggestedAnnotationActions`. Outras
transições, como a reversão de uma correção, ainda podem sugerir `reopen`; essa
sugestão só muda a Observação depois de um comando explícito com sua versão
corrente.

## Uso na interface

A área **Auditoria e correções** reúne duas abas:

- **Observações**, com a caixa de entrada e os detalhes das manifestações;
- **Achados**, com rodadas, achados, propostas, verificações e reversões.

Os endereços internos reconhecem estes destinos:

- `section=review&annotationId=...` para uma Observação;
- `section=review&findingId=...` para um achado;
- `section=review&findingId=...&correctionId=...` para uma correção;
- `section=review&auditRunId=...` para uma rodada.

Fonte ou Âncora abre **Fontes**; a Unidade abre **Conteúdo**. Combinações
incompatíveis são recusadas para evitar que um endereço aparente apontar para
outro contexto.

## Uso por MCP e Actions

O ciclo utiliza duas das seis operações públicas, apresentadas como ferramentas
no MCP e como caminhos HTTP em Actions:

- `lerCurso` com `view: "audit_cycle"` lê contexto, achados, rodadas e detalhe;
- `alterarCurso` com `operation: "update_audit_cycle"` executa os comandos do
  ciclo.

Os comandos são:

- `record_audit`;
- `propose_authoring_correction`;
- `reject_authoring_correction`;
- `decide_finding`;
- `apply_authoring_correction`;
- `verify_finding`;
- `rollback_authoring_correction`.

Nos dois canais, aplicar e reverter exigem `auditCommand.confirmed: true` depois
de confirmação humana. Os demais comandos recusam esse campo.

## Conexão, concorrência e limites

Observações podem usar a fila local própria. Auditoria, achados, correções e
verificações exigem conexão e propriedade do Curso. Sem rede, uma tela já
apresentada serve apenas à consulta transitória; antes de qualquer escrita, o
cliente precisa reler o estado autorizado.

As principais cercas são:

- até 24 itens por página e cursor de até 240 caracteres;
- até 12 Observações no contexto e por achado;
- até 16 achados e 32 critérios por rodada, incluindo o critério estrutural;
- comando de até 192 KiB e página de até 240 KiB;
- até 256 rodadas por Curso, com reserva para verificar correções aplicadas;
- até 1.024 identidades de achado;
- até 64 identidades de correção por Curso e oito por achado;
- estado anterior e posterior de até 48 KiB cada.

Revisões esperadas e `requestId` protegem concorrência e repetição. Uma proposta
desatualizada não sobrescreve a edição corrente, e repetir o mesmo comando não
duplica a operação.

## Interpretação responsável

Uma auditoria aprovada demonstra somente a aplicação dos critérios registrados
ao contexto identificado. Avaliação disciplinar, revisão por especialistas e
investigação com pessoas continuam necessárias conforme a finalidade.

Consulte [Observações e Anotações
ancoradas](observacoes-pedagogicas.md) para o registro situado, [Desenho
instrucional parametrizado](desenho-instrucional-parametrizado.md) para os
parâmetros e [Autoria por MCP](autoria-mcp.md) para os contratos completos.
