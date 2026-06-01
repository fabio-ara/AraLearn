# Documentação do AraLearn

Esta pasta descreve o AraLearn em camadas complementares. Cada documento responde a uma pergunta diferente e deve ser lido pelo problema que resolve, não como duplicata do outro. O objetivo desta organização é permitir leitura seletiva sem perda de contexto principal.

## Mapa de leitura

### 1. O que o produto é

- [Visão do produto](visao-do-produto.md)
  Explica que problema o AraLearn enfrenta, qual é sua proposta e como ele se posiciona em relação a outras ferramentas de estudo, autoria e consulta.

- [Modelo didático](modelo-didatico.md)
  Explica por que a microssequência é a unidade central, como teoria e prática se articulam e que papel cada tipo de card cumpre na trilha.

### 2. Como o produto é usado

- [Uso do app](uso-do-app.md)
  Descreve o fluxo operacional de uso: definir escopo, planejar a trilha, abrir uma microssequência, gerar ou corrigir cards, estudar, revisar versões e seguir adiante.

### 3. Como o sistema é organizado

- [Arquitetura](arquitetura.md)
  Descreve a organização do software, a persistência do projeto, as camadas de código, o histórico de execução e a relação entre contrato, geração, validação e renderização.

- [Contrato público](aralearn-contract.md)
  Especifica o formato JSON persistido pelo app, com entidades, campos, invariantes e exemplos.

- [Recursos de card](recursos-de-card.md)
  Especifica os recursos de card aceitos pelo contrato e a função didática de cada um.

### 4. Como a geração assistida funciona

- [Assistência por IA](assistencia-por-ia.md)
  Explica o papel do serviço textual, o papel do app, a seleção de contexto, o uso de campos controlados e a governança da autoria assistida.

- [Fluxos, prompts e contratos de geração](fluxos-prompts-e-contratos.md)
  Detalha os envelopes enviados aos serviços, as etapas do planejamento estrutural e da geração local, e as validações aplicadas em cada fase.

### 5. Em que base teórica e crítica o projeto se apoia

- [Fundamentos, pesquisa e governança](fundamentos-pesquisa-e-governanca.md)
  Reúne o enquadramento pedagógico, as tensões críticas, as hipóteses de design, as perguntas de pesquisa e a bibliografia consolidada do conjunto.

### 6. Integrações específicas

- [Codex CLI local](integrations/codex-cli.md)
  Descreve o uso do AraLearn com um serviço local que encaminha pedidos ao Codex CLI.

- [Compartilhamento no Android](integrations/android-share-import.md)
  Descreve o recebimento de arquivos compartilhados no APK.

## Caminhos sugeridos

Para conhecer o produto:

1. [Visão do produto](visao-do-produto.md)
2. [Modelo didático](modelo-didatico.md)
3. [Uso do app](uso-do-app.md)

Para entender a implementação:

1. [Arquitetura](arquitetura.md)
2. [Contrato público](aralearn-contract.md)
3. [Recursos de card](recursos-de-card.md)
4. [Fluxos, prompts e contratos de geração](fluxos-prompts-e-contratos.md)

Para leitura de fundamentação e pesquisa:

1. [Visão do produto](visao-do-produto.md)
2. [Modelo didático](modelo-didatico.md)
3. [Fundamentos, pesquisa e governança](fundamentos-pesquisa-e-governanca.md)
4. [Arquitetura](arquitetura.md)

## Referências e bibliografia

As referências a produtos, serviços e tecnologias aparecem distribuídas nos documentos em que são necessárias ao argumento. A bibliografia acadêmica consolidada do conjunto está em [Fundamentos, pesquisa e governança](fundamentos-pesquisa-e-governanca.md#referências-bibliográficas). Quando um autor aparece em outro arquivo por citação abreviada, a entrada completa está ali.

## Exemplos e testes

- [Exemplos JSON](examples/) — contratos e documentos usados em demonstração, validação e testes automatizados.
