# Fontes, citações e referências

Uma fonte identifica uma obra ou um material. A referência bibliográfica ajuda a
reconhecer essa obra; o vínculo explica como ela foi usada; a localização indica
onde encontrar o trecho pertinente. Essas informações têm funções diferentes.
Uma referência bem formatada ou um PDF acessível não confirma, por si só, uma
afirmação didática.

## Texto do autor e referência gerada

A referência escrita pelo autor é uma escolha deliberada. Ela pode ser adequada
a uma orientação institucional ou a um material que ainda tem poucos dados
conhecidos. Esse texto deve permanecer intacto ao trocar o estilo do curso.

A referência gerada utiliza os metadados estruturados conhecidos: autoria,
título, data, veículo, edição, editora, localização e identificadores pertinentes
ao tipo de fonte. Sobrenomes, datas, páginas e títulos não são inferidos para
preencher uma ficha. Um nome institucional pode permanecer literal; componentes
de um nome pessoal só são usados quando foram informados dessa forma.

Quando faltam dados, o autor pode completar a ficha ou manter uma referência
manual. O simples fato de um processador produzir uma linha não prova sua
suficiência: com um item inteiramente vazio, os estilos ensaiados ainda produzem
abreviações e pontuação. Por isso, o adaptador verifica os dados antes de oferecer
uma referência gerada.

## Estilos e orientação institucional

