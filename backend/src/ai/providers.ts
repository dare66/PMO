/**
 * Model-provider abstraction. The platform is not tied to one LLM vendor.
 *  - 'local'             : deterministic rules-based analyst, no model, no data leaves the server (DEFAULT)
 *  - 'anthropic'         : Claude via the official Anthropic SDK (only when AI_EXTERNAL_ALLOWED=true and a key is configured)
 *  - 'openai_compatible' : any self-hosted OpenAI-compatible endpoint (e.g. Ollama / vLLM on your own network)
 */
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

export interface CompletionRequest { system: string; user: string; maxTokens?: number }
export interface CompletionResult { text: string; tokensIn: number; tokensOut: number; model: string; provider: string; refused?: boolean }
export interface Provider { name: string; model: string; external: boolean; complete(r: CompletionRequest): Promise<CompletionResult | null> }

class LocalProvider implements Provider {
  name = 'local'; model = 'rules-v1'; external = false;
  async complete(): Promise<null> { return null; } // assistant composes deterministic answers itself
}

class AnthropicProvider implements Provider {
  name = 'anthropic'; external = true;
  model = config.ai.model || 'claude-opus-5-5';
  private client = new Anthropic({ apiKey: config.ai.anthropicApiKey });
  async complete(r: CompletionRequest): Promise<CompletionResult> {
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: r.maxTokens ?? 16000,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: r.system,
      messages: [{ role: 'user', content: r.user }],
    });
    const refused = res.stop_reason === 'refusal';
    const text = refused ? 'The model declined this request.' : res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n');
    return { text, tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens, model: res.model, provider: this.name, refused };
  }
}

class OpenAICompatibleProvider implements Provider {
  name = 'openai_compatible'; external = false; // assumed self-hosted; set AI_EXTERNAL_ALLOWED to permit if remote
  model = config.ai.model || 'llama3.1';
  async complete(r: CompletionRequest): Promise<CompletionResult> {
    const res = await fetch(`${config.ai.openaiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(config.ai.openaiApiKey ? { authorization: `Bearer ${config.ai.openaiApiKey}` } : {}) },
      body: JSON.stringify({ model: this.model, max_tokens: r.maxTokens ?? 2000, messages: [{ role: 'system', content: r.system }, { role: 'user', content: r.user }] }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`Model endpoint returned ${res.status}`);
    const j: any = await res.json();
    return { text: j.choices?.[0]?.message?.content ?? '', tokensIn: j.usage?.prompt_tokens ?? 0, tokensOut: j.usage?.completion_tokens ?? 0, model: this.model, provider: this.name };
  }
}

export function activeProvider(): Provider {
  if (config.ai.provider === 'anthropic' && config.ai.externalAllowed && config.ai.anthropicApiKey) return new AnthropicProvider();
  if (config.ai.provider === 'openai_compatible' && config.ai.openaiBaseUrl) return new OpenAICompatibleProvider();
  return new LocalProvider();
}

export function providerStatus() {
  const p = activeProvider();
  return {
    configured: config.ai.provider, active: p.name, model: p.model, external_transmission: p.external,
    external_allowed: config.ai.externalAllowed, monthly_token_budget: config.ai.monthlyTokenBudget,
    note: p.name === 'local' ? 'Rules-based analysis only. No data leaves the platform. Configure AI_PROVIDER to enable an LLM.' : undefined,
  };
}

/** Rough per-token cost table (USD per 1M tokens) for budgeting; configurable providers default to 0. */
export const PRICE: Record<string, [number, number]> = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] };
