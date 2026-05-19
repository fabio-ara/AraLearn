# Evolução do Motor, API e UI/UX do AraLearn

> Nota histórica: este documento registra o diagnóstico que motivou a reconstrução.
> A especificação corrente da arquitetura aplicada está em [nova-arquitetura-llm-api.md](nova-arquitetura-llm-api.md).


## Objetivo deste documento

Este documento consolida uma leitura crítica do AraLearn atual e propõe uma direção mais enxuta para o produto, com foco em uso real por estudantes e profissionais, respeitando os limites práticos de LLM via API.

Ele foi escrito para apoiar discussão arquitetural. Não descreve uma implementação já concluída. Ele descreve:

- como o motor atual está organizado;
- onde existe valor real;
- onde há sinais de overengineering;
- por que o top-down atual tende a falhar com entradas cruas e extensas;
- como UI/UX e engine podem convergir para um produto mais simples e mais útil.

## Tese principal

O AraLearn não precisa ser refeito do zero. O motor atual contém várias peças boas e reaproveitáveis.

Mas o produto, do jeito que evoluiu, acumulou complexidade demais no topo da pilha:

- top-down profundo demais para o estágio do produto;
- semântica interna demais para o valor entregue ao usuário comum;
- dependência excessiva de entrada crua e extensa;
- confiança excessiva em um pipeline multi-fase para casos que poderiam ser tratados com contratos menores e mais baratos.

A proposta deste documento é:

- preservar a árvore pública e o coração do runtime local;
- simplificar fortemente o top-down;
- reduzir a semântica enterrada;
- mover a inteligência fina para um bottom-up governado por um contrato de estudo pequeno;
- adaptar a UI para uma coleta de escopo mais estruturada e menos dependente de prompt livre.

## O que o AraLearn está tentando resolver

O AraLearn não é só um gerador de cards.

O problema que ele tenta resolver é:

- receber material de estudo, intenção e contexto de cobrança;
- transformar isso em trilha estudável;
- permitir evolução local e progressiva da trilha;
- manter aderência suficiente ao recorte que realmente importa para o usuário.

Esse problema aparece em vários cenários:

- estudante de ADS seguindo disciplina e professor específicos;
- profissional aprendendo uma ferramenta como Excel;
- pessoa estudando para concurso com foco em cobrança;
- acadêmico lendo artigos, capítulos, teses ou materiais técnicos;
- estudante com base irregular que precisa extrair fundamentos antes de avançar.

O núcleo correto do produto continua sendo forte:

- transformar conteúdo em trilha;
- permitir estudo incremental;
- controlar o escopo;
- evitar expansão enciclopédica desnecessária.

## Como o motor atual está organizado

## Estrutura pública

O contrato público atual é coerente e deve ser mantido:

```text
project
└── course
    └── module
        └── lesson
            └── microsequence
                └── card
```

Essa árvore já é suficientemente boa para:

- persistência;
- navegação;
- importação/exportação;
- materialização progressiva;
- estudo real.

Ela não é o problema principal.

## Separação conceitual atual

O desenho atual do produto parte de uma distinção correta:

- `top-down`: planeja trilha;
- `bottom-up`: materializa ou corrige conteúdo local.

Essa distinção também não é o problema principal. O problema está no peso e na profundidade do top-down.

## Pipeline atual do top-down

Hoje o fluxo de referência do `CourseForge` contém fases como:

1. `normalize_intent`
2. `ingest_sources`
3. `build_source_ledger`
4. `build_assessment_profile`
5. `plan_architecture`
6. `audit_architecture`
7. `repair_architecture`
8. `plan_lessons`
9. `build_course_graph`
10. `audit_course_graph`
11. `repair_course_graph`
12. `build_lesson_governance`
13. `plan_microsequences`
14. `audit_microsequences`
15. `repair_microsequences`
16. `compile_patch`
17. `validate_patch`
18. `apply_patch`
19. `final_report`

Esse pipeline é defensável do ponto de vista de auditabilidade, mas pesado demais como estratégia geral de produto.

## Peças boas do motor atual

Apesar do overengineering, o motor atual tem ativos valiosos:

- árvore pública clara;
- patching e validação antes de aplicar alterações;
- separação razoável entre runtime de provider e lógica do motor;
- noção de `SourceLedger` e evidência;
- progressos por fase;
- bottom-up já encaixado em torno de microssequência;
- runtime local forte o suficiente para continuar estudo sem replanejar tudo;
- testes e harness já existentes.

