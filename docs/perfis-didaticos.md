# Perfis didáticos

O AraLearn passa a tratar a parametrização avançada como `seed de perfil`, não como prompt solto.

## Regra central

O usuário comum não precisa escolher perfil técnico para usar o app. O sistema deve operar por padrão com um seed forte. O usuário avançado, a pesquisa e integrações externas podem trocar ou recalibrar o perfil sem quebrar as invariantes do produto.

## Perfil default

O seed padrão atual é:

- `aralearn.engine.ads.general.v3`

Ele representa o caso de uso imediato do projeto: estudante de ADS lidando com disciplinas como álgebra linear, engenharia de software, teoria dos grafos, lógica de programação, shell Linux, linguagem C e administração.

## Perfis especializados atuais

- `aralearn.engine.ads.math.v1`
  Direcionado a disciplinas matemáticas formais, com mais mediação de notação, contraste e concretização.

- `aralearn.engine.ads.programming.v1`
  Direcionado a programação procedural, com explicação palavra por palavra, progressão operacional e prática incremental.

- `aralearn.engine.ads.systems.v1`
  Direcionado a shell, terminal, ferramentas e workflows operacionais.

- `aralearn.engine.ads.theory.v1`
  Direcionado a disciplinas conceituais, analíticas e de modelagem.

## Perfis de generalização futura já previstos

- `aralearn.engine.languages.v1`
  Para estudo de idiomas.

- `aralearn.engine.research-reading.v1`
  Para leitura acadêmica, fundamentos e avaliação de argumentos.

- `aralearn.engine.project-programming.v1`
  Para programação por projeto, com progressão conforme o raciocínio do programador ideal.

## O que um perfil pode mudar

- densidade de prática;
- política de exaustividade;
- orçamento de microssequências por lição;
- tolerância a abstração;
- tratamento de siglas, notação e inglês técnico;
- regras de top-down e bottom-up;
- prompt packs e contract packs.

## O que um perfil não pode quebrar

- a hierarquia `curso -> módulo -> lição -> microssequência -> card`;
- a microssequência como unidade didática;
- card autossuficiente;
- ausência de pressupostos ocultos;
- separação entre planejamento, construção e auditoria;
- separação entre lógica didática e provider.
