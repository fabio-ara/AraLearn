# Arquitetura-alvo do AraLearn

## Tese de produto

O AraLearn deve consolidar-se como um sistema em que a organização pedagógica ampla e a intervenção local durante o estudo pertencem à mesma arquitetura, em vez de funcionarem como produtos quase separados.

## Princípios não negociáveis

- a microssequência é a unidade didática central;
- o card é unidade de interação, não de planejamento;
- a IA não detém soberania didática;
- o usuário preserva possibilidade real de autoria, auditoria e correção;
- o fluxo estrutural e o fluxo local compartilham o mesmo núcleo conceitual;
- falha operacional não pode corromper o projeto.

## Núcleo arquitetural

O produto deve continuar apoiado em quatro frentes:

- core didático;
- engine de produção por fases;
- runtime de providers;
- registry de configuração.

## Fluxo estrutural desejado

O fluxo estrutural deve:

- organizar corpus amplo em trilha pedagógica;
- produzir cursos, módulos, lições e microssequências planejadas;
- registrar metadados suficientes para navegação e continuidade;
- evitar pré-materialização massiva de cards como comportamento padrão.

## Fluxo local desejado

O fluxo local deve:

- materializar microssequências sob demanda;
- permitir correção, expansão, edição e reformulação;
- operar por patch mínimo;
- preservar o restante da trilha sempre que possível.

## Superfícies de uso

O usuário comum deve encontrar uma experiência simples. O usuário avançado pode acessar parâmetros mais finos de provider, prompt, seed e perfil. A arquitetura-alvo não rejeita controle avançado; ela apenas não deve impô-lo como condição de uso.

## Fidelity by design

A fidelidade à fonte não depende apenas de “citar documento”. Ela depende de ingestão, recorte, governança, grounding mínimo, auditoria e possibilidade de revisão local.

## Critério de sucesso

O sucesso arquitetural do AraLearn não é apenas “gerar muito”. É conseguir:

- organizar bem;
- tornar navegável;
- permitir estudo real;
- aceitar intervenção humana;
- manter coerência entre estrutura e prática.
