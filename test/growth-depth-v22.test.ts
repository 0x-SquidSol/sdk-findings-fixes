/**
 * v2.2 growth G8: depth fields of AssetGrowthV19, tier / lambda / kappa / ceiling / N_cap mirrors, the clamp predicate with
 * G(d), the extended quoteMaxLeverage, PushAuthMark 44 B, stakePoolValue. Vectors are hand-computed (see comments) from the
 * spec v22-growth-overnight-2026-10-14 section 1.1-1.3 and the Rust formulas in growth_v19.rs / band_rent.rs.
 */
import { describe, it, expect } from "vitest";
import {
  decodeAssetGrowthRecordV19, ASSET_GROWTH_LEN, ASSET_GROWTH_FIELD_OFF, effectiveDepthE6, depthTier, lDepthX100, lambdaDepthBps,
  kappaDepth, bandRGapBps, clampEnforced, growthTargetCeilingX100, nCapQWithDepth, capitalDoublings, growthCeilingView, quoteMaxLeverage,
  DEPTH_MAX_AGE_SLOTS, DEPTH_SOURCE, encodePushAuthMark, IX_TAG, stakePoolValue, decodeError, PERCOLATOR_ERRORS,
} from "../src/index.js";
import type { AssetGrowthV19, QuoteMaxLeverageInput } from "../src/index.js";

const M = 1_000_000n; // 1 USD of 6-decimal collateral

function rec(over: Partial<Record<"cLaunch" | "ceil" | "lambda" | "lLaunch" | "lTier" | "kink" | "rGap" | "src" | "depth" | "slot" | "prev", bigint>>): Uint8Array {
  const b = new Uint8Array(ASSET_GROWTH_LEN);
  const v = new DataView(b.buffer);
  const F = ASSET_GROWTH_FIELD_OFF;
  v.setBigUint64(F.cLaunchAtoms, over.cLaunch ?? 0n, true);
  v.setUint32(F.lambdaBps, Number(over.lambda ?? 10_000n), true);
  v.setUint16(F.lLaunchX100, Number(over.lLaunch ?? 300n), true);
  v.setUint16(F.lTierX100, Number(over.lTier ?? 1000n), true);
  v.setUint16(F.ceilX100, Number(over.ceil ?? over.lLaunch ?? 300n), true);
  v.setUint16(F.kinkBps, Number(over.kink ?? 5000n), true);
  v.setUint16(F.rGapBps, Number(over.rGap ?? 3445n), true);
  b[F.version] = 1;
  b[F.depthSource] = Number(over.src ?? 0n);
  v.setBigUint64(F.depthE6, over.depth ?? 0n, true);
  v.setBigUint64(F.depthSlot, over.slot ?? 0n, true);
  v.setBigUint64(F.depthPrevE6, over.prev ?? 0n, true);
  return b;
}

describe("AssetGrowthV19 depth fields", () => {
  it("offsets 44 / 56 / 64 / 72 relative to the record", () => {
    expect(ASSET_GROWTH_FIELD_OFF.depthSource).toBe(44);
    expect(ASSET_GROWTH_FIELD_OFF.depthE6).toBe(56);
    expect(ASSET_GROWTH_FIELD_OFF.depthSlot).toBe(64);
    expect(ASSET_GROWTH_FIELD_OFF.depthPrevE6).toBe(72);
  });
  it("decodes a hand-laid record byte-for-byte", () => {
    const b = new Uint8Array(120);
    b[38] = 1; b[44] = 1;
    b.set([0x40, 0x42, 0x0f, 0, 0, 0, 0, 0], 56); // 1_000_000
    b.set([0x2a, 0, 0, 0, 0, 0, 0, 0], 64); // 42
    b.set([0x80, 0x84, 0x1e, 0, 0, 0, 0, 0], 72); // 2_000_000
    const g = decodeAssetGrowthRecordV19(b)!;
    expect([g.depthSource, g.depthE6, g.depthSlot, g.depthPrevE6]).toEqual([1, 1_000_000n, 42n, 2_000_000n]);
  });
  it("does not disturb the existing fields and a growth-off record is still null", () => {
    const g = decodeAssetGrowthRecordV19(rec({ cLaunch: 7n, lLaunch: 550n, depth: 9n }))!;
    expect(g.cLaunchAtoms).toBe(7n);
    expect(g.lLaunchX100).toBe(550);
    expect(g.depthE6).toBe(9n);
    expect(decodeAssetGrowthRecordV19(new Uint8Array(120))).toBeNull();
  });
});

