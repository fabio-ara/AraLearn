# Plano de controle, workspaces e artefatos

O AraLearn separa informação mutável de conteúdo publicado imutável. Essa arquitetura pode ser compreendida por duas camadas:

- **plano de controle**: relações pequenas que dizem qual objeto existe, quem pode usá-lo, qual revisão está corrente e a que artefato ela aponta;
- **plano de dados**: bytes do curso materializado, armazenados como artefato JSON.

O PostgreSQL mantém o plano de controle e o workspace mutável por partes. O Supabase Storage recebe um documento integral somente quando uma revisão precisa ser distribuída ou fixada para revisão editorial.

## 1. Problema e alternativas

Um curso pode conter milhares de entidades e dezenas de megabytes. Salvar uma cópia integral a cada correção de rótulo é simples, porém multiplica armazenamento, tráfego e custo de validação. Guardar apenas patches sucessivos economiza bytes, mas torna leitura, auditoria e recuperação dependentes de uma cadeia potencialmente longa. Manter tudo numa única linha JSON reduz joins, mas aumenta conflito: duas edições independentes disputam a mesma revisão física.

### Decisão

O workspace conserva o **estado corrente normalizado por partes**. Cada alteração toca somente as entidades necessárias. Eventos guardam recibos e resumos operacionais, não cópias integrais. Quando uma revisão é publicada, o servidor recompõe, valida e grava um único artefato imutável endereçado pelo conteúdo.

### Consequências

- pequenas edições não criam objetos grandes;
- partes diferentes ainda pertencem a uma revisão global coerente;
- publicação e leitura usam um documento completo verificável;
- eventos não oferecem restauração arbitrária de qualquer estado passado;
- versionamento histórico completo, se vier a existir, precisará de política própria de deltas, checkpoints e retenção.

## 2. Workspace composto

Um **workspace** é a composição autoral corrente. Ele não é uma pasta temporária oculta: possui identidade, proprietário, origem opcional, revisão, continuidade e relações visíveis em Trilhas.

`private.authoring_workspaces` guarda metadados da composição. `private.authoring_workspace_entities` guarda uma linha corrente por entidade:

- projeto;
- curso;
- módulo;
- lição;
- tópico;
- microssequência;
- card.

Cada parte informa identidade, pai, posição, conteúdo próprio e versão. O pai não duplica os filhos dentro de seu JSON; a relação estrutural determina a árvore. O servidor recompõe `aralearn.library.v1` quando precisa validar, apresentar um recorte ou publicar.

### Limites explícitos

- até 10 mil partes por workspace;
- até 1 MiB por parte;
- até 32 MiB para o documento recomposto e para o artefato.

Os limites protegem CPU, memória e payload; não representam uma meta pedagógica de quantidade de cards. Uma microssequência deve ter o tamanho exigido pela progressão, respeitando os limites operacionais do documento.

## 3. Continuidade e observações

Continuidade é o contexto compacto necessário para retomar o trabalho: ids das partes relevantes, mandato humano, decisões e achados ativos. Não contém conversa completa, prompt, resposta do modelo, cópia de card ou snapshot da árvore.

Achados formais de auditoria e notas comuns permanecem separados. Um achado tem estado, alvo e decisão verificável; uma nota pertence à pessoa e não recebe automaticamente o mesmo ciclo de retenção. A retomada agrega o recorte ativo, enquanto históricos paginados ficam disponíveis conforme seu contrato.

Essa economia reduz armazenamento e contexto, mas limita reconstrução histórica. Um resumo registra o que foi decidido; não prova por si só todas as alternativas consideradas.

## 4. CAS, versões de parte e idempotência

Uma alteração declara:

- `expectedRevision`: revisão global lida pelo chamador;
- versões esperadas das partes tocadas;
- `requestId`: identidade da intenção;
- inserções, atualizações e exclusões mínimas.

O servidor executa:

```text
procurar recibo idempotente
→ bloquear o workspace
→ comparar revisão global e versões tocadas
→ aplicar a mudança mínima
→ recompor e validar aralearn.library.v1
→ avançar a revisão
→ gravar recibo e resumo
```

**CAS** recusa uma base desatualizada, sem combinação silenciosa. **Idempotência** associa `requestId` ao hash do payload e ao recibo. Repetir a mesma intenção recupera o resultado; reutilizar a identidade com conteúdo diferente é conflito.

Recibos não têm todos a mesma retenção. Observações de workspace usam quatorze dias; governança educacional e estado pessoal usam sete dias; a tabela geral de pedidos autorais não anuncia prazo universal. Cada workspace conserva até 200 eventos recentes.

