type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJsonObject(text: string): string {
  // Best-effort extraction in case the model wraps JSON in prose.
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return text;
  return text.slice(first, last + 1);
}

export async function openaiChatJson<T>(
  messages: OpenAIChatMessage[],
  opts?: {
    maxRetries?: number;
    timeoutMs?: number;
    model?: string;
  }
): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const model = opts?.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const maxRetries = opts?.maxRetries ?? 3;
  const timeoutMs = opts?.timeoutMs ?? Number(process.env.OPENAI_TIMEOUT_MS ?? 60_000);

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(process.env.OPENAI_ORG_ID ? { 'OpenAI-Organization': process.env.OPENAI_ORG_ID } : {})
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0,
          top_p: 1,
          response_format: { type: 'json_object' }
        }),
        signal: ac.signal
      });

      const text = await res.text();
      if (!res.ok) {
        const msg = text.slice(0, 600);
        throw new Error(`OpenAI error ${res.status}: ${msg}`);
      }

      const parsed = JSON.parse(text) as OpenAIChatCompletionResponse;
      const content = parsed.choices?.[0]?.message?.content;
      if (!content) throw new Error('OpenAI response missing message content');

      const jsonText = extractJsonObject(content);
      return JSON.parse(jsonText) as T;
    } catch (err) {
      clearTimeout(timer);
      const isLast = attempt >= maxRetries;
      if (isLast) throw err;
      // Exponential backoff with jitter.
      const backoffMs = Math.min(10_000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 200);
      await sleep(backoffMs);
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
}
