# Arquitetura-alvo do AraLearn

Este documento substitui a lógica de evolução por remendo. Ele descreve o AraLearn desejado.

## Tese de produto

O AraLearn existe para receber acervo acadêmico bruto, disperso e heterogêneo e transformá-lo em uma trilha estudável, progressiva, autossuficiente e de baixo atrito.

O público-alvo principal não é o usuário especialista em pedagogia nem em IA. É o estudante que precisa de direção, clareza, prática e continuidade sem ter de configurar o motor didático.

## Princípios não negociáveis

- a UX comum deve ser simples;
- a complexidade deve ficar no núcleo interno, não na superfície;
- a LLM não pode ser a autora soberana da didática;
- top-down e bottom-up devem obedecer ao mesmo núcleo pedagógico;
- prompts, contratos, thresholds e políticas voláteis devem ser parametrizáveis;
- providers devem ser separados da lógica didática;
- o projeto deve ser legível, testável e estudável por terceiros.

## Núcleo arquitetural

O AraLearn deve ser dividido em quatro camadas.

### 1. Core didático

Define:

- progressão pedagógica;
- microssequência como unidade central;
- critérios de cobertura;
- dependências e pré-requisitos;
- política de explicação de siglas e termos;
- política de prática;
- política de auditoria;
- regras de intervenção bottom-up.

Nada nessa camada deve depender de provider, prompt ou UI.

### 2. Engine de produção

Executa o fluxo interno:

1. ingestão do acervo;
2. planejamento pedagógico;
3. planejamento de microssequências;
4. construção de cards;
5. auditoria;
6. reparo;
7. consolidação.

O app internaliza aqui o antigo raciocínio `Planner -> Builder -> Auditor`.

### 3. Runtime de providers

Responsável por:

- Gemini, OpenAI, provider local e futuros providers;
- retry, fallback e timeout;
- budget de contexto e custo;
- cache e fragmentação por fase;
- adaptação para modelos fracos e fortes.

Essa camada não decide didática.

### 4. Registry de configuração

Responsável por:

- prompt packs;
- contract packs;
- profiles didáticos;
- thresholds;
- políticas de exaustividade;
- roteamento por provider.

O usuário comum usa o profile default. O usuário avançado e a pesquisa podem recalibrar sem reescrever o motor.

## Fluxo top-down desejado

O top-down ideal não começa por cards.

Ele deve:

1. ler o acervo;
2. extrair objetivos, sinais de avaliação e convenções do professor;
3. gerar `domainMap`, vocabulário obrigatório, pré-requisitos e envelope de prática por lição;
4. planejar microssequências com ordem auditável;
5. só então gerar cards.

## Fluxo bottom-up desejado

O bottom-up ideal não deve replanejar o curso inteiro a cada comentário.

Ele deve:

1. classificar a intervenção local;
2. escolher a menor resposta didaticamente suficiente;
3. responder a dúvida ou reparar a lacuna;
4. reconectar explicitamente à trilha;
5. preservar continuidade e baixo atrito.

## Superfícies de uso

### Usuário comum

- envia material;
- descreve o objetivo;
- recebe a trilha;
- estuda;
- comenta;
- recebe correção ou expansão local.

### Usuário avançado

Pode ajustar:

- profile didático;
- provider;
- prompt pack;
- contract pack;
- thresholds e budgets.

Essa superfície deve existir sem contaminar a experiência comum.

## Seed de perfis

O AraLearn deve operar com um `seed` forte por padrão. O seed inicial do projeto é o perfil geral de ADS. Sobre ele, o sistema pode expor perfis especializados e generalizações futuras.

Leitura correta:

- o usuário comum não precisa escolher isso para usar o app;
- o usuário avançado pode trocar o seed ou sobrescrever partes dele;
- a parametrização deve acontecer por profiles, prompt packs e contract packs, não por prompt livre desgovernado.

## Critério de sucesso

O AraLearn só estará arquiteturalmente correto quando a simplicidade externa estiver sustentada por um núcleo interno rigoroso, parametrizável e independente de provider.
