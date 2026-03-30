import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolvePrice } from "../src/oracle/price-router.js";

describe("resolvePrice", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not hang when upstream fetch never resolves (default timeout)", async () => {
    const p = resolvePrice("So11111111111111111111111111111111111111112", undefined, {
      timeoutMs: 80,
    });
    const result = await Promise.race([
      p,
      new Promise((_, reject) => setTimeout(() => reject(new Error("hang")), 3000)),
    ]);
    expect(result).toBeDefined();
    expect((result as Awaited<ReturnType<typeof resolvePrice>>).mint).toBe(
      "So11111111111111111111111111111111111111112",
    );
  }, 10_000);
});
