import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harmonize OS",
  description: "Gestão da Harmonize",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
