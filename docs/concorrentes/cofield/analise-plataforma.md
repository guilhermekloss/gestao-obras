# Cofield: análise completa da plataforma

> **O que é:** SaaS brasileiro de gestão de obras que conecta escritório e canteiro. Cobre planejamento (cronograma/Gantt), Last Planner System (LPS semanal), restrições, histograma de mão de obra, suprimentos, orçamento, custos, integração com ERP e dashboards. Tem IA para gerar cronograma, orçamento e quantitativos.
>
> **Como esta análise foi feita:** navegação autenticada no workspace "Guilherme Kloss Mendes's Workspace" (projeto de teste *Casa 2*, plano Enterprise em trial). Também foram lidos o site público e a Central de Tutoriais (`cofield.com.br/guides`). O projeto estava **vazio**, sem cronograma nem orçamento. Por isso, as telas operacionais foram vistas no estado inicial e a lógica interna foi documentada a partir dos guias oficiais. **Nada foi criado nem alterado na conta.**
>
> **Data:** 21–22/10/2026

---

## 1. Resumo executivo

- **Proposta:** substituir o combo MS Project + planilha + WhatsApp por uma base única. O **cronograma é a espinha dorsal**: tudo deriva dele, inclusive semanal, restrições, histograma, suprimentos, vinculação de orçamento, custos e quase todos os indicadores.
- **Público:** construtoras, incorporadoras, engenheiros, consultores de planejamento (multi-cliente) e gerenciadoras.
- **Modelo de cobrança:** **por projeto (obra) por mês**, em 4 planos cumulativos que vão de R$ 349 a R$ 1.299. Há trial no primeiro projeto e o site diz que não é preciso cartão para testar.
- **Diferenciais reais observados:**
  1. Rigor metodológico (LPS com PPC binário, motivo de atraso obrigatório para fechar a semana, linha de base com snapshot de pesos, curva S, IDP/IDC/IRR, tendência pelo caminho crítico com auditoria).
  2. Restrições com **responsável externo por e-mail** (projetista ou fornecedor atualiza por link, sem conta).
  3. Suprimentos com **lead time retroativo** amarrado à data da tarefa no Gantt.
  4. Custos com **fórmulas editáveis** (colunas personalizadas e fórmula de tendência), correção monetária (CUB) e trava de linha com motivo de estouro.
  5. IA com o princípio "propõe, você revisa", com confirmação explícita antes de gravar.
  6. Importação nativa de **.mpp** (o servidor converte), além de XML MSPDI e planilha.
  7. Integração com **Sienge** e **Mega** (ERPs muito usados na construção brasileira).

---

## 2. Arquitetura e modelo mental

```
Workspace (empresa)
 ├── Pessoas, perfis de acesso, faturamento, integrações
 └── Projetos (obras)  ← cada um habilita seus módulos e tem seu plano
      ├── Dashboard (visão geral + 1 painel por módulo)
      ├── Planejamento: Cronograma · Escadinha · Linha de balanço · Medições
      ├── Semanal (LPS)
      ├── Restrições
      ├── Histograma: Recursos por tarefa · Calendário de cronogramas
      ├── Suprimentos
      ├── Orçamento: Vinculação · Orçamentos
      ├── Custos
      ├── Integração: ERP
      └── (Em breve: Diário, Qualidade)
```

**Regras de navegação:**
- Sem projeto selecionado, o trilho de módulos não aparece. As únicas telas disponíveis são o Dashboard do workspace e a Listagem de projetos.
- Um módulo pode não aparecer por três motivos: (a) nenhum projeto selecionado, (b) módulo não habilitado no projeto, (c) falta de permissão.
- A URL carrega workspace, projeto, módulo e submódulo (`/w/{ws}/projects/{proj}/modules/{modulo}/{sub}`). Um link compartilhado abre a mesma tela para quem tem acesso.
- Ao trocar de projeto, a plataforma tenta manter o mesmo módulo. Se ele não existir no projeto de destino, cai no painel do projeto.
- A configuração dos módulos fica no **projeto**, não dentro do módulo (Configurações › Projeto › Módulos do projeto). Campo vazio dentro de um módulo geralmente indica um catálogo ainda não preenchido ali.

**Conceito transversal: escopo "por cronograma" × "por projeto".** Semanal, Restrições, Histograma, Suprimentos e Qualidade pedem essa decisão na primeira abertura. Custos tem a variante "por orçamento" × "por projeto".
- *Por cronograma:* cada cronograma (torre, fase, contrato) tem sua própria lista ou sequência. Útil quando equipes diferentes tocam frentes diferentes.
- *Por projeto:* uma lista única para a obra, agrupada por cronograma. Útil quando a reunião é uma só.
- A escolha é independente entre módulos. É possível, por exemplo, ter Semanal por cronograma e Restrições por projeto.

### 2.1 Cadeia de dependências (o que habilita o quê)

```
Calendário do projeto
      ↓
CRONOGRAMA (tarefas folha, predecessoras, Grupo/Local/Responsável)
      ↓ salvar
LINHA DE BASE  ──→ Curva S, IDP, Indicadores gerais, Tendência
      ↓
MEDIÇÕES (data efetiva) ──→ Realizado da curva S, progresso físico em Custos
      ↓
SEMANAL (semana finalizada) ──→ PPC e derivados ──(Salvar medição)──→ Medições
RESTRIÇÕES (planos no período) ──→ IRR
HISTOGRAMA (quantitativo × produtividade) ──→ curva de mão de obra
SUPRIMENTOS (lead times) ──→ datas planejadas por etapa

ORÇAMENTO (cravado) ──→ VINCULAÇÃO com pesos ──→ % custo / % receita
      ↓ 100% vinculado
CUSTOS (realizado/comprometido) ──→ IDC, tendência de custo, desembolso
```

**Roteiro oficial recomendado:** criar projeto e escolher módulos → convidar equipe e definir perfis → ajustar calendário → montar cronograma → salvar e marcar linha de base → ligar semanal, restrições, histograma e suprimentos.

---

## 3. Planos e preços

Valores por projeto/mês, vistos no assistente de criação de projeto. Os planos são **cumulativos**: cada um adiciona módulos ao anterior.

