# Arquitetura do AraLearn

O contrato público do AraLearn é propositalmente mais simples do que a sua operação interna. A arquitetura existe justamente para preservar essa assimetria: um JSON autoral enxuto, portável e legível de um lado; uma máquina local responsável por projeção, validação, persistência, assistência e revisão do outro.

## Visão geral

O núcleo estrutural do produto continua sendo:

```text
curso -> módulo -> lição -> microssequência -> card
```

Essa hierarquia não é só organização da interface. Ela funciona como moldura para persistência, importação e exportação, contexto de geração e progressão de estudo.

## Camadas

O repositório se organiza em seis grandes frentes.

`contract/` define e valida o contrato público. `model/` e `render/` projetam esse contrato para leitura. `editor/` executa mutações estruturais. `storage/` preserva projeto, snapshots e progresso local. `assist/` integra os provedores de IA. `generation/` concentra políticas, planejamento, validação e reparo. `ui/` reúne a navegação estrutural, o estudo e o workbench.

O ponto importante aqui é que a camada de geração não substitui a arquitetura; ela é apenas uma parte dela.

## Uma arquitetura para conter a geração

Na trilha de cards, o AraLearn foi desenhado para que a LLM não controle a operação em sentido amplo. Ela não define sozinha o percurso, não fixa posições livremente, não decide a forma de todas as unidades interativas e não aplica o resultado por conta própria. O app mantém autoridade sobre:

- o contexto;
- a governança da lição;
- as opções didáticas disponíveis;
- o plano determinístico dos cards;
- os formatos permitidos;
- a validação local;
- a aplicação final do resultado.

Essa decisão arquitetural traduz em software uma convicção metodológica: respostas de linguagem natural precisam ser contidas por estrutura quando o objetivo é produzir material estudável e repetível.

## O pipeline real

O fluxo real da geração de cards é incremental. Um pedido localizado produz contrato de planejamento; o modelo devolve um plano pequeno; o app valida; o app monta `cardPlan`; o modelo preenche; o app repara e valida; o resultado só então é aplicado.

Essa decomposição existe por duas razões. A primeira é pragmática: melhora previsibilidade com modelos mais fracos. A segunda é conceitual: impede que a aplicação terceirize à LLM uma decisão que pertence à arquitetura.

## Governança da lição

A maior parte da inteligência operacional da geração está ancorada na lição. É a lição que define meta, notação, erros prováveis, formatos permitidos, ações de aprendizagem e nível de apoio. O pedido do usuário continua importante, mas passa a atuar sobre um quadro já delimitado.

Essa escolha reduz ambiguidade e permite que top-down e bottom-up trabalhem sobre a mesma base local.

## Mapa de domínio

Quando presente, o `domainMap` funciona como memória operacional da lição. Ele registra capacidades relevantes, variações de prática, lacunas e estados de cobertura. Isso permite que a aplicação trate a geração de microssequências não como fila cega de títulos, mas como tentativa de cobrir funções reais do percurso.

Arquiteturalmente, esse é um ponto importante: o sistema deixa de depender apenas do texto de uma solicitação e passa a usar um estado local persistível sobre o andamento didático da lição.

## Checagens locais

Uma parte delicada da arquitetura está na camada de checagens locais. Ela precisa ser descrita com precisão. O AraLearn não executa interpretação semântica ampla de texto livre. O que ele faz é combinar checagens estruturais, checagens declarativas e sinais textuais de baixa força.

As checagens estruturais verificam contrato, quantidade, forma e coerência local. As checagens declarativas verificam relações explicitadas pela própria modelagem, como prática ausente, variação insuficiente ou duplicação sem nova função. Os sinais textuais observam padrões evidentes demais para serem ignorados, mas não são tratados como compreensão forte do enunciado.

Arquiteturalmente, isso é decisivo porque define o que a aplicação pode fazer de modo legítimo. Ela pode bloquear, reiterar ou recusar quando a base é forte o bastante; pode apenas sinalizar quando a base é fraca demais.

## Continuação automática

A continuação automática da geração não é laço cego de insistência. Ela é política de restrição adicional. Quando a falha remanescente é suficientemente forte, o AraLearn transforma esse diagnóstico em nova operação fechada: reescrever posição específica, inserir mediação mínima, adiar uma lacuna para outra microssequência ou recusar redundância. Quando o problema é apenas textual e fraco, a arquitetura correta é não exagerar o poder da máquina.

## Aplicação direta e reversibilidade

O resultado validado é aplicado diretamente na microssequência. Isso recoloca a geração dentro do fluxo real de autoria, em vez de deixá-la num limbo de prévia privada. Ao mesmo tempo, a arquitetura preserva reversibilidade por histórico local: a iteração ativa pode ser aceita ou excluída.

Essa combinação de aplicação direta e reversão explícita é uma escolha arquitetural e também de UX. Ela reduz atrito de uso sem abandonar responsabilidade editorial.

## Local-first

O compromisso local-first e offline-first atravessa a arquitetura inteira. Projeto, progresso, snapshots e histórico auxiliar vivem prioritariamente no dispositivo. A rede entra como canal de geração, não como condição permanente de funcionamento do estudo. Essa escolha reforça autonomia, portabilidade e continuidade.

## O que esta arquitetura de fato sustenta

A arquitetura do AraLearn sustenta, com clareza, algumas afirmações: que a tarefa da LLM é restringida; que o sistema valida localmente parte importante da operação; que o estudo pode continuar com material já salvo; que a separação entre rascunho, revisão e execução é parte real do produto.

Ela não sustenta a afirmação de que o app compreende livremente qualquer texto em sentido forte. E é melhor que não sustente.