Os estilos iniciais são APA, 7ª edição, e ABNT com base na NBR 6023:2025. A norma
brasileira de citações em documentos é a NBR 10520:2023; não se confunde com a
norma de referências. As bibliotecas da [Unicamp](https://www.ifch.unicamp.br/biblioteca/servico/normalizacao)
e da [ECA/USP](https://www.eca.usp.br/biblioteca/normalizacao) identificam essas
edições nas suas orientações de normalização.

A APA mantém a 7ª edição do [*Publication Manual*](https://www.apa.org/pubs/books/publication-manual-7th-edition-paperback).
O [guia da biblioteca do IE-ULisboa, de 2023](https://www.ie.ulisboa.pt/sites/default/files/documents/document/default/apa-7-2023.pdf),
atualmente vinculado pela instituição, orienta o uso de APA em seus trabalhos
acadêmicos e identifica a edição 7. Isso é uma orientação institucional
pertinente; não torna APA obrigatória para todo curso. Regras específicas de um
programa, orientador, periódico ou evento continuam relevantes.

O estilo de um curso determina a apresentação das referências geradas. Ele não
muda a identidade da fonte ou os vínculos com o material. Da mesma forma, um
marcador numérico ou sobrescrito usado para abrir uma referência é um controle de
navegação: sua presença não significa que o texto inteiro esteja normalizado
segundo um sistema autor-data.

## Processamento comum e saída segura

O AraLearn usa uma projeção limitada dos metadados para
[CSL-JSON](https://docs.citationstyles.org/en/v1.0.2/specification.html), mantendo a
fonte canônica como único cadastro. O CSL distingue os dados bibliográficos do
item, o contexto da citação e as regras de apresentação. Não é necessário adotar
um gerenciador bibliográfico completo para usar essa separação.

O motor selecionado é **citeproc-js, pacote `citeproc` 2.4.63**, sem dependências
adicionais de execução. Ele é carregado sob demanda por módulos locais. Motor,
estilos e traduções ficam fixados na distribuição; a geração de uma referência
não busca código, estilos, metadados ou arquivos em serviços externos.

O componente `renderCslReference(item, {style})` recebe um item CSL limitado e
devolve texto e segmentos tipados. Os segmentos contêm somente texto, itálico,
negrito e alinhamento sobrescrito/subscrito. O HTML genérico do processador não é
repassado à interface. URLs são tratadas pelo mecanismo próprio de links do
produto, separado da formatação bibliográfica. A mesma entrada produz os mesmos
segmentos no navegador e em Deno.

Um cache limitado a 32 resultados usa o conteúdo normalizado completo e o estilo
como chave. Cada consumidor recebe uma cópia; alterar o retorno não muda outra
referência. O estado interno de um processador não é reutilizado entre obras.

## Autoria nos canais conectados

As tarefas de autoria usam os mesmos campos e vínculos do aplicativo. Nomes
podem ser fornecidos como nome literal ou como sobrenome e nomes; o programa
não decompõe uma autoria escrita livremente. `papeisSugeridos` na ficha serve
como sugestão, enquanto `papeis` em cada vínculo declara seu uso naquele alvo.
A mesma fonte pode ter vários vínculos. Ao editar um vínculo pela posição
apresentada, os demais são conservados.

Uma ocorrência indica o lugar, a posição do componente, a folha textual e o
trecho literal do curso. Sua localização na fonte é registrada separadamente
pela âncora. O estado de localização da ocorrência é calculado na leitura;
não pode ser informado como uma confirmação pelo canal de autoria. A tarefa
`manter_fonte` também permite escolher `apa7` ou `abnt-2025` para o curso, sem
reescrever o material didático ou apagar uma referência manual.

## Estilos fixados e adaptação ABNT

O estilo [APA 7](https://raw.githubusercontent.com/citation-style-language/styles/32078ede72b9224e1ed02c546668e20ee7c75585/apa.csl)
e o estilo institucional
[UFRGS — ABNT com autoria abreviada](https://raw.githubusercontent.com/citation-style-language/styles/1a16445a22e1ca8aff67cab74fb6077513d67cc0/associacao-brasileira-de-normas-tecnicas-ufrgs-initials.csl)
são preservados no repositório com os seus autores, colaboradores, avisos e
hashes. O segundo declara NBR 6023:2025 e NBR 10520:2023. É uma implementação
institucional, não um software emitido ou certificado pela ABNT.

A variante distribuída aplica uma correção pequena e reproduzível ao estilo
UFRGS: quando um artigo não tem intervalo de páginas e possui localização
eletrônica, essa localização aparece na referência. Por exemplo, `e12345` não é
convertido em `p. e12345`. Quando páginas estão informadas, sua apresentação
permanece própria. A distinção acompanha os exemplos da atualização de 2025
apresentados pela [ECA/USP](https://www.eca.usp.br/sites/default/files/2025-06/NBR%206023_2025.pdf).

O XML original permanece intacto. A alteração
`aralearn-abnt-elocation-v1` é aplicada pelo gerador e identificada nos avisos. O
campo bibliográfico canônico de localização eletrônica é projetado para `number`
no CSL; ele não é armazenado como intervalo de páginas.

A adaptação `aralearn-abnt-access-punctuation-v1` também retira o segundo ponto
acrescentado pelos ramos de página web e relatório depois da macro de acesso,
que já fornece a pontuação. Assim, uma URL sem data de acesso termina com um
único ponto; uma data informada continua aparecendo normalmente. O ajuste é
feito no CSL gerado, sem limpar a referência por expressão regular nem preencher
uma data ausente. A indicação de metadados faltantes permanece independente.

O ajuste `aralearn-abnt-empty-separator-v1` condiciona dois separadores à
presença dos metadados que separam: em relatório, o ponto antes da publicação
é dispensado quando nada intervém depois do título já pontuado; no ramo geral,
a vírgula antes da data não é acrescentada depois de um título sozinho nem
de uma editora já pontuada. Isso cobre os separadores vazios observados com
metadados mínimos, preservando os dados e os marcadores de ausência do estilo.

## Reprodução, licenças e limites

Os fontes e hashes ficam em `src/bibliography/upstream`. Para gerar e conferir os
módulos locais, use:

```sh
node scripts/buildBibliographyVendor.mjs
node scripts/buildBibliographyVendor.mjs --check
```

O gerador funciona sem rede ou instalação adicional e recusa arquivos que não
correspondam aos hashes fixados. O código original é preservado; somente o
envoltório ESM e o empacotamento dos estilos são gerados.

O produto mantém sua licença MIT. Para o motor separado, o AraLearn utiliza a
opção CPAL 1.0 concedida pelo autor, preservando fonte, alterações e avisos. A
CPAL permite sua combinação com outros componentes sob termos diferentes,
mantidas as obrigações do código coberto. Estilos e traduções permanecem sob
CC BY-SA 3.0. Os [avisos de terceiros](../public/vendor/bibliography/NOTICE.txt),
a [CPAL](../public/vendor/bibliography/CPAL-1.0.txt) e a
[CC BY-SA](../public/vendor/bibliography/CC-BY-SA-3.0.txt) acompanham a distribuição.

Os testes focais cobrem os estilos, metadados incompletos, texto hostil,
localização eletrônica, tipografia, igualdade de segmentos e isolamento do
cache. O corpus de execução contém itens públicos identificados e casos
sintéticos explicitamente marcados. Ele demonstra funcionamento e segurança do
componente; não demonstra conformidade integral de todos os tipos documentais
ou de um trabalho acadêmico completo. Referência bibliográfica, localização da
evidência e verificação do conteúdo continuam responsabilidades distintas.