| Plano | Preço/mês | Módulos adicionados | Total acumulado | Posicionamento (texto da tela) |
|---|---|---|---|---|
| **Lite** | R$ 349 | Planejamento | Planejamento | "Para começar com diário e planejamento essencial" |
| **Plus** | R$ 799 | Semanal, Orçamento | + Semanal, Orçamento | "Mais controle da rotina, qualidade e produção semanal" |
| **Pro** | R$ 999 | Restrições, Histograma, Suprimentos | + Restrições, Histograma, Suprimentos | "Cobertura forte para gerir obra com custos, orçamento e suprimentos" |
| **Enterprise** | R$ 1.299 | Custos, Integração | Todos | "Todos os módulos para operações completas e integradas" |

- O plano é **sugerido** a partir dos módulos marcados na criação do projeto e pode ser trocado depois.
- O plano também limita uso. O exemplo citado nos guias é o número de cronogramas ativos ao mesmo tempo.
- O primeiro projeto do workspace tem trial gratuito. Do segundo projeto pago em diante, é obrigatório ter dia de vencimento e método de pagamento no workspace.
- Planos com valor R$ 0 não geram fatura nem exigem método de pagamento.
- **Inadimplência:** a fatura vencida **bloqueia o projeto**. Os dados ficam preservados, mas inacessíveis até o pagamento.

**Faturamento (workspace):**
- Modo **por projeto** (uma fatura por obra, útil quando cada obra tem CNPJ ou centro de custo próprio) ou **agregado** (fatura única). A escolha só pode ser trocada antes da primeira fatura.
- Pagador da NFS-e (razão social e CPF/CNPJ). Um projeto pode sobrescrever esse pagador.
- Vencimento entre os dias 1 e 28. A fatura fecha N dias antes (padrão 7).
- Cobrança automática no cartão. Também aceita boleto via Stripe.
- NFS-e emitida na emissão da fatura, no vencimento ou após o pagamento.

---

## 4. Módulos em detalhe

### 4.1 Planejamento › Cronograma (Gantt)

**Para que serve:** montar e manter o plano da obra. É a base de praticamente todos os outros módulos.

**Três formas de criar:**
1. **Na mão**, direto na grade.
2. **Importando** Microsoft Project (`.mpp` ou XML MSPDI) ou planilha (`.xlsx/.xls/.csv`, com modelo para baixar).
3. **Gerando com IA**, por um assistente com chat e formulário (ver seção 6).

Um projeto pode ter **vários cronogramas** (por torre, fase ou contrato). O limite de cronogramas ativos depende do plano.

**Importação: lógica e regras**
- No MS Project, a tela lista as colunas personalizadas e as linhas de base. O usuário mapeia o que vira Grupo, Local e Responsável, e escolhe qual baseline vira oficial e qual vira desafio. As demais entram como referências.
- Formato de data (DD/MM/AAAA, MM/DD/AAAA ou ISO), separador de predecessoras (vírgula ou ponto e vírgula) e locale dos vínculos (TI/II, FS/SS ou FC/CC).
- **Política de datas:**
  - *Manter durações* (padrão): recalcula as datas pelo CPM.
  - *Manter datas*: crava o início das folhas, e as predecessoras não atrasam.
- Erros bloqueiam a importação e são listados por linha. Avisos não bloqueiam.
- **Planilha, colunas obrigatórias:** UID, Nome, Início, Fim, Duração, Predecessoras, Grupo, Local, Linha de base (início/fim) e Desafio (início/fim). As colunas de referência podem vir vazias, mas precisam existir.
- **Planilha, colunas opcionais:** nº da estrutura, Progresso, Responsável, Custo, Receita.
- A ordem das linhas precisa respeitar a árvore: o pai vem antes dos filhos, e os irmãos ficam juntos.

**Estrutura de dados: a regra mais importante**
- O cronograma é uma árvore. **Tarefa pai (pacote)** é somente leitura e apenas soma os filhos (rollup). **Tarefa folha** é onde datas, duração, progresso, custo e receita são editados.
- Predecessora em tarefa pai não move a pai. Ela restringe quando os filhos podem começar.
- Indentar e desindentar mudam o nível na árvore.

**Colunas disponíveis:** #, Farol, Código hierárquico, Tarefa (fixa), Responsável (diretório com celular e e-mail), Grupo, Local, Início/Fim, Duração, Predecessores/Sucessoras, Progresso (clique abre medição), % previsto, Status (Concluído/Atrasado/Alerta/Em andamento/Em dia), Crítico, Restrições (contagem), Início/Fim real, Linha de base, Desafio, Custo/Receita (somente leitura quando vêm de vínculo), Pesos (físico, custo e receita) e Calendário. Também aceita **colunas personalizadas** (texto, número, data) e **disposições de colunas nomeadas** (ex.: "reunião" × "trabalho").

**Durações e calendário**
- `4d` = dias úteis (pula fins de semana e feriados).
- `3dd` = dias corridos.
- `24h` = horas de jornada.
- Calendário do projeto: fuso, dias trabalhados, horário por dia (padrão 08–16, todos os dias marcados), exceções por data ou intervalo, com presets de feriados.
- Calendários nomeados **por pacote** substituem o padrão em linhas específicas, que ganham a marca "Calendário alternativo".

**Predecessoras e CPM**
- Os tipos são TI/FS, II/SS, TT/FF e IT/SF, com lag ou sobreposição. Exemplos de sintaxe: `3`, `2TT`, `1 TI+0d`, `12TI-2d`.
- **Configurável por projeto**, há dois modos para tarefas com várias predecessoras:
  - *Modo Microsoft Project*: vale a predecessora que mais atrasa a tarefa.
  - *Respeitar todas*: cria uma janela de início mínimo e fim máximo. Se houver conflito, o fim manda.
