# Varredura tela por tela: achados e plano (05/10/2026)

Feita só com leitura: código da `main` (commit `61d037e`) e consultas de leitura no banco de produção. Nada foi alterado. Complementa `docs/AUDITORIA-HARMONIZE-2026-10-05.md`.

## O que já está certo

- Toda chamada do código ao banco (64 funções, 25 tabelas e views, colunas usadas em consultas e gravações) existe e bate com o banco. Nenhuma tela chama coisa inexistente.
- Todas as rotas linkadas existem.
- Dinheiro no banco está íntegro: 0 locação paga com saldo, 0 não paga com saldo zero, 0 pagamento sem lançamento no caixa.
- Situação hoje: 6 locações vencidas com saldo (R$ 10.415,78), 2 com pagamento parcial, 5 reservas passadas sem disparos lançados, 4 taxas pendentes e 1 taxa já paga pelo botão novo.

## Limite do teste

Não consigo entrar no app daqui (não há login neste ambiente) e não faço teste gravando em produção. O teste de cada entrega é: `tsc`, testes automáticos novos para cada conta de dinheiro, `next build`, consulta de leitura no banco depois do deploy e a sua conferência no celular, com o roteiro de cada item.

---

## Onda 1: corrigir o que grava dinheiro errado ou apaga dado (só código)

| # | Onde | Problema (conferido) | O que vou fazer |
|---|---|---|---|
| 1 | Financeiro, editar lançamento | **Grave.** Excluir uma entrada que é pagamento de locação apaga a **locação inteira** (`delete_record_forever` chama `excluir_locacao_cascata`). Editar valor ou data dela muda só o caixa, e o saldo da locação desencontra (já há 2 pagamentos com data diferente do caixa). | Nesses lançamentos, tirar "Excluir" e os campos de valor/data/tipo. No lugar: "Corrigir pagamento" (usa `editar_pagamento_locacao`, que já existe no banco) e "Remover só este pagamento" (usa `remover_pagamento_locacao`). Lançamentos comuns continuam iguais. |
| 2 | Calculadora, "Cobrar taxa de reserva agora" | O valor sugerido soma locação e taxa, a taxa vira lançamento próprio e o pagamento inteiro vai para a locação. O banco recusa por passar do saldo e o pagamento não é registrado. | Descontar a taxa dos pagamentos antes de registrar na locação. Teste automático da conta. |
| 3 | 10 campos de valor (Financeiro novo e editar, Editar locação, Despesas da reserva, Deslocamento, Configurações, Calculadora, Pendências) | "1.500,00" vira erro e "1.500" vira R$ 1,50. Na Calculadora e em Pendências, "1500.50" vira 150.050. | Usar o conversor único `lib/valor.ts` (já testado) em todos. |
| 4 | Lista de Clientes, botão confirmar | Grava direto na agenda por cliente+data: sem histórico, sem checar erro, e confirma também evento cancelado do mesmo dia. | Usar `confirmar_agendamento` pelo id do evento, como a Agenda faz. |
| 5 | Funil e Tarefas | Mover etapa, concluir tarefa e "Respondeu/Sem resposta" não checam erro: se falhar, a tela finge que deu certo. | Mostrar o erro e desfazer a mudança na tela. |
| 6 | Pendências e telas de dinheiro | Falha de rede aparece como "ninguém devendo". | Mostrar aviso de erro em vez de lista vazia. |

## Onda 2: atalhos (só código)

| # | Onde | Hoje | O que vou fazer |
|---|---|---|---|
| 7 | Botão "+" (aparece em todas as telas) | Não tem nada de receber. | Duas opções novas: **"Receber pagamento"** e **"Taxa de reserva recebida"**. Cada uma abre a lista de quem deve, com a baixa ali mesmo. |
| 8 | Um só componente "Receber pagamento" | Cada tela tem o seu ou não tem. | Valor já preenchido com o saldo, forma, conta PIX e data. O mesmo componente em todas as telas abaixo. |
| 9 | Locações | Linha com saldo só leva à ficha. | Botão "Receber" nas linhas com saldo. |
| 10 | Agenda | Locação finalizada: modal sem saldo nem pagamento. Pré-reserva: modal sem baixa de taxa. | Saldo e "Receber" no modal e no card da locação; "Taxa recebida" no modal da pré-reserva. |
| 11 | Ficha do cliente | Cartão de locação mostra só forma e valor; pagamento escondido dentro de "editar"; nenhuma baixa de taxa. | Saldo e "Receber" em cada cartão; "Taxa recebida" nas próximas reservas. |
| 12 | Tarefas | Tarefa automática só tem Concluir/Adiar. | Ação certa por tipo: cobrança de taxa = "Taxa recebida" e "Cobrar no WhatsApp"; confirmação = "Pedir confirmação"; pós-locação e recontato = WhatsApp com mensagem pronta; todas = abrir cliente. |
| 13 | Dashboard | Não mostra tarefas, e elas só nascem ao abrir Funil ou Tarefas (42 pendentes, 1 concluída na história). | Gerar as tarefas ao abrir o Dashboard e mostrar o aviso "N tarefas para hoje", levando à lista. |
| 14 | Dashboard, aviso de confirmações | Leva à Agenda genérica (contra a regra do CLAUDE.md). | Levar à Agenda já filtrada em "não confirmados". |
| 15 | Agenda de hoje | Lista sem nenhuma ação. | Tocar abre o cliente; botões "Finalizar com disparos", "Receber" e "Taxa recebida" conforme o caso. |

## Onda 3: precisa do seu aval (mexe no banco)

| # | Assunto | Proposta |
|---|---|---|
| 16 | Data da taxa recebida | Hoje entra no caixa na data do evento (futura) e não aparece em Entradas do dia nem do mês. Proposta: data do recebimento. Migration em `definir_taxa_agendamento`. |
| 17 | Locação de vários dias | Data final na reserva, agenda pintando o período, finalizar levando a data final. É a maior das entregas (auditoria 3.2). |
| 18 | Segurança | Exigir admin nas funções de exclusão e tirar a execução sem login (auditoria 2.2). |
| 19 | 2 pagamentos com data diferente do caixa | Mostro a prévia e acerto as datas com o seu aval. |

## Ordem

Uma onda por vez. Dentro da onda 1, uma entrega por item, publicada e conferida antes da próxima. A onda 2 vai em 3 entregas: (7, 8, 9) receber, (10, 11, 15) agenda e ficha, (12, 13, 14) tarefas e Dashboard. A onda 3 só com aval item a item.
