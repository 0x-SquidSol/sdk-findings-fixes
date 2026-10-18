/**
 * #348 / #354: the SDK's own install must not resolve the vulnerable transitive packages.
 *
 * - #348 GHSA-96hv-2xvq-fx4p (ws memory-exhaustion DoS): @solana/web3.js pulls ws 7.x (jayson) and 8.x
 *   (rpc-websockets). `pnpm.overrides` in package.json pins both lines to the patched releases (7.5.11 / 8.21.0+).
 * - #354 GHSA-3gc7-fjrx-p6mg (bigint-buffer <= 1.1.5 toBigIntLE buffer overflow): there is NO patched release. The
 *   overflow is in the native N-API addon (src/bigint-buffer.c `toBigInt`). `pnpm.patchedDependencies` patches 1.1.5 so
 *   the addon is never built or loaded, which leaves the package's own pure-JS fallback (Buffer -> hex -> BigInt).
 *
 * pnpm overrides and patches apply to THIS repository's install (CI, tests, the published dist build). They do not
 * propagate to an app that installs @percolatorct/sdk; such an app needs the same override in its own root.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8");

function semver(v: string): [number, number, number] {
  const [a, b, c] = v.split(".").map((x) => Number.parseInt(x, 10));
  return [a, b, c];
}
function gte(v: string, min: string): boolean {
  const x = semver(v);
  const y = semver(min);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return true;
}

/** Every `ws@X.Y.Z` package key the lockfile resolves. */
function lockedVersions(name: string): string[] {
  const re = new RegExp(`^  ${name.replace("/", "\\/")}@(\\d+\\.\\d+\\.\\d+)[^:]*:`, "gm");
  return [...new Set([...LOCK.matchAll(re)].map((m) => m[1]))];
}

/** Resolve bigint-buffer the way @solana/spl-token does: spl-token -> buffer-layout-utils -> bigint-buffer. */
function resolveBigintBuffer(): string {
  const fromRoot = createRequire(join(ROOT, "package.json"));
  const splToken = fromRoot.resolve("@solana/spl-token");
  const blu = createRequire(splToken).resolve("@solana/buffer-layout-utils");
  return createRequire(blu).resolve("bigint-buffer");
}

describe("#348 ws (GHSA-96hv-2xvq-fx4p)", () => {
  it("the lockfile resolves only patched ws releases (7.x >= 7.5.11, 8.x >= 8.21.0)", () => {
    const vs = lockedVersions("ws");
    expect(vs.length).toBeGreaterThan(0);
    for (const v of vs) {
      const major = semver(v)[0];
      if (major === 7) expect(gte(v, "7.5.11"), `ws@${v}`).toBe(true);
      else if (major === 8) expect(gte(v, "8.21.0"), `ws@${v}`).toBe(true);
      else expect(major, `unexpected ws major ${v}`).toBeGreaterThanOrEqual(8);
    }
  });
});

describe("#354 bigint-buffer (GHSA-3gc7-fjrx-p6mg)", () => {
  it("the installed bigint-buffer never loads the native addon (the vulnerable toBigInt)", () => {
    const entry = resolveBigintBuffer();
    const src = readFileSync(entry, "utf8");
    expect(src).not.toMatch(/require\(['"]bindings['"]\)/);
    const pkg = JSON.parse(readFileSync(join(dirname(entry), "..", "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    // No install-time native build (node-gyp rebuild) either.
    expect(pkg.scripts?.install ?? "").not.toMatch(/rebuild|node-gyp/);
  });

  it("the pure-JS path decodes LE/BE correctly, including empty and odd-length buffers", () => {
    const req = createRequire(join(ROOT, "package.json"));
    const bb = req(resolveBigintBuffer()) as {
      toBigIntLE(b: Buffer): bigint;
      toBigIntBE(b: Buffer): bigint;
      toBufferLE(n: bigint, w: number): Buffer;
    };
    expect(bb.toBigIntLE(Buffer.alloc(0))).toBe(0n);
    expect(bb.toBigIntLE(Buffer.from([0x01, 0x02, 0x03]))).toBe(0x030201n);
    expect(bb.toBigIntBE(Buffer.from([0x01, 0x02, 0x03]))).toBe(0x010203n);
    expect(bb.toBigIntLE(Buffer.from("ffffffffffffffff", "hex"))).toBe(2n ** 64n - 1n);
    expect([...bb.toBufferLE(0x0102n, 8)]).toEqual([2, 1, 0, 0, 0, 0, 0, 0]);
  });
});
