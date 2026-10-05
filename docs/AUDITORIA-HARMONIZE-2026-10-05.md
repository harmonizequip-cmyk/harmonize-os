# Harmonize OS: auditoria de 05/10/2026 e plano de trabalho

Este arquivo é a passagem de bastão de uma auditoria feita com acesso de leitura ao código (commit `e26b02c` da `main`), ao banco de produção (Supabase `vidnlzbxaxjlmzncqhxw`) e ao Vercel. Complementa o `CLAUDE.md`, que continua sendo a referência de como o sistema funciona.

**Como usar:** leia inteiro antes de mexer em qualquer coisa. Trabalhe um item por vez, na ordem da seção 5. Antes de cada item, confira de novo a evidência citada, porque o código muda. Nenhuma alteração foi feita no banco durante a auditoria.

**Legenda de confiança**
- **[conferido]**: eu mesmo li o código e, quando aplicável, consultei o banco.
- **[varredura]**: apontado por leitura automática do código, com arquivo e linha, mas não reconferido por mim. Confira antes de corrigir.

Este arquivo não contém nome de cliente nem valor por cliente, de propósito: o repositório provavelmente é público (item 2.1).

---

## 1. O que está saudável

Tudo abaixo foi medido no banco de produção em 05/10/2026.

| Verificação | Resultado |
|---|---|
| Locação marcada como paga com saldo em aberto | 0 |
| Locação não paga com saldo zero | 0 |
| Pagamento com valor diferente do lançamento no caixa | 0 |
| Pagamento sem lançamento, ou entrada de locação sem pagamento | 0 |
| Locação sem evento na agenda | 0 |
| Evento e locação com data, status ou equipamento diferentes | 0 |
| Tabelas sem RLS | 0 de 18 |
| Dados de teste sobrando, modo teste ligado | 0, desligado |
| WhatsApp duplicado entre clientes | 0 |
| Erros de execução no Vercel (7 dias) | nenhum |
| Deploy de produção | `READY` |
| RPCs e tabelas chamadas pelo código que não existem no banco | nenhuma |

Tamanho atual: 16 locações, 39 lançamentos, 40 eventos, 192 clientes, 1 usuário (admin). O sistema é novo e os dados estão íntegros. Os problemas abaixo são quase todos **caminhos que ainda não foram exercitados** ou que foram exercitados pouco.

---

## 2. Achados

### Prioridade 0: podem gravar dinheiro errado

#### 0.1 "Marcar pago" ignora pagamento parcial [conferido]
- **Onde:** função `marcar_locacao_paga` em `schema.sql` (`v_valor_lancamento := greatest(v_valor - v_credito, 0)`), chamada por `components/AgendamentosDoCliente.tsx` no botão "Marcar pago". Esse componente só aparece no card do Funil (`app/(app)/funil/LeadCardModal.tsx`).
- **Problema:** a função lança o valor cheio da locação menos a taxa, sem descontar o que já existe em `rental_payments`. A tela mostra a mesma conta errada (`aReceber = valor - credito`).
- **Risco concreto:** desde 04/10 a tela de Pendências registra pagamento parcial, e já existe uma locação com parcial lançado. Tocar em "Marcar pago" nela grava o valor cheio de novo, e o recebido passa do valor da locação.
- **Correção sugerida (só código):** o botão passa a ler o saldo de `rentals_situacao_pagamento` e a chamar `registrar_pagamento_locacao` com esse saldo, forma e conta PIX, igual à tela de Pendências. A função antiga deixa de ser usada pela tela.
- **Como conferir:** numa locação com parcial, o valor oferecido tem que ser o saldo, e o banco tem que recusar valor acima dele.

#### 0.2 Taxa de reserva paga é descontada duas vezes [conferido]
- **Onde:** `lib/rental-calculator.ts` (`valorLocacao = bruto - creditoTaxa`) e `components/CalculadoraLocacaoModal.tsx` (`p_calculated_value: resumo.valorLocacao`, nos dois caminhos: `create_rental` e `finalize_rental_reservation`). A view `rentals_situacao_pagamento` desconta a taxa paga outra vez.
- **Problema:** a calculadora grava o valor já sem a taxa, e o banco espera o valor bruto. O saldo fica menor pelo valor da taxa, e `registrar_pagamento_locacao` recusa o pagamento do valor mostrado ao cliente, por ser maior que o saldo.
- **Estado no banco:** nenhuma taxa foi paga até hoje (36 "nao_aplica", 4 "pendente", 0 "paga"). O defeito ainda não aconteceu. Vai acontecer na primeira reserva com taxa paga que for finalizada pela calculadora, e há 4 taxas pendentes agora.
- **Correção sugerida (só código):** gravar o bruto em `p_calculated_value` e manter na tela e no resumo do WhatsApp o "a pagar agora" como bruto menos crédito. Conferir também o caso "cobrar agora" (`totalAPagarAgora = valorLocacao + taxa`). Cobrir com testes em `lib/`.
- **Como conferir:** simular reserva com taxa paga, finalizar, e ver saldo igual a bruto menos taxa menos pagamentos.

