import type { FC } from 'hono/jsx';
import { Layout } from './layout.js';

const GoogleG: FC = () => (
  <svg viewBox="0 0 18 18" class="h-5 w-5" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.83.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
  </svg>
);

export const Login: FC<{ restrictedHd?: string; cancelled?: boolean }> = ({
  restrictedHd,
  cancelled = false,
}) => (
  <Layout title="wmgid">
    <div class="min-h-screen flex items-center justify-center px-4">
      <div class="max-w-md w-full">
        <pre class="text-xs text-zinc-500 mb-4">{`❯ wmgid --login
not signed in${restrictedHd ? `\n// restricted to @${restrictedHd}` : ''}`}</pre>
        {cancelled && (
          <div
            data-testid="cancelled-banner"
            class="text-xs text-amber-400/80 mb-3"
          >// sign-in cancelled</div>
        )}
        <a
          href="/auth/google"
          class="inline-flex items-center justify-center gap-3 w-full bg-zinc-900 border border-emerald-700/60 hover:border-emerald-500 text-emerald-300 hover:bg-emerald-900/20 px-4 py-3 rounded text-sm transition"
        >
          <GoogleG />
          <span>Sign in with Google</span>
        </a>
      </div>
    </div>
  </Layout>
);
