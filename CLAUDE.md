# Harmonize OS

Sistema interno da Harmonize (locação dos equipamentos HIPRO 1 e HIPRO 2 e mentorias). Um operador só, que usa quase sempre pelo celular.

## Onde as coisas estão

- Código: Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres, RLS, RPCs `security definer`).
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
- Anotar por voz: "+" > Anotar por voz ou atalho `/dashboard?acao=voz`. Abre a Nova tarefa escutando (`lib/reconhecer-fala.ts`) e `lib/voz.ts` tira da frase a data e o cliente. Na dúvida entre clientes, oferece as opções em vez de escolher.
- Despesa por voz: "+" > Despesa por voz abre o Novo lançamento escutando; `interpretarDespesa` (`lib/voz.ts`) tira valor, forma de pagamento, data, categoria (por sinônimos: gasolina→Combustível, almoço→Alimentação, hotel→Hospedagem...) e cliente.
- Novo lead: "Puxar dos contatos do celular" (`lib/contatos.ts`, só Chrome no Android).
- Sem internet: `components/GuardarAgendaOffline.tsx` guarda no localStorage (`harmonize-agenda-offline`) os atendimentos de hoje a 7 dias; o `sw.js` mostra `public/sem-internet.html` quando uma tela não abre por falta de rede.
- Entrar com a digital: passkey nativa do Supabase Auth (`supabase.auth.registerPasskey`/`signInWithPasskey`, `lib/digital.ts`, cartão em Configurações, botão no login). Precisa estar ligada no painel do Supabase (Authentication > Passkeys) com RP ID `harmonize-os.vercel.app`; mudar o RP ID invalida as digitais cadastradas. A tabela antiga `webauthn_credentials` não é usada.
- Atalhos do ícone (manifest `shortcuts`) usam `?acao=` (`/dashboard?acao=receber`, `/agenda?acao=reservar`).

## Pendências conhecidas

- Benefício da indicação: o dono ainda vai definir.
- Custo por disparo: adiado.
- Backup: o plano do Supabase é gratuito, então vale o backup manual semanal (Configurações > Baixar backup, guardar no Google Drive). Restauração testada em 06/10/2026 num Postgres temporário (`docs/RESTAURACAO-BACKUP.md`, `scripts/restaurar-backup.py`). Ainda não foi testada num projeto Supabase de verdade.
- Contrato assinado e checklist: fora do escopo por decisão do dono.
