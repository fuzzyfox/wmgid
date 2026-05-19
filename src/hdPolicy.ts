export type HdCheckInput = {
  received: string | undefined;
  allowed: string | undefined;
};

export type HdCheckResult =
  | { ok: true }
  | { ok: false; received: string; required: string };

/**
 * Opt-in restriction (see ADR-0002): unrestricted by default; when an
 * `ALLOWED_HD` is configured, the received `hd` claim must match exactly.
 * Missing `hd` on a personal account is reported as `(none)` so the
 * rejection screen can show what Google actually sent.
 */
export function checkHd({ received, allowed }: HdCheckInput): HdCheckResult {
  if (!allowed) return { ok: true };
  if (received === allowed) return { ok: true };

  return { ok: false, received: received ?? '(none)', required: allowed };
}
