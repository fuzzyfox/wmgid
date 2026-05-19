import type { FC } from 'hono/jsx';
import type { StoredClaims } from '../claims.js';
import { Layout } from './layout.js';
import { iatHuman, initials, avatarBg, primaryEntries, metaEntries } from './format.js';

const valueClass = (v: unknown): string => {
  if (v === null) return 'text-zinc-500 italic';
  if (typeof v === 'boolean' || typeof v === 'number') return 'text-amber-300';
  return 'text-emerald-300';
};

const renderValue = (v: unknown): string => JSON.stringify(v);

export const Card: FC<{ claims: StoredClaims }> = ({ claims }) => {
  const primary = primaryEntries(claims as unknown as Record<string, unknown>);
  const meta = metaEntries(claims as unknown as Record<string, unknown>);
  const metaCount = meta.length;
  const seed = claims.name || claims.email || claims.sub || '?';
  const verified = claims.email_verified !== false;

  return (
    <Layout title="wmgid">
      <div
        x-data={`{ debugOpen: false, copied: null, imgFailed: ${claims.picture ? 'false' : 'true'},
          async copy(value, key='default') {
            try { await navigator.clipboard.writeText(value); this.copied = key; setTimeout(() => { if (this.copied === key) this.copied = null; }, 1500); } catch(e) { console.error(e); }
          }
        }`}
        class="max-w-3xl mx-auto px-4 py-8"
      >
        <div class="text-xs text-zinc-500 mb-6">
          ❯ wmgid
        </div>

        <div class="flex items-center gap-4 mb-8 pb-6 border-b border-zinc-800">
          {claims.picture ? (
            <>
              <img
                x-show="!imgFailed"
                src={claims.picture}
                {...{ '@error': 'imgFailed = true' }}
                referrerpolicy="no-referrer"
                alt=""
                class="h-14 w-14 rounded object-cover ring-1 ring-zinc-700"
              />
              <div
                x-show="imgFailed"
                style={`background:${avatarBg(seed)}`}
                class="h-14 w-14 rounded flex items-center justify-center text-lg font-bold text-zinc-950"
              >
                {initials(seed)}
              </div>
            </>
          ) : (
            <div
              style={`background:${avatarBg(seed)}`}
              class="h-14 w-14 rounded flex items-center justify-center text-lg font-bold text-zinc-950"
            >
              {initials(seed)}
            </div>
          )}
          <div class="text-sm">
            <div class="text-zinc-100">
              <span class="text-zinc-500">name=</span>
              <span>"{claims.name ?? ''}"</span>
            </div>
            <div class="text-zinc-300">
              <span class="text-zinc-500">email=</span>
              <span>"{claims.email ?? ''}"</span>{' '}
              {verified ? (
                <span class="text-emerald-500">[verified]</span>
              ) : (
                <span class="text-red-400">[unverified]</span>
              )}
            </div>
            {claims.hd && (
              <div class="text-zinc-400 text-xs">
                <span class="text-zinc-500">hd=</span>
                <span>"{claims.hd}"</span>
              </div>
            )}
          </div>
        </div>

        <div class="mb-8">
          <div class="text-xs text-zinc-500 mb-2"># google_id — stable, never reused</div>
          <div class="bg-zinc-900 border border-emerald-700/40 rounded p-4 flex items-start gap-3">
            <span class="text-emerald-500 select-none shrink-0">❯</span>
            <code class="text-emerald-300 text-base break-all flex-1" data-testid="google-id">
              {claims.sub}
            </code>
            <button
              {...{ '@click': `copy(${JSON.stringify(claims.sub)}, 'sub')` }}
              data-testid="copy-google-id"
              class="shrink-0 text-xs px-2 py-1 border border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/30 rounded"
            >
              <span x-text="copied === 'sub' ? '✓' : 'copy'">copy</span>
            </button>
          </div>
        </div>

        <div class="flex gap-2 mb-6 text-xs">
          <button
            data-testid="copy-json"
            {...{ '@click': `copy(${JSON.stringify(JSON.stringify(claims, null, 2))}, 'json')` }}
            class="px-3 py-1.5 border border-zinc-700 hover:border-emerald-600 text-zinc-300 hover:text-emerald-300 rounded"
          >
            <span x-text="copied === 'json' ? '✓ json copied' : 'copy --json'">copy --json</span>
          </button>
          <button
            data-testid="toggle-meta"
            {...{ '@click': 'debugOpen = !debugOpen' }}
            class="px-3 py-1.5 border border-zinc-700 hover:border-emerald-600 text-zinc-300 hover:text-emerald-300 rounded"
          >
            <span x-text="debugOpen ? 'hide --meta' : 'show --meta'">show --meta</span>
          </button>
          <form method="post" action="/logout" class="ml-auto">
            <button class="px-3 py-1.5 text-zinc-500 hover:text-red-400">logout</button>
          </form>
        </div>

        <div class="bg-zinc-900/50 border border-zinc-800 rounded p-4 text-xs leading-relaxed overflow-x-auto">
          <div><span class="text-zinc-500">{'{'}</span></div>
          {primary.map(([k, v]) => (
            <div class="pl-4">
              <span class="text-sky-300">"{k}"</span>
              <span class="text-zinc-500">: </span>
              <span class={valueClass(v)}>{renderValue(v)}</span>
              <span class="text-zinc-500">,</span>
            </div>
          ))}
          {metaCount > 0 && (
            <>
              <div x-show="debugOpen" {...{ 'x-cloak': '' }}>
                {meta.map(([k, v]) => (
                  <div class="pl-4 bg-zinc-800/40">
                    <span class="text-purple-300">"{k}"</span>
                    <span class="text-zinc-500">: </span>
                    <span class={valueClass(v)}>{renderValue(v)}</span>
                    <span class="text-zinc-500">,</span>
                    {k === 'iat' && typeof v === 'number' && (
                      <span class="text-zinc-600 ml-2">{`// ${iatHuman(v)}`}</span>
                    )}
                  </div>
                ))}
              </div>
              <div
                x-show="!debugOpen"
                class="pl-4 text-zinc-600 italic"
                data-testid="meta-hidden"
              >{`▸ token claims (${metaCount} hidden) — click show --meta`}</div>
            </>
          )}
          <div><span class="text-zinc-500">{'}'}</span></div>
        </div>
      </div>
    </Layout>
  );
};
