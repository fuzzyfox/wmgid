import type { FC, PropsWithChildren } from 'hono/jsx';

export const Layout: FC<PropsWithChildren<{ title?: string }>> = ({
  title = 'wmgid',
  children,
}) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <link rel="stylesheet" href="/public/style.css" />
      <script defer src="/public/alpine.js"></script>
    </head>
    <body class="bg-zinc-950 text-emerald-300 font-mono min-h-screen">
      {children}
    </body>
  </html>
);
