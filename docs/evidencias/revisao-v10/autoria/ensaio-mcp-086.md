# Primeira produção por MCP após a publicação 0.0.86

## Condições e pedido

Em 27/09/2026, a versão hospedada era 0.0.86, commit `76d6a2a4a61e3111e422c9e6f152dc6bafbdbb24`, catálogo de tarefas 9.0.0. O operador atualizou as ferramentas da conexão MCP e abriu uma conversa nova no ChatGPT Chat, com raciocínio Médio e AraLearn selecionado, no Chrome normal persistente. Não forneceu rascunhos corrigidos, schemas ou instruções técnicas ao autor. Enviou às 05:33:49 UTC:

> Continue o curso “Do sinal à decisão: como representamos situações para prever o que acontece depois”, na etapa “Quem pertence a quê?”. Quero desenvolver essa etapa inteira para uma pessoa iniciante, seguindo o planejamento e as condições já definidos: explicação suficiente, exemplos, atividades que mostrem o que ela aprendeu e retorno que ajude a entender seus acertos e erros. Pode seguir até deixar essa etapa pronta, sem parar para minha revisão.

Antes do pedido, o curso estava na revisão 55, com 25 microssequências, seis explicações e nenhuma unidade. Os 12 parâmetros do recorte estavam em automático, ainda sem valores aplicados; isso não caracteriza 12 escolhas pedagógicas já realizadas.

## Persistência e auditoria do primeiro estado

O fluxo encerrou após 12m59s. O estado preservado na revisão 67 contém uma nova explicação com três parágrafos, 179 palavras, três ideias e três requisitos de evidência. Permanecem zero unidades em todas as 25 microssequências. A releitura após o encerramento confirmou a revisão 67. Nenhum feedback externo foi enviado antes dessa preservação.

A auditoria textual do agente não encontrou erro didático claro nos três parágrafos: eles distinguem pertencimento, interseção e relações por pares e apresentam critérios de escolha. Isso é um parecer sobre conteúdo parcial. Não permite avaliar uma prática inexistente, seu feedback, uma representação interativa ainda não produzida ou a aplicação efetiva dos parâmetros. Os demais títulos, objetivos, planejamentos e vínculos de escopo permaneceram iguais aos da revisão 55.

O GPT relatou que a pré-validação aceitara nove unidades, mas que a gravação falhara repetidamente, inclusive numa tentativa reduzida. As nove unidades alegadas não estão no estado persistido; não são contabilizadas como produção concluída nem como qualidade comprovada. O GPT informou corretamente que a etapa ainda não estava pronta para Estudo.

## Aterrissagem e interação

O [destino devolvido pelo GPT](https://fabio-ara.github.io/AraLearn/#/authoring/courses/68d099a5-60d6-4a26-bd93-4a990a4789c3?section=content&explanationId=0e39733a-a30f-8dcd-8b8e-c7b9161bb987) abriu a explicação persistida. A inspeção autônoma conferiu a [largura conceitual mobile no host web](exp7-mcp-086-desktop.jpg), o [início em 390 px](exp7-mcp-086-390.jpg) e o [final alcançado por rolagem](exp7-mcp-086-390-final.jpg). Os três parágrafos estão acessíveis; a página tem clientWidth e scrollWidth de 390 px. Esta medição se refere ao documento, não ao diagrama, que ainda não existe neste conteúdo.

O clique em fechar devolveu o foco ao botão da explicação, com [contorno inteiro visível](exp7-mcp-086-retorno-foco.jpg). A interface informa “Nenhuma unidade de estudo materializada”. As capturas sequenciais acompanham navegação, rolagem e fechamento reais; não atribuem prova de prática, feedback ou avanço a esse conteúdo parcial. O viewport temporário foi restaurado após a inspeção.

## Causa técnica comprovada

As cinco recusas de gravação registradas entre 05:44:55 e 05:46:33 UTC apontam o mesmo SQLSTATE `23514` e a mesma linha do escritor real. A consulta somente de leitura ao código da função hospedada confirmou a condição: uma dependência curricular precisa estar produzida ou integrar o mesmo lote de produção. A etapa solicitada depende de “Hierarquia não é a mesma coisa que rede”, que ainda não possuía unidades.

A pré-validação não verificava essa condição, enquanto o adapter convertia a recusa em “Os dados do Curso são inválidos”. O defeito demonstrado é a divergência entre a preparação e a gravação, acompanhada de informação insuficiente para recuperação. A regra de dependência não deve ser removida apenas para fazer o ensaio passar. A escolha de um recorte sem esse pré-requisito produzido também limita o ensaio planejado.

Três erros `22023` ocorreram antes disso na consulta de unidades. O código hospedado os associa à validação dos argumentos da consulta; sem os argumentos exatos ou uma reprodução equivalente, não se atribui uma causa específica a esses três eventos.

## Canal, contexto e limites

Este foi um fluxo real do GPT pelo MCP. A configuração das Actions foi salva e relida nesta versão, mas isso não atribui a elas a produção deste registro. As consultas SQL e a exportação feita pelo operador são diagnóstico e preservação de evidência, não autoria do GPT. Códigos HTTP 200/202 do protocolo não provam sucesso de cada operação de negócio.

O painel Fontes mostrou dois chats anteriores e uma memória relacionados ao AraLearn. Foram observados títulos e trechos curtos; não se infere recuperação integral de rascunhos. Assim, embora o operador não tenha fornecido correções anteriores, a conversa nova não estabelece isolamento desse contexto. O resultado é evidência diagnóstica, não prova independente da qualidade produzida por padrão.

A exportação integral, os registros literais da interface e os logs sanitizados permanecem no pacote privado desta execução. Nenhum resultado desta intervenção constitui validação humana pós-correção.