#### 0.3 Taxa vencida não tem baixa onde é mostrada [conferido]
- **Onde:** `app/(app)/pendencias/PendenciasClient.tsx`, seção "Taxas de reserva vencidas". O botão "Abrir na agenda" vai para `/agenda` sem data, e o modal da Agenda não tem ação de taxa. A baixa (`definir_taxa_agendamento`) só existe em `AgendamentosDoCliente`, dentro do card do Funil.
- **Problema:** é o mesmo defeito que o dono já reclamou duas vezes: um aviso que leva a uma tela sem a ação.
- **Correção sugerida (só código):** botão "Taxa recebida" em cada linha da seção, com forma de pagamento, chamando `definir_taxa_agendamento(p_event_id, 'paga', forma)`. Trocar o link por `/agenda?date=<data>`.
- **Atenção:** corrija o item 0.2 antes ou junto, porque este botão vai gerar as primeiras taxas pagas do sistema.
- **Decisão do dono embutida:** `definir_taxa_agendamento` data o lançamento no dia do evento, que é futuro. A taxa recebida hoje não aparece em "Entradas" de hoje nem do mês, mas entra no Saldo. Pergunte a ele se a data deve ser a do recebimento.

### Prioridade 1: segurança, barata de fechar

#### 2.1 O repositório provavelmente é público [conferido em parte]
- **Evidência:** `git fetch` e `raw.githubusercontent.com` devolveram arquivos dos dois repositórios (`harmonizequip-cmyk/harmonize-os` e a cópia antiga `edercampos1985-svg/harmonize-os`) numa sessão sem credencial para eles. Não consegui ver o rótulo "Public" na página.
- **O que fica exposto se for público:** todo o `schema.sql`, as regras de negócio, o `CLAUDE.md` com o id do projeto Supabase, e `lib/rental-calculator.ts` com as três chaves PIX, uma delas um CPF.
- **O que fazer:** confirme com `gh api repos/harmonizequip-cmyk/harmonize-os --jq .private`. Se for `false`, avise o dono para tornar privado em Settings do GitHub (ação dele) e para apagar ou tornar privada a cópia antiga. Confira antes se o plano do Vercel dele publica de repositório privado.

#### 2.2 Funções de exclusão sem checagem de permissão, executáveis sem login [conferido no banco]
- **Evidência:** no banco, `has_function_privilege('anon', ...)` é verdadeiro para as 58 funções `security definer`. `excluir_locacao_cascata` e `excluir_mentoria_cascata` não chamam `require_admin()` nem `has_module_permission()` e não registram no histórico. `registrar_movimentacao` também aceita chamada direta, o que permite forjar linha de histórico.
- **Risco real:** baixo hoje, porque é preciso conhecer o UUID da locação e a RLS não deixa quem não está logado ler as tabelas. Somado ao item 2.1, o esquema inteiro está à vista, então vale fechar.
- **Correção (migration, precisa do aval do dono):** acrescentar `perform public.require_admin();` no início das duas funções de exclusão; `revoke execute ... from anon, public` em todas as funções do schema `public`, mantendo `grant ... to authenticated`; deixar `disponibilidade_publica` liberada só se o dono usar o link público (nenhum código do app chama essa função).
- **Como conferir:** repetir a consulta de `has_function_privilege('anon', ...)` e ver falso em todas, e testar o app logado.

