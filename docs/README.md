# Mapa da documentação

A documentação do AraLearn ensina o produto antes de apresentar seus detalhes
internos. Não é necessário conhecer previamente educação, bancos de dados,
segurança ou integração de modelos de linguagem.

Capítulos conceituais explicam problema, conceitos, alternativas, decisão,
fundamentação, consequências e limites. Guias operacionais apresentam tarefa,
passos, resultado esperado e recuperação de falhas. Os
[princípios editoriais](principios-editoriais.md) formalizam essa separação.

A página [Origens do AraLearn](origens-do-aralearn.md) apresenta a genealogia
biográfica declarada do projeto e explica por que ela não substitui evidência
científica nem representa endosso institucional.

## Começar a usar

1. [Visão do produto](visao-do-produto.md): problema educacional, público e
   compromissos;
2. [Uso do aplicativo](uso-do-app.md): conta, seleção de curso, Estudo,
   Autoria e sincronização;
3. [Guia do estudante](guia-estudante.md): primeiro percurso, retomada,
   revisão, observações e citações redigidas;
4. [Guia do professor e autor](guia-professor-autor.md): criação privada,
   planejamento incremental, Conteúdo, **Fontes**, revisão, Analytics e acesso;
5. [Solução de problemas](solucao-de-problemas.md): diagnóstico por sintoma e
   recuperação segura.

A página [Capacidades e limites atuais](estado-atual-e-roadmap.md) reúne as
funções disponíveis e os limites que afetam seu uso.

## Estudar o modelo pedagógico

1. [Modelo didático](modelo-didatico.md): Microssequência didática,
   microteoria, prática e progressão;
2. [Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md):
   propriedades pedagógicas, escopo e limites;
3. [Revisão de literatura](revisao-de-literatura.md): bases, controvérsias e
   lacunas;
4. [Quadro teórico](quadro-teorico.md): construtos e relações propostas;
5. [Fundamentação dos componentes](fundamentacao-pedagogica-dos-resources.md):
   quando uma representação é justificável;
6. [Estado de estudo não punitivo](estado-de-estudo-nao-punitivo.md): retomada
   e dados que não devem ser confundidos com aprendizagem;
7. [Observações e Anotações ancoradas](observacoes-pedagogicas.md): retorno
   situado, triagem protegida, funcionamento sem conexão e limites de inferência.

O [glossário de construtos](glossario-construtos.md) delimita termos
educacionais e metodológicos. O [vocabulário controlado](vocabulario-controlado.md)
registra as decisões terminológicas e seus fundamentos. A
[matriz de rastreabilidade](matriz-rastreabilidade-pedagogica.md)
liga decisões, literatura, implementação e avaliação prevista.

## Aprender no trabalho e formar profissionalmente

Aprendizagem no trabalho, gestão do conhecimento, treinamento e
desenvolvimento e educação profissional e tecnológica são contextos possíveis
de aplicação e investigação. O percurso abaixo não presume que disponibilizar
um curso produza competência, transferência ao trabalho ou mudança
organizacional:

1. [Visão do produto](visao-do-produto.md): públicos, condições de uso e
   capacidades que o AraLearn não oferece;
