# Direção arquitetural

Este documento registra a direção arquitetural do AraLearn para manter coerência entre produto, modelo didático e implementação.

## Princípios

- A microssequência é a unidade didática central.
- O card é a unidade de interação.
- O planejamento estrutural organiza a trilha antes dos cards.
- A materialização local opera na microssequência selecionada.
- O provider executa operações, mas não governa o domínio.
- Respostas inválidas não substituem o projeto.
- O contrato público permanece legível, exportável e validável.
- A interface comum deve mostrar o necessário para estudar e revisar, não todo o aparato interno.

## Produto esperado

O usuário deve conseguir:

- definir um curso ou tema;
- recortar módulos por termos que entram e ficam fora;
- gerar uma trilha planejada;
- reconhecer microssequências sem cards;
- abrir uma microssequência;
- gerar cards;
- estudar;
- corrigir ou complementar;
- avançar para a próxima etapa;
- marcar o que está pronto.

## Motor esperado

O motor deve operar por fases pequenas e auditáveis:

- validar escopo;
- montar contexto;
- chamar provider;
- validar resposta;
- reparar quando possível;
- aplicar alteração ao projeto;
- preservar versão anterior;
- registrar relatório de validação.

Nem toda operação usa todas as fases. O importante é que a aplicação ao projeto seja sempre controlada.

## Fronteiras

A arquitetura deve evitar três excessos:

1. pedir que a IA descubra todo o curso a partir de material desorganizado;
2. gerar volume demais antes de o usuário estudar;
3. expor metadados internos como se fossem parte do uso comum.

Ao mesmo tempo, deve preservar precisão suficiente para que usuários técnicos auditem contratos, providers, versões e recursos de card.

## Critério de sucesso

A arquitetura está alinhada quando o usuário consegue usar o app sem conhecer seus detalhes internos, mas o projeto continua compreensível para quem precisa manter, auditar, adaptar ou pesquisar o sistema.