- Ciclos de dependência são recusados. Na importação, a cadeia do ciclo é mostrada.
- O **caminho crítico** pode ser calculado sobre o cronograma completo ou só sobre as tarefas visíveis (filtradas). A barra avisa quando o segundo modo está ativo.
- **Início cravado (cadeado):** a tarefa não é empurrada pelas predecessoras. Serve para marcos contratuais. Existe ação em massa para cravar e descravar.
- **"Paredes" do recálculo:** folha ou pacote com 100% e tarefa com início cravado interrompem a propagação de datas para as sucessoras. A mudança de calendário atravessa essas paredes.

**Edição**
- A grade funciona como planilha: setas, Tab, Enter, Esc, Ctrl+Z/Y e duplo clique abre o editor completo.
- Na linha do tempo, arrastar a barra muda as datas.
- Multiseleção com barra inferior: mover, indentar, duplicar estrutura, vincular predecessoras, editar em lote, cravar/descravar e remover.

**Rascunho, versões e histórico**
- As edições ficam em **rascunho local** até salvar. Um contador mostra as alterações pendentes, e as remoções aparecem como "linha fantasma".
- **Cada salvamento cria uma versão**, com nota opcional.
- **Restaurar** uma versão carrega o conteúdo no rascunho e nunca sobrescreve o servidor direto.
- O histórico é rolante e poda versões antigas. Versões marcadas como importantes ficam guardadas e podem receber nome.
- Existe **bloqueio de cronograma** (Arquivo › Bloquear).

**Linha de base, desafio e variância**
- **Referência** é uma fotografia do cronograma. É possível ter várias, e duas têm papel especial:
  - **Linha de base** = plano oficial, base de praticamente todos os indicadores.
  - **Desafio** = plano agressivo, usado para comparação paralela.
- O snapshot guarda datas e também **duração, custo e receita**, que funcionam como os pesos daquela referência. Editar só as datas da referência não altera esses pesos.
- Tarefas excluídas do cronograma continuam na baseline, e o peso delas segue acumulando nas mães.
- A ação "Atualizar pesos" recalcula a duração a partir das datas da foto, ou copia custo e receita atuais. Pede frase de confirmação e não tem volta.
- O **modo de comparação** desenha as barras de referência junto às atuais.
- A **tabela de variância** mostra as diferenças campo a campo.
- **Sem linha de base marcada, a curva S, o IDP, os indicadores gerais e a tendência ficam vazios.**

**Acompanhamento**
- **Progresso** só pode ser lançado via medição. A célula não é editável direto; existe um atalho de correção pelo editor da tarefa, sem histórico.
- **% previsto** e **Status** comparam o realizado com o plano na data de hoje.
- **Metas mensais (curva S):** cravam a fatia planejada de cada mês. Um mês passado só pode ser editado se a meta não foi cravada dentro do próprio mês, o que preserva a honestidade do histórico.
- **Marcadores de data:** linhas verticais no Gantt, fixas ou ancoradas em tarefa com lag. Podem ser agrupados, coloridos e ocultados.

**Replanejar obra (assistente)**
- Reposiciona o cronograma inteiro a partir de uma **data de corte**:
  - *Tarefas no passado não iniciadas:* vêm inteiras para a data de corte.
  - *Tarefas com progresso:* o realizado fica onde ocorreu e o restante começa na data. Há opções de quebrar por progresso, esticar duração, mover ignorando início ou não mover.
  - *Tarefas em andamento:* mudam só se estiverem atrasadas em relação ao planejado.
  - *Tarefas futuras com progresso:* o realizado é lançado antes da data de corte e o término é mantido.
- O resultado vai para o rascunho. A recomendação é salvar uma versão antes de aplicar.

**Visualizar:** zoom (Dia/semana até Mês/ano), nível de detalhe, cores por status, progresso e nome na barra, ligações, dias ou horas. Tudo isso afeta só a tela de quem está usando.

**Exportar:**
- `.xlsx`, no mesmo formato aceito na importação.
- MS Project `.xml`.
- PDF "cronograma em uma página".
- Impressão A3 com quatro recortes: raízes, pacotes, todas ou filtradas.

**Barra de ferramentas observada:** Adicionar tarefa · Salvar · Registrar medição · Desfazer/Refazer · Zoom · Expandir/Níveis/Recolher · Colunas da grade · Histórico de versões · Replanejar obra · Referências · Metas mensais da curva S · Marcadores de data.

**Benefícios para o usuário**
- Um único lugar para o plano, sem perder a compatibilidade com o MS Project (entra `.mpp`, sai `.xml`).
- Rastreabilidade: versões com nota e restauração segura.
- O plano oficial fica protegido por snapshot. Mexer no cronograma não "reescreve a história" da baseline.
- O replanejamento em massa evita dias arrastando barras quando a obra descola do plano.

---

### 4.2 Planejamento › Medições

**Para que serve:** registrar o avanço físico como **fotografias datadas**. É o que gera série temporal: curva S, previsto × realizado e desempenho.

**Lógica**
- Cada medição tem uma **data efetiva**, que é a data a que o avanço se refere, e não a data de digitação.
- O percentual global é calculado aplicando todas as medições **em ordem de data efetiva**. Uma medição retroativa recalcula a série a partir dali, e corrigir uma medição antiga propaga o ajuste para as seguintes.
- Exige o cronograma **salvo**. A medição só trabalha sobre dados persistidos.
- A tela mostra, por tarefa: **Acumulado** na data, **Esperado** para a data, valor **Apontado** e a diferença ponderada pelo peso.
- Aceita **fotos** como evidência vinculadas aos itens.
- Caminho mais comum: no Semanal, a ação **"Salvar medição"** cria a medição a partir do que foi apontado na semana.

**Benefício:** separa "onde a obra está" de "quando chegou lá", o que torna os indicadores auditáveis.

---

### 4.3 Planejamento › Escadinha e Linha de balanço

**Para que servem:** leituras de **ritmo** em obras repetitivas, como pavimentos, blocos e trechos. São somente leitura; toda edição continua no Gantt.

**Dependem** de três campos do cronograma:
- **Grupo:** a unidade que se repete. Vira linha na escadinha e eixo vertical na linha de balanço.
- **Local:** filtro adicional para frentes paralelas.
- **Pacote:** a tarefa pai. Vira coluna na escadinha e cor na linha de balanço.

**Sem Grupo preenchido, as duas telas ficam vazias.**

