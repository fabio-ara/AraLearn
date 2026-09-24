# Experimento de autoria v7

Materialize os focos indicados na atribuição. Público: estudantes iniciantes de computação que conhecem funções, números inteiros/hexadecimais e leitura de tabelas. Curso sintético “Modelos computacionais em ação”. O planejamento abaixo já foi aprovado e persistido. Fontes não são exigidas para estes exemplos construídos; não invente bibliografia.

Entregue uma lista JSON de argumentos reais de `materializar_parte`, um objeto por microssequência, conforme tool.json. Cada objeto deve incluir explicacao em `explicacoes` e as unidades necessárias. `concluir:false` é apenas o estado operacional, não uma instrução para reduzir a cobertura. Não execute ferramentas remotas nem escreva no banco. Catálogo corrente em catalog.json; consulte somente os contratos necessários nos arquivos src/resources/packages. Não leia resultados de outros ensaios.

Concentre-se no encadeamento objetivo → explicação → operação → evidência → prática → feedback. Escolha representações pela informação necessária, não pela facilidade. Preserve repertório, múltiplas alternativas corretas e múltiplas lacunas quando pertinentes; não há quota de componentes, alternativas, lacunas ou unidades. Uma lacuna e escolha única são legítimas quando suficientes. Não troque cálculo/relação/procedimento por simples reconhecimento de nomes. Feedback deve explicar a resposta e erros plausíveis. O material precisa ensinar o assunto e permitir consulta autônoma, não apenas resumir os tópicos. Recursos e dificuldades técnicas não justificam reduzir conteúdo. Não edite contratos para acomodar sua resposta.

Escreva primeiro `first.json`, antes de validar. Valide estrutura e contratos localmente pelo registry/completeHumanContent já existentes, salvando o resultado em `validation.json`. Pode corrigir erros em `final.json`, preservando first.json e registrando as correções. Não avalie a própria qualidade como evidência experimental; outro processo fará a avaliação. Registre os arquivos consultados, chamadas de validação e número de correções em `process.md`. Só escreva no diretório de ensaio atribuído.

## A — Garantias e limites de protocolos

Título exato: Garantias e limites de protocolos.
Objetivo: justificar a escolha de transporte distinguindo entrega ordenada/recuperação, prazo e confidencialidade.
Conhecimento fornecido: TCP oferece fluxo ordenado e confiável, usa números de sequência, confirmações e retransmissões; não garante prazo máximo nem cifra automaticamente. Uma conexão pode falhar. UDP preserva datagramas sem garantir entrega, ordem ou recuperação. Aplicações podem acrescentar mecanismos. TLS oferece confidencialidade quando empregado adequadamente; não transforma TCP em transporte com prazo garantido. Use situações concretas (arquivo íntegro, controle com prazo, áudio interativo), explicite a condição considerada e evite escolha universal “sempre TCP/UDP”.
Ideias do repertório: “Entrega ordenada e recuperação de perdas”; “Prazo e confidencialidade são requisitos distintos”.
Requisitos de evidência: “Relacionar confirmação e retransmissão à recuperação de uma perda”; “Discriminar simultaneamente as garantias presentes e ausentes num cenário de transporte”.
Cobertura: “Propriedades e limites de transporte”.

## B — Intervalos e limites de memória

Título exato: Intervalos e limites de memória.
Objetivo: calcular extremos/tamanho de intervalos e decidir contiguidade ou sobreposição, respeitando a base numérica e limites inclusivos.
Conhecimento fornecido: memória endereçada a bytes; intervalos neste modelo são inclusivos; tamanho = fim − início + 1. Intervalos contíguos não compartilham byte: fim do primeiro + 1 = início do segundo. Intervalos separados podem ter lacunas. Exemplo construído: início 0x1000, tamanho 16 bytes, fim 0x100F; próximo byte 0x1010. Endereços de 64 bits são valores exatos, não aproximações em ponto flutuante. Não confunda intervalo de endereços com sequência de chamadas.
Ideias do repertório: “Intervalo inclusivo de bytes”; “Contiguidade e sobreposição”.
Requisitos de evidência: “Calcular um extremo e o tamanho de um intervalo inclusivo”; “Distinguir contiguidade de sobreposição comparando extremos”.
Cobertura: “Aritmética de endereços e intervalos”.

## C — Transições de um controle de acesso

Título exato: Transições de um controle de acesso.
Objetivo: prever o estado final a partir de estado inicial e sequência de eventos, explicando por que a mesma entrada pode produzir efeitos diferentes.
Modelo construído completo: estados Bloqueado (inicial), Liberado e Alarme. Em Bloqueado, credencial válida → Liberado; passagem forçada → Alarme; tempo esgotado → Bloqueado; rearme → Bloqueado. Em Liberado, credencial válida → Liberado; passagem → Bloqueado; passagem forçada → Alarme; tempo esgotado → Bloqueado; rearme → Bloqueado. Em Alarme, rearme → Bloqueado; qualquer outro evento mantém Alarme. Evento “passagem” em Bloqueado mantém Bloqueado. Não há transições implícitas além das fornecidas.
Ideias do repertório: “Estado como memória do sistema”; “Transição condicionada ao estado e evento”.
Requisitos de evidência: “Compor uma sequência de transições para prever o estado final”; “Comparar o efeito do mesmo evento em estados distintos”.
Cobertura: “Rastreamento de máquinas de estados”.
