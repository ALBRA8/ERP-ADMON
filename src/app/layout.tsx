import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Marsella ERP — Software Contable Administrativo",
  description:
    "ERP contable-administrativo para Colombia. Facturación electrónica DIAN, inventarios, cartera, contabilidad NIIF.",
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Script para eliminar el badge "N" de Next.js DevTools
const devToolsKiller = `
(function() {
  var remove = function() {
    var p = document.querySelector('nextjs-portal');
    if (p) p.remove();
  };
  setTimeout(remove, 100);
  setTimeout(remove, 500);
  setTimeout(remove, 1500);
  setTimeout(remove, 3000);
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/icon-192.svg" />
        <style dangerouslySetInnerHTML={{ __html: "nextjs-portal{display:none!important;}" }} />
      </head>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <script dangerouslySetInnerHTML={{ __html: devToolsKiller }} />
        </ThemeProvider>
      </body>
    </html>
  );
}