**Escadinha:** matriz pacote × grupo, com a data (início ou fim) em cada célula. Com ritmo constante, as datas formam uma **diagonal**, e onde a diagonal quebra está o pavimento travado. Tem filtro de mês, visibilidade de pacotes e grupos, cores por situação e layout salvo no servidor.

**Linha de balanço:** tempo × grupos, com cada pacote desenhado como uma linha inclinada.
- **Inclinação = ritmo.** Linha mais deitada indica equipe mais lenta.
- **Linhas que se cruzam** indicam duas equipes disputando o mesmo local.
- Opções de início/fim/ambos, eixo em dias ou semanas e impressão paginada.

**Benefício:** enxergar o ritmo e os conflitos de equipe que o Gantt esconde. Uma torre de 30 pavimentos vira um desenho legível.

---

### 4.4 Semanal (Last Planner System)

**Para que serve:** o ciclo semanal de compromisso. A equipe se compromete com tarefas, aponta o avanço e justifica desvios, e o sistema mede o **PPC**.

**Configuração inicial:** escopo (por cronograma ou por projeto), **dia de início da semana** (padrão segunda) e primeira semana de preenchimento. Exige cronograma com tarefas.

**Ciclo de estados**
1. **Rascunho:** as tarefas do cronograma que caem no período entram automaticamente. Nesse estado é possível incluir tarefas, omitir as atuais ou atrasadas que não vão acontecer, criar subtarefas e ajustar as datas.
2. **Iniciada:** "Iniciar semana" **trava o plano**, que passa a ser o compromisso. Daí em diante só se aponta progresso e justifica atrasos.
3. **Finalizada:** congela o PPC e **abre a próxima semana automaticamente**.
4. **Pulada:** usada para recesso ou obra parada. Não entra no PPC.

**Trava de qualidade:** não é possível finalizar a semana enquanto houver tarefa abaixo do esperado **sem motivo de atraso**. O diálogo mostra quantas faltam e leva até elas.

**PPC (Percentual de Pacotes Concluídos)**
- **PPC = tarefas 100% concluídas ÷ tarefas planejadas na semana.**
- É binário: uma tarefa com 90% não entra no numerador.
- Quando há subtarefas, a mãe sai da conta e cada subtarefa da semana conta como uma unidade.
- Tarefas omitidas não penalizam o PPC.

**Colunas:** Pacote, Origem (automática ou manual), Esperado, Progresso, Peso total / previsto / executado na semana (em % físico, custo ou receita), Status, Motivo de atraso (do catálogo, com especificação obrigatória quando o motivo é "Outros") e Responsável.

**Calendário da semana:** pinta os dias de execução seguindo os segmentos do Gantt. Em duração em dias úteis, fim de semana fica em branco. É possível marcar dias produtivos em massa.

**Engajamento de quem está no campo**
- **"Enviar tarefas aos responsáveis"** manda e-mail com um link para uma **página pública**. O responsável indica se a tarefa está feita ou atrasada sem precisar de conta.
- A coluna **Status do responsável** mostra: não enviado, sem resposta, no esperado, atrasado com motivo e atrasado sem motivo.
- Essa indicação não grava o atraso na tarefa. É um insumo para o planejador.

**Atalhos:** Igualar ao esperado, Aplicar valor em massa, Marcar pendentes e Salvar progresso (com contador).

**Ponte com o cronograma:** "Salvar medição" grava o avanço da semana como medição. Exige o Gantt salvo.

**Benefícios**
- Disciplina de método: o PPC não pode ser maquiado, e o motivo do atraso é obrigatório.
- O ranking de causas mostra o gargalo real da obra (material, projeto, mão de obra, clima).
- Quem está no campo participa por e-mail sem precisar de licença ou login.

---

### 4.5 Restrições

**Para que serve:** planejamento de médio prazo, removendo bloqueios **antes** que virem atraso (projeto não liberado, material sem compra, licença, frente ocupada).

**Estrutura**
- **Plano de ação:** o bloqueio em si. Tem título, tipo (do catálogo por setor), criticidade (Crítico, Alto, Médio, Baixo, Informativo) e ID automático (0001, 0001.01…).
- **Ações do plano:** cada uma tem responsável, início, término, status e observações com histórico. O modo **"Usar como ação"** transforma o plano em uma linha única quando não há subações.
- **Vínculo ao cronograma:** uma ou mais tarefas do Gantt ligadas ao plano. A restrição aparece na coluna Restrições e como **badge na barra** da tarefa.

**Responsável externo por e-mail:** um projetista ou fornecedor sem conta recebe um link e atualiza o status por ali. As atualizações aparecem identificadas como "convidado". O próprio guia chama isso de **diferencial do módulo**.

**Outros recursos:**
- Planos concluídos ficam ocultos por padrão.
- Exportação para Excel (útil para a ata da reunião).
- Notificações por e-mail quando uma ação é atribuída e quando está vencendo ou atrasada.

**Diferença conceitual:** restrição é **prevenção** e é registrada antes. Motivo de atraso, no Semanal, é **diagnóstico** e é registrado depois.

**Indicador:** **IRR = restrições removidas ÷ identificadas** no período. Pode ser quebrado por responsável, setor e tipo.

**Benefício:** tira o controle de pendências de terceiros da planilha paralela e do WhatsApp, cobrando cada pessoa pelo próprio link.

---

### 4.6 Histograma de mão de obra

**Para que serve:** responder "quanta gente, de qual ofício, em qual dia".

**Configuração:** escopo por cronograma ou por projeto. Ao continuar, a plataforma cria um **catálogo padrão de ofícios** com produtividade, que pode ser revisado nas configurações.

**Cálculo:**
- **Efetivo = Quantitativo ÷ Produtividade do ofício ÷ Duração.**
- Exemplo: 600 m² ÷ 12 m²/dia ÷ 10 dias = 5 pessoas.