describe("effective depth and tier", () => {
  it("min of the two pushes; a spike buys nothing", () => {
    expect(effectiveDepthE6(500_000n * M, 10_000n * M, 100n, 110n)).toBe(10_000n * M);
    expect(effectiveDepthE6(10_000n * M, 500_000n * M, 100n, 110n)).toBe(10_000n * M);
  });
  it("fresh at age 150, absent at 151; a clock behind the push is fresh", () => {
    expect(DEPTH_MAX_AGE_SLOTS).toBe(150n);
    expect(effectiveDepthE6(30_000n * M, 30_000n * M, 100n, 250n)).toBe(30_000n * M);
    expect(effectiveDepthE6(30_000n * M, 30_000n * M, 100n, 251n)).toBe(0n);
    expect(effectiveDepthE6(30_000n * M, 30_000n * M, 100n, 90n)).toBe(30_000n * M);
  });
  it("tier boundaries $25k / $100k / $500k for an on-chain source", () => {
    const t = (usd: bigint) => depthTier(usd * M, DEPTH_SOURCE.OnChainPool);
    expect([t(24_999n), t(25_000n), t(99_999n), t(100_000n), t(499_999n), t(500_000n)]).toEqual([0, 1, 1, 2, 2, 3]);
  });
  it("keeper-attested depth is capped at tier 1; no source is tier 0", () => {
    expect(depthTier(10_000_000n * M, DEPTH_SOURCE.Attested)).toBe(1);
    expect(depthTier(24_999n * M, DEPTH_SOURCE.Attested)).toBe(0);
    expect(depthTier(10_000_000n * M, DEPTH_SOURCE.None)).toBe(0);
    expect(depthTier(10_000_000n * M, 7)).toBe(1); // unknown source: still never above the attested cap
  });
  it("L_depth, lambda_depth, kappa tables", () => {
    expect([0, 1, 2, 3].map((t) => lDepthX100(t, 300))).toEqual([300, 500, 1000, 2000]);
    expect([0, 1, 2, 3].map(lambdaDepthBps)).toEqual([10_000, 10_000, 20_000, 30_000]);
    expect([0, 1, 2, 3].map(kappaDepth)).toEqual([5_000, 10_000, 10_000, 20_000]);
  });
});

describe("G(d) and the clamp predicate", () => {
  // G = ceil((1e4+d)^2/(1e4-d)) - 1e4. d=100: 102_010_000/9_900 = 10304.04 -> 10305 -> 305. d=500: 110_250_000/9_500 = 11605.26 -> 1606.
  // d=1000: 121_000_000/9_000 = 13444.4 -> 3445. d=2000: 144_000_000/8_000 = 18000 exactly -> 8000.
  it("hand-computed vectors", () => {
    expect([100n, 500n, 1000n, 2000n].map((d) => bandRGapBps(d))).toEqual([305n, 1606n, 3445n, 8000n]);
  });
  it("out of range -> null (0, > 2000)", () => {
    expect(bandRGapBps(0n)).toBeNull();
    expect(bandRGapBps(2001n)).toBeNull();
  });
  it("enforced iff band_bps != 0 and r_gap == G(band)", () => {
    expect(clampEnforced(1000, 3445)).toBe(true);
    expect(clampEnforced(1000, 3444)).toBe(false); // mismatch fails closed
    expect(clampEnforced(0, 400)).toBe(false);
    expect(clampEnforced(0, 0)).toBe(false);
    expect(clampEnforced(2500, 0)).toBe(false);
  });
});

