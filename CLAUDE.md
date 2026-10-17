# Harmonize OS

Sistema interno da Harmonize (locação dos equipamentos HIPRO 1 e HIPRO 2 e mentorias). Um operador só, que usa quase sempre pelo celular.

## Onde as coisas estão

- Código: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind, Supabase (Postgres, RLS, RPCs `security definer`). Versões de next/react fixas no `package.json` (sem `^`), porque o `package-lock.json` não vai para o git.
- Next 16: `params`, `searchParams` e `cookies()` são Promises (`await props.searchParams`); o controle de login fica em `proxy.ts` (antigo middleware). Nada de `require`/`module` em código que vai para o navegador: o Turbopack não aceita (já quebrou uma tela).
- Repositório oficial: `harmonizequip-cmyk/harmonize-os`, branch `main`. Existe uma cópia antiga em `edercampos1985-svg/harmonize-os`: nunca publicar lá.
- Deploy: Vercel, projeto `harmonize-os`, publica a cada push em `main`. Site: harmonize-os.vercel.app.
- Banco: projeto Supabase `vidnlzbxaxjlmzncqhxw`. `schema.sql` é o retrato do banco e `migrations/` guarda cada mudança. Toda migration precisa ser aplicada no banco E refletida em `schema.sql`.

## Como trabalhar aqui

- Responder em português, direto, sem enrolação. O dono lê no celular: resposta curta, com o que mudou e o que ele precisa fazer.
- Antes de afirmar o efeito de qualquer coisa, conferir no código ou no banco. Já houve afirmações erradas por dedução.
- Antes de publicar: `npx tsc --noEmit`, `npx vitest run` e `npx next build`.
- Depois de publicar, conferir o deploy no Vercel quando houver acesso.
- SQL que altera dados ou estrutura só roda com o aval do dono. Consulta de leitura pode.
- Um aviso no Dashboard deve levar à lista do que ele avisa, nunca a uma tela genérica.
- A tela de Pendências é só para quem deve ou ainda não foi cobrado.

## Banco de dados: protocolo

- Toda mudança de estrutura ou função vira um arquivo em `migrations/`, nomeado `AAAA-MM-DD-descricao.sql`.
- A migration só roda no Supabase (projeto `vidnlzbxaxjlmzncqhxw`) depois do aval explícito do dono, e sempre antes de publicar o código que depende dela.
- No mesmo commit, o `schema.sql` é atualizado para refletir a mudança. O `schema.sql` tem que conseguir recriar o banco do zero.
- Depois de rodar, conferir no banco com uma consulta de leitura que a mudança entrou e dizer o resultado ao dono.
- Coluna criada direto no Supabase também precisa entrar no `schema.sql`. Para achar divergência: restaurar um backup recente com `scripts/restaurar-backup.py` num Postgres local com o `schema.sql`; a conferência linha a linha acusa coluna que falta.
- As views `rentals_contabilizaveis` e `transactions_contabilizaveis` usam `select *`: ao adicionar coluna em `rentals` ou `transactions`, recriar a view na mesma migration.
- Funções seguem o padrão existente: `security definer`, `set search_path = public`, checagem com `has_module_permission`, e `registrar_movimentacao` quando alteram dados.
- Mudança que apaga ou altera dados existentes exige uma consulta de prévia, mostrada ao dono antes de rodar.
- Tabela nova: criar também o gatilho de acesso só de visualização (`create trigger trg_somente_leitura before insert or update or delete on public.<tabela> for each statement execute function public.bloquear_somente_leitura();`).
- Função nova: depois de criar, rodar `revoke execute on function <nome> from public, anon;` e dar `grant execute ... to authenticated, service_role;`. Sem isso ela nasce executável por quem não está logado. Nenhuma função é aberta para `anon`.
- Todo SQL para o dono rodar sai numa página (Artifact) com botão Copiar em cada bloco, um bloco por script, na ordem de execução, com uma consulta de conferência no fim. Nunca como arquivo anexo: o dono usa o celular e não abre anexo. Gerar com `python3 scripts/gerar-pagina-sql.py saida.html migrations/a.sql ... --conferencia "select ..."` e publicar com a ferramenta Artifact. Antes de entregar, rodar os scripts num Postgres local com o `schema.sql` carregado.
- Aplicar migration pela ferramenta do Supabase (`apply_migration`) pode ser barrado pelo ambiente. Nesse caso não contornar com `execute_sql`: entregar a página de SQL e esperar o dono rodar.

## Ciclo da locação (conferido no código)

1. **Reserva**: `calendar_events` com `status = 'pre_reserva'`, sem `rental_id`. Pode ter taxa de reserva (`taxa_status`).
2. **Finalizar com disparos** (`finalize_rental_reservation` ou `create_rental`): cria a linha em `rentals` e preenche `calendar_events.rental_id`. É neste momento que as despesas lançadas na reserva se amarram à locação (gatilho `calendar_events_amarra_despesas`) e que a tarefa pós-locação passa a valer.
3. **Pagamento**: `rental_payments` via `registrar_pagamento_locacao`. `rentals.pago` é calculado, nunca gravado à mão. Saldo vem da view `rentals_situacao_pagamento` (desconta parciais e taxa de reserva paga).
4. **Status "realizada"**: quase nunca é marcado no banco. As telas derivam: locação não cancelada cuja data já passou conta como realizada. Não criar avisos pedindo para marcar.

Somas de dinheiro leem de `rentals_contabilizaveis` e `transactions_contabilizaveis` (excluem cancelada e modo teste). Essas views usam `select *`: ao adicionar coluna na tabela, recriar a view.

## Regras de negócio que já foram decididas

- Mensagens ao cliente usam tratamento e primeiro nome (`lib/saudacao.ts`): cadastro primeiro, campo "Nome" como reserva.
- Datas disponíveis: um dia só é sugerido como livre quando os dois HIPROs estão livres. O dono trabalha sozinho e nem sempre consegue atender dois lugares no mesmo dia, então a regra fica e ele marca os outros dias à mão.
- Lançamento manual de receita esconde as categorias "Locação" e "Mentoria", que são geradas pelo sistema.
- Locação cancelada não tem despesa.
- Parceiro não paga taxa de reserva: virar parceiro, ou a reserva passar para um parceiro, tira a taxa pendente e a tarefa de cobrança (gatilhos `clients_isentar_taxa_parceiro` e `calendar_events_isentar_taxa_parceiro`). Taxa já paga fica.
- Locação de vários dias deve ser um evento só, com data final. Várias reservas de um dia para o mesmo atendimento confundem os avisos.

## Auditoria

