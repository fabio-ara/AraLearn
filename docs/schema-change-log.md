# Alterações do schema

## 20260905062817 — identidade e acesso público

A migration `20260905062817_public_course_access_and_identity.sql` introduz identificadores escolhidos pelas pessoas e leitura pública de cursos. Perfis conservam UUID e avatar; o identificador inicial fica vazio até a escolha. Os nomes anteriores são preservados em `private.person_profile_identity_migration_backup`, sem permissão para clientes nem leitor de runtime. Cursos existentes e novos permanecem privados por padrão.

A publicação exige confirmação do proprietário e política explícita de arquivos. O bucket continua privado. Exceções de arquivo prevalecem sobre as da fonte; estas prevalecem sobre a política do curso. As RPCs públicas projetam somente dados de estudo. Visitantes não precisam de conta; pessoas autenticadas podem enviar suas próprias observações, sem editar o curso.

O vínculo das cópias próprias existentes migra para `courses.copy_origin`, antes da remoção da tabela de vínculos e do comando que criava cópias automaticamente. A projeção pública exclui essa origem. A recuperação é somente leitura: confirma o alvo ainda próprio por origem e hash da edição inicial, informa as revisões atuais e não reaplica o rascunho. Falta de prova produz `unresolved`, preservando a pendência local.

### Preflight e recuperação operacional

Antes de aplicar, é obrigatório manter backup verificado do banco e dos objetos necessários, com restauração ensaiada em ambiente descartável. Confira a lista de migrations pendentes e a revisão do manifesto. A aplicação é transacional e rejeita vínculos cujo proprietário diverge do ator ou cuja origem é o próprio alvo; esses casos exigem reconciliação comprovada antes do corte. Não deduza uma pessoa pelo nome ou e-mail e não descarte mappings incompatíveis para fazer a migration passar.

Não execute reset em um ambiente com dados a preservar. Uma reversão que restaure o escritor anterior depende do backup ensaiado e de uma janela de manutenção; trocar apenas o código não recompõe o schema retirado. O arquivo privado de nomes e `copy_origin` preservam dados úteis à migração, sem manter um caminho alternativo de runtime.

### Verificação focal

- `supabase test db supabase/tests/009_runtime_manifest_test.sql` verifica o manifesto e as fronteiras correntes.
- `supabase test db supabase/tests/011_public_course_access_test.sql` verifica identificadores, grants, publicação, negações, observações e acesso aos PDFs com fixtures sintéticas em transação.
- O ensaio de upgrade usa os arquivos `tests/fixtures/sql/011_public_access_upgrade_seed.sql`, `011_public_access_upgrade_preflight.sql`, `011_public_access_upgrade_assert.sql` e `011_public_access_upgrade_cleanup.sql`, nessa ordem relativa à aplicação da migration: seed e preflight antes; assert e cleanup depois. Eles usam uma lista literal de UUIDs reservados e ficam fora da descoberta normal dos testes do banco.

No ensaio local, passaram 63 verificações do estado final, 17 de upgrade e 2 de falha fechada. A recuperação foi comprovada também sem recibo temporário, após retirada da unidade e após remoção da origem, conservando o alvo próprio. Essa prova local não substitui a conferência do manifesto e dos clientes no ambiente de implantação.

## 20260905070040 — guarda de upload de avatar

A migration `20260905070040_fix_person_avatar_storage_profile_guard.sql` retira da policy de inserção do Storage a consulta direta a `person_profiles`, cuja leitura ampla foi revogada. Reutiliza a guarda protegida existente, que valida sessão, perfil e exclusão de conta sob lock. As condições de proprietário, caminho e bucket permanecem. Nenhum diretório de perfis é aberto.

O teste `supabase/tests/012_person_avatar_storage_policy_test.sql` passou 16 verificações locais: upload e leitura próprios, busca no contexto do curso, relação de compartilhamento, negações para outra pessoa e visitante, sessão expirada e bucket privado. Ele exercita policies com identidades sintéticas em transação; a transferência de bytes depende da jornada real de Storage.

## 20260905070507 — metadados atômicos e projeção de citações

A migration `20260905070507_atomic_course_metadata_and_public_citations.sql` estende o comando existente de composição com `courseMetadata: {title, objective}` opcional. Título, objetivo, entidades e atribuições usam a mesma transação, revisão esperada e recibo. A edição focal de unidade rejeita metadados do curso. A ausência do argumento conserva as chamadas existentes e seus hashes; as assinaturas substituídas são retiradas.

A projeção de citações deixa de expor `verificationExcerpt`, preservando o valor útil na tabela privada. O preflight confere as definições que serão transformadas e falha se os pontos esperados não existirem; não aplica uma reescrita parcial silenciosa.

## 20260905071622 — política pública de PDF independente da apresentação da referência

A migration `20260905071622_separate_public_file_policy_from_citation_display.sql` corrige a autorização de um PDF explicitamente liberado quando a fonte apresenta somente a citação. Para cursos públicos, a autorização segue a política de arquivo, fonte e curso, nessa precedência. A visibilidade editorial continua controlando a citação e sua URL; o acesso privado compartilhado conserva sua regra de link. O bucket continua privado e a assinatura exige autorização no servidor.

O teste focal `supabase/tests/013_atomic_course_metadata_test.sql` passou 28 verificações locais sobre as duas últimas correções: gravação somente de metadados, combinação com entidades e atribuições, idempotência, conflito de revisão, propriedade, rollback integral, chamadas sem o novo argumento, projeção anônima sem trecho privado e PDF autorizado por exceção do arquivo. Todos os dados sintéticos são revertidos pela transação de teste.

Estas correções são incrementais. Antes de aplicá-las, mantenha o backup e o ensaio de restauração exigidos acima, confira a lista exata de migrations pendentes e valide o manifesto final `20260905071622`. Não execute reset nem seed de upgrade sobre um ambiente que já recebeu estas migrations. As provas SQL locais e as jornadas com clientes reais complementam-se; nenhuma delas declara a implantação hospedada concluída.
