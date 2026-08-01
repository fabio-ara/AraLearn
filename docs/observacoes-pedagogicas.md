# Observações pedagógicas nos cards

Durante o estudo, a pessoa pode registrar uma observação no card sem sair do
leitor. O ícone de edição abre uma folha curta com cinco tipos:

- **Dúvida**: algo que a pessoa quer compreender melhor;
- **Possível erro**: informação que parece incorreta;
- **Confuso**: explicação, exemplo ou prática difícil de interpretar;
- **Sugestão**: proposta de melhoria do material;
- **Observação**: registro que não cabe nos tipos anteriores.

Escolher um tipo não classifica a aprendizagem nem produz nota. O texto tem até
1.000 caracteres. Salvar substitui a observação corrente daquele card; retirar
apaga essa observação. Um contador discreto indica apenas que existe um registro
da própria pessoa no card atual.

## Funcionamento atual

A observação é gravada primeiro no dispositivo e entra na mesma fila offline do
estado pessoal. A reconexão envia apenas a referência estável do card, a
categoria e o texto. O conteúdo do card não é copiado para a observação e não há
histórico de versões do texto.

Se a mesma conta editar a observação em dois dispositivos, vale a última
alteração válida aceita pelo servidor. Repetir um envio depois de timeout não
cria duplicata. Mover ou renomear o card preserva o vínculo porque a referência
usa a identidade interna, não sua posição ou seu título. Se o card for
excluído, a observação deixa de existir com ele.

Neste estágio, cada pessoa consulta, edita e retira somente suas próprias
observações. Elas ainda não são uma conversa: resposta docente, resolução,
reabertura, filtros por responsável e operações pelo Chatbot ou Plugin serão
integrados ao modelo de workspaces e papéis. Até essa integração, o aplicativo
não sugere que a observação foi recebida ou atendida por um professor.

## Como interpretar

Uma observação é evidência qualitativa do que a pessoa decidiu registrar em um
momento e contexto específicos. Pode orientar revisão do material, mas não
autoriza alteração automática e não demonstra, isoladamente, erro do curso,
dificuldade, atenção ou falta de domínio. A ausência de observações também não
demonstra compreensão.

A hipótese de design é que uma manifestação curta e situada ofereça agência com
pouca interrupção do estudo. Ela será avaliada por tarefas de uso, entrevistas e
análise qualitativa; quantidade de observações não será convertida em ranking,
nota ou indicador automático de aprendizagem.

## Fundamentação

Nicol e Macfarlane-Dick tratam estudantes como participantes ativos na geração
e no uso de feedback para autorregulação. Carless e Boud descrevem feedback
literacy como capacidades e disposições para interpretar informação e agir
sobre ela. Nicol e Kushwah mostram que comentários produzidos por estudantes a
partir de comparações com recursos podem ampliar agência e tornar pedidos de
feedback mais precisos. Esses trabalhos sustentam a investigação do mecanismo;
não provam sua eficácia específica no AraLearn.

- Nicol, D. J., & Macfarlane-Dick, D. (2006). Formative assessment and
  self-regulated learning: a model and seven principles of good feedback
  practice. *Studies in Higher Education, 31*(2), 199–218.
  <https://doi.org/10.1080/03075070600572090>
- Carless, D., & Boud, D. (2018). The development of student feedback literacy:
  enabling uptake of feedback. *Assessment & Evaluation in Higher Education,
  43*(8), 1315–1325. <https://doi.org/10.1080/02602938.2018.1463354>
- Nicol, D., & Kushwah, L. (2024). Shifting feedback agency to students by
  having them write their own feedback comments. *Assessment & Evaluation in
  Higher Education, 49*(3), 419–439.
  <https://doi.org/10.1080/02602938.2023.2265080>

Os limites, o orçamento e a cobertura automatizada deste recorte estão no
[registro de evidência](evidence/situated-personal-comments-stage-2026-08-01.json).