describe("growthTargetCeilingX100 (spec 1.2)", () => {
  const base = { lLaunchX100: 300, lTierX100: 1000, cLaunchAtoms: 1000n, bandBps: 1000, rGapBps: 3445 };
  it("doublings", () => {
    expect([999n, 1000n, 1999n, 2000n, 3999n, 4000n].map((c) => capitalDoublings(c, 1000n))).toEqual([0, 0, 0, 1, 1, 2]);
    expect(capitalDoublings(5n, 0n)).toBe(0);
  });
  it("graduation: min(L_tier, max(L_launch, min(L_depth, L_launch + steps)))", () => {
    expect(growthTargetCeilingX100({ ...base, cM: 999n, tier: 1 })).toBe(300);
    expect(growthTargetCeilingX100({ ...base, cM: 2000n, tier: 1 })).toBe(400);
    expect(growthTargetCeilingX100({ ...base, cM: 4000n, tier: 1 })).toBe(500);
    expect(growthTargetCeilingX100({ ...base, cM: 1n << 60n, tier: 1 })).toBe(500); // depth-limited at 5x
    expect(growthTargetCeilingX100({ ...base, cM: 1n << 60n, tier: 2 })).toBe(1000); // L_depth 10x, = L_tier
    expect(growthTargetCeilingX100({ ...base, cM: 1n << 60n, tier: 3 })).toBe(1000); // never above L_tier
  });
  it("not graduated: tier 0, no band, r_gap mismatch, force_down", () => {
    const cM = 1n << 60n;
    expect(growthTargetCeilingX100({ ...base, cM, tier: 0 })).toBe(300);
    expect(growthTargetCeilingX100({ ...base, cM, tier: 1, bandBps: 0 })).toBe(300);
    expect(growthTargetCeilingX100({ ...base, cM, tier: 1, rGapBps: 400 })).toBe(300);
    expect(growthTargetCeilingX100({ ...base, cM, tier: 1, forceDown: true })).toBe(300);
  });
  it("edge: L_launch above L_depth is never lowered; L_tier below L_launch wins", () => {
    expect(growthTargetCeilingX100({ ...base, lLaunchX100: 550, cM: 1n << 60n, tier: 1 })).toBe(550);
    expect(growthTargetCeilingX100({ ...base, lTierX100: 250, cM: 1n << 60n, tier: 1 })).toBe(250);
  });
  it("no launch capital recorded -> no climb", () => {
    expect(growthTargetCeilingX100({ ...base, cLaunchAtoms: 0n, cM: 1n << 60n, tier: 1 })).toBe(300);
  });
});

describe("nCapQWithDepth", () => {
  // N = cM * lambda_eff * 1e6 / (1e4 * P). cM = 1e9, P = 1e6.
  it("lambda_eff = min(stored, lambda_depth(tier))", () => {
    const i = { cM: 1_000_000_000n, priceE6: 1_000_000n, effectiveDepth: 0n };
    expect(nCapQWithDepth({ ...i, lambdaBps: 30_000, tier: 0 })).toBe(1_000_000_000n); // 1x
    expect(nCapQWithDepth({ ...i, lambdaBps: 30_000, tier: 1 })).toBe(1_000_000_000n);
    expect(nCapQWithDepth({ ...i, lambdaBps: 30_000, tier: 2 })).toBe(2_000_000_000n);
    expect(nCapQWithDepth({ ...i, lambdaBps: 30_000, tier: 3 })).toBe(3_000_000_000n);
    expect(nCapQWithDepth({ ...i, lambdaBps: 5_000, tier: 3 })).toBe(500_000_000n); // stored is lower
  });
  it("depth cap kappa * depth / P applies while depth is present", () => {
    const i = { cM: 1_000_000_000n, priceE6: 1_000_000n, lambdaBps: 10_000 };
    // depth $1000 = 1e9 e6, tier 0 kappa 0.5 -> 1e9 * 5000 * 1e6 / (1e4 * 1e6) = 5e8 < 1e9
    expect(nCapQWithDepth({ ...i, tier: 0, effectiveDepth: 1_000_000_000n })).toBe(500_000_000n);
    // tier 1 kappa 1 and depth 5e9 -> 5e9 > 1e9, capital binds
    expect(nCapQWithDepth({ ...i, tier: 1, effectiveDepth: 5_000_000_000n })).toBe(1_000_000_000n);
    // price 2e6 halves both
    expect(nCapQWithDepth({ ...i, priceE6: 2_000_000n, tier: 1, effectiveDepth: 400_000_000n })).toBe(200_000_000n);
  });
  it("zero price -> null", () => {
    expect(nCapQWithDepth({ cM: 1n, lambdaBps: 10_000, tier: 0, priceE6: 0n, effectiveDepth: 0n })).toBeNull();
  });
});

function g(over: Parameters<typeof rec>[0]): AssetGrowthV19 {
  return decodeAssetGrowthRecordV19(rec(over))!;
}
function qin(growth: AssetGrowthV19, cap: bigint, lpPos = 1n, v22: QuoteMaxLeverageInput["v22"] | null = { bandBps: 1000, nowSlot: 1000n }): QuoteMaxLeverageInput {
  return {
    engineImrBps: 1000n, growth, lpCapital: cap, lpPnl: 0n, lpFeeCredits: 0n, lpEffectivePositionQ: lpPos, assetBound: true,
    oiEffLongQ: 0n, oiEffShortQ: 0n, priceE6: 1_000_000n, bankruptcyHlockActive: false, ...(v22 ? { v22 } : {}),
  };
}

