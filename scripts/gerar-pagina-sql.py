#!/usr/bin/env python3
"""
Gera a página HTML (para publicar como Artifact) com os SQLs que o dono vai
rodar no SQL Editor do Supabase pelo celular: um bloco por arquivo, na ordem
em que forem passados, cada um com botão Copiar.

Uso:
  python3 scripts/gerar-pagina-sql.py saida.html migrations/a.sql migrations/b.sql \
      [--conferencia "select ...;" --conferencia-texto "Deve voltar uma linha: x."]

O título de cada bloco é a primeira linha de comentário depois do STATUS, e a
descrição são as linhas seguintes do mesmo comentário (até 3). Comentários do
início e do fim do arquivo não vão para a página: só o SQL.
Publicar com: Artifact (icon "database", description de uma frase).
Regra do projeto: todo SQL para o dono rodar sai nesta página, na ordem de
execução, nunca como arquivo anexo.
"""
import html
import sys


def partes(caminho):
    linhas = open(caminho, encoding="utf-8").read().split("\n")
    cab, i = [], 0
    while i < len(linhas) and (linhas[i].startswith("--") or not linhas[i].strip()):
        cab.append(linhas[i])
        i += 1
    corpo = linhas[i:]
    while corpo and (corpo[-1].startswith("--") or not corpo[-1].strip()):
        corpo.pop()
    texto = [l[2:].strip() for l in cab if l.startswith("--")]
    texto = [t for t in texto if t and not set(t) <= {"-", "="} and not t.upper().startswith("STATUS")]
    titulo = texto[0] if texto else caminho.split("/")[-1]
    desc = " ".join(texto[1:4])
    return titulo.rstrip("."), desc, "\n".join(corpo) + "\n"


def main():
    args = sys.argv[1:]
    conf, conf_txt = None, "Execute esta consulta (só leitura) para conferir."
    if "--conferencia" in args:
        k = args.index("--conferencia")
        conf = args[k + 1]
        del args[k : k + 2]
    if "--conferencia-texto" in args:
        k = args.index("--conferencia-texto")
        conf_txt = args[k + 1]
        del args[k : k + 2]
    if len(args) < 2:
        sys.exit(__doc__)
    saida, arquivos = args[0], args[1:]

    blocos = ""
    for n, f in enumerate(arquivos, 1):
        t, d, sql = partes(f)
        blocos += f"""
<section class="script">
  <header><span class="passo">{n}</span><div><h2>{html.escape(t)}</h2><p>{html.escape(d)}</p></div></header>
  <div class="barra"><button class="copiar" data-alvo="sql{n}">Copiar SQL {n}</button><span class="aviso" role="status"></span></div>
  <pre id="sql{n}" tabindex="0">{html.escape(sql)}</pre>
</section>"""
    verif = ""
    if conf:
        verif = f"""
<section class="verif">
  <h2>Conferência</h2><p>{html.escape(conf_txt)}</p>
  <div class="barra"><button class="copiar" data-alvo="sqlv">Copiar consulta</button><span class="aviso" role="status"></span></div>
  <pre id="sqlv" tabindex="0">{html.escape(conf)}</pre>
</section>"""

    modelo = open(__file__.replace("gerar-pagina-sql.py", "pagina-sql.modelo.html"), encoding="utf-8").read()
    pagina = modelo.replace("{{BLOCOS}}", blocos).replace("{{CONFERENCIA}}", verif).replace("{{TOTAL}}", str(len(arquivos)))
    open(saida, "w", encoding="utf-8").write(pagina)
    print(f"{saida}: {len(arquivos)} script(s)")


if __name__ == "__main__":
    main()
