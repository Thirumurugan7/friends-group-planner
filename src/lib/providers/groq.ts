import Groq from "groq-sdk";
import { ProviderError, type LlmProvider, type LlmRequest } from "./types";

export interface GroqLike {
  chat: { completions: { create(args: object): Promise<{ choices: { message: { content: string | null } }[] }> } };
}

export class GroqLlm implements LlmProvider {
  constructor(
    private client: GroqLike = new Groq({ apiKey: process.env.GROQ_API_KEY }) as unknown as GroqLike,
    private model = "llama-3.3-70b-versatile"
  ) {}

  async json<T>(req: LlmRequest<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: req.task === "sketch" ? 0.8 : 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      });
      try {
        return req.schema.parse(JSON.parse(completion.choices[0]?.message.content ?? ""));
      } catch (err) {
        lastErr = err;
      }
    }
    throw new ProviderError(`LLM returned invalid output: ${String(lastErr)}`);
  }
}
