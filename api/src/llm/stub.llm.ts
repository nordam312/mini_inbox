import { LlmProvider, LlmRequest } from './llm.types';

/**
 * Used when LLM_PROVIDER=stub, which is the default. Lets the whole flow run
 * with no API key and no spend, and keeps tests deterministic.
 *
 * The reply is deliberately obvious, so a stub reply is never mistaken for a
 * real one in the dashboard.
 */
export class StubLlm implements LlmProvider {
  async complete(request: LlmRequest): Promise<string> {
    const lastCustomerMessage = request.messages.at(-1)?.text ?? '';
    const quoted =
      lastCustomerMessage.length > 80
        ? `${lastCustomerMessage.slice(0, 80)}...`
        : lastCustomerMessage;

    return `[stub reply] Thanks for your message: "${quoted}" - someone will follow up shortly.`;
  }
}
