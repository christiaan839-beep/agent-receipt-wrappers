# agent-receipt-wrappers

Wrap a model call so the response gets a signed Guardian receipt. Your rules run over the output, the verdict (`pass`, `warn` or `block`) is signed with a signer you supply, and the result is a receipt you can store or verify later. No SDK dependencies: each wrapper accepts the response shape loosely, so it works across SDK versions.

| Import | Wraps |
|---|---|
| `agent-receipt-wrappers/anthropic` | Anthropic SDK `messages.create()` |
| `agent-receipt-wrappers/openai` | OpenAI chat completions |
| `agent-receipt-wrappers/google` | Gemini `generateContent` |
| `agent-receipt-wrappers/ai-sdk` | Vercel AI SDK `generateText` and `generateObject` |
| `agent-receipt-wrappers` | The Guardian rule runner and built-in rules |

Each wrapper exports a `mint…Receipt` function and a `withReceipt` helper. The receipt commits to the model's text output only, not to tool calls.

```ts
import { mintMessageReceipt } from "agent-receipt-wrappers/anthropic";

const receipt = await mintMessageReceipt(message, {
  sign: (canonical) => mySigner(canonical), // you supply the signer
  agentSlug: "contract-summarizer",
  runId: "run-001",
  rules: [],
});
```

The rule packs and verifiers live in [verifiable-receipts](https://github.com/christiaan839-beep/verifiable-receipts).

## Develop

```bash
npm install
npm test
npm run build
```

## Licence

Dual-licensed under either of [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option.