**Submódulos**
- **Recursos por tarefa:** matriz em árvore igual à do cronograma, com uma coluna por recurso.
  - As folhas recebem quantitativo e equipe.
  - Os pais mostram a média das folhas. Digitar um total no pai reparte o valor entre as filhas ao salvar.
  - Ações em massa: Definir quantitativo, Definir equipe, Calcular equipe do quantitativo (tarefas sem dados são ignoradas, com aviso) e **Estimar por IA**.
- **Calendário de cronogramas:** curva de carga diária, com totais por dia e marcador de "hoje". Mostra picos acima da capacidade do canteiro e vales de ociosidade.

**O histograma não tem datas próprias:** ele lê as datas do Gantt. Se uma tarefa muda no cronograma, a curva se redesenha.

**Benefício:** dimensionar a equipe e antecipar picos de mobilização.

---

### 4.7 Suprimentos

**Para que serve:** garantir que o material chegue no dia em que a tarefa começa, contando o lead time **de trás para frente**.

**Configuração (passo 1 de 2): etapas e lead time padrão.** O padrão observado na conta:

| Ordem | Etapa | Lead time |
|---|---|---|
| 1 | Cadastro da Solicitação | 10 dias |
| 2 | Mapa de Cotação | 20 dias |
| 3 | Pedido de Compras | 10 dias |
| 4 | Mobilização e Produção | 20 dias |
| 5 | Folga | 5 dias |
| | **Total** | **65 dias** |

As etapas podem ser reordenadas, adicionadas e removidas. O passo 2 é o escopo (por cronograma ou por projeto).

**Lógica**
- A **data de referência é o início da tarefa no Gantt**. A plataforma recua o lead time acumulado e calcula a data planejada de cada etapa.
- Se a tarefa se mover no cronograma, **todas as datas planejadas se movem junto**. As datas reais não mudam, e o que muda é o desvio.
- **Lead time por linha:** um item específico pode ter prazos próprios (por exemplo, elevador × cimento). A alteração desce para as filhas e a linha recebe a marca "lead times personalizados".
- **Desvio (dias)** = data real − data planejada. Valor positivo indica atraso.
- Cada célula de etapa tem status (Não iniciado, Em andamento, Concluído), data planejada, data real, observações e histórico.
- Os pais mostram status agregado. É possível omitir tarefas que não envolvem compra.
- O dashboard mostra status por etapa, itens em alerta e itens atrasados. Toda segunda-feira sai um e-mail com o resumo de atrasados e alertas.

**Benefício:** a compra deixa de ser surpresa. O quadro nunca fica desatualizado em relação ao plano.

---

### 4.8 Orçamento e Vinculação

**Para que serve:** trazer o orçamento (custo e receita) e **amarrar cada item às tarefas** do cronograma com pesos.

**Tipos de orçamento**
- **Custo:** alimenta a coluna Custo do Gantt, o peso de custo e o módulo Custos.
- **Receita:** medições de contrato e vendas. Alimenta a coluna Receita e o peso de receita.

**Quatro formas de criar**
1. **Manual:** editor em árvore com comportamento de planilha. Tem rascunho com marcação amarela, Ctrl+Z/Y e códigos recalculados (1, 1.1…) até cravar. Nas folhas entram unidade, quantidade e preço unitário, ou só o total.
2. **Planilha:** o parser lê os **nomes** das colunas (em pt-BR, en-US ou es-419), não a ordem. Exige código e descrição, além de quantidade × preço ou total. Reimportar descarta os itens atuais.
3. **ERP (Sienge ou Mega):** exige a integração configurada. Há um chip de origem no seletor e a opção "Atualizar orçamento do ERP" mostra o diff antes de gravar.
4. **IA:** chat que gera a estrutura (ver seção 6).

**Rascunho × Cravado**
- Só orçamentos **cravados** podem ser vinculados.
- Editar um orçamento cravado abre um rascunho paralelo sem mexer nas linhas vivas até cravar de novo.
- Código cravado não muda, e um item novo não reaproveita código já excluído.
- A tela mostra o que entra, muda ou sai, e os vínculos das linhas removidas só caem após confirmação.

**Vinculação**
- Painel duplo: orçamentos cravados à esquerda e cronogramas à direita.
- Seleciona-se itens × tarefas e usa-se **"Vincular com pesos"**. Um item pode ser repartido entre tarefas (ex.: 60% / 40%), e uma tarefa pode receber vários itens.
- É possível vincular a tarefas de **cronogramas diferentes**.
- Filtros: Não vinculados, Não somam 100% e Vinculação parcial.
- Valores que vêm de vínculo ficam **somente leitura** no Gantt.
- **O orçamento de custo precisa estar 100% vinculado para o módulo Custos abrir.** Um indicador de progresso mostra quanto falta.

**Benefício:** liga dinheiro ao plano físico. O avanço pode ser medido em **% custo** ou **% receita**, e uma tarefa cara passa a pesar mais que uma barata de mesma duração, que é como a diretoria enxerga a obra.

---

### 4.9 Custos

**Pré-requisito:** orçamento de custo **100% vinculado**. Se o módulo continuar bloqueado depois da vinculação, há o botão "Revalidar".

**Configuração:** escopo **por orçamento** (colunas, níveis e índices próprios de cada um) ou **por projeto** (tabela consolidada).

**Colunas:** Total orçado, Valor realizado, Valor comprometido, Realizado + Comprometido, **Saldo = Orçamento − (Realizado + Comprometido)**, Estoque, Progresso físico previsto/realizado, Saldo não corrigido/corrigido, Orçamento atualizado, **Tendência** (custo final projetado) e **Variação de tendência**.

**Controles**
- **Período:** acumulado ou movimento do mês.
- **Correção monetária:** liga ou desliga e escolhe o índice (ex.: CUB).
- **Níveis:** nível 2 para a diretoria, folhas para o engenheiro de custos.
- **Planilha de custos:** importa realizado, comprometido e estoque do mês aberto como rascunho.
- **Acumular / distribuir / reconciliar por ramo:** define a relação entre valores de pai e filho.
- **Travar linha:** disponível quando o físico realizado chega a 100%. Congela valores e tendência a partir do mês. Se a variação for negativa, o **motivo de estouro é obrigatório**, e o catálogo já vem com os motivos padrão da CSO.

