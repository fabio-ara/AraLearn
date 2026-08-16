# Analytics instrucionais

O destino **Resultados** reúne descrições versionadas do desenho, do processo
de autoria, do estado estrutural explícito de estudo e de experimentos. Ele não
atribui uma nota única ao curso, ao autor ou ao estudante. Gráfico e tabela
usam a mesma base numérica, e cada visualização aponta para uma definição no
[dicionário de métricas e datasets](dicionario-metricas-datasets.md).

## Como consultar

1. Abra **Autoria**, escolha um workspace e entre em **Resultados**.
2. Leia a pergunta pedagógica de cada seção antes dos valores.
3. Use a tabela como alternativa acessível ao gráfico.
4. Abra **Definição e proveniência** para conferir métrica, versão, unidade,
   denominador, ausências e limites.
5. Pessoas com capacidade `research` podem trocar o recorte do workspace por
   um experimento. A seleção fixa protocolo, condições e revisões correntes.
6. Para conferência externa, exporte CSV ou JSON. O servidor pagina sob o mesmo
   `datasetSetRef`; se o conjunto mudar, a exportação falha em vez de misturar
   revisões.

O overview pode ser relido do cache como `stale` e somente leitura. Linhas,
exportações e novos outcomes exigem conexão. O cache pertence à conta e ao
escopo; trocar conta ou pin não reaproveita a cópia anterior.

## Quatro recortes, sem colapso em score

- **Desenho instrucional:** origem dos valores efetivos; packages, papel
  instrucional, fit e `ResourceSet` efetivamente usados; refs do snapshot e do
  manifesto. Permitido não significa selecionado, e selecionado não significa
  materializado.
- **Processo de autoria:** Partes, materializações e findings não superseded.
  Override não significa erro; Auto não significa qualidade; ausência de
  finding não prova dimensão não verificada.
- **Aprendizagem:** somente conclusão estrutural explicitamente persistida.
  O denominador é `card × seleção`; ausência de estado é mostrada como dado
  indisponível, pois pode refletir falta de sincronização.
- **Experimento:** N atribuído por condição, revisão congelada, completude de
  instrumentos e outcomes descritivos por condição/onda. Participantes aparecem
  por pseudônimo local. Seed, conta, consentimento individual e roster não
  entram na exportação.

## O que não é coletado nem inferido

Cliques, abertura, tempo, velocidade, número de tentativas e uso de revelação
não são tratados como atenção, esforço, domínio ou aprendizagem. O AraLearn não
executa automaticamente teste de hipótese, valor-p, ranking, predição ou
conclusão causal. Uma associação descritiva entre desenho e outcome continua
dependente do protocolo, instrumento, dados ausentes, contexto e explicações
rivais.

## Outcomes explícitos

Um outcome só pode ser registrado para enrollment consentido, ativo e atribuído
a uma `VariantRevision` congelada, enquanto o experimento está coletando. A
observação fixa instrumento, outcome, onda, tipo, instante e revisão. Valor
ausente exige motivo explícito e nunca é imputado automaticamente. Repetir o
mesmo `requestId` devolve o receipt original; tentar reutilizá-lo com outro
payload é rejeitado.

## Resources como dimensão analítica

A leitura conserva `package@version`, família, papel, fit
`canonical|versatile|substitute`, `ResourceSetRef`, limitações e quantidade
materializada. Isso permite confrontar disponibilidade e uso ou distinguir
prática incorporada de resposta quando o manifesto declarou esses papéis. Mais
variedade, mais packages ou fit canônico não são interpretados como melhora.

## Exportação e limites

Os datasets são `authoring_design`, `authoring_process`,
`experiment_assignments` e `experiment_outcomes`, todos em
`schemaVersion: 1.0.0`. Páginas têm no máximo 20 linhas e respostas permanecem
abaixo de 96 KiB. CSV inclui versão, dataset, tipo e JSON canônico da linha;
JSON é emitido em chunks estruturados. A aplicação recebe páginas criadas no
servidor sob um pin imutável e recompõe um único documento JSON
válido ao concluir.

Esses mecanismos demonstram rastreabilidade técnica, não validade educacional.
A regressão integral, stress e avaliação humana permanecem no marco #109.
