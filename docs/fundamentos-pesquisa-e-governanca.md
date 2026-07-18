# Fundamentos, pesquisa e governança

O AraLearn pode ser entendido como produto, artefato técnico e hipótese de pesquisa. Há software funcionando, contrato definido, catálogo remoto, persistência relacional com réplica offline e integração por LLM via API. Ao mesmo tempo, há perguntas abertas sobre aprendizagem autodidata, estudo móvel, dependência de IA, privacidade, autoria e avaliação.

O ponto de partida é social: muitos estudantes trabalham, estudam à noite, usam o celular como principal dispositivo, dependem de intervalos fragmentados e nem sempre têm conexão estável. O projeto nasce dessas condições e tenta respondê-las com uma arquitetura de estudo editável, compartilhada e capaz de operar offline depois da primeira sincronização.

## Informação, atenção e plataformas

Simon (1971) mostrou que abundância de informação cria escassez de atenção. Castells (1996) descreveu a sociedade em rede como um ambiente em que fluxos informacionais passam a organizar relações sociais, econômicas e culturais. Covington, Adams e Sargin (2016) exemplificam, no caso do YouTube, como recomendações podem organizar o acesso a conteúdo por geração de candidatos e ranqueamento.

O problema educacional não é apenas encontrar material. É transformar material em percurso, prática e retomada. O AraLearn assume que o estudante precisa de uma estrutura que interrompa a dispersão sem tirar sua autoria.

## Carga cognitiva, prática e representação

Sweller (1988) e Sweller, Van Merriënboer e Paas (1998) mostram que o desenho da informação afeta a carga cognitiva. O AraLearn tenta reduzir carga desnecessária ao explicitar sequência, dependências e recursos adequados ao conteúdo.

Karpicke e Roediger (2008) demonstram a importância da recuperação ativa. Por isso, o projeto não se limita à apresentação de explicações; ele inclui prática, feedback e revisão. Bjork e Bjork (2011) ajudam a formular o valor de dificuldades desejáveis: perguntas que exigem decisão real, sem criar obstáculos vazios.

Mayer (2009) contribui para a decisão de usar recursos como matriz, grafo, plano, tabela e fluxo. A representação visual entra quando preserva relações que o texto linear pode obscurecer.

## Autonomia e mediação

Zimmerman (2002) descreve aprendizagem autorregulada como processo de planejamento, monitoramento e ajuste. O AraLearn apoia esse processo ao mostrar trilha, etapa, progresso, erro e continuidade.

Vygotsky (1978) ajuda a compreender aprendizagem como processo mediado por instrumentos e signos. Bruner (1978) contribui com a ideia de apoio gradual. Freire (1996) reforça que autonomia não é abandono, mas participação crítica do estudante no próprio processo. O AraLearn, nesse sentido, tenta oferecer estrutura sem retirar autoria.

## IA generativa e limites

A arquitetura Transformer de Vaswani et al. (2017) tornou-se base relevante para modelos contemporâneos de linguagem. Brown et al. (2020) mostraram que modelos de grande escala podem realizar tarefas diversas a partir de instruções e poucos exemplos. Essa capacidade torna as LLMs úteis para organizar trilhas e redigir cards, mas também exige governança.

O AraLearn não trata a IA como fonte final de verdade. A LLM por API ajuda a propor estrutura e conteúdo; o app valida; o usuário revisa. A intenção é reduzir o esforço de autoria sem apagar responsabilidade editorial.

Lewis et al. (2020) são relevantes para pensar RAG como geração apoiada por recuperação de informação. O uso de RAGs externos na preparação de fixtures e de conteúdo destinado à publicação aponta uma direção: apoiar a geração em fontes mais controladas. Isso ainda deve ser distinguido das capacidades internas já implementadas.

A UNESCO (2023) recomenda cautela no uso de IA generativa em educação e pesquisa, com atenção a qualidade, equidade, privacidade e responsabilidade humana. Esses critérios se aplicam diretamente ao AraLearn.

## Pergunta de pesquisa

Uma formulação possível é:

> De que modo uma plataforma móvel, offline-first e orientada por microssequências, com estado relacional compartilhado, cards renderizáveis e assistência de LLM por API, pode apoiar o estudo autodidata de conteúdos técnicos em contextos de excesso informacional, pouco tempo, atenção fragmentada e conectividade instável?

Essa pergunta não pretende provar eficácia geral do projeto em larga escala. Ela delimita uma investigação de desenvolvimento sobre desenho, uso, limites e percepção do estudante.

## Hipóteses de design

As hipóteses de design são:

1. A microssequência reduz a distância entre explicação isolada e lição extensa.
2. O contrato JSON torna conteúdo gerado por IA mais auditável.
3. A divisão top-down/bottom-up reduz ambiguidade e custo de geração.
4. Recursos visuais baseados em dados ajudam em conteúdos estruturais.
5. Progresso e comentários granulares apoiam retomada e revisão do estudo.
6. Uma réplica relacional offline favorece estudantes com conexão instável sem renunciar a uma fonte canônica compartilhada.
7. A LLM por API deve atuar como assistência, não como autoridade final.

A metodologia adequada se aproxima de design-based research, conforme o Design-Based Research Collective (2003): o artefato é concebido, testado, analisado e ajustado em ciclos.

## Governança e risco

O mesmo sistema que apoia autonomia pode, em contexto institucional, ser usado para vigilância ou normalização. Foucault (1975) ajuda a pensar a relação entre exame, disciplina e controle. Lyotard (1979) alerta para a redução do saber a desempenho mensurável em sociedades orientadas por performatividade.

Por isso, métricas de uso, desempenho e progresso precisam ser tratadas com cuidado. Analytics podem apoiar revisão e orientação; também podem virar mecanismo de punição ou classificação indevida. A governança do AraLearn deve separar apoio pedagógico de controle disciplinar.

Selwyn (2016) lembra que tecnologia educacional não é neutra: ela incorpora interesses, práticas e formas de poder. No AraLearn, isso exige transparência sobre o que é salvo, o que é enviado a APIs, o que é gerado por IA e o que depende de revisão humana.

## Referências citadas

Bjork, R. A., & Bjork, E. L. (2011). Making things hard on yourself, but in a good way: Creating desirable difficulties to enhance learning. In M. A. Gernsbacher et al. (Eds.), *Psychology and the real world*. Worth.

Brown, T. B., Mann, B., Ryder, N., Subbiah, M., Kaplan, J., Dhariwal, P., et al. (2020). Language models are few-shot learners. *Advances in Neural Information Processing Systems*, 33, 1877-1901. <https://arxiv.org/abs/2005.14165>

Bruner, J. S. (1978). The role of dialogue in language acquisition. In A. Sinclair, R. J. Jarvella, & W. J. M. Levelt (Eds.), *The child's conception of language*. Springer.

Castells, M. (1996). *The rise of the network society*. Blackwell.

Covington, P., Adams, J., & Sargin, E. (2016). Deep neural networks for YouTube recommendations. *Proceedings of the 10th ACM Conference on Recommender Systems*. <https://doi.org/10.1145/2959100.2959190>

Design-Based Research Collective. (2003). Design-based research: An emerging paradigm for educational inquiry. *Educational Researcher*, 32(1), 5-8. <https://doi.org/10.3102/0013189X032001005>

Foucault, M. (1975). *Surveiller et punir: naissance de la prison*. Gallimard.

Freire, P. (1996). *Pedagogia da autonomia: saberes necessários à prática educativa*. Paz e Terra.

Karpicke, J. D., & Roediger III, H. L. (2008). The critical importance of retrieval for learning. *Science*, 319(5865), 966-968. <https://doi.org/10.1126/science.1152408>

Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., et al. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. *Advances in Neural Information Processing Systems*, 33, 9459-9474. <https://arxiv.org/abs/2005.11401>

Lyotard, J.-F. (1979). *La condition postmoderne: rapport sur le savoir*. Les Éditions de Minuit.

Mayer, R. E. (2009). *Multimedia learning* (2nd ed.). Cambridge University Press. <https://doi.org/10.1017/CBO9780511811678>

Selwyn, N. (2016). *Education and technology: Key issues and debates* (2nd ed.). Bloomsbury.

Simon, H. A. (1971). Designing organizations for an information-rich world. In M. Greenberger (Ed.), *Computers, communication, and the public interest*. Johns Hopkins Press.

Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257-285. <https://doi.org/10.1207/s15516709cog1202_4>

Sweller, J., Van Merriënboer, J. J. G., & Paas, F. (1998). Cognitive architecture and instructional design. *Educational Psychology Review*, 10, 251-296. <https://doi.org/10.1023/A:1022193728205>

UNESCO. (2023). *Guidance for generative AI in education and research*. <https://unesdoc.unesco.org/ark:/48223/pf0000386693>

Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, L., & Polosukhin, I. (2017). Attention is all you need. *Advances in Neural Information Processing Systems*, 30. <https://arxiv.org/abs/1706.03762>

Vygotsky, L. S. (1978). *Mind in society: The development of higher psychological processes*. Harvard University Press.

Zimmerman, B. J. (2002). Becoming a self-regulated learner: An overview. *Theory Into Practice*, 41(2), 64-70. <https://doi.org/10.1207/s15430421tip4102_2>
