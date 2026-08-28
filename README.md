# Harmonize OS — MVP (Fase 1, parte 1)

Sistema de gestão da Harmonize. Esta entrega cobre: login, dashboard,
e o módulo financeiro (lançamentos manuais). Clientes, Agenda, Equipamentos,
Relatórios e Configurações estão como telas placeholder — chegam nas
próximas etapas, na ordem da Fase 1 que você definiu.

## O que já funciona

- Login com Supabase Auth
- Dashboard: Saldo, Entradas, Saídas, Resultado, Locações, Ticket médio,
  gráfico de fluxo financeiro e de receitas por categoria, com filtro de
  período (Hoje / 7 dias / Este mês / Mês anterior / Personalizado)
- Financeiro: lançamento manual (entrada/saída → categoria → descrição →
  valor → forma de pagamento → data → observação → salvar)
- Menu lateral no desktop, menu inferior no celular, mostrando só os
  módulos liberados pelas permissões do usuário logado

## O que falta (próximas entregas)

- Clientes (cadastro + perfil com histórico)
- Locações (fluxo cliente + HIPRO + calculadora de disparos + pagamento)
- Agenda com bloqueio de conflito por equipamento (já garantido no banco,
  falta a tela)
- Equipamentos, Relatórios, Exportação Excel, Configurações/Usuários
- Ambiente financeiro pessoal (seletor HARMONIZE | PESSOAL)

A calculadora de disparos (`lib/rental-pricing.ts`) já está pronta e
testada com a tabela de preços nova (R$ 2.500 fixo até 20.000 disparos,
R$ 0,10/disparo até 80.000, R$ 0,07/disparo acima disso, sem mínimo).
Ela só ainda não está conectada a nenhuma tela, porque a tela de Locações
é a próxima etapa.

## Aviso importante sobre este código

Este projeto foi escrito e revisado manualmente, arquivo por arquivo, mas
**não consegui rodar `npm install` até o fim neste ambiente** (a instalação
do Next.js ficou incompleta por limite de rede/tempo do sandbox onde eu
trabalho). Ou seja: o código não foi validado por um build real. Antes de
publicar, rode os comandos abaixo localmente ou deixe a Vercel fazer isso
no primeiro deploy — se houver algum erro de sintaxe ou tipo que eu não
peguei na revisão manual, é ali que ele vai aparecer, e é rápido de corrigir.

## Passo a passo — rodar localmente

Pré-requisito: Node.js 18 ou mais recente instalado no computador.

```bash
# 1. instalar dependências
npm install

# 2. copiar o arquivo de variáveis de ambiente
cp .env.example .env.local
```

Edite `.env.local` com os dados do seu projeto Supabase (próximo passo
explica onde pegar isso).

```bash
# 3. rodar localmente
npm run dev
```

Abra http://localhost:3000 — deve redirecionar para /login.

## Passo a passo — criar o banco no Supabase

1. Crie uma conta gratuita em https://supabase.com e um novo projeto
2. Vá em **SQL Editor**, cole o conteúdo de `schema.sql` (na raiz deste
   projeto) e rode
3. Vá em **Project Settings > API** e copie:
   - `Project URL` → cole em `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → cole em `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Vá em **Authentication > Users** e crie seu usuário (e-mail + senha
   que você vai usar para logar no sistema)
5. Volte ao **SQL Editor** e rode, trocando pelo seu e-mail:

```sql
update profiles set is_admin = true,
  permissions = '{"dashboard":true,"financeiro":true,"clientes":true,
    "agenda":true,"equipamentos":true,"relatorios":true,
    "exportacao":true,"configuracoes":true}'::jsonb
where email = 'seu-email@exemplo.com';
```

Isso te dá acesso total como administrador.

## Passo a passo — publicar (Vercel)

1. Suba este projeto para um repositório no GitHub (pode ser privado)
2. Crie uma conta gratuita em https://vercel.com e conecte com o GitHub
3. Clique em **New Project**, selecione o repositório
4. Em **Environment Variables**, adicione as duas mesmas variáveis do
   `.env.local` (`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
5. Clique em **Deploy**

Depois do primeiro deploy, qualquer novo `git push` na branch principal
publica automaticamente — não precisa repetir esse processo.

## Variáveis de ambiente necessárias

| Variável | Onde encontrar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase > Project Settings > API |

## Estrutura do projeto

```
app/
  login/            tela de login
  (app)/            telas autenticadas (sidebar + menu inferior)
    dashboard/
    financeiro/
    clientes/       placeholder
    agenda/         placeholder
    equipamentos/   placeholder
    relatorios/     placeholder
    configuracoes/  placeholder
components/         componentes de UI compartilhados
lib/
  supabase/         clientes Supabase (browser e servidor)
  rental-pricing.ts calculadora de disparos (pronta, ainda não conectada)
  period.ts         lógica do filtro de período do dashboard
  format.ts         formatação de moeda e data em pt-BR
schema.sql           schema completo do banco (Supabase/Postgres)
middleware.ts         protege rotas autenticadas e redireciona para /login
```
