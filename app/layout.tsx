import type { Metadata, Viewport } from "next";
import "./globals.css";
import DialogosHost from "@/components/Dialogos";

export const metadata: Metadata = {
  title: "Harmonize OS",
  description: "Gestão da Harmonize",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icone-192.png", apple: "/icone-180.png" },
  appleWebApp: { capable: true, title: "Harmonize", statusBarStyle: "default" },
};

// Trava o zoom (pinça e duplo-toque) e fixa a largura na tela do
// dispositivo, para o app se comportar como um app nativo instalado em
// vez de uma página que pode ser ampliada/reduzida no navegador.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  themeColor: "#2e9a94",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var p = location.pathname;
                var pessoal = p === '/pessoal' || p.indexOf('/pessoal/') === 0;
                if (pessoal) {
                  document.documentElement.classList.add('espaco-pessoal');
                }
                var t = localStorage.getItem('harmonize-tema');
                if (t === 'aurora') {
                  document.documentElement.classList.add('tema-aurora');
                } else if (t === 'hipro' && !pessoal) {
                  document.documentElement.classList.add('tema-hipro');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="bg-brand-mesh bg-[#f4f6f9] text-neutral-900 antialiased">
        {children}
        <DialogosHost />
      </body>
    </html>
  );
}