Essas peças justificam evoluir a partir do motor atual, e não recomeçar.

## Onde o produto mostra sinais de overengineering

## 1. Top-down profundo demais para entradas cruas

O top-down atual tende a partir de anexos, prompt livre e contexto amplo para tentar produzir:

- arquitetura;
- lições;
- mapa semântico;
- microssequências planejadas;
- auditorias e reparos em cadeia.

Isso é caro, lento e frágil, especialmente com LLM via API.

O efeito prático é:

- timeout;
- custo alto;
- baixa previsibilidade;
- dificuldade de escalar para usuários comuns;
- excesso de latência logo no começo da experiência.

## 2. Dependência excessiva de semântica enterrada

O motor internalizou muitas estruturas semânticas úteis, como:

- `domainMap`;
- `domainRefs`;
- `practiceVariantRefs`;
- `coverageRole`;
- `didacticPurpose`;
- `assessmentTargets`;
- várias diretivas intermediárias de auditoria e reparo.

Parte disso tem valor.

Mas o conjunto ficou maior do que o produto precisa para gerar valor real ao usuário comum. Em vez de ser apenas infraestrutura interna, essa complexidade começou a ditar o desenho do produto.

## 3. UI ainda carregando promessas caras demais

A superfície de `Gerar estrutura` ainda nasce próxima de uma ideia implícita de:

- subir material;
- escrever um pedido;
- deixar a IA descobrir o curso.

Isso é sedutor, mas pouco realista para uso acadêmico sério e para limites de API.

## 4. Modelo mental excessivamente universal no top-down

O motor tentou acomodar desde cedo:

- disciplina formal;
- conteúdo instrumental;
- estudo acadêmico;
- corpus extenso;
- listas de exercícios;
- uso local;
- geração estrutural ampla;
- auditoria forte.

Esse universalismo é bom como ambição, mas gera um topo de sistema pesado demais.

## 5. Custo estrutural desproporcional ao benefício

Muitas decisões corretas em isolamento somam uma sobrecarga operacional:

- muitas chamadas ao provider;
- muitos artefatos intermediários;
- muito contexto recombinado;
- muito esforço de planejamento antes de o usuário estudar algo.

## O que os limites de LLM via API mudam

Uma conclusão importante da discussão é:

**LLM via API não funciona bem como base de um top-down profundo ancorado em fontes extensas e desorganizadas.**

Os motivos práticos são simples:

- custo em tokens;
- latência;
- limites de contexto úteis, mesmo quando o contexto nominal é grande;
- baixa robustez para material cru;
- structured outputs melhores em contratos pequenos do que em planejamento amplo;
- grounding melhor com trechos selecionados do que com corpus inteiro reenviado.

Logo, o problema não é só “o prompt está ruim”. O próprio formato da entrada precisa mudar.

## O uso real do produto e o que ele exige

O caso de uso acadêmico descrito na conversa é decisivo:

- o usuário precisa seguir disciplina específica;
- o escopo depende do professor;
- a ordem depende da disciplina;
- teoria e prática importam;
- o que cai e o que não cai importam;
- listas e provas são evidência muito mais forte do que completude enciclopédica.

Esse uso real mostra que o AraLearn não pode depender de uma IA “descobrindo o curso do zero” a partir do caos.

Mas também mostra que o produto não pode virar só um bottom-up solto.

O produto precisa de governança de escopo.

## Releitura correta de top-down e bottom-up

## O top-down ainda é necessário, mas não do jeito atual

O AraLearn ainda precisa de top-down, mas num papel mais modesto:

- capturar contorno da disciplina ou do estudo;
- dizer o que entra;
- dizer o que não entra;
- dizer quais blocos existem;
- dizer quais evidências mandam;
- dizer o perfil de cobrança em nível grosso.

Isso é muito diferente de “gerar curso completo do zero a partir de anexos”.

## O bottom-up deve ser o motor principal de execução

O bottom-up é o lugar mais natural para:

- materializar conteúdo;
- corrigir progressão;
- responder dúvidas;
- ampliar prática;
- criar nova microssequência quando necessário;
- continuar estudo dentro da trilha.

## Síntese da proposta

O desenho proposto é:

- `top-down`: governança leve;
- `bottom-up`: execução forte.

Ou:

- top-down define disciplina, curso, ferramenta ou corpus em nível de contorno;
- bottom-up realiza a aprendizagem em nível operacional.

## O novo papel da ingestão

## O que não deve mais ser a ingestão principal

