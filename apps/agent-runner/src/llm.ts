/** OpenAI-compatible chat completions with tool calls (OpenRouter). */

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface Llm {
  chat(messages: Msg[], tools: ToolSpec[]): Promise<{ content: string | null; toolCalls: ToolCall[]; cost: number }>;
}

export function openRouter(apiKey: string, model: string, baseUrl = "https://openrouter.ai/api/v1"): Llm {
  return {
    async chat(messages, tools) {
      for (let attempt = 1; ; attempt++) {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages,
            tools: tools.length ? tools.map((t) => ({ type: "function", function: t })) : undefined,
            max_tokens: 12000, // reasoning models spend part of this before answering
            reasoning: { effort: "low" },
            temperature: 0.6,
            usage: { include: true },
          }),
        });
        if (!res.ok) {
          const t = (await res.text()).slice(0, 300);
          if (attempt >= 3 || (res.status < 500 && res.status !== 429)) throw new Error(`LLM HTTP ${res.status}: ${t}`);
          await new Promise((r) => setTimeout(r, 4000 * attempt));
          continue;
        }
        const j: any = await res.json();
        const m = j.choices?.[0]?.message ?? {};
        const toolCalls: ToolCall[] = m.tool_calls ?? [];
        if (!m.content && !toolCalls.length && attempt < 3) continue; // empty answer: retry
        return { content: m.content ?? null, toolCalls, cost: j.usage?.cost ?? 0 };
      }
    },
  };
}
