# Estado atual e próximos passos

Este documento separa capacidade atual, prática externa de autoria e direção de desenvolvimento. A distinção evita confundir o que já está implementado com hipótese de pesquisa ou plano futuro.

## Implementado no repositório atual

O AraLearn já possui:

- aplicação web servida localmente por Node;
- publicação web em GitHub Pages;
- empacotamento Android por WebView;
- runtime JavaScript único para web e Android, sem SDK Supabase nativo;
- autenticação Supabase com cadastro, confirmação, recuperação, sessão persistida e renovação;
- contrato público `aralearn.contract`, versão 3;
- PostgreSQL/Supabase como fonte canônica compartilhada, com UUIDs, chaves estrangeiras, revisões, tombstones, RLS e RPCs autorizadas;
- catálogo exclusivamente remoto, limitado a metadados de cursos oficiais publicados;
- clonagem transacional de cursos oficiais para cópias pessoais com novos UUIDs e rastreamento de origem;
- importação e exportação manual em JSON v3, sem persistência do curso como documento;
- réplica relacional no IndexedDB, com outbox, pull incremental, cursor, mutações idempotentes e conflitos explícitos;
- persistência granular da árvore didática, do progresso por lição e card e dos comentários por usuário e card;
- estudo, revisão e edição offline do material já sincronizado;
- recursos de card: `paragraph`, `choice`, `composite`, `code`, `table`, `flow`, `tree`, `graph`, `relation_map`, `matrix` e `plane`;
- geração top-down por LLM via API;
- geração bottom-up por LLM via API;
- integração com Gemini;
- integração com serviços compatíveis com a API de chat da OpenAI, incluindo DeepSeek por endpoint compatível;
- ponte local para Codex CLI;
- serviço falso para testes;
- validações estruturais e didáticas;
- montagem em memória do documento público a partir das linhas relacionais;
- atualização bottom-up limitada à microssequência, ao card ou à linha filha afetada;
- scripts de validação, harnesses, smoke tests e benchmarks.

## Prática externa de autoria

A preparação de fixtures ou de uma publicação oficial pode usar RAGs externos. Lewis et al. (2020) descrevem RAG como geração apoiada por recuperação de informação. No AraLearn atual, esse uso deve ser entendido como prática de curadoria e preparação de material, não como prova de que o app já contém um sistema interno completo de RAG.

Essa prática é útil porque ajuda a produzir material inicial com fontes mais delimitadas. Ainda assim, o conteúdo resultante precisa ser revisado, adaptado ao contrato, validado e publicado no banco. Fixtures não funcionam como catálogo operacional do site ou do APK.

## Direções técnicas

As próximas direções técnicas incluem:

- melhorar a extração de fontes e arquivos;
- ampliar validações didáticas;
- qualificar relatórios de geração;
- reduzir dependência de serviços externos;
- investigar modelos locais ou parcialmente locais;
- amadurecer a experiência Android;
- melhorar a edição manual de cards;
- aprofundar a interface já existente de inspeção e resolução de conflitos preservados;
- ampliar observabilidade e testes de implantação do Supabase;
- avaliar estratégias de atualização de cópias personalizadas sem merge automático.

A eventual execução local de LLM no smartphone deve ser tratada como horizonte de desenvolvimento. No estado atual, a geração por API continua sendo o mecanismo operacional principal.

## Direções pedagógicas

O projeto precisa testar como estudantes usam microssequências em situações reais: deslocamento, pouco tempo, retomada depois de pausa e estudo de conteúdo técnico. A investigação pode seguir ciclos de design-based research, conforme proposto pelo Design-Based Research Collective (2003), em que o artefato é desenvolvido, observado e ajustado.

Perguntas úteis:

- a microssequência ajuda o estudante a retomar o estudo?
- os cards visuais melhoram compreensão de conteúdos estruturais?
- a geração por LLM reduz esforço de autoria sem reduzir qualidade?
- a réplica offline torna a retomada previsível entre sessões e dispositivos?
- o estudante entende o que foi produzido pela IA e o que precisa revisar?

## Direções sociais e éticas

A UNESCO (2023) recomenda atenção a qualidade, equidade, privacidade e responsabilidade humana no uso de IA generativa em educação. Para o AraLearn, isso implica:

- explicitar quando há uso de API externa;
- evitar envio desnecessário de contexto;
- preservar revisão humana;
- impedir que métricas substituam julgamento pedagógico;
- manter transparência sobre limites da IA;
- projetar o app para estudantes com poucos recursos e conexão instável.

## Referências citadas

Design-Based Research Collective. (2003). Design-based research: An emerging paradigm for educational inquiry. *Educational Researcher*, 32(1), 5-8. <https://doi.org/10.3102/0013189X032001005>

Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., et al. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. *Advances in Neural Information Processing Systems*, 33, 9459-9474. <https://arxiv.org/abs/2005.11401>

UNESCO. (2023). *Guidance for generative AI in education and research*. <https://unesdoc.unesco.org/ark:/48223/pf0000386693>
