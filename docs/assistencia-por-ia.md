# Assistência por IA

## O lugar da IA no AraLearn

O AraLearn não foi concebido como um chat de estudo que ocasionalmente exporta cards. A IA entra no produto como parte de um sistema maior de organização, materialização localizada e revisão do percurso.

Isso muda a pergunta central. Em vez de perguntar apenas qual modelo escreve melhor, o projeto pergunta como organizar a tarefa para que o resultado faça sentido dentro de uma trilha estudável, corrigível e persistente.

## O que a IA faz no app

Hoje a IA é usada principalmente para:

- organizar material amplo em cursos, módulos, lições e microssequências;
- materializar conteúdo dentro de uma microssequência planejada;
- corrigir, expandir ou reformular conteúdo já existente;
- continuar o trabalho didático sem perder a referência da trilha.

O foco, portanto, não está em “gerar tudo”, mas em ajudar a dar forma a um percurso e intervir nele quando necessário.

## Por que o app não depende só de prompt livre

Boa parte da proposta do AraLearn está em não reduzir a experiência a uma conversa aberta com o modelo.

O sistema tenta estruturar o problema antes de pedir texto. Para isso, usa hierarquia do projeto, orientação da lição, ingestão das fontes, artefatos intermediários, contratos explícitos, auditoria e aplicação por patch. Essa lógica dialoga com o que hoje se discute como specification-driven development: o modelo não recebe apenas um pedido, mas trabalha dentro de um processo mais delimitado.

## É RAG?

Há no produto elementos que lembram RAG, porque o app extrai texto das fontes, organiza esse material, preserva referências internas e pode recuperar partes relevantes durante a geração.

Ainda assim, chamar o AraLearn simplesmente de sistema RAG seria pouco preciso. O coração do produto não é responder perguntas sobre documentos, mas transformar material e intenção de estudo em uma trilha editável, além de intervir localmente nessa trilha depois. Em outras palavras: há grounding e recuperação localizada, mas o desenho geral está mais próximo de autoria estruturada do que de pergunta e resposta documental.

## Controle humano e revisão

O AraLearn parte do princípio de que um bom sistema de estudo assistido por IA precisa manter o usuário em posição de revisar e corrigir o resultado.

Por isso, a pessoa usuária pode:

- editar títulos, descrições e orientação da lição;
- revisar a estrutura gerada;
- aceitar, excluir ou reformular iterações;
- alterar cards manualmente;
- exportar e versionar o projeto.

A IA ajuda, mas não recebe a palavra final sobre o material.

## Modelos acessíveis e operação local

O produto procura funcionar também em cenários de orçamento estudantil. Isso explica a ênfase em decomposição da tarefa, redução de ruído por ingestão, contratos pequenos, auditoria localizada e materialização progressiva.

Além de providers por API, o projeto também suporta provider local via `Codex CLI`. Esse caminho amplia a autonomia operacional do app, embora ainda exija preparação técnica do ambiente.

## Um limite importante

Sem conexão, o AraLearn continua útil para estudo, navegação e revisão do que já está salvo localmente. Já as operações criativas que dependem de LLM continuam condicionadas ao provider disponível.

Esse limite não diminui o produto; ele apenas define com clareza onde termina a operação local autônoma e onde começa a dependência de geração assistida.
