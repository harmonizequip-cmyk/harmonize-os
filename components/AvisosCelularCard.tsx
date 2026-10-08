"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisosSuportados, chaveParaBytes, VAPID_PUBLIC_KEY } from "@/lib/push";

type Estado = "carregando" | "sem_suporte" | "bloqueado" | "desligado" | "ligado";

// Evento do Chrome que permite oferecer "Instalar app" com um botão próprio.
interface PedidoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Avisos no celular: liga e desliga os avisos deste aparelho e manda um aviso
 * de teste. Os avisos chegam com o app fechado: 7h30 o resumo do dia e 18h as
 * reservas de amanhã.
 */
export default function AvisosCelularCard() {
  const supabase = createClient();
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [instalacao, setInstalacao] = useState<PedidoInstalacao | null>(null);
  const [instalado, setInstalado] = useState(false);

  useEffect(() => {
    setInstalado(window.matchMedia("(display-mode: standalone)").matches);
    const aoPedir = (e: Event) => {
      e.preventDefault();
      setInstalacao(e as PedidoInstalacao);
    };
    window.addEventListener("beforeinstallprompt", aoPedir);

    (async () => {
      if (!avisosSuportados()) return setEstado("sem_suporte");
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const inscricao = await reg.pushManager.getSubscription();
      setEstado(inscricao ? "ligado" : "desligado");
    })().catch(() => setEstado("sem_suporte"));

    return () => window.removeEventListener("beforeinstallprompt", aoPedir);
  }, []);

  async function ligar() {
    setOcupado(true);
    setErro(null);
    setMensagem(null);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        setErro("Os avisos não foram autorizados neste aparelho.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const inscricao =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: chaveParaBytes(VAPID_PUBLIC_KEY) as unknown as BufferSource,
        }));
      const json = inscricao.toJSON();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Entre no app de novo e tente outra vez.");
      const { error } = await supabase.from("push_inscricoes").upsert(
        {
          user_id: user.id,
          endpoint: inscricao.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          aparelho: navigator.userAgent.slice(0, 200),
        },
        { onConflict: "endpoint" }
      );
      if (error) throw new Error(error.message);
      setEstado("ligado");
      setMensagem("Avisos ligados neste aparelho. Toque em \"Enviar aviso de teste\" para conferir.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui ligar os avisos.");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    setErro(null);
    setMensagem(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const inscricao = await reg?.pushManager.getSubscription();
      if (inscricao) {
        await supabase.from("push_inscricoes").delete().eq("endpoint", inscricao.endpoint);
        await inscricao.unsubscribe();
      }
      setEstado("desligado");
      setMensagem("Avisos desligados neste aparelho.");
    } catch {
      setErro("Não consegui desligar. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function testar() {
    setOcupado(true);
    setErro(null);
    setMensagem(null);
    const { data, error } = await supabase.functions.invoke("alertas", { body: { tipo: "teste" } });
    setOcupado(false);
    if (error) return setErro("O envio falhou. Tente de novo em alguns minutos.");
    if (!data?.enviados) return setErro("Nenhum aparelho recebeu. Desligue e ligue os avisos de novo.");
    setMensagem("Aviso enviado. Ele deve aparecer no celular em alguns segundos.");
  }

  async function instalar() {
    if (!instalacao) return;
    await instalacao.prompt();
    const escolha = await instalacao.userChoice;
    if (escolha.outcome === "accepted") setInstalado(true);
    setInstalacao(null);
  }

  const botao = "rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal">
          <BellRing size={17} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Avisos no celular</p>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            Chegam com o app fechado: 7h30 o resumo do dia (reservas, quem deve, tarefas atrasadas) e 18h as
            reservas de amanhã. Tocar no aviso abre a tela certa.
          </p>

          {!instalado && (
            <div className="mt-2 rounded-lg bg-neutral-100 p-2 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {instalacao ? (
                <button type="button" onClick={instalar} className="font-medium text-brand-teal underline underline-offset-2">
                  Instalar o Harmonize na tela inicial
                </button>
              ) : (
                <>Dica: instale o app pelo menu do Chrome (⋮) em &quot;Instalar app&quot; ou &quot;Adicionar à tela inicial&quot;.</>
              )}
            </div>
          )}

          <p className="mt-2 text-xs font-medium">
            {estado === "carregando" && <span className="text-neutral-400">Verificando este aparelho...</span>}
            {estado === "sem_suporte" && (
              <span className="text-amber-700 dark:text-amber-400">
                Este navegador não recebe avisos. No celular, use o Chrome (no iPhone, instale o app na tela inicial).
              </span>
            )}
            {estado === "bloqueado" && (
              <span className="text-amber-700 dark:text-amber-400">
                Os avisos estão bloqueados. Libere em Configurações do Chrome &gt; Configurações do site &gt; Notificações.
              </span>
            )}
            {estado === "desligado" && <span className="text-neutral-500">Desligados neste aparelho.</span>}
            {estado === "ligado" && <span className="text-brand-teal">Ligados neste aparelho.</span>}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {estado === "desligado" && (
              <button type="button" onClick={ligar} disabled={ocupado} className={`${botao} bg-brand-teal text-white`}>
                {ocupado ? "Ligando..." : "Ativar avisos"}
              </button>
            )}
            {estado === "ligado" && (
              <>
                <button type="button" onClick={testar} disabled={ocupado} className={`${botao} bg-brand-teal text-white`}>
                  {ocupado ? "Enviando..." : "Enviar aviso de teste"}
                </button>
                <button
                  type="button"
                  onClick={desligar}
                  disabled={ocupado}
                  className={`${botao} border border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300`}
                >
                  Desligar
                </button>
              </>
            )}
          </div>
          {mensagem && <p className="mt-2 text-xs text-brand-teal">{mensagem}</p>}
          {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