**Fórmulas (diferencial forte)**
- Até **5 colunas personalizadas por orçamento**, com sintaxe tipo planilha:
  - Campos entre colchetes: `[Valor realizado]`, `[Total]`, `[Saldo]`, `[Índice de correção]`.
  - Operadores `+ − × ÷`, comparações e `if(cond, então, senão)`, `min()`, `max()`.
  - Validação em tempo real (colchete aberto, campo desconhecido, divisão por zero).
- A **fórmula da Tendência é editável** no mesmo editor. A projeção segue o critério da empresa, sem caixa-preta.
- **Ajuste manual por célula:** exige motivo e congela a célula com a marca "Manual". Não se atualiza sozinho, então precisa ser revisado no fechamento mensal.

**Benefício:** responde "quanto resta" e "quanto essa obra vai custar no fim" com cruzamento físico × financeiro. O cálculo é auditável e configurável.

---

### 4.10 Integração (ERP)

- Provedores: **Sienge** e **Mega**.
- Campos: subdomínio ou tenant, usuário de API (com leitura de orçamento) e senha (não exibida após salvar).
- Botões **Testar conexão** e Salvar.
- Uso: **importar orçamentos** e **exportar a estrutura de volta** ao ERP.
- A integração é configurada por projeto. Existe também a permissão "Gerir integrações" no nível do workspace.

---

### 4.11 Dashboard e indicadores

**Estrutura:** **Visão geral** do projeto, mais **um painel por módulo** (Planejamento, Semanal, Restrições, Histograma, Suprimentos, Orçamento, Custos). Dentro de cada módulo há um atalho "Abrir painel modular do módulo".

**Edição:** Editar painel → Adicionar widget (catálogo por módulo) → arrastar e redimensionar → Salvar layout.
- **O layout é salvo no servidor e vale para todos** que abrem aquele painel.
- Cada widget tem uma **engrenagem própria**. Os ajustes valem só para quem está vendo, até alguém clicar em "Salvar como padrão da dashboard".
- Os cards têm três tamanhos (útil para TV na obra).
- Exportação em PDF pela impressão do navegador.

**Três controles que mudam a leitura de tudo**
1. **Base do percentual:** % físico, % custo ou % receita. Custo e receita só existem com vinculação.
2. **Referência:** linha de base ou desafio.
3. **Data de referência:** dia atual ou mês atual. No começo do mês, essa escolha muda bastante o "previsto" e, por consequência, o atraso aparente.

**Widgets observados por painel**
- *Visão geral / Planejamento:* Imagem do projeto, Indicadores gerais, Desempenho do cronograma (IDP), Curva S, Progresso por pacote/grupo/local/responsável, Tarefas atuais, Tarefas por meta mensal, Tarefas na linha de base, Tarefas no desafio.
- *Semanal:* Progresso, % de omissão, PPC histórico, PPC, PPC por responsável, Motivos de omissão, Tarefas omitidas, Motivos de atraso, Tarefas com motivo de atraso. Toggle Físico/Custo/Receita.
- *Restrições:* IRR, Status, IRR na linha do tempo, Status na linha do tempo, IRR por responsável/setor/tipo, Próximos planos a vencer, Planos críticos. Janela padrão: últimos 90 dias.
- *Histograma:* Somatória de recursos, Número de recursos, Cronograma por atividade × dia × pessoas.
- *Suprimentos:* Status por etapa, Suprimentos em alerta, Suprimentos atrasados.
- *Orçamento:* Curvas Prev × Real por item, Previsto × realizado (mensal/acumulado, valor/%).
- *Custos:* Indicadores gerais de custo (orçamento, atualizado, gasto, comprometido, saldo, tendência, CUB base/atual, R$/m²), IDC, Avanço por etapas, Comparativo físico e custo, Desembolso previsto × realizado, Principais motivos de estouro.

**Indicadores: definição e leitura**

| Indicador | Fórmula | Leitura |
|---|---|---|
| **Curva S** | Previsto e realizado acumulados (linhas) + avanço do período (barras) | A distância vertical na data de hoje é o atraso físico. Se essa distância aumenta, o problema está em curso. |
| **IDP** (prazo) | Avanço realizado ÷ previsto | 1,0 indica que a obra está no plano. Meta configurável entre 0,5 e 1,5. O IDP mensal é o termômetro; o acumulado reage devagar. |
| **IDC** (custo) | Valor agregado ÷ valor gasto | IDC 0,90 significa ~R$ 1,11 gasto para cada R$ 1,00 entregue. Exige o módulo Custos. |
| **IRR** | Restrições removidas ÷ identificadas | Ler sempre junto com o total identificado (3 de 3 = 100% pode indicar que ninguém está identificando restrições). |
| **PPC** | Tarefas 100% ÷ planejadas | Abaixo de ~70% de forma sustentada indica plano otimista. |
| **Término atual** | CPM com o cronograma de hoje | "Quando acaba se nada mudar." |
| **Término gerencial** | Data-alvo definida à mão | Compromisso interno. |
| **Tendência** | Fixa a âncora e recalcula o restante do caminho crítico | "Quando acaba se o ritmo continuar." Séries Atual, Linha de base, Desafio e Pessimista. Tem **auditoria** (âncora, dias escorregados, fim projetado). |

**Leitura combinada IDP × IDC (do próprio guia):**
- IDP baixo e IDC alto: obra atrasada mas barata, normalmente parada.
- IDP alto e IDC baixo: obra no prazo à custa de gasto extra (hora extra, retrabalho).
- Os dois baixos: é preciso revisar o plano.

**Widgets nunca ficam vazios em silêncio:** a mensagem diz o que falta (linha de base, semana finalizada, vinculação etc.) e geralmente traz um atalho para resolver.

---

### 4.12 Qualidade e Diário (em construção)

- Os guias dizem que **Diário e Qualidade** aparecem com a marca "Em breve". Na conta testada, Qualidade **não aparece no trilho**.
- Porém já existe **configuração de Qualidade** no projeto:
  - Escopo por cronograma ou por projeto, com uma "lista de verificações".
  - Catálogo de motivos para marcar uma tarefa como "não aplicável ao controle de qualidade": Serviço não produtivo, Sem norma ou critério aplicável, Escopo de terceiro, Tarefa duplicada e Outro.
