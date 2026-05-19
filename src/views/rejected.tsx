import type { FC } from 'hono/jsx';
import { Layout } from './layout.js';

export const Rejected: FC<{ required: string; received: string; email: string }> = ({
  required,
  received,
  email,
}) => (
  <Layout title="wmgid — access denied">
    <div class="min-h-screen flex items-center justify-center px-4">
      <div class="max-w-lg w-full">
        <pre class="text-xs text-zinc-500 mb-4">❯ wmgid --verify</pre>
        <pre data-testid="rejected" class="text-red-400 mb-4">✗ access denied</pre>
        <pre class="text-sm text-zinc-300 mb-6">{`  required hd  "${required}"
  received hd  "${received}"
  signed in as ${email}

  This tool is restricted to @${required} accounts.`}</pre>
        <a
          href="/auth/google"
          class="inline-block px-4 py-2 border border-emerald-700/60 hover:border-emerald-500 text-emerald-300 hover:bg-emerald-900/20 rounded text-sm"
        >
          [ try again ]
        </a>
      </div>
    </div>
  </Layout>
);