- `docs/AUDITORIA-HARMONIZE-2026-10-05.md`: achados, evidências e ordem de entregas (seção 5). Ler antes de mexer; trabalhar um item por vez e só avançar quando o dono pedir.

## Avisos no celular

- Web push do próprio Harmonize: app instalável (`public/manifest.webmanifest`, `public/sw.js`), cartão "Avisos no celular" em Configurações, tabela `push_inscricoes`.
- Envio pela Edge Function `alertas` (código em `supabase/functions/alertas`, publicada no Supabase). Segredos no cofre (vault), lidos por `alertas_segredos()`, que só `service_role` executa. Nunca commitar a chave privada.
- Relógio pg_cron: 7h30 resumo do dia, 18h reservas de amanhã (só envia se houver). Todo aviso leva à tela do que avisa.
- Junto do resumo das 7h30 saem avisos de evento (no máximo 6): buscar HIPRO de locação de vários dias, cobrança no 3º, 7º e 15º dia de atraso, taxa de reserva vencendo hoje, fim previsto de manutenção. Cobrança e taxa trazem botão WhatsApp com a mensagem pronta.
- Segundas e quintas, o resumo leva também os dias livres dos próximos 7 dias (os dois HIPROs livres, fora domingo), com botão para `/agenda?acao=datas` (imagem de datas). Às 18h, além da lista de amanhã, sai um aviso por cliente sem pedido de confirmação, que abre `/agenda?confirmar=<id>`; o envio só é registrado lá. Domingo 19h (job `harmonize-alerta-domingo`, tipo `domingo`): fechamento da semana e lembrete do backup, que abre `/configuracoes?acao=backup` com o arquivo pronto para o Drive.
- Tarefas: "Atacar a fila" (`app/(app)/tarefas/ModoFila.tsx`) mostra as de hoje e atrasadas uma de cada vez, com o WhatsApp pronto. O resumo das 7h30, quando há tarefa atrasada, traz o botão para `/tarefas?fila=1`.
- Funil: visão Lista (abas de etapa, padrão no celular) ou Quadro (kanban, padrão no computador), escolha guardada no aparelho. Na lista, "Mover ▾" troca a etapa do lead sem arrastar; no funil de clientes as abas só filtram (etapa calculada).
- Relatórios > "De onde vêm os clientes que fecham": lista quem já alugou e está sem origem, com botões para marcar (`CompletarOrigem.tsx`).
- Recibo: o `ReceberPagamentoBotao` dispara `harmonize:pagamento-registrado` e o `components/ReciboHost.tsx` (no layout) oferece mandar a imagem do recibo (`lib/recibo-image.ts`). Pagamento lançado na finalização da locação não oferece recibo.
- `supabase/functions/alertas/mensagens.ts` é cópia de `lib/saudacao.ts` e das mensagens de cobrança: mudou lá, mudar aqui e publicar a função de novo.
- Reinstalar o app zera a permissão de notificação e mata a inscrição. `RegistrarServiceWorker` refaz a inscrição sozinho quando a permissão existe; quando não existe, `AvisosDesligadosFaixa` (topo de toda tela) mostra "Ativar avisos", porque o Android só pede permissão depois de um toque.
- Compartilhar comprovante: manifest `share_target` manda para `/compartilhar`; o `sw.js` guarda o arquivo no cache `harmonize-compartilhado` e abre "Receber pagamento", que sobe o comprovante para a pasta `comprovantes` do Storage (`locacao/<id>` ou `taxa/<id>`).
- Foto do contador: retirada das telas a pedido do dono (10/10/2026). A pasta `fotos-contador` continua no Storage, sem uso.
- Anotar por voz: só pelo microfone dentro da Nova tarefa (atalhos do "+" e do ícone retirados a pedido do dono em 14/10/2026). Escuta (`lib/reconhecer-fala.ts`) e `lib/voz.ts` tira da frase a data e o cliente. Na dúvida entre clientes, oferece as opções em vez de escolher.
- Despesa por voz: "+" > Despesa por voz abre o Novo lançamento escutando; `interpretarDespesa` (`lib/voz.ts`) tira valor, forma de pagamento, data, categoria (por sinônimos: gasolina→Combustível, almoço→Alimentação, hotel→Hospedagem...) e cliente.
- Novo lead: "Puxar dos contatos do celular" (`lib/contatos.ts`, só Chrome no Android).
- Sem internet: `components/GuardarAgendaOffline.tsx` guarda no localStorage (`harmonize-agenda-offline`) os atendimentos de hoje a 7 dias; o `sw.js` mostra `public/sem-internet.html` quando uma tela não abre por falta de rede.
- Entrar com a digital: passkey nativa do Supabase Auth (`supabase.auth.registerPasskey`/`signInWithPasskey`, `lib/digital.ts`, cartão em Configurações, botão no login). Precisa estar ligada no painel do Supabase (Authentication > Passkeys) com RP ID `harmonize-os.vercel.app`; mudar o RP ID invalida as digitais cadastradas. A tabela antiga `webauthn_credentials` não é usada.
- Atalhos do ícone (manifest `shortcuts`, no máximo 5): Receber, Nova reserva, Hoje e Dias livres (`/agenda?acao=datas`, imagem de datas). Usam `?acao=`. Pendências saiu a pedido do dono (12/10/2026).

## Menu do celular

- O "Mais" da barra de baixo (`components/BottomNav.tsx`, título "Menu") é organizado em grupos com blocos em duas colunas: Atendimento (Relacionamento, Clientes, Tarefas, Planejador, Contratos), Dinheiro (Locações, Pendências, Cartões, Empréstimos), Inteligência (Assistente, Cérebro, Relatórios) e Sistema (Equipamentos, Movimentações, Configurações). Tudo cabe numa tela; item novo entra no grupo certo (`grupo` em `MORE_ITEMS`).

## Configurações (central)

- `/configuracoes` é uma central (`app/(app)/configuracoes/ConfiguracoesHub.tsx`): cartão "Minha conta" (trocar senha, sair), "Check-up do app" (backup em dia, avisos ligados, digital cadastrada, modo teste desligado; o que falta leva ao lugar) e blocos em grupos: O negócio (Preços com simulação antes/depois, Contas fixas, Tags, Automações), Este celular (Avisos, Digital, Aparência) e Dados e acesso (Backup, Visualização, Dados de teste, Histórico). `?secao=<id>` abre um assunto (ids em `secoes-ids.ts`, que o servidor também usa); `?acao=backup` abre o Backup. Seções em `secoes/`, peças comuns (chave, campo, barra "Salvar alterações" que só aparece com mudança) em `ui.tsx`. O selo "Inativo" mudou de Preços para Automações.

## Diálogos e avisos

