# Autoria de cursos para o AraLearn

Este diretório reúne as regras e os artefatos necessários para produzir cursos do AraLearn em etapas. O mesmo assistente planeja o curso, constrói uma parte de cada vez, examina o que produziu e só publica depois de concluir a validação integral.

O curso publicado continua obedecendo ao contrato público `aralearn.contract` versão 3. A API recebe artefatos de trabalho pequenos, mantém o rascunho no banco e materializa a árvore didática em linhas relacionais. Nenhum assistente recebe acesso direto às tabelas nem à credencial administrativa do Supabase.

## Como o trabalho avança

1. O autor fornece objetivo, público, fontes, profundidade e restrições.
2. O assistente abre uma execução e grava um plano compacto, com o manifesto do registro e os contornos das partes.
3. Fontes, afirmações e termos são enviados em trechos; a API confere as quantidades e finaliza o planejamento.
4. A API indica a próxima parte, e o assistente grava somente a especificação detalhada dessa parte.
5. O assistente produz o fragmento, relê o que foi persistido e o examina em um passo separado.
6. Um problema localizado gera reparo; um fragmento inadequado é reconstruído sob a mesma especificação. Uma base incorreta bloqueia ou cancela a execução.
7. A próxima parte só é liberada depois da aprovação da anterior.
8. A publicação exige todas as partes aprovadas e o documento remontado validado pelo AraLearn.

As regras completas estão em [core/workflow.md](core/workflow.md). Os formatos trocados com a API ficam em [schemas](schemas/).

## Conteúdo

- `core/`: fluxo, estados, critérios de qualidade, uso de fontes e segurança;
- `knowledge/`: contrato v3, recursos de card, termos, continuidade entre partes e publicação;
- `schemas/`: esquemas JSON dos artefatos de autoria;
- `examples/`: uma execução completa, pequena e coerente;
- `platforms/`: instruções de instalação para diferentes assistentes;
- `docs/aralearn-contract.md`: contrato completo do documento v3;
- `docs/recursos-de-card.md`: campos e exemplos dos onze recursos de card;
- `docs/openapi/aralearn-authoring-api.yaml`: descrição da API usada pelas integrações que aceitam OpenAPI.

## Pacotes para download

Execute:

```powershell
npm.cmd run authoring:packages
```

O comando cria pacotes reproduzíveis em `docs/downloads/authoring/`, além de um manifesto e hashes SHA-256. Cada pacote contém o núcleo comum e somente as instruções próprias da plataforma escolhida.

Downloads:

- [núcleo comum](https://github.com/fabio-ara/AraLearn/raw/main/docs/downloads/authoring/aralearn-authoring-core.zip);
- [ChatGPT](https://github.com/fabio-ara/AraLearn/raw/main/docs/downloads/authoring/aralearn-authoring-chatgpt.zip);
- [Gemini](https://github.com/fabio-ara/AraLearn/raw/main/docs/downloads/authoring/aralearn-authoring-gemini.zip);
- [Microsoft 365](https://github.com/fabio-ara/AraLearn/raw/main/docs/downloads/authoring/aralearn-authoring-microsoft-365.zip);
- [Claude](https://github.com/fabio-ara/AraLearn/raw/main/docs/downloads/authoring/aralearn-authoring-claude.zip);
- [integração genérica](https://github.com/fabio-ara/AraLearn/raw/main/docs/downloads/authoring/aralearn-authoring-generic.zip);
- [hashes SHA-256](https://github.com/fabio-ara/AraLearn/raw/main/docs/downloads/authoring/SHA256SUMS.txt).

| Pacote | Integração disponível |
|---|---|
| ChatGPT | GPT personalizado com Action baseada na especificação OpenAPI |
| Gemini | Gem clássica para planejamento e geração de arquivos; Skill para ambientes compatíveis com ferramentas e MCP |
| Microsoft 365 | Agente no Copilot Studio com OpenAPI 2.0, ferramenta REST ou conector personalizado |
| Claude | Project para conhecimento e instruções; conector MCP remoto quando habilitado |
| Genérico | Instruções e protocolo para qualquer assistente capaz de chamar uma API HTTPS |

Planos, licenças e recursos variam conforme o fornecedor. O material não presume gratuidade nem promete funções que a plataforma não oferece.

O pacote ChatGPT gera um único `KNOWLEDGE.md` com as regras, os esquemas e o contrato necessários. A cópia do OpenAPI incluída nele aceita somente a chave restrita de autoria e não expõe a importação integral. A especificação geral permanece disponível para o AraLearn e para clientes que usam sessão Supabase. O pacote Microsoft 365 inclui uma variante OpenAPI 2.0 própria para o Copilot Studio.

## Referências do próprio projeto

- [Contrato público do AraLearn](https://github.com/fabio-ara/AraLearn/blob/main/docs/aralearn-contract.md)
- [Recursos de card](https://github.com/fabio-ara/AraLearn/blob/main/docs/recursos-de-card.md)
- [API de autoria](https://github.com/fabio-ara/AraLearn/blob/main/docs/openapi/aralearn-authoring-api.yaml)
- [Persistência relacional](https://github.com/fabio-ara/AraLearn/blob/main/docs/persistencia-relacional.md)