#### 2.3 Itens menores de segurança
- **`expense_limits`** [conferido no banco]: as duas policies valem para qualquer papel, inclusive sem login, e `limits_rw_pessoal` não confere usuário. A tabela está vazia. Restringir a `authenticated` com checagem de dono, ou remover a tabela se o recurso não existe.
- **Senhas vazadas** [conferido no banco]: a proteção contra senha vazada do Supabase Auth está desligada. É um botão no painel do Supabase, ação do dono.
- **`handle_new_user`** [conferido no banco]: existe no `schema.sql` e não existe no banco, e não há gatilho em `auth.users`. Há 1 usuário e 1 perfil. Hoje um usuário novo nasceria sem perfil e sem acesso, o que é o comportamento seguro. O `schema.sql`, se reaplicado, criaria perfil com quase todas as permissões ligadas. Pergunte ao dono se pretende ter outro usuário; se não, tire a função do `schema.sql`.
- **Permissão de módulo só no menu** [varredura]: nenhuma página confere a permissão no servidor, só o menu esconde o link. Com um usuário só, não tem efeito. Passa a importar no dia em que houver um segundo usuário.
- **`components/ConfirmPinModal.tsx`** [varredura]: PIN fixo no código, componente não usado. Remover.

### Prioridade 1: uso diário

#### 3.1 O sistema de tarefas está parado [conferido no banco]
- **Evidência:** 42 tarefas pendentes, 38 atrasadas, e 1 tarefa concluída em toda a história (27/09). Por tipo: 25 recontato, 9 pós-locação, 4 cobrança de taxa, 4 contato inicial.
- **Causa provável:** o dono vive no Dashboard, e o Dashboard não lê a tabela `tasks`. As tarefas só são geradas ao abrir Funil ou Tarefas (`gerar_tarefas_agenda` e `gerar_tarefas_recontato`), e Tarefas fica dentro de "Menu". A pós-locação tem janela de 14 dias: se nenhuma das duas telas for aberta nesse prazo, a tarefa nunca nasce.
- **Por que importa:** a meta é de 25 a 30 locações por mês e outubro tinha 14 eventos. Recontato e pós-locação são o motor de venda, e estão acumulando sem uso.
- **Correção sugerida:** chamar as duas funções também no Dashboard; um cartão no Dashboard com a contagem por tipo, levando à lista filtrada; e em cada tarefa automática um botão de WhatsApp com a mensagem pronta, porque hoje só existe "Concluir" [varredura para este último ponto]. Converse com o dono antes: pode ser que ele prefira menos tipos de tarefa.

#### 3.2 Locação de vários dias não cabe numa reserva só [conferido]
- **Evidência:** `ReservarHiproModal.tsx` e `NovoEventoModal.tsx` gravam `date_end` igual a `date_start`. `finalize_rental_reservation` não leva `date_end` para `rentals.event_date_end`. `reagendar_agendamento` iguala as duas datas. `agenda/page.tsx` nem busca `date_end`. No banco há 0 eventos e 0 locações de mais de um dia.
- **Caso real:** uma locação de vários dias foi lançada como 4 reservas de um dia. A orientação dada ao dono foi lançar os disparos em uma delas e cancelar as outras 3.
- **Correção (migration mais telas):** data final opcional na reserva; `finalize_rental_reservation` copiando `date_end`; Agenda, imagem de datas disponíveis e radar pintando todos os dias do período; reagendar preservando a duração. É o item de maior esforço desta lista.

#### 3.3 Edição que desalinha caixa e pagamentos
- **Financeiro edita direto um pagamento de locação** [conferido]: `app/(app)/financeiro/EditarLancamentoModal.tsx` faz `update` em `transactions` sem passar por `editar_transacao`, que existe e bloqueia exatamente esse caso. No banco já há 2 pagamentos cuja data difere da data do lançamento, com valores iguais. Usar a RPC ou bloquear a edição quando o lançamento for pagamento de locação.
- **`update_rental`** [conferido]: ao salvar "Editar locação", sobrescreve valor e data do lançamento apontado por `rentals.transaction_id` com o valor cheio e a data do evento, e não recalcula `pago`. Aumentar o valor de uma locação quitada deixa `pago = true` com saldo positivo, e Pendências não enxerga porque filtra `pago = false`.
- **Campo de valor com ponto de milhar** [conferido]: dez campos usam `Number(x.replace(",", "."))`, então "1.500" vira 1,5. `CalculadoraLocacaoModal.tsx` e `PendenciasClient.tsx` já tratam o ponto. Criar um conversor único em `lib/` e usar em todos.

### Prioridade 2: melhora, sem urgência

