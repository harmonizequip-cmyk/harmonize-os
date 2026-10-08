import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="pt-BR">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem('harmonize-theme');
                if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="bg-brand-mesh bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
