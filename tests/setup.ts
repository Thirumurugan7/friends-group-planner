import { vi } from "vitest";

type Jar = Map<string, string>;
const g = globalThis as unknown as { __jar: Jar };
g.__jar = new Map();

vi.mock("next/headers", () => ({
  cookies: async () => {
    const jar = (globalThis as unknown as { __jar: Jar }).__jar;
    return {
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
      set: (name: string, value: string) => void jar.set(name, value),
      delete: (name: string) => void jar.delete(name),
    };
  },
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async () => ({ statusCode: 201 })),
  },
}));
