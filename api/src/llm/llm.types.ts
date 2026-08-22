export interface LlmMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface LlmRequest {
  /** The tenant's persona and knowledge base, already assembled. */
  system: string;
  messages: LlmMessage[];
}

/**
 * The whole model interface. It knows nothing about tenants, conversations or
 * knowledge bases - assembling the prompt is domain logic and lives in
 * AutoReplyService, so a second provider never has to reimplement it.
 */
export interface LlmProvider {
  complete(request: LlmRequest): Promise<string>;
}

/** Injection token: an interface cannot be injected, a symbol can. */
export const LLM = Symbol('LLM');
