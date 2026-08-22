import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AnthropicLlm } from './anthropic.llm';
import { LLM, LlmProvider } from './llm.types';
import { StubLlm } from './stub.llm';

const DEFAULT_MODEL = 'claude-sonnet-5';

function requireEnv(config: ConfigService, key: string): string {
  const value = config.get<string>(key);

  if (!value) {
    throw new Error(`${key} must be set when LLM_PROVIDER=anthropic`);
  }

  return value;
}

/**
 * Binds one implementation of LlmProvider for the whole app.
 *
 * A plain factory provider rather than a dynamic module: there is one app and
 * one config source, so forRoot() would only be a longer way to read the same
 * environment variables.
 *
 * Misconfiguration throws here, at boot, rather than on the first customer
 * message that matters.
 */
@Module({
  providers: [
    {
      provide: LLM,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LlmProvider => {
        const provider = config.get<string>('LLM_PROVIDER') ?? 'stub';

        switch (provider) {
          case 'stub':
            return new StubLlm();
          case 'anthropic':
            return new AnthropicLlm(
              requireEnv(config, 'ANTHROPIC_API_KEY'),
              config.get<string>('ANTHROPIC_MODEL') ?? DEFAULT_MODEL,
            );
          default:
            throw new Error(
              `Unknown LLM_PROVIDER "${provider}". Expected "stub" or "anthropic".`,
            );
        }
      },
    },
  ],
  exports: [LLM],
})
export class LlmModule {}