- Também já existem **notificações** de FVS (Ficha de Verificação de Serviço) e de Não Conformidade: tarefa em execução sem FVS, FVS gerada e não preenchida, NC vencendo e NC atrasada.
- Leitura: o módulo de Qualidade deve vir com FVS vinculada a tarefas do cronograma e gestão de não conformidades.

---

## 5. Administração, permissões e notificações

### 5.1 Pessoas
- Convite por e-mail com perfil de acesso e acesso a projetos ("Todos" ou "Só selecionados").
- Projetos criados depois **não** entram automaticamente quando o acesso é "selecionados".
- Convite para quem não tem conta fica pendente. Ao criar a conta, a pessoa já entra configurada.
- Login por Google, Microsoft ou código por e-mail (sem senha).

### 5.2 Perfis de acesso (RBAC)
- **Perfis do sistema:** Administrador, Membro e Somente leitura. Não podem ser editados.
- É possível criar perfis próprios. A permissão efetiva é igual a concessões menos negações.
- Existem perfis no nível do **workspace** e no nível do **projeto**.
- Opção "Incluir em todos os projetos": novos membros com aquele perfil entram em todas as obras com um perfil de projeto definido.
- Permissões de workspace observadas:
  - **Geral:** acessar, ver visão geral, editar configurações, gerir logo, excluir.
  - **Projetos:** criar, listar próprios, listar todos.
  - **Pessoas:** ver, gerir, convites, ver/gerir perfis.
  - **Faturamento:** ver, editar, ver faturas, pagar, gerir cliente.
  - **Integração:** ver, gerir.

### 5.3 Notificações (e-mail, além do in-app)
- Semana LPS em aberto perto do fim
- Cronograma sem salvar e sem medições
- Cobrança e faturas
- Ação de restrição vencendo ou atrasada
- Ação de restrição atribuída a você
- Resumo semanal de suprimentos (segunda-feira)
- Acesso concedido
- Menção com @ em comentário
- Tarefa em execução sem FVS
- FVS não preenchida
- Não conformidade vencendo
- Não conformidade atrasada

### 5.4 Outros
- Idiomas: pt-BR, en-US e es-419.
- Tema claro, escuro ou sistema.
- Tours guiados contextuais por tela (no cronograma: visão geral, multisseleção e teclado).
- Central de tutoriais com cerca de 20 guias detalhados.

---

## 6. IA na plataforma

O princípio, declarado e coerente nas três frentes, é: **a IA propõe, o usuário revisa e nada é gravado sem confirmação explícita.**

| Onde | O que faz | Como funciona | Cuidado indicado pelo produto |
|---|---|---|---|
| **Cronograma** | Gera a estrutura inicial: fases, pacotes, repetições (pavimentos, blocos, trechos) e vínculos | Chat em linguagem natural ↔ formulário de passos (um atualiza o outro) → **prévia** com número de tarefas e vínculos → "Gerar cronograma" | Os nomes vêm genéricos (torre, lote, frente) de propósito. É ponto de partida. |
| **Orçamento** | Monta a árvore de itens | Chat ocupa a tela; com escopo suficiente, a tela se divide em árvore + chat → Cravar | "Estrutura, não preço": substituir valores pela base de preços da empresa |
| **Histograma** | Estima quantitativos pelo nome e contexto das tarefas | Ação em massa "Estimar por IA" | Não usar para contratar equipe sem conferir o levantamento real |

**Erros previstos:** limite de uso, assistente indisponível, excesso de passos e prévia não calculável.

**Ponto em aberto:** o guia não responde se os dados da obra são usados para treinar modelos. Ele remete ao time da Cofield.

---

## 7. Benefícios por perfil de usuário

| Perfil | O que ganha |
|---|---|
| **Diretor / incorporador** | Visão consolidada de prazo (IDP, tendência auditável) e custo (IDC, tendência de custo, desembolso), com avanço em % custo ou receita, que é a linguagem da diretoria. Dashboard em PDF ou TV. |
| **Planejador** | Gantt compatível com MS Project, versões seguras, linha de base com snapshot, replanejamento em massa, escadinha e linha de balanço, IA para sair do zero. |
| **Engenheiro de obra** | Semanal com compromisso e calendário, restrições com cobrança de terceiros por link, histograma para dimensionar equipe. |
| **Mestre / encarregado / terceiros** | Atualizam status pela página pública via e-mail, sem login. |
| **Suprimentos / compras** | Datas-limite de cada etapa calculadas a partir do cronograma, com desvio em dias e e-mail semanal. |
| **Custos / controladoria** | Saldo, comprometido, estoque, correção por CUB, fórmulas próprias, motivos de estouro padronizados. |
| **Consultor de planejamento** | Mesma ferramenta e método em vários clientes, com vários workspaces e preço por obra. |
| **Financeiro** | Fatura por obra ou agregada, NFS-e configurável, boleto ou cartão. |

---

## 8. Análise de produto (visão de PM)

### 8.1 Forças
1. **Profundidade metodológica rara.** As regras de negócio protegem a integridade dos dados:
   - Finalizar a semana exige justificar os atrasos.
   - A meta mensal não pode ser reescrita depois do mês.
   - Estouro de custo exige motivo.
   - O snapshot da baseline guarda os pesos.
   - A restauração de versão vai para o rascunho.

   Isso é desenho de produto feito por quem conhece LPS e controle de obras.
2. **Grafo de dados único.** A cadeia cronograma → medição → semanal → custos é coerente. A mesma tarefa alimenta todos os módulos, e mudar uma data propaga para suprimentos e histograma.
3. **Indicadores auditáveis.** A tendência tem "Como a data é calculada" e a fórmula de custo é editável. Isso reduz a resistência ("esse número está errado") e aumenta a adoção pela gestão.
4. **Colaboração externa sem licença.** Restrições e Semanal por link de e-mail atacam o maior problema real, que é a dependência de terceiros. Também é um vetor de aquisição viral.
5. **Pouca fricção de migração.** Importa `.mpp` direto, exporta `.xml`, aceita planilha com parser por nome de coluna e se integra a Sienge e Mega.
6. **Escopo por cronograma ou por projeto** em cada módulo dá flexibilidade a obras com várias frentes sem forçar um único modelo.
7. **Onboarding bem documentado.** A central de tutoriais é extensa, cada estado vazio explica o que falta e há tours contextuais.

