import Anthropic from '@anthropic-ai/sdk';

import { LlmProvider, LlmRequest } from './llm.types';

/** A chat reply, not an essay. */
const MAX_TOKENS = 1024;

/** Milliseconds in the TypeScript SDK. */
const TIMEOUT_MS = 15_000;

/** The only file in the codebase that imports the Anthropic SDK. */
export class AnthropicLlm implements LlmProvider {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({
      apiKey,
      // The SDK already retries 408/409/429/5xx and connection errors with
      // backoff, so there is no hand-written retry loop here. Worst-case wall
      // clock is timeout x (maxRetries + 1) and this call runs inside the
      // webhook request, so one retry is the budget: a channel provider gives
      // up and redelivers long before 45 seconds.
      timeout: TIMEOUT_MS,
      maxRetries: 1,
    });
  }

  async complete({ system, messages }: LlmRequest): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      system,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.text,
      })),
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
  }
}
