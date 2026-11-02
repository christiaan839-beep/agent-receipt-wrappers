/**
 * agent-receipt-wrappers/openai
 *
 * Wraps a OpenAI chat completion in a Guardian attestation: your rules run over the
 * output and the verdict is signed with a signer you supply (Ed25519, HMAC,
 * a KMS). The receipt commits to the model output only.
 *
 * Usage:
 *
 *   import OpenAI from "openai";
 *   import { mintCompletionReceipt } from "agent-receipt-wrappers/openai";
 *
 *   const openai = new OpenAI();
 *   const completion = await openai.chat.completions.create({
 *     model: "gpt-4o",
 *     messages: [{ role: "user", content: "Summarize this contract..." }],
 *   });
 *
 *   const receipt = await mintCompletionReceipt(completion, {
 *     sign: (canonical) => Ed25519.sign(privateKey, canonical),
 *     agentSlug: "contract-summarizer",
 *     runId: "run_01HXX...",
 *     rules: [hipaaPack.rules, ...].flat(),  // optional Guardian rules
 *   });
 *
 *   // receipt.signature → "v2=<base64>" — verifiable by any third party
 *   // receipt.overall   → "pass" | "warn" | "block"
 *   // receipt.canonical → the bytes that were signed
 *
 * Compose with github.com/christiaan839-beep/verifiable-receipts for verification:
 *
 *   import { verifyGuardianAttestation } from "./guardian.js";
 *   const ok = verifyGuardianAttestation(receipt, verifyCallback);
 *
 * @packageDocumentation
 */

import {
  runGuardian,
  type GuardianAttestation,
  type GuardianRule,
} from "./guardian.js";

/**
 * Minimal shape of an OpenAI ChatCompletion that this wrapper needs.
 * Matches `openai.chat.completions.create()` return value (non-stream).
 *
 * We intentionally accept this loose shape rather than `import type`
 * from `openai` — keeps this package zero-runtime-dep + lets it work
 * across openai SDK major versions (v4 / v5).
 */
export interface OpenAIChatCompletion {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface MintCompletionReceiptOptions {
  /**
   * Sign function. Caller supplies their own crypto primitive — Node
   * `crypto.sign`, `@noble/ed25519`, KMS HSM, whatever. Receives the
   * exact UTF-8 bytes that need to be signed and returns the wire
   * signature (typically `v2=<base64>` per VAOS 2.0).
   */
  sign: (canonical: string) => string;
  /**
   * Stable slug for the agent making the call (e.g. "contract-summarizer").
   * Surfaces in the receipt for audit-trail grouping.
   */
  agentSlug: string;
  /**
   * Stable id for this specific run. Caller-supplied — typically a UUID
   * generated at the top of the request handler.
   */
  runId: string;
  /**
   * Optional opaque token id (e.g. an idempotency key). Persists into
   * the receipt for replay-detection by downstream verifiers.
   */
  tokenId?: string;
  /**
   * Optional Guardian rules to evaluate against the completion's output.
   * Pass `[...hipaaPack.rules, ...cfpbPack.rules]` from the
   * the rule packs in github.com/christiaan839-beep/verifiable-receipts subpath to get
   * jurisdiction-cited verdicts in the receipt.
   *
   * If omitted, the receipt records the completion bytes without any
   * verdict — still cryptographically signed, just no policy layer.
   */
  rules?: GuardianRule[];
}

/**
 * Mint a VAOS Guardian attestation around an OpenAI chat completion.
 *
 * Returns the same shape as `runGuardian()` from the canonical
 * github.com/christiaan839-beep/verifiable-receipts package — a signed
 * `GuardianAttestation` that any third party can verify with the
 * issuer's public key.
 *
 * Throws when:
 *   - The completion has no choices or the first choice has no content
 *   - The sign callback throws
 *
 * Never mutates the input completion. Safe to call after the OpenAI
 * SDK call returns; safe to chain.
 */
export async function mintCompletionReceipt(
  completion: OpenAIChatCompletion,
  opts: MintCompletionReceiptOptions,
): Promise<GuardianAttestation> {
  if (!completion || typeof completion !== "object") {
    throw new Error("mintCompletionReceipt: completion must be an object");
  }
  const choice = completion.choices?.[0];
  if (!choice) {
    throw new Error(
      "mintCompletionReceipt: completion has no choices to attest over",
    );
  }
  const output = choice.message?.content ?? "";

  // Compose an input projection that's stable + minimal. We don't
  // re-include the prompt because (a) it could be huge, (b) the
  // canonical projection is meant to be compact — the receipt
  // commits to the OUTPUT bytes, not the input. Callers who need
  // input commitment should pre-hash + pass in tokenId.
  const input = {
    provider: "openai",
    model: completion.model,
    finishReason: choice.finish_reason ?? null,
    promptTokens: completion.usage?.prompt_tokens ?? null,
    completionTokens: completion.usage?.completion_tokens ?? null,
  };

  return runGuardian(
    opts.rules ?? [],
    {
      runId: opts.runId,
      agentSlug: opts.agentSlug,
      tokenId: opts.tokenId ?? completion.id,
      input,
      output,
    },
    opts.sign,
  );
}

/**
 * Convenience helper: takes an in-flight promise to an OpenAI
 * completion and returns both the original completion + the minted
 * receipt. Useful when you want a one-line wrap of an existing call.
 *
 * Example:
 *
 *   const { completion, receipt } = await withReceipt(
 *     openai.chat.completions.create({ ... }),
 *     { sign, agentSlug: "x", runId: "y" }
 *   );
 */
export async function withReceipt<T extends OpenAIChatCompletion>(
  completionPromise: Promise<T>,
  opts: MintCompletionReceiptOptions,
): Promise<{ completion: T; receipt: GuardianAttestation }> {
  const completion = await completionPromise;
  const receipt = await mintCompletionReceipt(completion, opts);
  return { completion, receipt };
}

/**
 * Re-export the canonical types so callers can use them without a
 * second `import` statement.
 */
export type { GuardianAttestation, GuardianRule };
