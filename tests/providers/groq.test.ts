import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { GroqLlm } from "@/lib/providers/groq";

const client = (...contents: string[]) => {
  const create = vi.fn();
  contents.forEach((c) => create.mockResolvedValueOnce({ choices: [{ message: { content: c } }] }));
  return { chat: { completions: { create } } };
};
const schema = z.object({ summary: z.string() });

describe("GroqLlm", () => {
  it("returns validated JSON", async () => {
    const llm = new GroqLlm(client('{"summary":"hi"}'));
    expect(await llm.json({ task: "narrate", system: "s", user: "u", schema })).toEqual({ summary: "hi" });
  });
  it("retries once on invalid output", async () => {
    const c = client("not json", '{"summary":"ok"}');
    expect(await new GroqLlm(c).json({ task: "narrate", system: "s", user: "u", schema })).toEqual({ summary: "ok" });
    expect(c.chat.completions.create).toHaveBeenCalledTimes(2);
  });
  it("throws after two invalid outputs", async () => {
    await expect(new GroqLlm(client("{}", "{}")).json({ task: "narrate", system: "s", user: "u", schema })).rejects.toThrow(/invalid/i);
  });
});
