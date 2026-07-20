# Uso do app

O fluxo atual do AraLearn é simples: entrar, selecionar cursos, organizá-los em trilhas e estudar. O curso oficial é somente leitura; o estudante grava apenas sua organização, progresso e comentários.

## 1. Entrar

Sem sessão, o app mostra a porta de autenticação. É possível criar conta, confirmar e-mail, entrar e recuperar senha. A mesma sessão Supabase é usada na web e no APK.

Cada conta abre um IndexedDB próprio, identificado pelo UUID do usuário. Sair encerra a sessão, mas não apaga a réplica nem as gravações pendentes dessa conta.

## 2. Selecionar cursos nas Coleções

A aba **Coleções** pesquisa os metadados do catálogo oficial. As coleções são administradas pelo AraLearn e não podem ser alteradas pelo estudante.

Adicionar um curso exige conexão. O servidor grava somente a seleção da conta e o dispositivo baixa a árvore oficial para seu cache local. Não é criada uma cópia completa do curso no espaço pessoal do usuário.

Retirar um curso remove somente a seleção, o cache local e o estado pessoal relacionado dessa conta. A publicação oficial permanece no catálogo e continua disponível para outras pessoas.

## 3. Organizar em Trilhas

A aba **Trilhas** permite:

- criar e renomear trilhas;
- mover cursos entre trilhas sem refazer a seleção;
- mudar a ordem dos cursos;
- excluir uma trilha sem retirar seus cursos da biblioteca.

Cada curso selecionado ocupa no máximo uma trilha. Movê-lo atualiza a mesma associação e preserva sua seleção, seu progresso e seus comentários. Os cursos selecionados que ainda não foram organizados aparecem em **Sem trilha**.

Trilhas são estado pessoal pequeno. As alterações são gravadas primeiro no IndexedDB e entram na sincronização oportunista.

## 4. Estudar

A navegação segue:

```text
curso -> módulo -> lição -> microssequência -> card
```

Os cards podem apresentar texto, escolha, código, tabela, matriz, plano, grafo, mapa de relações, fluxograma, árvore ou uma composição desses blocos.

Progresso e comentários são confirmados no IndexedDB antes de o app indicá-los como salvos. Depois do primeiro download do curso, o estudo continua offline.

O conteúdo oficial não pode ser alterado pela UI atual. Criação, importação pessoal, geração top-down e correção bottom-up de cursos não fazem parte deste runtime.

## 5. Sincronização automática

Quando o app está visível e online, ele tenta sincronizar:

- ao iniciar;
- quando a conexão retorna;
- ao voltar para a tela;
- depois de gravações locais;
- em ciclos periódicos enquanto permanece aberto.

Sem conexão, a outbox conserva as mutações e o estudo não é interrompido. Fechar ou ocultar o app encerra o ciclo periódico, evitando atividade desnecessária em segundo plano.

O ícone de sincronização apenas solicita um ciclo imediato. Ele não é necessário para salvar o trabalho nem para manter a sincronização automática.

Se dois dispositivos enviarem mudanças para o mesmo estado pessoal, vale a última mutação válida confirmada pelo servidor. O app não apresenta versões ou uma tela de merge.

## 6. Atualização de um curso oficial

O app compara o marcador da publicação com o cache local. Quando há uma publicação nova, baixa a árvore atual e a substitui numa única transação IndexedDB. Um download incompleto não apaga o cache anterior.

Entidades que preservam seus UUIDs mantêm progresso e comentários. Se uma entidade deixou de existir na publicação, seu estado pessoal relacionado deixa de ser aplicável e é removido pelas relações do banco.

## 7. Falhas previsíveis

- **Sem rede, timeout, 429 ou 5xx:** a mutação continua pendente e será tentada novamente.
- **Sessão expirada:** a outbox é preservada; depois do novo login, as mesmas mutações voltam à fila.
- **Ação inválida ou sem autorização:** a ação é marcada como rejeitada e precisa ser descartada ou refeita; ela não entra em loop automático.
- **Falha no IndexedDB:** o app não afirma que o dado foi salvo e oferece nova tentativa.

## 8. Sair ou excluir a conta

O ícone de saída encerra apenas a sessão e conserva a réplica local daquela conta.

A exclusão de conta é uma ação separada e destrutiva. Depois de confirmação explícita, remove Auth, seleções, trilhas, progresso, comentários e os dados locais do UUID. Ela não remove cursos oficiais do catálogo.

## Fora do app atual

Autoria pessoal por curso independente e autoria administrativa por GPT personalizado são fases futuras. O app estudantil atual não expõe GPT Actions, Edge Function de autoria, importação pessoal nem edição de conteúdo oficial.
