#!/usr/bin/env python3
"""Gera o SQL que restaura um backup baixado em Configurações > Baixar backup.

Uso:
  python3 scripts/restaurar-backup.py backup-harmonize-AAAA-MM-DD.json saida.sql

O SQL gerado serve para um banco NOVO (schema.sql já carregado e nenhum dado
de negócio). Ele se recusa a rodar se o banco já tiver clientes, locações ou
lançamentos, para nunca escrever por cima de dados reais.

Cada tabela é carregada com jsonb_populate_recordset, que converte os tipos
pelo próprio banco. Os gatilhos ficam desligados durante a carga
(session_replication_role = replica), senão eles recriariam tarefas e
histórico que o backup já traz. Ao final o SQL confere linha a linha cada
tabela contra o arquivo e levanta erro se algo não bater.

O login (e-mail e senha) vive no Auth do Supabase, fora das tabelas: crie o
usuário no projeto novo ANTES com o mesmo id do perfil salvo (o id aparece em
tabelas.profiles do arquivo), ou ajuste o id depois.
"""
import json
import sys

# Ordem que respeita as chaves estrangeiras (pai antes de filho).
ORDEM = [
    "profiles", "settings", "equipments", "categories", "tags", "clients",
    "client_tags", "calendar_events", "rentals", "rental_payments",
    "transactions", "emprestimos", "mentoring_events", "expense_limits", "tasks",
    "contratos_emitidos", "movimentacoes",
]
# Tabelas que o schema.sql já semeia com linhas padrão: saem antes da carga.
SEMEADAS = ["settings", "equipments", "categories", "tags"]


def colunas_do_backup(linhas: list) -> list:
    """Colunas presentes no arquivo, na ordem em que aparecem."""
    vistas: dict = {}
    for linha in linhas:
        for chave in linha:
            vistas.setdefault(chave, None)
    return list(vistas)


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    with open(sys.argv[1], encoding="utf-8") as f:
        backup = json.load(f)
    tabelas = backup["tabelas"]
    esperado = backup.get("contagens", {})
    for nome in ORDEM:
        if nome not in tabelas:
            # Backup anterior à tabela existir (emprestimos entrou em 06/10/2026).
            tabelas[nome] = []
            esperado.setdefault(nome, 0)
        if esperado.get(nome) != len(tabelas[nome]):
            print(f"Contagem do cabeçalho não bate em {nome}", file=sys.stderr)
            return 1

    sql = []
    sql.append("-- Restauração de backup gerada por scripts/restaurar-backup.py")
    sql.append(f"-- Backup gerado em {backup.get('gerado_em')}")
    sql.append("begin;")
    sql.append("""do $$
begin
  if exists (select 1 from public.clients) or exists (select 1 from public.rentals)
     or exists (select 1 from public.transactions) then
    raise exception 'Banco não está vazio: a restauração só roda em banco novo.';
  end if;
end $$;""")
    sql.append("set local session_replication_role = replica;")
    for nome in SEMEADAS:
        sql.append(f"delete from public.{nome};")
    for nome in ORDEM:
        corpo = json.dumps(tabelas[nome], ensure_ascii=False)
        if "$bk$" in corpo:
            print(f"Conteúdo de {nome} contém o marcador $bk$", file=sys.stderr)
            return 1
        colunas = colunas_do_backup(tabelas[nome])
        if not colunas:
            continue
        lista = ", ".join(f'"{c}"' for c in colunas)
        # Só as colunas que o arquivo traz: coluna criada depois do backup
        # fica com o valor padrão do banco em vez de nulo.
        sql.append(
            f"insert into public.{nome} ({lista}) select {lista} from jsonb_populate_recordset(null::public.{nome}, $bk${corpo}$bk$::jsonb);"
        )
    sql.append("-- Conferência linha a linha: cada linha do arquivo precisa existir idêntica no banco.")
    sql.append("do $$\ndeclare v_dif integer;\nbegin")
    for nome in ORDEM:
        corpo = json.dumps(tabelas[nome], ensure_ascii=False)
        chaves = "array[" + ", ".join(f"'{c}'" for c in colunas_do_backup(tabelas[nome])) + "]::text[]"
        sql.append(
            f"""  select count(*) into v_dif from (
    select (select coalesce(jsonb_object_agg(k, v), '{{}}'::jsonb) from jsonb_each(to_jsonb(t)) j(k, v) where k = any({chaves}))
      from public.{nome} t
    except select e from jsonb_array_elements($bk${corpo}$bk$::jsonb) e
  ) d;
  if v_dif <> 0 or (select count(*) from public.{nome}) <> {len(tabelas[nome])} then
    raise exception 'Restauração de {nome} não confere com o backup';
  end if;"""
        )
    sql.append("end $$;")
    sql.append("commit;")
    sql.append("select 'restauração conferida' as resultado;")
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write("\n".join(sql) + "\n")
    print(f"SQL gerado: {sys.argv[2]} ({sum(len(v) for v in tabelas.values())} linhas)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