2. [Revisão de literatura](revisao-de-literatura.md#13-aprendizagem-no-trabalho-gestão-do-conhecimento-e-educação-profissional):
   aprendizagem formal e informal, processos organizacionais de conhecimento
   e educação e formação técnica e profissional;
3. [Origens do AraLearn](origens-do-aralearn.md): experiências declaradas que
   tornaram esses problemas relevantes, sem transformar biografia em prova;
4. [Modelo didático](modelo-didatico.md): como fontes, progressão,
   representações, prática e revisão organizam um curso;
5. [Fundamentos de pesquisa e governança](fundamentos-pesquisa-e-governanca.md)
   e [Protocolo de avaliação](protocolo-avaliacao-artefato.md): como distinguir
   uso, tarefa, aprendizagem, transferência e resultado organizacional.

## Estudar a engenharia

1. [Arquitetura](arquitetura.md): Curso vivo, fronteiras e fontes de
   autoridade;
2. [Persistência relacional e sincronização](persistencia-relacional.md):
   IndexedDB, PostgreSQL, Storage, cópia temporária e fila;
3. [Supabase](supabase.md): Auth, banco, Storage, Edge Functions, migrações e
   políticas de acesso;
4. [Contrato de conteúdo](aralearn-contract.md): envelopes, corte direto de
   fontes e validação;
5. [Componentes didáticos e pacotes](componentes-didaticos.md): núcleo,
   pacotes, catálogo e renderização;
6. [Sistema visual](sistema-visual.md): tipografia, responsividade e
   acessibilidade;
7. [Privacidade](privacidade.md): finalidade, retenção e limites de acesso.

O [glossário técnico](glossario-tecnico.md) define os mecanismos correntes. A
[matriz de conformidade técnica](matriz-conformidade-tecnica.md) indica onde
cada propriedade pode ser verificada.

## Estudar a autoria de cursos

Comece pelo comportamento já implementado:

1. [Guia do professor e autor](guia-professor-autor.md): criar e abrir cursos,
   editar planejamento e proveniência e conceder acesso para Estudo;
2. [Autoria por Model Context Protocol](autoria-mcp.md): ferramentas que
   operam o mesmo curso da interface;
3. [GPT personalizado com Actions](autoria-actions.md): OpenAPI, conexão OAuth
   e diferença em relação ao MCP;
4. [Criar Cursos pelo chat](criar-cursos-pelo-chat.md): percurso
   conversacional e seus limites;
5. [Assistência por modelo de linguagem](assistencia-por-ia.md): autoridade,
   contexto e concorrência;
6. [Fluxos, instruções e contratos](fluxos-prompts-e-contratos.md): separação
   entre intenção textual e operação estruturada;
7. [Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md):
   parâmetros, orientação natural, herança e política de componentes.

O ciclo de revisão possui um capítulo próprio:

8. [Revisão e correções do Curso](auditoria-de-conformidade-instrucional.md):
   Observações abertas, contexto pedagogicamente afetado, decisão, aplicação e
   reinspeção.

Analytics caracteriza o desenho corrente e intervenções observáveis no mesmo
curso:

- [Analytics da Autoria](analytics-instrucionais.md);
- [Referência do snapshot de Analytics](dicionario-metricas-datasets.md);
- [Comparar condições de desenho](experimentos-instrucionais-parametrizados.md);
- [Guia de investigação](guia-pesquisador.md).

## Avaliar o artefato

Este percurso separa fundamentação, hipótese, propriedade implementada e
resultado empírico:

1. [Fundamentos de pesquisa e governança](fundamentos-pesquisa-e-governanca.md);
2. [Contribuição e originalidade](contribuicao-originalidade.md);
3. [Protocolo de avaliação](protocolo-avaliacao-artefato.md);
4. [Auditoria acadêmica dos componentes](auditoria-academica-dos-resources.md);
5. [Auditoria da interface](auditoria-front-end.md);
6. [Benchmark de footprint editorial](benchmark-footprint-editorial.md):
   comparação reproduzível entre extensão, composição e espaço no leitor móvel;
7. [Capacidades e limites atuais](estado-atual-e-roadmap.md).

O [roteiro de aceitação humana](roteiro-aceitacao-humana-autoria.md) prepara a
avaliação com pessoas. Automação pode verificar contrato e geometria, mas não
pode declarar compreensão ou eficácia educacional.

## Avaliar um uso institucional

Um gestor, uma instituição educacional ou uma administração pública pode
começar pela [Visão do produto](visao-do-produto.md) e pelas
[Capacidades e limites atuais](estado-atual-e-roadmap.md). Esses capítulos
delimitam finalidade, público, propriedades implementadas e resultados ainda
não demonstrados.

Para examinar uma adoção concreta, continue por:

1. [Arquitetura](arquitetura.md): serviços, fronteiras e dependências;
2. [Privacidade](privacidade.md): localização, acesso, retenção e exclusão dos
   dados;
3. [Implantação](implantacao.md): ambientes, configuração, operação e
   recuperação;
4. [Sistema visual](sistema-visual.md): acessibilidade e condições de leitura;
5. [Protocolo de avaliação](protocolo-avaliacao-artefato.md): avaliação própria
   do contexto institucional, sem presumir adequação legal, científica ou
   educacional universal.

## Operar e implantar

| Assunto | Documento |
| --- | --- |
| ambientes, configuração e publicação | [Implantação](implantacao.md) |
| banco, Storage, autenticação e funções | [Supabase](supabase.md) |
| estrutura, testes e contribuições | [Guia do desenvolvedor](guia-desenvolvedor.md) |

Para contribuir com código ou documentação, consulte também o
[`CONTRIBUTING.md`](../CONTRIBUTING.md). A integração Android tem instruções
próprias em [`android/README.md`](../android/README.md), e as bibliotecas
distribuídas dentro do aplicativo são identificadas em
[`public/vendor/README.md`](../public/vendor/README.md).

## Consultar história e licença

O [`CHANGELOG.md`](../CHANGELOG.md) registra mudanças por versão e conserva a
terminologia do período correspondente. O histórico detalhado permanece no
Git. A licença de uso e redistribuição está em [`LICENSE.md`](../LICENSE.md).
Documentos correntes não repetem essa cronologia.

## Referência completa

| Documento | Função principal |
| --- | --- |
| [Princípios editoriais](principios-editoriais.md) | critérios de clareza e evidência |
| [Glossário técnico](glossario-tecnico.md) | termos de software e infraestrutura |
| [Glossário de construtos](glossario-construtos.md) | termos educacionais e metodológicos |
| [Vocabulário controlado](vocabulario-controlado.md) | decisões terminológicas e mapa de corte |
| [Referências](referencias.md) | bibliografia legível e percursos temáticos gerados da fonte canônica |
| [Cobertura da documentação](inventario-documentacao.md) | assunto e percurso de cada capítulo |
| [Matriz de conformidade](matriz-conformidade-tecnica.md) | rastreabilidade da engenharia |

## Como interpretar uma afirmação

- **Implementado** significa que há código e contrato verificáveis.
- **Conectado** significa que as camadas realmente chamam umas às outras.
- **Acessível** significa que uma pessoa autorizada alcança a função pela
  interface ou pelo protocolo indicado.
- **Verificado** informa a evidência e sua data.
- **Fundamentado** informa a literatura ou norma e o limite da inferência.
- **Planejado** não deve ser lido como disponível.

Quando houver divergência, [Capacidades e limites
atuais](estado-atual-e-roadmap.md) prevalece para o comportamento disponível; a
[visão](visao-do-produto.md) delimita a finalidade e os compromissos do produto.