- Não usar `confirm`/`alert`/`prompt` do navegador: usar `confirmar`, `avisar` e `pedirTexto` de `components/Dialogos.tsx` (montado em `app/layout.tsx`). `perigo: true` e rótulo próprio ("Apagar") quando apaga ou cancela.
- O "+" (`QuickActionsButton`) segue o Menu: Receber pagamento em destaque e grupos Agenda, Dinheiro e Clientes em duas colunas. A barra lateral do computador usa os mesmos grupos do Menu.

## Padrão visual (aprovado pelo dono em 17/10/2026)

- Modelo: o Dashboard (imagem enviada pelo dono). Fundo cinza-claro frio (#f4f6f9, cinzas ardósia em `--n-*`), cartões brancos com borda bem leve, sombra suave e cantos bem redondos (classe `.cartao` em `app/globals.css`), ícones lucide em quadradinho de cor clara (`IconeChip`), selos com ícone (`Pilula`), onda da marca no canto dos destaques (`OndaMarca`), tudo em `components/ui/Visual.tsx`. Sem emoji como ícone em tela nova.
- As telas antigas com cartão de vidro (`bg-white/70` + `border-white/60` + `backdrop-blur`) e `shadow-sm` caem no mesmo padrão pelo `globals.css`, sem mexer em cada arquivo. Barra de baixo branca com o item ativo em turquesa claro.

## Temas (Clássico e Aurora)

- O tema escuro foi retirado a pedido do dono (14/10/2026); não usar classes `dark:`. O Suave também saiu (o dono não gostou). No lugar há o tema Aurora: botão de paleta no topo/menu (`components/ThemeToggle.tsx`), guardado em `localStorage` `harmonize-tema` = `aurora` e aplicado pela classe `tema-aurora` no `<html>` (script em `app/layout.tsx`). Os cinzas `neutral-*` do Tailwind saem de variáveis (`--n-50`…`--n-950`, em `app/globals.css`): o Aurora usa cinzas frios, brilho da marca no topo, cartões brancos com sombra e a barra de baixo flutuante com item ativo em degradê. Ajustes ficam só no `globals.css`.

## Dashboard (17/10/2026)

- Abre no mês (período padrão "Este mês"; `PeriodFilter padrao="mes"`). Ordem: destaque do mês (`components/dashboard/MesCard.tsx`: saudação, locações contra a meta 25 a 30, faturado, contas fixas), "Precisa de você" (`components/dashboard/PrecisaDeVoce.tsx`: todos os avisos num cartão, urgentes primeiro, 4 visíveis; cada um leva à sua lista; tarefas levam a `/tarefas?fila=1`), Saldo e A receber, Previsão de caixa, Radar, Próximos dias (3 dias com atendimento, hoje incluso) e "Números do período" (locações, ticket médio, concluídas/canceladas/reagendadas, HIPROs e gráficos). Aviso novo entra na lista `avisos` de `dashboard/page.tsx`.
- `settings.inactive_days_threshold` não tem efeito em nenhuma tela; saiu de Configurações.

## Relacionamento (17/10/2026)

- Tela `/relacionamento` (Menu > Atendimento; `app/(app)/relacionamento/`): "Chamar hoje" (no máximo 8 por dia, por prioridade, com WhatsApp pronto, "Já falei" e "Pular hoje" só no aparelho) e a carteira em abas Clientes/Leads com filtro por classe. Regras puras em `lib/relacionamento.ts` (testadas), dados em `lib/carregar-relacionamento.ts`.
- Classificação automática (nada para marcar à mão). Clientes (`is_client` ou com locação): Agendada (reserva futura), Nova (1 locação, até 60 dias), Ativa, Em risco (passou de 1,5x o ritmo dela, mínimo 30 dias; sem ritmo, 60), Sumida (mais de 120 dias ou cliente sem locação no sistema). Leads: Quente (etapa Interesse/Agendamento), Morna (Em contato ou conversa nos últimos 14 dias), Fria. Valor pela curva ABC do faturamento: VIP (primeira metade), Frequente (30% seguintes).
- Cadência (dias sem conversa para voltar à lista): Nova 10, Ativa 21, Em risco 14, Sumida 30, Quente 3, Morna 7, Fria 30. Último contato = tarefa concluída, agenda enviada ou pedido de confirmação. Conversar fecha as tarefas de recontato/contato pendentes da pessoa ou grava uma tarefa concluída (o recontato automático conta daí).
- Aparece também no Dashboard ("N pessoas para chamar hoje") e na ficha do cliente (`components/RelacaoFicha.tsx`).

## Gráficos do Dashboard

- `components/DashboardCharts.tsx` (SVG próprio, sem recharts), contas em `lib/grafico-fluxo.ts`: resultado do período com anel de margem, resultado acumulado (área) e entradas/saídas por dia em barras para cima e para baixo (mês a mês acima de 62 dias), com toque mostrando o dia; e "Para onde foi / De onde veio" por categoria. Recebe os mesmos lançamentos dos quadros (sem empréstimo e sem pagamento de fatura). Paleta validada para daltonismo: #1F9E97 (entradas), #D9577E (saídas).

## Exportar planilha

- Todas as telas que exportavam CSV (Agenda, Financeiro, Locações, Clientes, Funil, Pendências, Movimentações) agora geram .xlsx com o layout da Harmonize: título, período, resumo, cabeçalho turquesa, linhas zebradas, R$, datas de verdade, filtro, cabeçalho fixo e total. Montado à mão em `lib/planilha-xlsx.ts` (fflate), entregue por `lib/exportar-planilha.ts` (`exportarTabela`): tenta o Compartilhar (Drive); se o aparelho recusar o tipo, baixa e avisa como mandar ao Drive. Usa as mesmas linhas da tela.
- Cada planilha abre numa aba "Gráficos" (gráficos nativos do Office, editáveis no Google Planilhas e no Excel; `lib/planilha-graficos.ts`), com a tabela de números de cada gráfico a partir da coluna J. O que cada tela leva fica em `lib/graficos-exportacao.ts` (Financeiro: entradas/saídas por dia, resultado acumulado, para onde foi e de onde veio; Locações: faturamento por dia, clientes que mais faturaram, disparos por equipamento; e os demais por ranking).

## Bloqueio da agenda

- `bloqueios_equipamento` (tipo manutencao, recesso ou outro; datas inclusivas), escrito só por `criar_bloqueio_equipamento`, `alterar_fim_bloqueio_equipamento` e `excluir_bloqueio_equipamento`. Gatilho `trg_validar_bloqueio_equipamento` recusa reserva nova ou mudança de data/equipamento que caia num bloqueio; reservas que já existiam ficam.
- Manutenção agora é bloqueio do tipo manutencao (tela Equipamentos > Bloquear período). Quando cobre hoje, `sincronizar_manutencao_por_bloqueio` põe o equipamento em manutenção com `status_previsto_fim` = último dia + 1; o retorno automático antigo continua. "Voltar para ativo" e "Adiar previsão" ajustam o bloqueio.
- Agenda (traço cinza no dia e cartão 🔒), imagem de datas livres e aviso de dias livres tratam dia bloqueado como ocupado.

## Aplicadores (desgaste por disparos)

- A contagem de disparos é por aplicador, não por HIPRO: 4 aplicadores, 2 montados e 2 de reserva, e eles trocam de aparelho.
- `aplicadores` (nome, série, `garantia_disparos` opcional (o fabricante garante até 6 milhões de disparos; passar não para o aplicador), última leitura `contador_base` em `contador_base_em`) e `aplicador_montagens` (onde esteve montado, intervalo [desde, ate), um por HIPRO). Escritos só por `salvar_aplicador`, `montar_aplicador` e `registrar_leitura_aplicador`.
- View `aplicadores_uso`: disparos = última leitura + disparos das locações (`rentals_contabilizaveis`, fora mentoria) do HIPRO onde estava montado, depois da leitura. A locação do dia da troca conta para quem entrou.
- Tela Equipamentos > cartão "Aplicadores" (`components/AplicadoresCard.tsx`, `lib/aplicador.ts`). Aviso no Dashboard com a garantia entre 90% e 100%, levando a `/equipamentos#aplicadores`; no resumo das 7h30, o mesmo só às segundas. Fora da garantia só aparece no cartão, sem aviso.
- Revisão anual é do equipamento: `equipments.ultima_revisao`, gravada por `registrar_revisao_equipamento`. Próxima = última + 1 ano. Aviso no Dashboard 30 dias antes ou vencida (leva a `/equipamentos#revisao-<code>`), e no resumo das 7h30 às segundas.

## Previsão de caixa

- Dashboard > "Previsão de caixa" (`components/PrevisaoCaixaCard.tsx`, conta em `lib/previsao.ts`), 30 ou 60 dias: reservas marcadas (sem `rental_id`) estimadas pela média das locações do próprio cliente ou pela média geral, menos a taxa já paga; mais o a receber vencido (`buscarPendencias`); menos custos das locações (proporção despesas/faturamento de `rentals_lucro`) e contas fixas de Configurações (1 vez a cada 30 dias). Mentoria sem histórico fica "sem estimativa".

## Arte para a cliente divulgar

- Agenda > reserva pendente de HIPRO com cliente > "🎨 Arte para a cliente divulgar" (`components/ArteDivulgacaoModal.tsx`, desenho em `lib/arte-divulgacao.ts`). Formatos Status/Story (1080x1920) e Feed (1080x1350), sem a marca da Harmonize. Textos editáveis; clínica, cidade e WhatsApp vêm do cadastro. "Mandar para a cliente" compartilha a imagem com a mensagem pronta. Abre por portal porque a janela da reserva usa backdrop-filter.

## Tabela de preços (arte)

- "+" > Tabela de preços e cartão do cliente no Funil > "Enviar tabela de preços" (`components/TabelaPrecosModal.tsx`, desenho em `lib/tabela-precos-arte.ts`). Valores de Configurações (faixas e taxa de reserva); estimativas por procedimento fixas em `ESTIMATIVAS_DISPAROS`. Acima do limite 2 a taxa da faixa 3 vale sobre o total de disparos, sem pacote fixo (regra confirmada pelo dono em 13/10/2026; `calculateRentalValue`, contrato, imagem do cálculo e radar seguem a mesma regra).

## Espaço Pessoal (chave Harmonize | Pessoal)

- Chave no topo de toda tela (`components/EspacoSwitch.tsx`), para quem tem a permissão `pessoal`. O espaço sai do endereço (`lib/espaco.ts`): tudo em `/pessoal` é Pessoal, e Sidebar/BottomNav trocam o menu para Início (`/pessoal`, dashboard pessoal), Lançamentos (`/pessoal/lancamentos`), Cartões (`/pessoal/cartoes`) e Relatórios (`/pessoal/relatorios`). No Pessoal o "+" da Harmonize some; o Início tem "+ Novo lançamento" com "Conta pessoal" marcada.
- Lançamentos: mesma tela do Financeiro (`FinanceiroClient` com `escopo="pessoal"`, carga em `financeiro/carregar-lancamentos.ts`), `scope = 'pessoal'`, saldo de sempre e contas fixas do tipo pessoal. Categorias pessoais próprias.
- Retirada: saída "Retiradas" no caixa da Harmonize cria sozinha a entrada "Retirada da Harmonize" no pessoal (gatilho `espelhar_retirada`, `transactions.vinculo_id`); mudar/apagar a retirada muda/apaga a entrada. A entrada não se edita no pessoal.
- "Novo lançamento" tem a caixinha "Conta pessoal". Despesa pessoal ligada a locação/reserva: "custo do atendimento pago do bolso" (`conta_no_lucro = true`, entra em `rentals_lucro`) ou "gasto meu" (fora do lucro). Despesas da reserva têm "Pago com" (caixa, bolso-custo, gasto pessoal) via `registrar_despesa_reserva(..., p_pessoal)`.
- Contas fixas pessoais (Configurações) não entram no quadro "Este mês", na previsão de caixa nem no fechamento de domingo; aparecem no Pessoal.
- Relatórios financeiros (`components/RelatorioFinanceiro.tsx`, carga em `lib/carregar-relatorio-financeiro.ts`, contas em `lib/relatorio-financeiro.ts`): gastos e entradas por categoria, 12 meses, cartões (recentes e próximas faturas) e, na Harmonize, empréstimos. Na Harmonize aparece no topo de Relatórios ("Financeiro da Harmonize"); no Pessoal, em `/pessoal/relatorios`. Ficam fora das somas: empréstimo/devolução e pagamento de fatura.

## Cartão de crédito

- `cartoes` (cada um da Harmonize ou pessoal; dia de fechamento, vencimento, limite), escrito só por `salvar_cartao`. Tela Cartões (`/financeiro/cartoes` só os da Harmonize, `/pessoal/cartoes` só os pessoais; `CartoesClient.tsx` com `escopo`): fatura atual e as outras, movimentos, "Pagar fatura", cadastro.
- Compra: Novo lançamento, saída, forma Crédito, escolhe cartão e parcelas → `registrar_compra_cartao` cria uma saída por parcela (data + n meses), `cartao_mov = 'compra'`, `fatura_ref` = mês do vencimento ('AAAA-MM', `fatura_da_compra`, espelhada em `lib/cartao.ts`). Conta como gasto no mês da parcela, mas não sai do saldo.
- Pagamento: `pagar_fatura_cartao` cria saída "Pagamento de fatura" (`cartao_mov = 'pagamento'`): sai do saldo e fica fora de Entradas/Saídas/Resultado (Financeiro, Dashboard). View `faturas_cartao` soma compras e pagos por fatura. `excluir_compra_cartao` apaga todas as parcelas.
- Previsão de caixa desconta as faturas da Harmonize ainda não pagas até o fim do período.
- Novo lançamento também tem "Empréstimo para a Laser Dream" (João Pessoa ou Campina Grande): saída = concedido, entrada = devolução, via `registrar_emprestimo`.
- Tela Empréstimos: tocar num movimento abre a edição (devedor, valor, data, forma, observação) via `editar_emprestimo`, que muda o empréstimo e o lançamento do Financeiro juntos; "Apagar este lançamento" usa `remover_emprestimo`. "Só registrar a pendência" (`p_sem_caixa` em `registrar_emprestimo`/`editar_emprestimo`) guarda quem deve sem lançamento no caixa (empréstimos antigos); ligar na edição apaga o lançamento, desligar cria.

## Acesso só de visualização

- `profiles.somente_leitura`. Configurações > "Acesso só de visualização" (`components/AcessoVisualizacaoCard.tsx`) cria o login (signUp num cliente sem sessão) e chama `liberar_acesso_visualizacao(email, nome)`: vê tudo menos Configurações. `remover_acesso_visualizacao` desliga.
- O gatilho `trg_somente_leitura` (em toda tabela de public, por comando) recusa gravação de quem é só de visualização, inclusive por funções `security definer`; no Storage, políticas restritivas. Na tela (`useSomenteLeitura`, `components/SomenteLeitura.tsx`): faixa "Modo visualização", sem "+", sem avisos/inscrição de push, sem recibo; o Financeiro esconde "Novo lançamento" e não abre edição.

## Segurança (checklist de 24 pontos, 14/10/2026)

- Cabeçalhos em `next.config.js`: CSP (só o próprio site e `*.supabase.co`; `wasm-unsafe-eval` pelo PDF do contrato), HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy e Permissions-Policy (microfone só `self`). Serviço externo novo precisa entrar na CSP, senão é bloqueado sem aviso.
- Banco: funções de gatilho sem EXECUTE para `authenticated`, `disponibilidade_publica` fechada, `anon` sem acesso a tabelas/views (também para tabelas futuras), `search_path` fixo (migration `2026-10-14-endurecer-seguranca.sql`).
- Senhas (Auth > Providers > Email, 16/10/2026): mínimo 8 caracteres com minúscula, maiúscula e número; as telas conferem antes por `problemaSenha` (`lib/senha.ts`). "Leaked password protection" só existe no plano Pro (o projeto é gratuito).
- Next.js atualizado para 16.3.8 em 14/10/2026 (`npm audit` sem vulnerabilidades). Em aberto: cadastro público do Auth fica aberto por causa do acesso de visualização (conta nova nasce sem acesso).

## Assistente (IA)

- Tela `/assistente` (ícone ✨ no topo do celular e item no menu): chat com a IA da Anthropic, modelo `claude-sonnet-5-5` (troca pelo segredo `ASSISTENTE_MODELO`). Etapa 1: só consulta, não altera nada. Etapa 2 (ações com confirmação) e 3 (logística com Maps) ainda não feitas.
- Edge Function `assistente` (`supabase/functions/assistente`): roda com o login de quem pergunta (RLS vale), lê o banco por `assistente_consultar(sql)` (security invoker, só SELECT/WITH sem ";", dentro de subconsulta, transação só leitura, bloqueia vault/auth/pg_/push/webauthn). O que ela sabe do app está em `conhecimento.ts`: mudou regra ou tabela, atualizar lá e publicar a função.
- Segredos da função (Edge Functions > Secrets): `ANTHROPIC_API_KEY` (o dono cola, nunca no chat nem no git), `ASSISTENTE_LIMITE_MENSAL_USD` (padrão 20; a função recusa ao passar).
- Tabelas: `assistente_memoria` (o que o dono ensinou, lida a cada pergunta), `assistente_conversas` (histórico completo no formato da API), `assistente_uso` (tokens e custo estimado; "Gasto estimado este mês" na tela).
- Por cliente: `client_id` em `assistente_memoria` (memória da cliente) e em `assistente_conversas` (conversa amarrada). Chip "Sobre: <cliente>" na tela, `/assistente?cliente=<id>` (link na ficha do cliente). A função põe no contexto o cadastro e as memórias da cliente; ferramentas `vincular_cliente` e `guardar_memoria(client_id)`.
- Responder WhatsApp: colar a mensagem ou compartilhar texto do WhatsApp para o Harmonize (`share_target` → `sw.js`/`app/compartilhar` mandam texto sem arquivo para `/assistente?texto=`). A IA confere agenda/preços/histórico e chama `preparar_whatsapp`, que vira o botão "Abrir no WhatsApp" (o dono envia; nada sai sozinho).
- Planilha: ferramenta `gerar_planilha` (título, SQL, colunas com tipo, gráfico de ranking opcional) vira o cartão "toque para baixar"; a tela roda o SQL de novo por `assistente_consultar(sql, 5000)` e monta o .xlsx com `exportarTabela` (mesmo layout das telas).
- Voz grátis: escuta com `lib/reconhecer-fala.ts`, resposta lida pela voz do aparelho (`lib/falar.ts`). Pergunta feita por voz: depois de falar a resposta, já escuta a próxima. Botão de alto-falante liga/desliga (`localStorage` `harmonize-assistente-voz`).

## Envio da agenda (abertura no dia 20, atualização no dia 5)

- Agenda sempre por mês inteiro, em duas rodadas: dia 20 abre o mês seguinte; 15 dias depois (dia 5) vai a atualização do mesmo mês com as datas que sobraram, só para quem recebeu a abertura e ainda não agendou. Quem tem reserva não cancelada de hoje em diante (qualquer data) fica fora das duas. Regras na seção "Mandar a agenda" de `supabase/functions/assistente/conhecimento.ts`.
- A IA lê as mensagens anteriores (`agenda_envios`) e escreve uma diferente para cada cliente (nunca repetir, nem no mesmo lote; a função recusa texto igual no lote). Ferramenta `preparar_envio_agenda` vira o cartão `app/(app)/assistente/CartaoAgenda.tsx`.
- O cartão gera a imagem das datas livres (`lib/agenda-imagens.ts`, mesma arte da Agenda, uma por mês do período) e, por cliente: "Enviar com imagem" (Compartilhar com imagem e texto; o texto também vai para a área de transferência), "Só texto" (wa.me) e "Marcar enviado" (`registrar_envio_agenda`, grava em `agenda_envios`). Sem "Marcar enviado" a atualização não sabe que ela recebeu.
- Dias 20 e 5, junto do resumo das 7h30, sai o aviso que abre `/assistente?auto=1&pergunta=...`: a tela já manda o pedido e os cartões (lotes de 15, botão "Montar as próximas") aparecem sozinhos. Pergunta sobre envio da agenda sempre vira cartão, nunca lista em texto.

## Cérebro (insights)

- Tela `/insights` ("Cérebro" no menu, `app/(app)/insights/InsightsClient.tsx`, regras em `lib/insights.ts`). "Gerar novos insights" (com foco opcional por categoria) chama a Edge Function `assistente` com `modo: "insights"`: ela usa o texto `INSIGHTS` de `conhecimento.ts`, faz até 8 consultas agregadas, cruza com conhecimento de mercado e grava de 8 a 12 insights pela ferramenta `registrar_insights` (não vira conversa).
- Tabela `insights` (RLS por `user_id`, como `assistente_memoria`): categoria (prospeccao, relacionamento, vendas, financeiro, agenda, marketing, operacao), título, texto, `acao` (próximo passo, com mensagem pronta), `evidencia` (números), `impacto` 1 a 3, `client_ids`, `status` (novo, feito, arquivado) e `util`. A IA lê os anteriores para não repetir e usa "útil/não útil" para calibrar.
- Cada cartão tem "Colocar em prática com o assistente" (`/assistente?auto=1&pergunta=...`), "Fiz", "Arquivar" e 👍/👎.

## Atalhos entre telas

- Regra: tudo que está ligado a outra coisa abre com um toque, sem voltar ao menu. Endereços em `lib/atalhos.ts`, peças em `components/Atalhos.tsx` (`Atalho` pílula, `Atalhos` fileira, `LinkCliente`; todos param o clique para não abrir a linha de baixo). Tela nova que mostra cliente, locação, atendimento ou lançamento usa esses atalhos.
- Endereços que abrem o item: `/agenda?evento=<id>` (abre o atendimento no dia dele), `/financeiro?lancamento=<id>` (abre a edição, mesmo de outro mês; entrada espelhada de Retirada abre a retirada), `/clientes/<id>?locacao=<rentalId>` (abre a locação na ficha), `/tarefas?highlight=<id>`, `/planejador/novo?cliente=&evento=`.
- Movimentações e o histórico da ficha viram links por `linkDaMovimentacao` (locação ganha a cliente buscando `rentals` na carga da tela; exclusões ficam sem link).

## Planejador HIPRO

- Tela nativa (16/10/2026, a pedido do dono: o HTML antigo em moldura cortava no celular e foi apagado). `app/(app)/planejador/EditorPlanejamento.tsx` abre em tela cheia por cima do menu (`fixed inset-0 z-[60]`): topo com paciente, cliente e procedimento, saldo restante com barra sempre à vista, abas Paciente / Áreas / Resumo e barra de baixo com o próximo passo (some quando o teclado abre). Menu ⋯: novo, duplicar para outro paciente (vai por `CHAVE_PLANO_IA` com `?ia=1`), PDF do prontuário, PDF do paciente, excluir paciente. Na lista, cada paciente tem "Editar" (abre com `?aba=paciente`) e "Excluir". Excluir pede para escrever APAGAR (`components/ConfirmarApagarModal.tsx`, mesmo critério do `ConfirmarExclusaoModal`).
- Contas em `lib/planejador.ts` (`AREAS_FIXAS`, `normalizarPlano`/`paraEstado`, totais, `alertas` com o máximo do fabricante, `textoResumo` no formato antigo). O estado salvo é o mesmo objeto do HTML antigo (paciente, data, DATA, customAreas...), então planos antigos abrem iguais; área manual guarda `parte` (região do boneco) em vez da imagem.
- Áreas fixas (regra do dono, 16/10/2026), nesta ordem na tela: Pescoço, Submandibular e Papada (uma área só, id `papada`, campo único; não existe mais área Submandibular), Jowls (o nasolabial entra aqui; não existe mais área Nasolabial), Terço médio (id antigo `arcomandibular`, era "Arco Mandibular"), Temporal e Arco Zigomático, Frontal, Perioral Superior e Inferior. Planos antigos: `normalizarPlano` soma o submandibular (D+E) em linhas da papada e passa a área manual "Nasolabial" para o Jowls. Mesma regra em `CATALOGO_AREAS` (`lib/planejamento.ts`) e na função `assistente` (`AREAS_PLANEJADOR`, `ROSTO_GRANDES`, `conhecimento.ts`).
- Imagens das áreas: fotos da tabela de protocolos do dono (16/10/2026), recortadas em `public/ferramentas/areas/<id>.jpg`: pescoço, papada, terço médio, frontal, peribucal (vale para perioral superior e inferior), jowls (foto do nasolabial) e olhos (área manual com "olho"/"pálpebra" no nome). Temporal usa a foto dos olhos da tabela (o dono confirmou que é a mesma região, 16/10/2026). Outra área manual do rosto mostra um quadro com a inicial (a modelo antiga sem setas saiu a pedido do dono). Um desenho próprio foi tentado e o dono recusou: só fotos. Toque na foto do cartão abre ampliada com o texto do movimento (`MOVIMENTO_DA_AREA` em `lib/planejador.ts`) e o máximo por linha. Corporal: fotos da modelo de frente e de costas, corpo inteiro (enviadas pelo dono em 16/10/2026; `public/ferramentas/corpo-frente.jpg` e `corpo-costas.jpg`, em base64 em `lib/corpo-foto-dados.ts`), com as regiões em elipses por vista (`lib/corpo-foto.ts`, `REGIOES_FOTO`; a imagem da área usa a vista onde a região aparece, frente primeiro, recortada num quadrado centrado na região por `recorteDaRegiao`; a ampliada mostra o corpo inteiro, `urlCorpoInteiro`). Prontuário e ficha do paciente em `lib/planejador-impressao.ts` (prévia na aba Resumo; impressão por `window.open` + `print`).
- Cartão de área: linhas por profundidade com "feito", profundidade, Direito/Esquerdo com - e + (passo 50; mexer no direito leva o esquerdo junto quando estavam iguais), quadrantes no corporal, aviso acima do máximo do fabricante.
- Telas: `/planejador` (lista por cliente, busca, filtro `?cliente=`, "Retornos nos próximos 15 dias"), `/planejador/<id>` e `/planejador/novo` (`EditorPlanejamento.tsx`: tela cheia nativa, cliente e atendimento ligados, salva sozinho com intervalo; o novo só vira registro quando ganha paciente, anotação ou disparos). Profissional e data já vêm da cliente e do atendimento.
- Tabela `planejamentos` (cliente, atendimento, paciente, datas, procedimento, saldo, total, `estado` jsonb completo), escrita só por `salvar_planejamento` e `excluir_planejamento`. Atalhos: menu, "+", atendimento na Agenda, ficha da cliente.
- IA monta planejamento: ferramenta `preparar_planejamento` do assistente (áreas, profundidades válidas e saldo conferidos na função; `AREAS_PLANEJADOR` em `supabase/functions/assistente/index.ts` espelha `AREAS_FIXAS` de `lib/planejador.ts`) vira `CartaoPlanejamento.tsx` com resumo por área e "Abrir no planejador": o estado vai por `sessionStorage` (`CHAVE_PLANO_IA`) para `/planejador/novo?...&ia=1`. Regras de distribuição na seção "Planejador HIPRO" de `conhecimento.ts`; o protocolo do dono (mínimos por área, profundidades) ele ensina no chat e fica em `assistente_memoria` com o prefixo "Protocolo HIPRO:". No editor, "✨ Montar com a IA" abre o assistente com o pedido para completar.
- Tabela de disparos do fabricante (PDF do dono, 16/10/2026) está na seção "Tabela de disparos do HIPRO" de `conhecimento.ts`: os números são o MÁXIMO por lado e por profundidade (0 até ele); maioria até 1.200, Frontal 500, Perioral 600 sup/600 inf, papada no campo único até 2.400 (soma dos lados); Jowls pode passar. A função recusa linha acima do máximo (`MAXIMO_POR_LINHA`). Contraindicações e cuidados do guia também estão lá.
- Fluxo: sem as áreas definidas ("full face"), a IA chama `escolher_areas` → `CartaoEscolhaAreas.tsx` (caixinhas por área, saldo e queixa; manda "Áreas escolhidas: ... Procedimento: ...") → `preparar_planejamento`. Áreas fora das 9 fixas (olhos, mento, corporais) entram como área manual (`areas_extras` → `customAreas`). Nome do procedimento por `nomeProcedimento` (`lib/planejamento.ts`, espelhado em `nomeDoProcedimento` na função): todas as áreas grandes do rosto (Frontal, Temporal, Terço médio, Jowls) = "Full Face"; "Submandibular e Papada" e Pescoço somam no nome ("Full Face + Submandibular e Papada + Pescoço").
- Profundidades (regra do dono, 16/10/2026): rosto sempre 4,5, 3,0 e 1,5 mm (Frontal 4,5 e 1,5; Perioral só 1,5). Papada: o dono informa no seletor adipômetro, quantidade de profundidades (até 5) e disparos; a conta é fixa (`profundidadesPapada`/`dividirDisparos` em `lib/planejamento.ts`, espelhadas na função): mais funda = metade do adipômetro arredondada para baixo numa profundidade que existe (4,5, 6 a 13), sempre com 4,5, as do meio espaçadas, disparos divididos igual (sobra na mais funda). A IA manda `papada_config` e a função monta as linhas da papada. Ex.: 20 mm, 3 profundidades, 1.500 → 10, 7 e 4,5 mm com 500 cada.

- Seletor monta, IA ajusta: `components/SeletorPlanejamento.tsx` (no cartão `escolher_areas` do assistente e em "Montar pelas regras" no editor) monta o plano por `montarPlanejamento` (`lib/planejamento.ts`) e abre no planejador sem passar pela IA; "Pedir ajuste à IA" manda a escolha para o assistente. Regras: rosto 4,5/3,0/1,5 (frontal e olhos 4,5/1,5, perioral 1,5) dividindo o saldo até o máximo de cada linha; papada pelo adipômetro; corporal por quadrante de 10 x 10 cm, 3.200 a 4.000 disparos por profundidade por quadrante, flacidez 2 ou 3 profundidades (1,5 a 4,5), gordura no mínimo 3 de 6,0 até metade do adipômetro (acima de 26 mm, 13), quadrantes à escolha do dono.
- Modelo corporal: `components/BonecoCorporal.tsx` mostra as duas fotos lado a lado (Frente e Costas), cada uma com as regiões tocáveis; região que aparece nas duas (flancos, braços, culote) marca nas duas. O desenho antigo (`lib/boneco-corporal.ts`) fica só como catálogo das regiões (`CATALOGO_CORPORAL`) e para os arquivos `public/ferramentas/corpo/*.svg`.

## Portal da cliente (acesso só ao Planejador)

- Login de cliente = `profiles.cliente_id` preenchido (migration `2026-10-16-acesso-cliente-planejador.sql`). `has_module_permission` é sempre falso para ele (nenhuma tela da Harmonize abre; o layout de `(app)` manda para `/portal`), a política `planejamentos_select_cliente` (por `cliente_do_usuario()`) só devolve os planejamentos dela, e `salvar_planejamento`/`excluir_planejamento` forçam o client_id dela e não mudam o atendimento ligado pelo dono. Ninguém troca o próprio `cliente_id` (gatilho de campos privilegiados).
- Telas: `app/(portal)` (layout próprio, `PortalTopo` com trocar senha e sair): `/portal` (lista), `/portal/novo`, `/portal/<id>`, reaproveitando `PlanejadorLista` e `EditorPlanejamento` com `portal` (sem cliente/atendimento, sem IA; "Montar pelas regras" fica). Nome e "Profissional" por `portal_cliente()`.
- Criar o acesso: ficha da cliente > "Acesso ao Planejador" (`components/AcessoPlanejadorCard.tsx`): formulário uma vez por cliente (tratamento, nome, e-mail, WhatsApp, endereço, cidade, senha inicial), atualiza o cadastro, cria o login (signUp num cliente sem sessão) e chama `liberar_acesso_planejador(email, client_id)`; depois mostra a mensagem pronta para WhatsApp. "Tirar acesso" = `remover_acesso_planejador` (active = false). Login que já tem acesso à Harmonize não vira login de cliente.
- O dono vê tudo em `/planejador`; o que ela criou leva "Feito pela cliente".
- Formulário que a cliente preenche (migration `2026-10-16-convite-cadastro.sql`): ficha > "Acesso ao Planejador" > "Enviar formulário para ela preencher", ou Clientes > "🔗 Link de cadastro" (sem cliente). `criar_convite_cadastro` gera o token (64 hex, vale 14 dias, uso único; reaproveita o aberto da cliente) em `convites_cadastro`. Página pública `/cadastro/<token>` (liberada no `proxy.ts`) fala com a Edge Function `cadastro-cliente` (sem JWT; confere o token): ela cria a senha, a função cria o login (`auth.admin.createUser`, e-mail já confirmado; se o e-mail já existe, mantém a senha antiga) e chama `convite_cadastro_receber` (só `service_role`). Acha a ficha pela cliente do link ou pelo WhatsApp (10 dígitos finais; 8 se só um bater) e substitui nome completo, tratamento, nome, WhatsApp e e-mail (os outros só preenchem); o que havia fica em `convites_cadastro.antes` e na movimentação. Sem ficha parecida, cria lead (origem `formulario`). Avisa no celular e no Dashboard até liberar; o dono toca em "Liberar acesso" (`liberar_acesso_planejador` com o `email_login`). A IA (Edge Function `assistente`) recusa login de cliente.
- Validade (migration `2026-10-16-portal-validade.sql`, regra do dono): criar o acesso dá 60 dias (`clients.portal_liberado_ate`); cada agendamento de HIPRO (locação ou reserva não cancelada, fora teste) prorroga até 45 dias depois da data do atendimento (`portal_ultimo_atendimento`, reserva futura conta). Vale o maior (`portal_valido_ate`). Passou, `cliente_do_usuario()` volta nulo (não vê nem salva) e o portal mostra "acesso pausado, fale com a Harmonize". Ficha > "Acesso ao Planejador" mostra até quando vale e "Liberar por mais 60 dias" (`liberar_portal_cliente`).

## Créditos da cliente e permuta

- Migration `2026-10-16-creditos-e-permuta.sql`. `creditos_cliente` é o extrato (tipo disparos ou valor; positivo entra, negativo usa; origem contagem, permuta, manual, uso) e `creditos_saldo` o saldo por cliente. Crédito de origem contagem só fica disponível quando a locação de origem está paga ("aguardando pagamento" antes); uso numa locação cancelada devolve. Contas em `lib/creditos.ts`.
- Finalizar locação: várias contagens (`locacao_contagens`, uma por ponteira). Depois da última contagem preenchida: "+ Somar outra contagem" (só soma) ou "Gerar crédito e continuar" (a cliente paga tudo hoje e os disparos daquela contagem viram crédito). `p_shots` continua sendo o total real (desgaste dos aplicadores); o valor sai dos disparos cobrados (total menos o crédito usado). `registrar_contagens_locacao` grava as contagens, gera e usa o crédito.
- Permuta: forma de pagamento `permuta`. `registrar_permuta` (empresa: saída "Outros" com a observação; pessoal: "Retiradas", que espelha no Pessoal, e a saída pessoal na categoria escolhida), gera crédito em R$ e, vindo de uma locação, já abate o que couber; o resto fica de crédito. `usar_credito_valor` abate locação com crédito em R$ (pagamento permuta). Lançamento com `payment_method = 'permuta'` fica fora do saldo do caixa (`foraDoSaldo` em `lib/cartao.ts`), mas conta em Entradas/Saídas/Resultado.
- Telas: ficha da cliente > cartão de créditos (saldo, extrato, "Lançar crédito": disparos, permuta, ajuste em R$), `/clientes/creditos` (créditos em aberto), selo "tem crédito" na Agenda, "Usar crédito" e forma "Permuta" no Receber pagamento.
- Troca de ponteira durante o atendimento (migration `2026-10-16-troca-ponteira-reserva.sql`): na reserva, depois da contagem inicial, "Trocar ponteira" grava o disparo final da atual (somar ou gerar crédito) e a inicial da nova por `trocar_ponteira_reserva` (contagens fechadas em `reserva_contagens`; `calendar_events.contagem_inicial`/`contagem_aplicador_id` passam a ser da ponteira atual; a nova fica montada no HIPRO). "Desfazer última troca" = `desfazer_troca_ponteira_reserva`. A finalização vem pré-preenchida com essas contagens. Crédito de disparos nunca abate sozinho: o "Usar crédito" da finalização vem desligado.
- Ajustes (migration `2026-10-16-creditos-ajustes.sql`): cada contagem pode ter a ponteira (`locacao_contagens.aplicador_id`); `aplicadores_uso` dá os disparos dessa contagem a ela e o resto segue a montagem. Na finalização, ponteira por contagem e "Registrar a troca" (chama `montar_aplicador`). Editar locação refaz contagens e crédito por `corrigir_contagens_locacao` (recusa se o crédito gerado já foi usado em outra). Permuta também nas linhas de pagamento da finalização. Permuta pessoal guarda o gasto pessoal em `creditos_cliente.transaction_extra_id`; apagar a saída da permuta apaga esse gasto (gatilho `trg_creditos_apagar_gasto_pessoal`).

## Cadastros do formulário (Contourline Academy)

- Formulário Google "CADASTRO CONTOURLINE ACADEMY" (planilha de respostas no Drive do dono: nome, profissão, WhatsApp, e-mail, empresa, estabelecimento, cidade/estado). O Apps Script da planilha (`scripts/apps-script-formulario.gs`, segredo só no script e no cofre `formulario_cadastro_segredo`) manda cada resposta para a Edge Function `cadastro-formulario` (sem JWT; confere o segredo por `formulario_segredo()`), que guarda em `cadastros_recebidos` (chave = carimbo|nome|email, sem duplicar) e avisa no celular.
- Tela Clientes > "Cadastros recebidos" (`/clientes/cadastros`, aviso no Dashboard): acha o parecido (WhatsApp, e-mail ou nome; `lib/cadastro-formulario.ts`), mostra atual → novo e só grava o que for marcado, por `confirmar_cadastro_recebido` (cria lead com origem `formulario` ou atualiza) ou `descartar_cadastro_recebido`. Profissão e estabelecimento vão para as observações. Depois mostra "Liberar na Contourline Academy" (copiar nome, copiar e-mail, abrir `LINK_ACADEMY`): quem cadastra na Academy é o dono; o link nunca vai para a cliente.

## Pendências conhecidas

- Benefício da indicação: o dono ainda vai definir.
- Custo por disparo: adiado.
- Backup: o plano do Supabase é gratuito, então vale o backup manual semanal (Configurações > Baixar backup, guardar no Google Drive). Restauração testada em 06/10/2026 num Postgres temporário (`docs/RESTAURACAO-BACKUP.md`, `scripts/restaurar-backup.py`). Ainda não foi testada num projeto Supabase de verdade.
- Contrato assinado e checklist: fora do escopo por decisão do dono.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
