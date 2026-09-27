# Recibo de inspeção sem duplicação da base — 0.0.88

A revisão MS9 pela versão 0.0.87 corrigiu conteúdo, mas relatou falha ao registrar o parecer de IA. As cinco recusas hospedadas tinham SQLSTATE `23514` e apontavam a linha 43 de `private.record_course_ai_inspection_v1`. A consulta posterior, somente de metadados, confirmou que essa linha insere em `private.course_change_receipts` e que a constraint real exige objeto JSONB com `pg_column_size(result) <= 65536`. Os logs não nomearam a constraint; linha e definição foram confirmadas separadamente, sem ler argumentos privados ou executar escrita remota.

O resultado inserido incluía a base pedagógica completa. Uma reprodução local sobre subconjunto do export rev122 já mediu 76.502 bytes, antes de incluir o próprio parecer e outros campos. A constraint literal recusou esse resultado. Como o recibo integra a transação, sua falha reverte também a atualização da inspeção e da revisão.

## Correção

A migração `20260928094500_compact_ai_inspection_receipts.sql` substitui somente o corpo do escritor privado. As leituras continuam retornando a base completa, com conteúdo, declarações, parâmetros, dependências, fontes e citações. A resposta de uma nova gravação retorna identidade, revisão, hash, estado e parecer, sem repetir `pedagogicalBasis`, campo já opcional nesse contrato.

O recibo guarda os metadados do resultado original, sem base pedagógica e sem outra cópia do parecer. Em replay, o servidor verifica autorização, curso, operação e o hash do pedido, que vincula tipo/alvo, hash da base e parecer. Só depois recompõe `inspection.report` usando o mesmo `p_report` recebido. Não consulta o parecer corrente do alvo para reconstruir o resultado anterior.

Isso conserva timestamp, revisão, `changed` e conteúdo do resultado original mesmo após um parecer posterior ou alteração da base. Um novo pedido com hash obsoleto continua recusado. A chave do pedido e o lock do curso permanecem. Recibos anteriores à migração são preservados e continuam reproduzindo seus campos originais.

Não há novos inputs, reconstrução de IDs/hashes pelo produtor, cache, tabela ou aumento do limite global de 64 KiB. Schema, adapter, handler MCP/Actions e normalizador já aceitam a resposta de gravação compacta; nenhuma alteração neles foi necessária. O getter, as barreiras de grounding e os controles de acesso permanecem intactos.

## Por que retirar somente a base não basta

Os limites existentes permitem 42.000 pontos de código nos campos textuais do parecer: resumo de 2.000, vinte findings de 1.000, cinco razões de 1.000 e trinta evidências de 500. Em UTF-8, esses valores podem ocupar 168.000 bytes, antes dos nomes e estruturas JSON.

O teste preencheu todos esses limites com Unicode de quatro bytes em um parecer `needs_attention` válido. O normalizador JS, o validador SQL e o grounding aceitaram o caso; seu tamanho JSONB foi **168.788 bytes**. Por isso o recibo não pode conter outra cópia do parecer, mesmo sem a base. O parecer integral continua salvo na inspeção do alvo e retornado ao chamador.

## Validação focal

A fixture `course-ai-inspection-pglite.test.js` passou a carregar a constraint literal da migração original, que antes não estava representada no teste. Uma base sintética completa com dez unidades, duas de ensino e oito práticas, produziu **104.708 bytes** no payload de leitura. O escritor anterior falha com `23514`; após a migração, a gravação passa, a leitura conserva a mesma base e o recibo ocupa **480 bytes**. O caso do parecer máximo também produziu recibo de 480 bytes. Esses números descrevem as fixtures, não um tamanho máximo universal do recibo.

As provas cobrem controle pequeno, rollback da falha antiga, replay após parecer posterior e alteração da base, conflito de pedido, troca de curso/tipo/alvo, negação de acesso após mudança de proprietário, fontes/âncoras, grounding e inspeção protegida. Duas submissões do mesmo pedido criam um único resultado e incremento de revisão; PGlite as serializa em uma conexão, portanto essa prova não substitui concorrência entre sessões PostgreSQL hospedadas.

Foram aprovados 18 casos focais distintos: sete SQL/PGlite, três de domínio/cliente/UI, sete do handler humano e um do adapter. Os dois casos novos de tamanho falharam antes da implementação e passaram depois. Na integração, a raiz corrigiu um achado de lint no regex que extrai a constraint, conferiu ESLint e repetiu os três casos novos após reordenar o arquivo de migração: todos passaram, com os mesmos tamanhos medidos. Não foram executados gates pesados ou escrita remota nesta prova focal.

## Estado da entrega

A migração e os testes estão preparados localmente. O arquivo ainda não aplicado foi reordenado após a última migração já publicada, preservando o SQL e evitando inserir uma migração atrás do histórico remoto. O identificador ordena a implantação; não afirma que a execução ocorreu em 28/09. Esta correção não altera assinatura RPC ou contrato de leitura. A aplicação e verificação hospedadas permanecem pendentes da integração pela raiz.

Não foi registrado novo parecer no curso real. A informação de que o registro falhou na revisão 0.0.87 continua válida; esta prova técnica não constitui julgamento pedagógico nem registro retroativo.
