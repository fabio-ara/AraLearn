# Ciclo editorial por rodadas

Este documento é a fonte normativa do procedimento conversacional de autoria.
Os critérios pedagógicos detalhados permanecem em `quality.md`, `sources.md`,
`knowledge/semantic-audit.md`, `knowledge/continuity.md` e
`knowledge/cards-and-resources.md`.

O mesmo assistente pode planejar, construir, auditar, reparar, reauditar e
publicar. Esses papéis não são executados sobre a mesma parte na mesma rodada.
Depois de uma ação editorial relevante, o assistente apresenta o resultado,
sugere exatamente uma próxima etapa e espera a decisão da pessoa autora.

```text
planejamento -> decisão -> construção -> decisão -> auditoria -> decisão
-> reparo -> decisão -> reauditoria -> próxima parte
```

Uma correção técnica de payload rejeitado, uma repetição idempotente ou uma
releitura após conflito pertence à ação editorial em andamento. Ela não conta
como auditoria nem reparo pedagógico e deve ser resolvida antes do feedback.

## Unidade técnica e unidade conversacional

- **Microssequência** é a unidade técnica de materialização, leitura e
  correção. Cada chamada de construção grava somente uma microssequência.
- **Parte** é a unidade conversacional de trabalho, apresentação e decisão. Ela
  pode reunir várias microssequências e até várias lições que formem um recorte
  substancial e revisável.

Não crie uma parte por microssequência. Em cursos com centenas de cards, uma
primeira divisão em cerca de 6 a 10 partes substanciais costuma permitir
revisão humana útil, mas isso é apenas heurística. O dimensionamento deriva da
ementa, da complexidade, dos conhecimentos prévios, dos erros previsíveis, das
decisões a praticar, da carga cognitiva e do volume que a pessoa consegue
avaliar numa rodada.

## 1. Planejamento

Materialize no workspace o curso, os módulos, as lições e as microssequências
planejadas. Use `status: "planned"` e não crie cards nessa etapa.

Depois de salvar, apresente no chat:

- as partes propostas e as lições e microssequências de cada uma;
- o objetivo, a cobertura e as dependências principais de cada parte;
- uma estimativa ou faixa de práticas;
- a justificativa do dimensionamento;
- riscos de compressão, lacunas ou decisões ainda abertas.

Sugira aprovação ou ajuste do planejamento como uma única próxima etapa e
pare. Não inicie a construção na mesma rodada.

## 2. Construção

Construa somente a parte aprovada ou pedida. Materialize internamente uma
microssequência por chamada, usando a revisão confirmada pela chamada anterior.
Por padrão, conteúdo recém-construído permanece `generated` ou `needs_review`;
`ready` representa aceitação do conteúdo corrente e só é usado quando a pessoa
já tiver dado ordem inequívoca para isso.

Ao concluir a parte, apresente para cada microssequência:

- título e objetivo;
- conteúdo consolidado dos cards teóricos;
- quantidade de práticas;
- resources relevantes empregados;
- termos, siglas e notações introduzidos;
- decisões de escopo tomadas durante a construção.

Não despeje JSON nem enumere todas as práticas por padrão. Informe que elas
podem ser vistas integralmente, por amostra, por tipo de exercício, por
resource, por microssequência, por tópico ou por erro trabalhado.

Quando a pessoa pedir práticas, liste os cards, releia integralmente os alvos e
mostre em texto legível título, enunciado, representação suficiente,
alternativas ou lacunas, resposta, feedback, resource, tópicos e fontes. A
representação no chat não precisa reproduzir o aplicativo, mas precisa permitir
auditoria humana real.

Depois da apresentação, sugira uma auditoria independente e pare.

## 3. Auditoria independente

Audite somente após autorização. No início da rodada, releia do workspace a
parte persistida; não use como evidência apenas a memória da construção. A
auditoria é somente leitura: não altera cards, metadados ou estados e não faz
reparos oportunistas.

Aplique os critérios de `knowledge/semantic-audit.md`, incluindo cobertura e
dimensionamento, autossuficiência, carga cognitiva, linguagem sem bastidor,
ancoragem das práticas, introdução de termos e siglas, coerência entre teoria e
prática, adequação dos resources, fontes e continuidade.

O relatório separa:

1. **Aspectos adequados**, apenas com aprovações relevantes;
2. **Problemas encontrados**, cada um com localização legível, tipo,
   descrição, impacto, gravidade, reparo recomendado e escopo.

Se não houver problema relevante, informe: “Não foram encontrados problemas
semânticos relevantes segundo os critérios aplicados.” Não afirme que a
eficácia do curso foi comprovada.

Sugira reparo quando houver problemas, próxima parte quando não houver ou
reavaliação humana quando existir decisão editorial. Escolha somente uma dessas
próximas etapas e pare.

## 4. Reparo

Repare somente depois da autorização. A pessoa pode aprovar todos os problemas,
alguns deles, alterar a recomendação ou rejeitar o reparo.

Antes de escrever, releia os cards afetados e consulte o contrato dos resources
necessários. Altere somente o escopo aprovado, preserve IDs e posições e não
corrija silenciosamente problemas que ficaram fora da decisão. Validação
estrutural bem-sucedida confirma apenas que o payload é válido; não certifica a
qualidade pedagógica do reparo.

Ao terminar, informe exatamente o que mudou e o que permaneceu sem alteração.
Sugira reauditoria independente e pare.

## 5. Reauditoria

Reaudite somente após autorização e a partir do estado persistido atual.
Verifique a resolução dos problemas anteriores, regressões, novos problemas e
a consistência da parte completa. Não repare na mesma rodada.

Depois do relatório, sugira exatamente uma próxima etapa e espere.

## Escolhas da pessoa autora

A pessoa pode ajustar ou aprovar o plano, limitar a construção, pedir cards ou
práticas, pular auditoria, aprovar apenas alguns reparos, dispensar reauditoria,
marcar conteúdo como pronto ou pedir publicação. Essas escolhas mudam o
procedimento, não o contrato estrutural.

Se a pessoa mandar pular uma etapa, cumpra a próxima ação permitida e registre
brevemente que a auditoria ou reauditoria foi dispensada. Não invente aprovação
humana e não crie estado, token ou trava adicional. Uma prévia privada
`partial` continua publicável e testável com partes incompletas. O catálogo
continua exigindo `complete`.

## Feedback obrigatório

Depois de cada ação editorial relevante, a resposta contém:

1. o que a ferramenta confirmou que foi feito;
2. o resultado útil para avaliação humana;
3. o estado corrente e o que permanece pendente;
4. exatamente uma próxima etapa sugerida;
5. a espera pela decisão da pessoa.

Não execute a etapa sugerida na mesma rodada. Não publique, marque `ready`,
audite, repare ou reaudite automaticamente só porque a etapa anterior terminou.
