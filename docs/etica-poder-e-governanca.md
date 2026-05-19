# Ética, poder e governança

AraLearn não deve ser apresentado apenas como solução técnica para organizar estudo. A mesma arquitetura que pode ajudar o usuário a transformar informação dispersa em percurso também pode intensificar problemas éticos clássicos: controle, padronização, vigilância, redução do conhecimento a desempenho e delegação excessiva da formação a sistemas automatizados.

Este documento registra esses riscos como parte do projeto.

## Ponto de partida

O AraLearn organiza conhecimento em uma estrutura explícita:

```text
curso -> módulo -> lição -> microssequência -> card
```

Essa estrutura pode dar orientação, continuidade e prática. Mas também pode enquadrar demais o estudo, induzir respostas esperadas, registrar padrões de comportamento e transformar aprendizagem em sequência de tarefas mensuráveis.

Por isso, a questão ética não é externa ao produto. Ela está no centro do desenho.

## Lyotard: conhecimento, bancos de dados e performatividade

Lyotard é relevante para o AraLearn porque sua análise da condição pós-moderna trata diretamente da transformação do estatuto do conhecimento em sociedades informatizadas.

Na modernidade, a legitimação do saber foi frequentemente associada a ideias como verdade, emancipação, razão pública e finalidade ética. Na sociedade tecnocientífica e telemática, Lyotard observa o deslocamento da legitimação para critérios de desempenho, eficiência, operacionalidade e circulação em sistemas informacionais.

Esse ponto toca diretamente o AraLearn.

O app nasce para resolver um problema real: há informação demais e pouca estrutura de estudo. No entanto, ao transformar conhecimento em trilhas, microssequências, cards, validações e versões, ele também participa da tendência de converter saber em unidade operacional. O risco é que aprender deixe de significar formação, interpretação e juízo, e passe a significar apenas percorrer etapas, responder corretamente e otimizar desempenho.

Outro ponto importante é a centralidade dos bancos de dados. Em um mundo em que a realidade concreta é mediada por bases de dados, interfaces e permissões de acesso, o saber disponível a cada pessoa depende de sua posição técnica, econômica, institucional e social. AraLearn pode reduzir esse problema quando opera localmente, exporta contratos e preserva autoria. Mas pode ampliá-lo se depender de APIs inacessíveis, modelos fechados, chaves pagas ou curadorias opacas.

A pergunta lyotardiana para o AraLearn é:

> o app ajuda o usuário a se apropriar criticamente do conhecimento, ou apenas adapta o usuário a uma lógica de eficiência informacional?

## Foucault: disciplina, exame e normalização

Foucault é pertinente porque o AraLearn também pode ser pensado como tecnologia de organização, observação e normalização.

Em sua análise das instituições disciplinares, Foucault mostra como práticas de classificação, vigilância, exame, correção e treinamento produzem sujeitos ajustados a determinados regimes de conduta. O problema não é apenas haver coerção explícita. O poder também opera por rotinas, métricas, registros, espaços organizados e critérios de normalidade.

AraLearn pode se aproximar desse risco quando transforma estudo em sequência de etapas controladas:

- define o que entra e o que fica fora;
- ordena o percurso;
- registra versões e escolhas;
- mede avanço por status;
- induz respostas por lacunas e feedback;
- cria histórico detalhado do que o usuário viu, errou, corrigiu ou aceitou.

Em uso pessoal e local, isso pode favorecer estudo e revisão. Em uso institucional, corporativo ou escolar, pode virar mecanismo de controle: monitorar desempenho, padronizar pensamento, exigir percursos, punir desvios, classificar estudantes ou trabalhadores e reduzir aprendizagem a conformidade.

A pergunta foucaultiana para o AraLearn é:

> a estrutura ajuda o usuário a governar o próprio estudo, ou torna o usuário mais governável por uma instituição, uma plataforma ou um modelo?

## IA e delegação da produção do saber

A integração com IA amplia o risco.

Quando o usuário delega a um modelo a geração de explicações, exemplos e exercícios, há ganho de acesso e produtividade. Mas há também perda possível de pluralidade, dependência de formulações dominantes, reprodução de vieses e padronização do modo de pensar.

O perigo não é apenas a IA errar. O perigo é a IA acertar de modo estreito: produzir uma versão fluente, plausível e funcional do saber, mas alinhada a uma perspectiva limitada, invisibilizando conflito, dúvida, historicidade e interpretação.

Em um app educacional, isso é particularmente sensível. A IA não entrega apenas texto. Ela pode organizar a sequência pela qual o usuário aprende a perceber um assunto.

## Risco behaviorista

AraLearn usa cards, lacunas, feedback e progressão. Esses recursos podem favorecer prática. Mas também podem reduzir aprendizagem a treinamento de resposta.

O risco behaviorista aparece quando o app passa a valorizar apenas acerto imediato, reforço, repetição e avanço operacional. Nesse caso, o estudante aprende a responder ao sistema, não necessariamente a compreender o problema.

Para evitar isso, a microssequência precisa manter explicação, exemplo, contraste, prática e reflexão. O feedback não deve servir apenas para premiar ou corrigir; deve ajudar o usuário a entender por que uma resposta faz sentido.

## Riscos concretos

Riscos que o projeto deve reconhecer:

- transformar conhecimento em mera sequência de tarefas;
- confundir aprendizagem com desempenho mensurável;
- reforçar visão única produzida por IA;
- padronizar linguagem, exemplos e critérios;
- ocultar disputas conceituais ou históricas;
- induzir dependência do usuário em relação ao modelo;
- registrar detalhes demais sobre estudo, erro, dúvida e preferência;
- permitir uso institucional para vigilância ou punição;
- criar assimetria entre quem controla o sistema e quem apenas executa a trilha;
- converter revisão didática em normalização de comportamento.

## Diretrizes de governança

O AraLearn deve adotar salvaguardas compatíveis com sua própria arquitetura.

### Autoria visível

O usuário deve ver e editar a estrutura. A IA não deve ocultar o processo de organização.

### Escopo reversível

O que entra e o que fica fora deve ser explícito, revisável e exportável.

### Versões preservadas

Alterações não devem apagar o percurso anterior sem possibilidade de inspeção.

### Mínimo de telemetria

O app deve evitar coleta desnecessária de dados de estudo. Quanto mais íntimo o dado cognitivo, maior o dever de minimização.

### Local-first

A persistência local reduz dependência de servidor e favorece controle do usuário. Quando houver API remota, o envio de contexto deve ser claro.

### Pluralidade de fontes

A geração por IA deve poder ser confrontada com anotações, bibliografia, professor, documentação, listas e revisão humana.

### Exportação

O projeto deve permanecer exportável em contrato público, para evitar aprisionamento em uma plataforma.

### Não substituir juízo

O app deve apoiar estudo, não decidir sozinho o que é verdadeiro, importante ou suficiente.

## Critério ético de projeto

Uma formulação simples pode guiar o AraLearn:

> a estrutura deve aumentar a capacidade do usuário de compreender, revisar e se apropriar do material; não apenas aumentar sua eficiência em cumprir tarefas.

Esse critério não elimina o risco. Ele apenas torna o risco visível e discutível.

## Consequência para a documentação

A documentação do AraLearn deve evitar duas formas de ingenuidade:

1. apresentar o app como solução neutra para aprendizagem;
2. rejeitar toda estrutura didática por ela poder servir ao controle.

O ponto mais honesto é reconhecer a ambivalência: a mesma arquitetura que organiza estudo pode organizar controle. O valor do projeto depende de suas escolhas de governança, de sua abertura à revisão humana e do modo como será usado.