describe("quoteMaxLeverage v2.2 (ceiling, tier, nextUnlock, graduationOn)", () => {
  const fresh = { src: 1n, depth: 30_000n * M, prev: 30_000n * M, slot: 990n };
  it("graduated thin side: stored ratchet at 5x, 5x with $30k attested depth and 4x capital", () => {
    const q = quoteMaxLeverage(qin(g({ cLaunch: 1000n * M, ceil: 500n, ...fresh }), 4000n * M), "long"); // LP long -> long is thin
    expect(q.tier).toBe(1);
    expect(q.graduationOn).toBe(true);
    expect(q.ceilingX100).toBe(500);
    expect(q.maxLeverageX100).toBe(500); // IMR ceil(1e6/500) = 2000 bps -> 1e6 / 2000
    expect(q.nextUnlock).toEqual({ kind: "none" }); // 5x is the attested-depth cap
  });
  it("stored ratchet lags the target: the gate reads the minimum", () => {
    const q = quoteMaxLeverage(qin(g({ cLaunch: 1000n * M, ceil: 300n, ...fresh }), 4000n * M), "long");
    expect(q.ceilingX100).toBe(300);
    expect(q.maxLeverageX100).toBe(299); // IMR = ceil(1e6/300) = 3334 bps -> floor(1e6/3334); existing rounding
  });
  it("stale depth -> tier 0, launch ceiling, depth is the next unlock", () => {
    const q = quoteMaxLeverage(qin(g({ cLaunch: 1000n * M, ceil: 500n, ...fresh, slot: 800n }), 4000n * M), "long");
    expect(q.tier).toBe(0);
    expect(q.graduationOn).toBe(false);
    expect(q.ceilingX100).toBe(300);
    expect(q.nextUnlock).toEqual({ kind: "depth", thresholdUsd: 25_000, leverageX100: 500 });
  });
  it("no depth and capital under the first doubling: depth AND capital are both needed", () => {
    const q = quoteMaxLeverage(qin(g({ cLaunch: 1000n * M }), 1500n * M), "long");
    expect(q.nextUnlock).toEqual({ kind: "depth", thresholdUsd: 25_000, leverageX100: 400, alsoRequiresCapitalUsd: 2000 });
  });
  it("depth fine, capital short: capital is the next unlock", () => {
    const q = quoteMaxLeverage(qin(g({ cLaunch: 1000n * M, ceil: 300n, ...fresh }), 1500n * M), "long");
    expect(q.nextUnlock).toEqual({ kind: "capital", thresholdUsd: 2000, leverageX100: 400 });
  });
  it("off-band market: graduation never on, nothing to unlock", () => {
    const q = quoteMaxLeverage(qin(g({ cLaunch: 1000n * M, rGap: 400n, ...fresh }), 4000n * M, 1n, { bandBps: 0, nowSlot: 1000n }), "long");
    expect(q.graduationOn).toBe(false);
    expect(q.ceilingX100).toBe(300);
    expect(q.nextUnlock).toEqual({ kind: "none" });
  });
  it("h-lock forces the launch ceiling", () => {
    const q = quoteMaxLeverage({ ...qin(g({ cLaunch: 1000n * M, ceil: 500n, ...fresh }), 4000n * M), bankruptcyHlockActive: true }, "long");
    expect(q.ceilingX100).toBe(300);
  });
  it("without the v22 input the quote is the growth-1 quote (back-compat)", () => {
    const q = quoteMaxLeverage(qin(g({ cLaunch: 1000n * M, ceil: 500n, ...fresh }), 4000n * M, 1n, null), "long");
    expect(q.ceilingX100).toBe(300);
    expect(q.tier).toBe(0);
    expect(q.graduationOn).toBe(false);
  });
  it("lambda_eff and the depth cap shrink N_cap: tier 1 with lambda 3x stored behaves as 1x", () => {
    const q = quoteMaxLeverage(qin(g({ cLaunch: 1000n * M, lambda: 30_000n, ...fresh }), 4000n * M), "long");
    expect(q.nCapQ).toBe(4000n * M); // 4000e6 atoms * 1x / $1 in Q (POS_SCALE 1e6)
  });
  it("growthCeilingView exposes the effective depth", () => {
    const v = growthCeilingView(g({ cLaunch: 1000n * M, src: 1n, depth: 40_000n * M, prev: 26_000n * M, slot: 990n }), 1000, 1000n, 4000n * M, false);
    expect(v.effectiveDepthE6).toBe(26_000n * M);
    expect(v.tier).toBe(1);
  });
});