Não deve ser o fluxo principal:

- anexar material cru extenso;
- colar prompt longo;
- pedir para a API montar toda a trilha a partir disso.

Isso pode continuar existindo como apoio, mas não como estratégia central.

## O que deve passar a ser a ingestão principal

A ingestão principal deveria ser um **contrato de escopo compacto e governado**, preferencialmente por módulo.

Esse contrato pode nascer de três formas:

1. preenchimento manual pelo usuário;
2. geração por GPT externo ou outra etapa preparatória;
3. extração assistida pelo próprio AraLearn a partir de anexos.

## Proposta de contrato mínimo de estudo

O AraLearn precisa de um contrato pequeno, transversal a vários usos.

Exemplo de campos:

- nome do curso, disciplina, ferramenta ou trilha;
- observação curta do objetivo;
- evidência prioritária;
- módulos;
- por módulo:
  - nome;
  - o que entra;
  - o que não entra;
  - observações curtas opcionais.

Opcionalmente:

- estilo de cobrança ou uso em nível alto:
  - `teórico`
  - `prático`
  - `misto`

Mas isso deve continuar leve e governar só o contorno. A materialização fina pertence ao bottom-up.

## Proposta de UI/UX para ingestão

## Diagnóstico da UI atual de geração estrutural

Hoje a UI de geração estrutural ainda depende demais de:

- texto livre;
- anexos;
- e um pedido genérico à IA.

Mesmo com camadas adicionais de configuração, isso não reduz o custo cognitivo real do usuário.

## Proposta de superfície nova

A superfície de top-down deveria se parecer mais com um construtor de escopo.

### Bloco do curso

- nome do curso ou disciplina;
- nota curta opcional;
- evidência prioritária:
  - lista de exercícios
  - aula/caderno
  - apostila
  - documentação
  - artigo
  - mistura

### Blocos de módulo

Cada módulo teria:

- `Nome do módulo`
- `O que entra`
- `O que não entra`
- `Observações` curtas opcionais

### Interação por chips

Para `O que entra` e `O que não entra`, a UI ideal é de tags/chips:

- usuário digita;
- aperta `Enter` ou clica em `+`;
- o termo vira chip;
- o chip pode ser removido;
- os módulos podem ser adicionados com botão `+ novo módulo`.

Exemplo:

**Módulo: Lógica proposicional**

- O que entra:
  - `conectivos`
  - `tabelas-verdade`
  - `diagrama de Venn`
  - `equivalências lógicas`
  - `inferências lógicas`
- O que não entra:
  - `lógica de predicados`

**Módulo: Vetores e matrizes**

- O que entra:
  - `definição de vetor`
  - `operações com vetores`
  - `matriz inversa`
  - `transformações`
- O que não entra:
  - `autovalores`
  - `diagonalização`

## Por que essa UI é melhor

Esse formato é melhor porque:

- é barato em tokens;
- é fácil para usuário comum preencher;
- é fácil para GPT externo gerar;
- é fácil para API consumir;
- reduz ambiguidade;
- força respeito ao escopo;
- continua flexível para disciplinas, ferramentas e concursos.

## O que ainda pode existir como apoio

A UI ainda pode permitir:

- anexos;
- nota livre;
- importação de fonte-guia em Markdown;
- geração assistida de módulos a partir de material.

Mas isso deve alimentar o contrato principal, não substituí-lo.

## Como a API deveria ser usada

## Uso ideal da API no novo top-down

A API não deveria mais receber, como caminho principal:

- muitos arquivos crus;
- prompt longo;
- pedido amplo e pouco delimitado.

Ela deveria receber:

- contrato de escopo;
- breve nota de contexto;
- no máximo um resumo factual curto;
- talvez sinais de evidência prioritária.

Com isso, a API pode gerar:

- curso;
- módulos;
- lições;
- objetivos curtos por lição;
- sugestão de ordem.

Opcionalmente, pode sugerir microssequências planejadas, mas isso não deveria ser obrigatório no primeiro passo.

## O que deve sair do top-down

O top-down novo deve parar em algo como:

- estrutura navegável;
- objetivos;
- cobertura aproximada;
- lacunas evidentes;
- pronto para bottom-up.

## O que deve sair do top-down atual

Deve deixar de ser expectativa central:

- profunda ancoragem em material extenso em todas as fases;
- múltiplas auditorias pesadas para cada uso comum;
- descoberta ampla do curso a partir de anexos crus;
- excesso de semântica necessária antes de o usuário estudar.

