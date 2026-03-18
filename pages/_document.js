import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="es">
      <Head>
        <meta charSet="utf-8" />
        <meta name="description" content="Tablero de diagnóstico territorial electoral - Córdoba Capital" />
        <meta name="theme-color" content="#1976D2" />
        <link rel="icon" href="/favicon.ico" />
        
        {/* Preconnect para performance */}
        <link rel="preconnect" href="https://basemaps.cartocdn.com" />
        <link rel="dns-prefetch" href="https://basemaps.cartocdn.com" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