describe("PushAuthMark tag 63", () => {
  const a = { assetIndex: 3, marketId: 1n, nowSlot: 300_000_001n, markE6: 50_100_000n, observationSequence: 9n };
  it("35 B form unchanged (no depth)", () => {
    const d = encodePushAuthMark(a);
    expect(d.length).toBe(35);
    expect(d[0]).toBe(IX_TAG.PushAuthMark);
  });
  it("44 B form appends mode u8 + depth_e6 u64 LE", () => {
    const d = encodePushAuthMark({ ...a, depth: { mode: 1, depthE6: 30_000n * M } });
    expect(d.length).toBe(44);
    expect(Array.from(d.subarray(0, 35))).toEqual(Array.from(encodePushAuthMark(a)));
    expect(d[35]).toBe(1);
    expect(new DataView(d.buffer, d.byteOffset).getBigUint64(36, true)).toBe(30_000n * M);
    const none = encodePushAuthMark({ ...a, depth: { mode: 0, depthE6: 0n } });
    expect(none.length).toBe(44);
    expect(Array.from(none.subarray(35))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it("refuses a mode the program answers with error 128", () => {
    expect(() => encodePushAuthMark({ ...a, depth: { mode: 2 as 0 | 1, depthE6: 1n } })).toThrow(/depth mode/);
    expect(PERCOLATOR_ERRORS[128]?.name).toBe("DepthInputInvalid");
    expect(decodeError(128)?.name).toBe("DepthInputInvalid");
  });
  it("depth over u64 is refused", () => {
    expect(() => encodePushAuthMark({ ...a, depth: { mode: 1, depthE6: 1n << 64n } })).toThrow();
  });
});

describe("stakePoolValue (release checklist 5.4: pool value includes deployed insurance)", () => {
  const pool = { totalDeposited: 1000n, totalWithdrawn: 100n, totalFlushed: 300n, totalReturned: 50n, totalFeesEarned: 20n, realizedJuniorLoss: 10n };
  // liquid = 1000 - 100 - 300 + 50 + 20 - 10 = 660; deployed = floor(250 * 400 / 1000) = 100; total 760.
  it("hand vector", () => {
    expect(stakePoolValue(pool, { unitsStake: 250n, unitsTotal: 1000n }, 400n)).toEqual({ liquid: 660n, deployed: 100n, total: 760n });
  });
  it("floors the deployed value (like stake math::deployed_value)", () => {
    expect(stakePoolValue(pool, { unitsStake: 1n, unitsTotal: 3n }, 10n)?.deployed).toBe(3n);
  });
  it("no units or no insurance -> deployed 0 and total = liquid", () => {
    expect(stakePoolValue(pool, { unitsStake: 0n, unitsTotal: 0n }, 999n)).toEqual({ liquid: 660n, deployed: 0n, total: 660n });
    expect(stakePoolValue(pool, { unitsStake: 5n, unitsTotal: 10n }, 0n)?.deployed).toBe(0n);
  });
  it("fails closed where the program does", () => {
    expect(stakePoolValue(pool, { unitsStake: 11n, unitsTotal: 10n }, 5n)).toBeNull(); // units_stake > units_total
    expect(stakePoolValue({ ...pool, totalWithdrawn: 5000n }, { unitsStake: 1n, unitsTotal: 1n }, 1n)).toBeNull(); // negative
    expect(stakePoolValue(pool, { unitsStake: 1n << 100n, unitsTotal: 1n << 100n }, 1n << 100n)).toBeNull(); // u128 overflow
    expect(stakePoolValue(pool, { unitsStake: 1n, unitsTotal: 1n }, 1n << 64n)).toBeNull(); // beyond u64
  });
  it("negative control: the pre-fix value (liquid only) understates by exactly the deployed part", () => {
    const v = stakePoolValue(pool, { unitsStake: 250n, unitsTotal: 1000n }, 400n)!;
    expect(v.total - v.liquid).toBe(100n);
  });
});