## Papel da fonte-guia

O exemplo do Markdown de Teoria dos Grafos discutido na conversa mostra um ponto importante:

esse tipo de arquivo já não é “material bruto”. Ele é quase uma fonte-guia estruturada.

O AraLearn deveria suportar explicitamente esse caso:

- importar uma fonte-guia;
- converter para um contrato leve de escopo;
- revisar o resultado;
- só então chamar a API.

Ou seja: o produto precisa reconhecer a diferença entre:

- material bruto;
- evidência factual;
- fonte-guia já consolidada.

## O que fazer com a semântica enterrada atual

## O que manter

Vale manter internamente:

- `domainMap`, se ele continuar ajudando o bottom-up e a auditoria local;
- `domainRefs`, se continuarem servindo para continuidade de microssequência;
- patching, validação e aplicação segura;
- `SourceLedger` e extração de evidência;
- progresso, run state e harness.

## O que reduzir

É desejável reduzir:

- dependência de semântica complexa já no top-down;
- multiplicação de artefatos sem valor direto para o fluxo do usuário;
- exigência de contratos ricos demais antes de o estudo começar;
- modelagem excessiva da cobrança dentro do topo do sistema.

## Regra prática

Se um conceito interno:

- não melhora diretamente o bottom-up;
- não protege uma aplicação de patch;
- não evita erro recorrente de escopo;
- e não ajuda a API a operar com menos custo,

então ele é candidato forte a simplificação ou remoção.

## Proposta de arquitetura-alvo

## Camada 1: contrato de escopo

Entrada principal do top-down:

- curso ou disciplina;
- módulos;
- o que entra;
- o que não entra;
- notas curtas;
- evidência prioritária.

## Camada 2: top-down leve

Responsável por:

- estrutura coarse-grained;
- lições;
- objetivos;
- ordem.

Sem dependência de material bruto extenso como input principal.

## Camada 3: bottom-up governado

Responsável por:

- materializar conteúdo;
- responder dúvida;
- corrigir microssequência;
- expandir prática;
- crescer a trilha localmente.

Sempre governado pelo contrato de escopo e pela estrutura já existente.

## Camada 4: grounding pragmático

Responsável por:

- resumir fontes;
- recuperar trechos úteis;
- tratar exercícios e listas como evidência prioritária;
- evitar reenvio de corpus inteiro a cada fase.

## O que isso permite

Esse desenho continua servindo a:

- ADS;
- disciplinas formais;
- Excel e ferramentas;
- concursos;
- leitura acadêmica;
- cursos temáticos.

Porque o contrato de escopo continua pequeno e flexível.

## O que não precisa ser decidido agora

Este documento não exige decidir imediatamente:

- formato final de todo `domainMap`;
- se microssequência continua sendo produzida no top-down ou só no bottom-up;
- quantas fases exatas do `CourseForge` permanecerão;
- se a importação de Markdown vira função pública ou avançada.

Essas decisões podem ser feitas depois.

O importante agora é fixar a direção:

- top-down menor;
- contrato de entrada mais explícito;
- bottom-up mais central;
- menos dependência de material cru;
- menos overengineering.

## Diretrizes concretas para a refatoração

1. Preservar a árvore pública atual.
2. Preservar patching e validação.
3. Preservar o runtime local de microssequência.
4. Redefinir o top-down como governança leve.
5. Introduzir uma UI de escopo por módulo com `O que entra` e `O que não entra`.
6. Transformar anexos em apoio ao contrato de escopo, não em entrada principal.
7. Reduzir a dependência de semântica enterrada no topo do sistema.
8. Reposicionar a API para trabalhar sobre contratos compactos.
9. Usar bottom-up como centro da materialização real.

## Conclusão

O AraLearn não parece fracassar por falta de arquitetura. Ele parece sofrer por excesso de arquitetura no topo do fluxo.

O produto já tem ativos suficientes para evoluir sem recomeçar:

- estrutura pública;
- engine;
- patch;
- runtime local;
- testes;
- linguagem de produto.

O trabalho principal agora não é inventar mais camadas. É remover peso.

A melhor direção, hoje, parece ser:

- um top-down menor, mais barato e mais previsível;
- uma ingestão estruturada por módulos;
- uma UI de escopo simples;
- uma API usada com contratos compactos;
- um bottom-up forte, governado e progressivo.

Esse caminho preserva o valor central do AraLearn e o aproxima mais do uso real que motivou o produto.