- **`schema.sql` e banco com conteúdo diferente** [conferido por hash]: 52 de 63 funções batem. Diferem: `agendamentos_do_cliente`, `definir_taxa_agendamento`, `desfazer_conclusao_tarefa`, `desfazer_pagamento_locacao`, `excluir_mentoria_cascata`, `marcar_is_client`, `reativar_agendamento`, `registrar_pagamento_locacao`, `remover_pagamento_locacao`, `set_client_test_flag_cascade`, `validar_equipamento_coerente`. Em pelo menos uma a diferença é real: no banco, `agendamentos_do_cliente` devolve uma coluna a mais (reagendado). Nas outras pode ser só comentário ou quebra de linha. O banco é a verdade: traga cada definição com `pg_get_functiondef` para o `schema.sql`.
- **Lucro** [varredura]: as views `rentals_lucro` e `clientes_lucro` não filtram `excluir_financeiro`, e a soma de despesas não filtra `is_test`. A conta de lucro do modal de edição usa outra fórmula. Unificar antes de mostrar lucro em Locações e Relatórios.
- **Mesmo rótulo, contas diferentes** [varredura]: "Pendente" nos cards de equipamento soma saldo de locações futuras; "A receber" em Pendências soma só as vencidas. O período padrão é "hoje" no Dashboard, "mês" no Financeiro e "ano" em Relatórios.
- **Detalhe do equipamento no celular** [conferido]: `app/(app)/dashboard/equipamentos/[id]/page.tsx` tem tabela de 6 colunas em contêiner `overflow-hidden`, sem versão em cartão. Corta colunas em tela estreita.
- **Falha de consulta vira "nada pendente"** [varredura]: `lib/pendencias.ts` e outras telas de dinheiro leem só `data` e ignoram `error`. Uma falha de rede mostra "ninguém devendo". Mostrar erro em vez de lista vazia nas telas de dinheiro.
- **Sobras** [conferido no banco]: tabela `clients_backup_stage` (RLS ligada, sem policy, sem chave primária) e view `locacoes_a_receber` (filtra `status = 'realizada'`, que quase nunca é marcado, e nenhuma tela usa).
- **Cadastro** [conferido no banco]: 185 de 192 clientes sem Tratamento ou Nome de exibição. As mensagens agora tiram o nome do campo "Nome", então isso deixou de travar. Um cliente tem nome de empresa e sairia com saudação estranha.
- **Desempenho**: o Supabase aponta 22 chaves estrangeiras sem índice e policies que reavaliam `auth.uid()` por linha. Com o volume atual não há efeito. Não mexer agora.

---

## 3. O que não fazer

- Não criar aviso pedindo para "marcar como realizada". O status é derivado pela data.
- Não mudar a regra das datas disponíveis (dia livre só com os dois HIPROs livres). O dono trabalha sozinho e decidiu manter.
- Não colocar em Pendências nada que não seja dívida ou atendimento ainda não cobrado.
- Não rodar SQL de alteração sem mostrar antes o que vai mudar e receber o aval.
- Não afirmar efeito de mudança sem conferir no código ou no banco. Na conversa que gerou esta auditoria, três afirmações sobre o que "finalizar" fazia estavam erradas por dedução.
- Não corrigir vários itens numa entrega só. Um por vez, com conferência do dono na tela.

---

## 4. Perguntas que só o dono responde

1. O repositório é para ser privado? (item 2.1)
2. A taxa de reserva recebida deve entrar no caixa na data do recebimento ou na data do evento? (item 0.3)
3. Ele usa o link público de disponibilidade? Se não, a função pública pode ser fechada. (item 2.2)
4. Vai existir um segundo usuário algum dia? (item 2.3)
5. Quais tipos de tarefa ele quer de fato receber, e onde? (item 3.1)

---

## 5. Ordem sugerida

| # | Entrega | Tipo | Depende do dono? |
|---|---|---|---|
| 1 | "Marcar pago" usando o saldo (0.1) | código | não |
| 2 | Calculadora gravando o valor bruto (0.2) | código e testes | não |
| 3 | "Taxa recebida" em Pendências (0.3) | código | pergunta 2 |
| 4 | Confirmar se o repositório é público (2.1) | conferência | pergunta 1 |
| 5 | Permissão nas exclusões e `revoke` de `anon` (2.2) | migration | aval e pergunta 3 |
| 6 | Tarefas no Dashboard (3.1) | código | pergunta 5 |
| 7 | Financeiro e `update_rental` (3.3) | código e migration | aval |
| 8 | Conversor único de valor (3.3) | código | não |
| 9 | Reserva de vários dias (3.2) | migration e telas | aval |
| 10 | Acerto do `schema.sql` com o banco | documentação | não |

Em cada entrega: `npx tsc --noEmit`, `npx vitest run`, `npx next build`, publicar na `main`, conferir o deploy no Vercel, e responder ao dono em poucas linhas com o que mudou e o que ele deve conferir na tela.
