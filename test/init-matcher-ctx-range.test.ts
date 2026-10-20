/**
 * AUD-S3-A5: encodeInitMatcherCtx wrote its four u32 fields through `new Uint32Array([v])`, which silently wraps
 * (-1 -> 4294967295, 2^32 -> 0, 1.5 -> 1, NaN -> 0). A caller bug then became a plausible on-chain parameter.
 * Every u32 field must now be a whole number in 0..4294967295, like encU32.
 */
import { describe, it, expect } from "vitest";
import { encodeInitMatcherCtx } from "../src/abi/instructions.js";
import type { InitMatcherCtxArgs } from "../src/abi/instructions.js";

const base: InitMatcherCtxArgs = {
  kind: 1,
  tradingFeeBps: 30,
  baseSpreadBps: 10,
  maxTotalBps: 500,
  impactKBps: 100,
  liquidityNotionalE6: 1_000_000n,
  maxFillAbs: 1_000n,
  maxInventoryAbs: 2_000n,
  feeToInsuranceBps: 0,
  skewSpreadMultBps: 0,
};
const u32Fields = ["tradingFeeBps", "baseSpreadBps", "maxTotalBps", "impactKBps"] as const;
const u32At = (d: Uint8Array, off: number) => new DataView(d.buffer, d.byteOffset).getUint32(off, true);

describe("encodeInitMatcherCtx u32 range", () => {
  it("in-range values encode little-endian at the same offsets as before, including both bounds", () => {
    const d = encodeInitMatcherCtx({ ...base, tradingFeeBps: 0, baseSpreadBps: 4_294_967_295, maxTotalBps: 500, impactKBps: 1 });
    expect(d.length).toBe(70);
    expect([u32At(d, 2), u32At(d, 6), u32At(d, 10), u32At(d, 14)]).toEqual([0, 4_294_967_295, 500, 1]);
  });
  for (const f of u32Fields) {
    for (const bad of [-1, 4_294_967_296, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      it(`${f} = ${bad} is rejected, not wrapped`, () => {
        expect(() => encodeInitMatcherCtx({ ...base, [f]: bad })).toThrow(/out of range/);
      });
    }
  }
});
