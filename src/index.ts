import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';

export const app = new Hono();

app.get('/healthz', (c) => c.text('ok'));

app.get('/public/*', serveStatic({ root: './' }));

app.get('/', (c) => {
  return c.html(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>wmgid</title>
    <link rel="stylesheet" href="/public/style.css" />
  </head>
  <body class="bg-zinc-950 text-emerald-300 font-mono p-8">
    <pre>❯ wmgid --boot
ok — walking skeleton</pre>
  </body>
</html>`
  );
});

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port });
  console.log(`[wmgid] listening on :${port}`);
}