### 8.2 Fraquezas e riscos
1. **Dependência em cascata e onboarding pesado.** Quase nada funciona antes de existir cronograma salvo com linha de base. Custos ainda exige orçamento cravado e 100% vinculado. Isso eleva o *time-to-value*: no projeto de teste, todos os painéis estavam vazios. A IA de cronograma é a principal alavanca para encurtar esse caminho, mas não aparece como CTA no estado vazio do módulo (a tela observada só oferece "Novo cronograma", que pede um nome).
2. **Preço por obra e degraus grandes.** Do Lite para o Plus o preço mais que dobra (R$ 349 → R$ 799). Restrições, que o próprio produto apresenta como diferencial, só entra no **Pro** (R$ 999). Para uma construtora com 10 obras no Pro, o custo é ~R$ 10 mil/mês.
3. **Inconsistências de comunicação:**
   - A descrição do Lite promete "diário", e o Plus promete "qualidade", mas Diário e Qualidade estão "em breve".
   - A landing diz que a IA gera Gantt, linha de balanço e Last Planner. Na prática, gera o cronograma, e as outras visões derivam dele.
   - Os contadores "Nossos números" da landing aparecem como "+0" na leitura da página. Pode ser só a animação, mas transmite pouca credibilidade se renderizar assim.
4. **Curva de aprendizado alta.** Exemplos: paredes do recálculo, dois modos de predecessoras, reconciliar por ramo, pesos de baseline. Isso exige maturidade de planejamento. Para obras menores (o caso típico do Lite), pode ser complexidade demais.
5. **Sem app mobile evidente.** O canteiro é atendido por e-mail e página pública. O Diário de obra, que é o caso mobile clássico, ainda não existe.
6. **Ações irreversíveis concentradas** (atualizar pesos da baseline, restaurar layout padrão, reimportar orçamento). Elas exigem frase de confirmação, o que mitiga o risco, mas aumenta a ansiedade de quem está começando.
7. **Dados e IA:** não há política clara de uso de dados para treinamento. Isso pode ser objeção em incorporadoras grandes.

### 8.3 Oportunidades
- Tornar "Gerar com IA" e "Importar .mpp" os CTAs principais do estado vazio do Cronograma, para reduzir o time-to-value.
- Oferecer um projeto de demonstração pré-populado no trial, para que a pessoa veja dashboards cheios antes de investir horas de setup.
- Lançar Diário e Qualidade (a FVS já tem notificações prontas), o que fecha o ciclo do canteiro e justifica os planos superiores.
- Criar planos por volume (workspace com N obras) ou um add-on de Restrições no Plus, para suavizar os degraus de preço.
- Fazer benchmark entre obras do mesmo workspace (PPC, IDP, motivos de atraso), aproveitando os dados padronizados por catálogo.

### 8.4 Posicionamento competitivo
- **Contra MS Project / Primavera:** substitui o Gantt com compatibilidade de ida e volta e acrescenta LPS, restrições, custos e dashboard, que esses softwares não têm.
- **Contra planilhas:** traz integridade (versões, travas, motivos obrigatórios) e indicadores automáticos.
- **Contra ERPs (Sienge/Mega):** não compete, complementa. Puxa o orçamento do ERP e entrega o planejamento operacional que o ERP faz mal.
- **Contra apps de diário (tipo Diário de Obra):** ainda perde no canteiro mobile enquanto Diário e Qualidade não saem.

---

## 9. Mapa de telas observadas (referência rápida)

| Área | Rota | Estado observado |
|---|---|---|
| Dashboard workspace | `/home/dashboard` | Saudação + projetos recentes |
| Listagem de projetos | `/home/projects` | Cards/Tabela; Casa 2 (Teste, "sem cronograma consolidado") |
| Config. conta | `/settings/{profile,notifications,appearance}` | 12 tipos de notificação |
| Config. workspace | `/settings/{workspace,permission-profiles,people,billing}` | 3 perfis do sistema; 1 membro (Proprietário) |
| Config. projeto | `/projects/{id}/settings/{general,billing,module-config/*}` | Enterprise em trial |
| Cronograma | `/modules/planning/schedule` | Vazio; toolbar completa |
| Escadinha / LB / Medições | `/modules/planning/{staircase,line-of-balance,measurements}` | Vazios |
| Semanal | `/modules/weekly/overview` | Tela de configuração do LPS |
| Restrições | `/modules/restrictions/overview` | Tela de escopo |
| Histograma | `/modules/histogram/task-resources` | Tela de escopo |
| Suprimentos | `/modules/supply/overview` | Assistente com 5 etapas padrão |
| Orçamento | `/modules/budget/{linking,budgets}` | Vazio |
| Custos | `/modules/costs/overview` | Assistente de escopo (passo 1/2) |
| Integração | `/modules/integration/erp` | Formulário Sienge/Mega |
| Dashboards | `/modules/dashboard/{overview,planning,weekly,restrictions,histogram,supply,budget,costs}` | Widgets vazios com mensagem do que falta |
| Tutoriais | `/guides` | ~20 guias |

---

## 10. Limitações desta análise

- O projeto estava vazio. **Nenhum fluxo foi executado de ponta a ponta**: não foi criado cronograma, rodada a IA, aberta uma semana LPS ou feita vinculação. A lógica desses fluxos vem dos guias oficiais da própria Cofield e das telas de configuração observadas.
- Não foi testada a performance com cronogramas grandes nem a qualidade real do output da IA.
- Os preços e a composição dos planos são os exibidos na conta em 22/10/2026.

**Próximo passo sugerido:** criar um cronograma de teste com a IA no projeto *Casa 2*, salvar uma linha de base e lançar uma medição. Isso permite validar na prática a qualidade da IA, o comportamento da curva S e o fluxo semanal.
