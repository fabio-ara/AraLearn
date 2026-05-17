# Fundamentos e evidências

## Como ler este documento

O AraLearn tem fundamentos pedagógicos, técnicos e filosóficos, mas este texto não pretende transformar o produto em tese pronta nem em vitrine conceitual. O objetivo aqui é indicar com honestidade quais ideias ajudam a orientar o desenho do app, quais autores e tradições dialogam com ele e quais pontos ainda dependem de pesquisa empírica.

## Estrutura antes de volume

Uma convicção central do projeto é que aprender não se reduz a acumular informação. Em muitos casos, o problema mais difícil está em dar forma ao percurso: distinguir pré-requisito de aprofundamento, explicação de prática, passo central de detalhe periférico.

Por isso, o AraLearn trata a microssequência como unidade didática central. O card continua importante, mas ele ganha mais força quando está situado numa pequena sequência com função clara.

## Microlearning, mas com função

O produto conversa com a literatura de microlearning apenas parcialmente. A redução de escala interessa ao AraLearn porque diminui carga cognitiva e facilita continuidade em rotinas fragmentadas. Mas o objetivo não é fragmentar por fragmentar.

Uma microssequência faz sentido quando é curta e também funcional. Ela precisa cumprir um papel: introduzir, explicar, contrastar, praticar, revisar ou preparar a continuação.

## Recuperação ativa, prática e revisão

O desenho do app também dialoga com pesquisas sobre active recall, prática de recuperação, worked examples, feedback e revisão. Em linhas gerais, a proposta do produto assume que compreensão tende a melhorar quando o estudante:

- precisa recuperar ativamente uma noção;
- pratica procedimentos em vez de apenas reler;
- compara casos próximos;
- encontra erros comuns de forma explícita;
- recebe uma progressão que não salta etapas demais.

Aqui o diálogo é compatível com autores e tradições como Robert e Elizabeth Bjork, John Sweller, Richard Mayer e pesquisas sobre worked examples, faded guidance e gestão de carga cognitiva.

## Mediação e progressão

O AraLearn também se aproxima de tradições que valorizam mediação e progressão em vez de exposição abrupta. Em termos amplos, isso conversa com debates presentes em didática, psicologia educacional e teorias histórico-culturais do aprendizado.

Sem transformar o app em aplicação direta de um único autor, há afinidade com a ideia de que aprender envolve apoio estruturado, passagem entre níveis de autonomia e reconstrução ativa do conteúdo, não mera recepção passiva.

## IA sob forma arquitetada

Do ponto de vista técnico, o produto parte da hipótese de que modelos de linguagem funcionam melhor quando a tarefa é decomposta, contextualizada e validada. Daí a ênfase em contratos, artefatos intermediários, auditoria e patch.

Essa escolha dialoga com discussões recentes sobre specification-driven development e sobre o uso de modelos de linguagem em pipelines estruturados, em vez de depender apenas de prompt livre. O AraLearn tenta incorporar essa direção sem empurrar complexidade técnica para a superfície principal de uso.

## Grounding, recuperação e limites do rótulo RAG

O app também incorpora práticas de grounding: ingestão de fontes, extração textual, preservação de trechos úteis e recuperação localizada de informação para orientar a geração. Isso o aproxima de parte da literatura e da engenharia em torno de RAG.

Mesmo assim, o rótulo não dá conta de tudo. O AraLearn não foi pensado principalmente como sistema de pergunta e resposta sobre documentos, e sim como sistema de organização didática, autoria assistida e continuidade do estudo. Se há algo de RAG aqui, ele aparece como componente de grounding dentro de uma arquitetura mais ampla.

## Persistência local, autonomia e continuidade

A persistência local do projeto não é um detalhe técnico qualquer. Ela responde a uma situação concreta de uso: estudar com tempo escasso, conexão instável e atenção dividida. Guardar o percurso no dispositivo permite reler, revisar e retomar sem depender continuamente da rede.

Essa escolha também reforça autonomia, rastreabilidade e controle editorial do material.

## O que o AraLearn pode afirmar com segurança

Hoje o AraLearn pode afirmar, com boa base de projeto e implementação, que foi desenhado para:

- organizar conteúdo amplo em trilhas de estudo revisáveis;
- permitir materialização progressiva em vez de geração massiva;
- preservar autoria e correção humana;
- combinar persistência local com assistência por IA;
- funcionar como apoio real a rotinas de estudo fragmentadas.

O que ele não deve afirmar sem pesquisa específica é que produz melhora garantida de aprendizagem em qualquer público, disciplina ou contexto.

## Referências e diálogos

O projeto dialoga, em graus diferentes, com:

- literatura sobre microlearning;
- active recall e retrieval practice;
- cognitive load theory;
- worked examples e faded guidance;
- autoria assistida com human-in-the-loop;
- grounded generation e recuperação localizada;
- specification-driven development;
- software com persistência local e autonomia de uso.

Essas referências servem para orientar a leitura do produto e para abrir caminho a pesquisa futura. Não substituem revisão bibliográfica formal nem validam automaticamente os efeitos do app.