Transações e bloqueios seguem as garantias do [PostgreSQL](https://www.postgresql.org/docs/current/transaction-iso.html). Bloquear corretamente evita estado parcial, mas não resolve um desacordo pedagógico; após conflito, a pessoa ou agente precisa reler e decidir.

## 5. Cópia e movimento

### Cópia profunda

Copiar remapeia ids da raiz e dos descendentes, inclusive referências internas, e registra a origem. A nova composição pode evoluir sem alterar a fonte. Reutilizar ids faria observações, dependências e edições atingirem o objeto errado.

### Movimento

Mover preserva a identidade, troca pai e posição e remove a localização anterior na mesma transação. Identidades são únicas por tipo no workspace. Assim, movimento expressa continuidade do mesmo objeto; cópia expressa nova linhagem.

## 6. Materialização canônica

**Canonicalizar** significa produzir uma representação determinística do mesmo conteúdo lógico. Ao publicar, a Edge Function:

1. recompõe o curso;
2. valida contrato e packages;
3. ordena chaves segundo a regra canônica;
4. serializa em UTF-8;
5. calcula SHA-256;
6. obtém o caminho derivado do hash.

```text
artifacts/sha256/ab/cd/abcdef...json
```

Dois conteúdos canônicos idênticos produzem o mesmo hash. O objeto não é sobrescrito; o ponteiro da publicação pode avançar para outro hash.

Essa técnica é chamada **content addressing**. Git também identifica objetos pelo conteúdo, embora seu formato e suas garantias não sejam o contrato do AraLearn; a analogia é explicada em [Git Internals — Git Objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects).

### Consequências e limites

O hash detecta alteração e corrupção acidental; não comprova autoria, correção pedagógica nem segurança criptográfica de todo o sistema. Proveniência exige relações e recibos no plano de controle. Assinatura de release é outra propriedade.

## 7. Pré-registro e upload

Antes do primeiro upload, o plano de controle registra hash, caminho, tamanho esperado e estado. Esse **pré-registro** resolve uma falha importante: se a conexão cair depois de enviar bytes, o sistema ainda conhece o objeto potencialmente órfão e pode coletá-lo.

Arquivos pequenos usam upload padrão. Acima de 6 MiB, o roteiro usa TUS retomável; o protocolo permite continuar uma transferência interrompida. Depois do envio, o servidor verifica tamanho, UTF-8, JSON e SHA-256. O commit da publicação confere o descritor novamente e é idempotente.

A documentação de [uploads do Supabase Storage](https://supabase.com/docs/guides/storage/uploads/standard-uploads) e [uploads retomáveis](https://supabase.com/docs/guides/storage/uploads/resumable-uploads) descreve as características do serviço.

## 8. Publicação, vínculo e revisão editorial

O workspace mutável pode ser estudado diretamente em Trilhas sem artefato. O artefato aparece quando uma revisão precisa ser fixada:

| Destino | Estado aceito | Finalidade |
|---|---|---|
| privado | parcial ou completo | distribuição privada ou submissão de revisão exata |
| catálogo | completo | publicação editorial oficial |
| catálogo | parcial | rejeitado |

`private.authoring_workspace_publications` mantém o vínculo leve entre workspace, raiz de curso, destino, `courseId` e hash-base. Na primeira publicação cria a identidade; nas seguintes reutiliza o vínculo e atualiza a mesma publicação. Reiniciar uma conversa não cria outro curso.

Anexar manualmente uma publicação preexistente exige o par indivisível `existingCourseId` e `expectedContentHash`. O hash impede associar o workspace a uma base diferente da que foi revisada.

Retirar uma publicação desativa distribuição, seleções e alias, mas não apaga o workspace. Uma submissão editorial aponta para hash privado exato e retém o artefato enquanto estiver ativa. A pessoa revisora pode abrir cópia independente; suas alterações não modificam silenciosamente o original.

## 9. Coleta de lixo

**Coleta de lixo** remove artefatos que não são mais alcançáveis por nenhuma referência válida.

O coletor:

1. lista somente descritores antigos e sem referência;
2. reivindica o descritor com tombstone transacional;
3. remove o objeto do Storage;
4. confirma a exclusão ou devolve a referência para nova tentativa.

Revisões ativas e submissões permanecem protegidas. Uma reserva cujo upload nunca criou o objeto pode ser encerrada quando o Storage confirma ausência. A janela de idade reduz corridas entre upload, publicação e coleta.

Excluir imediatamente seria mais simples, mas um timeout poderia apagar um objeto que acabou de ser publicado. Nunca coletar preservaria segurança de referência, porém consumiria Storage indefinidamente.

## 10. Tráfego, CPU e armazenamento

A arquitetura torna o custo proporcional a:

- partes efetivamente alteradas no workspace;
- revisões de conteúdo distintas;
- seleções e estados pessoais leves;
- janela de eventos e recibos mantida.

Ela evita custo proporcional ao número de estudantes multiplicado pelo tamanho integral do curso. Ainda assim, recompôr e validar um documento grande consome CPU, e downloads iniciais consomem egress. Métricas de tamanho, tempo, falhas de upload e coleta precisam ser observadas no ambiente real.

## 11. Evidência no repositório

| Propriedade | Implementação principal | Evidência |
|---|---|---|
| workspace por partes | migrations de workspace e `workspaceEngine.js` | testes de engine e PGlite |
| CAS e idempotência | RPCs de commit e tabelas de requests | testes de conflito e replay |
| continuidade compacta | migrations `2026080901*` e `workspaceContinuity.js` | testes de continuidade |
| canonicalização e hash | `src/storage/canonicalRevision.js` e funções de publicação | testes de revisão e artefato |
| pré-registro e coleta | migrations do plano de artefatos e RPCs de GC | testes de Storage e GC |
| entrega autorizada | `aralearn-course-revisions` | testes Deno, runtime e smoke |

Uma suíte aprovada demonstra os cenários codificados. Recuperação diante de desastre, custo no plano contratado e comportamento sob carga exigem ensaios operacionais adicionais.
