/**
 * v2.2 growth round 2 (R2.1): sticky depth, per-market tiers, venue / book tiers, the tier-driven target, N_cap, the extended quote and
 * next-unlock, the tier builders and the client-side validator. Vectors are hand-computed AND lifted from the Rust unit tests in
 * percolator-prog `feat/v22-growth-tiers` `src/growth_v19.rs` (`g8_effective_depth_and_tiers`, `r2_tier_table_and_bounds`,
 * `g8_wl2_same_slot_push_is_not_a_second_sample`, `r2_sticky_depth_cap_w_m1`, `g8_n_cap_depth_cap_only_when_fresh_and_identity_off_clamp`,
 * `g8_target_ceiling_ratchet_and_force_down`), with the Rust `DEPTH_TIER1_E6 = 25_000_000_000` etc.
 */
import { describe, it, expect } from "vitest";
import {
  ASSET_GROWTH_LEN, ASSET_GROWTH_FIELD_OFF, ASSET_GROWTH_DEPTH_FIELD_OFF, decodeAssetGrowthRecordV19,
  DEPTH_EVER, DEPTH_PREV_REAL, freshDepthE6, DEPTH_SOURCE, depthSourceOf, depthEver, depthSourceByteOk, effectiveDepthE6, depthPushUpdate, stickyDepthE6, capDepthE6,
  tierThresholdsE6, depthTierFor, attestedMaxTierEff, venueTier, bookDepthFromPins, bookCapacityE6, bookDepthE6, bookTier, combinedTier,
  tierLeverage, lTableX100, tierConfigOk, attestedMaxTierOk, mergeTierConfigAtBind, validateTierConfig,
  lambdaDepthBps, kappaDepthBps, lambdaEffBps, depthNotionalCapE6, depthCapQ, nCapG8Q, growthMatcherCapsG8, nCapQ, growthMatcherCapsV3,
  targetCeilingX100, ceilingInForceX100, ratchetCeilingX100, graduationRatchet, graduationFallOnly, graduationOn, clampEnforced,
  growthCeilingView, quoteMaxLeverage, encodeInitVaultLpV22Tiers, encodeSetAssetRiskLimitsV22Tiers, encodeInitVaultLpV19,
  decodeError,
} from "../src/index.js";
import type { AssetGrowthV19, QuoteMaxLeverageInput, DepthState } from "../src/index.js";

const T1 = 25_000_000_000n, T2 = 100_000_000_000n, T3 = 500_000_000_000n;
const M = 1_000_000n;
const PS = 1_000_000n;
const DEF = tierThresholdsE6([0, 0, 0]);
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

describe("record decoder (bytes 44, 45, 80, 88, 96, 108)", () => {
  it("offsets are the Rust offset_of! values", () => {
    const D = ASSET_GROWTH_DEPTH_FIELD_OFF;
    expect([D.depthSource, D.attestedMaxTier, D.depthE6, D.depthSlot, D.depthPrevE6, D.depthLastGoodE6, D.depthLastGoodSlot, D.tierThresholdUsd, D.tierLeverageX100]).toEqual([44, 45, 56, 64, 72, 80, 88, 96, 108]);
  });
  it("decodes a hand-laid record byte for byte", () => {
    const b = new Uint8Array(ASSET_GROWTH_LEN);
    b[ASSET_GROWTH_FIELD_OFF.version] = 1;
    b[44] = 0x82; // DEPTH_EVER | source 2
    b[45] = 3;
    b.set([0, 152, 160, 107, 21, 0, 0, 0], 80); // 92_000_000_000
    b.set([0x39, 0x30, 0, 0, 0, 0, 0, 0], 88); // 12345
    b.set([0x88, 0x13, 0, 0], 96); // 5000
    b.set([0x20, 0x4e, 0, 0], 100); // 20000
    b.set([0xa0, 0x86, 0x01, 0], 104); // 100000
    b.set([0xf4, 0x01], 108); // 500
    b.set([0xe8, 0x03], 110); // 1000
    b.set([0xd0, 0x07], 112); // 2000
    const g = decodeAssetGrowthRecordV19(b)!;
    expect([g.depthSource, g.depthEver, g.attestedMaxTier]).toEqual([2, true, 3]);
    expect([g.depthLastGoodE6, g.depthLastGoodSlot]).toEqual([92_000_000_000n, 12345n]);
    expect(g.tierThresholdUsd).toEqual([5000, 20000, 100000]);
    expect(g.tierLeverageX100).toEqual([500, 1000, 2000]);
  });
  it("source bits are masked: bits 2 and 7 do not leak into depthSource", () => {
    const b = new Uint8Array(ASSET_GROWTH_LEN);
    b[38] = 1; b[44] = 0x85;
    const g = decodeAssetGrowthRecordV19(b)!;
    expect([g.depthSource, g.depthEver, g.depthPrevReal]).toEqual([1, true, true]);
    expect(depthSourceOf(0x81)).toBe(1);
    expect(depthEver(0x81) && !depthEver(0x01)).toBe(true);
    expect([depthSourceByteOk(0x82), depthSourceByteOk(0x03), depthSourceByteOk(0x04), depthSourceByteOk(0x85), depthSourceByteOk(0x40), depthSourceByteOk(0x08)]).toEqual([true, false, true, true, false, false]);
  });
});

describe("Rust g8_effective_depth_and_tiers", () => {
  it("effective depth", () => {
    expect(effectiveDepthE6(5n * T1, 2n * T1, 100n, 100n)).toBe(2n * T1);
    expect(effectiveDepthE6(5n * T1, 0n, 100n, 100n)).toBe(0n);
    expect(effectiveDepthE6(0n, 5n * T1, 100n, 100n)).toBe(0n);
    expect(effectiveDepthE6(T1, T1, 100n, 250n)).toBe(T1);
    expect(effectiveDepthE6(T1, T1, 100n, 251n)).toBe(0n);
    expect(effectiveDepthE6(T1, T1, 101n, 100n)).toBe(0n);
  });
  it("thresholds, venue tier", () => {
    expect(DEF).toEqual([T1, T2, T3]);
    const a = DEPTH_SOURCE.Attested;
    expect(venueTier(T1 - 1n, a, DEF, 0)).toBe(0);
    expect(venueTier(T1, a, DEF, 0)).toBe(1);
    expect(venueTier(T3, a, DEF, 0)).toBe(1); // I-D3
    expect(venueTier(T3, a, DEF, 3)).toBe(3);
    expect(venueTier(T3, a | DEPTH_EVER, DEF, 2)).toBe(2);
    expect(venueTier(T3, DEPTH_SOURCE.OnChainPool, DEF, 0)).toBe(3);
    expect(venueTier(T3, DEPTH_SOURCE.None | DEPTH_EVER, DEF, 3)).toBe(0);
    expect(venueTier(0n, DEPTH_SOURCE.OnChainPool, DEF, 3)).toBe(0);
    const th2 = tierThresholdsE6([5_000, 20_000, 100_000]);
    expect(depthTierFor(5_000_000_000n, th2)).toBe(1);
    expect(depthTierFor(100_000_000_000n, th2)).toBe(3);
    expect(depthTierFor(0n, th2)).toBe(0);
  });
  it("lambda / kappa constants, lambda_eff", () => {
    expect([0, 1, 2, 3].map(lambdaDepthBps)).toEqual([10_000, 10_000, 20_000, 30_000]);
    expect([0, 1, 2, 3].map(kappaDepthBps)).toEqual([5_000, 10_000, 10_000, 20_000]);
    expect(lambdaEffBps(30_000, 1)).toBe(10_000);
    expect(lambdaEffBps(5_000, 3)).toBe(5_000);
  });
  it("book depth and tier", () => {
    expect(bookDepthE6(100_000_000_000n, 30_000)).toBe(100_000_000_000n);
    expect(bookDepthE6(100_000_000_000n, 5_000)).toBe(50_000_000_000n);
    expect(bookTier(100_000_000_000n, 10_000, DEF)).toBe(2);
    expect(bookTier(99_999_999_999n, 10_000, DEF)).toBe(1);
    expect(bookDepthFromPins(1_000n, 20, 50, 100)).toBe(1_000n);
    expect(bookDepthFromPins(1_000n, 20, 50, 300)).toBe(1_000n);
    expect(bookDepthFromPins(1_000n, 20, 2_000, 300)).toBe(330n); // floor(4000*180/2180)
    expect(bookDepthFromPins(1_000n, 200, 50, 300)).toBe(0n);
    expect(combinedTier(3, 1)).toBe(1);
    expect(combinedTier(0, 3)).toBe(0);
  });
  it("book capacity is overflow-free and monotone; saturates at u64::MAX", () => {
    expect(bookCapacityE6(10_001n, 10_000)).toBe(10_001n);
    expect(bookCapacityE6(10_001n, 5_000)).toBe(5_000n); // floor(10001*0.5)
    expect(bookCapacityE6(0n, 10_000)).toBe(0n);
    expect(bookDepthE6((1n << 120n), 10_000)).toBe((1n << 64n) - 1n);
  });
  it("attested_max_tier_eff", () => {
    expect([attestedMaxTierEff(0), attestedMaxTierEff(2), attestedMaxTierEff(9)]).toEqual([1, 2, 3]);
  });
});

describe("Rust r2_tier_table_and_bounds", () => {
  it("table", () => {
    expect(tierLeverage([0, 0, 0], 500, 2_000)).toEqual([500, 500, 1_000, 2_000]);
    expect(tierLeverage([0, 0, 0], 500, 500)).toEqual([500, 500, 500, 500]);
    expect(tierLeverage([0, 0, 0], 700, 1_000)).toEqual([700, 700, 1_000, 1_000]);
    expect(tierLeverage([600, 900, 1_500], 500, 2_000)).toEqual([500, 600, 900, 1_500]);
    expect(tierLeverage([3_000, 100, 0], 500, 2_000)).toEqual([500, 2_000, 2_000, 2_000]);
    expect(lTableX100(9, [1, 2, 3, 4])).toBe(4);
  });
  it("bounds", () => {
    expect(tierConfigOk([0, 0, 0], [0, 0, 0], 500, 500)).toBe(true);
    expect(tierConfigOk([5_000, 20_000, 100_000], [500, 1_000, 2_000], 500, 2_000)).toBe(true);
    expect(tierConfigOk([4_999, 20_000, 100_000], [0, 0, 0], 500, 2_000)).toBe(false);
    expect(tierConfigOk([5_000, 19_999, 100_000], [0, 0, 0], 500, 2_000)).toBe(false);
    expect(tierConfigOk([5_000, 20_000, 99_999], [0, 0, 0], 500, 2_000)).toBe(false);
    expect(tierConfigOk([30_000, 30_000, 500_000], [0, 0, 0], 500, 2_000)).toBe(false);
    expect(tierConfigOk([0, 600_000, 0], [0, 0, 0], 500, 2_000)).toBe(false);
    expect(tierConfigOk([0, 0, 0], [400, 0, 0], 500, 2_000)).toBe(false);
    expect(tierConfigOk([0, 0, 0], [1_000, 900, 2_000], 500, 2_000)).toBe(false);
    expect(tierConfigOk([0, 0, 0], [0, 0, 2_001], 500, 2_000)).toBe(false);
    expect(tierConfigOk([0, 0, 0], [600, 0, 0], 700, 2_000)).toBe(false);
    expect(tierConfigOk([0, 0, 0], [700, 0, 0], 700, 2_000)).toBe(true);
    expect(attestedMaxTierOk(3) && !attestedMaxTierOk(4)).toBe(true);
  });
  it("tag 94 merge: a preset field is kept, a zero field takes the creator's", () => {
    const m = mergeTierConfigAtBind({ thresholdUsd: [30_000, 0, 0], leverageX100: [0, 900, 0] }, { thresholdUsd: [10_000, 150_000, 0], leverageX100: [600, 700, 2_000] });
    expect(m).toEqual({ thresholdUsd: [30_000, 150_000, 0], leverageX100: [600, 900, 2_000] });
  });
});

describe("validateTierConfig (client-side, calm messages)", () => {
  it("ok === tierConfigOk on a deterministic grid (the exact Rust verdict)", () => {
    const ths: [number, number, number][] = [[0, 0, 0], [5_000, 20_000, 100_000], [4_999, 20_000, 100_000], [30_000, 30_000, 500_000], [0, 600_000, 0], [25_000, 0, 0], [0, 0, 99_999], [100_000, 200_000, 300_000], [5_000, 4_000, 100_000]];
    const lvs: [number, number, number][] = [[0, 0, 0], [500, 1_000, 2_000], [400, 0, 0], [1_000, 900, 2_000], [0, 0, 2_001], [700, 0, 0], [600, 0, 0], [500, 500, 500], [2_000, 2_000, 2_000], [0, 1_000, 0]];
    for (const th of ths) for (const lv of lvs) for (const [launch, tier] of [[500, 2_000], [700, 1_000], [500, 500], [300, 400]] as const) {
      const r = validateTierConfig({ thresholdsUsd: th, leverageX100: lv, lLaunchX100: launch, lTierX100: tier });
      expect(r.ok, `${th} ${lv} ${launch} ${tier}`).toBe(tierConfigOk(th, lv, launch, tier));
      expect(r.ok).toBe(r.issues.length === 0);
    }
  });
  it("names the problem in one calm line, no bps", () => {
    expect(validateTierConfig({ thresholdsUsd: [1_000, 20_000, 100_000], lLaunchX100: 500, lTierX100: 2_000 }).issues).toEqual([
      { field: "thresholds", code: "below-floor", tier: 1, message: "Tier 1 pool depth must be at least $5,000." },
    ]);
    const r = validateTierConfig({ thresholdsUsd: [30_000, 30_000, 500_000], leverageX100: [400, 900, 2_500], lLaunchX100: 500, lTierX100: 2_000 });
    expect(r.issues.map((i) => i.message)).toEqual([
      "Tier 2 pool depth must be higher than tier 1.",
      "Tier 1 leverage cannot be below the launch leverage of 5x.",
      "Tier 3 leverage cannot exceed this market's maximum of 20x.",
    ]);
    expect(validateTierConfig({ leverageX100: [1_000, 900, 2_000], lLaunchX100: 500, lTierX100: 2_000 }).issues[0]?.message).toBe("Tier 2 leverage cannot be below tier 1's 10x.");
    expect(validateTierConfig({ leverageX100: [550, 0, 0], lLaunchX100: 550, lTierX100: 2_000 }).ok).toBe(true);
    expect(validateTierConfig({ leverageX100: [525, 0, 0], lLaunchX100: 600, lTierX100: 2_000 }).issues[0]?.message).toBe("Tier 1 leverage cannot be below the launch leverage of 6x.");
    expect(validateTierConfig({ lLaunchX100: 500, lTierX100: 2_000, attestedMaxTier: 4 }).issues[0]?.code).toBe("out-of-range");
    expect(validateTierConfig({ lLaunchX100: 500, lTierX100: 2_000, attestedMaxTier: 3 }).ok).toBe(true);
    expect(validateTierConfig({ thresholdsUsd: [5_000.5, 0, 0], lLaunchX100: 500, lTierX100: 2_000 }).ok).toBe(false);
    expect(validateTierConfig({ leverageX100: [0, 0, 0], lLaunchX100: 0.5, lTierX100: 2_000 }).ok).toBe(false);
  });
});

const st = (d: bigint, p: bigint, s: bigint): DepthState => ({ depthE6: d, depthPrevE6: p, depthSlot: s, depthSource: d === 0n ? 0 : 1, lastGoodE6: 0n, lastGoodSlot: 0n });
const tri = (x: DepthState): [bigint, bigint, bigint] => [x.depthE6, x.depthPrevE6, x.depthSlot];

describe("depthPushUpdate (Rust W-L2 + R2.1 sticky vectors)", () => {
  const a = DEPTH_SOURCE.Attested;
  it("same-slot push is not a second sample", () => {
    expect(tri(depthPushUpdate(st(T1, 0n, 10n), a, 2n * T1, 11n))).toEqual([2n * T1, T1, 11n]);
    expect(tri(depthPushUpdate(st(0n, 0n, 0n), a, T1, 5n))).toEqual([T1, 0n, 5n]);
    expect(tri(depthPushUpdate(st(T1, 0n, 10n), a, 2n * T1, 10n))).toEqual([T1, 0n, 10n]);
    expect(tri(depthPushUpdate(st(2n * T1, 7n, 10n), a, T1, 10n))).toEqual([T1, 7n, 10n]);
    expect(tri(depthPushUpdate(st(2n * T1, 7n, 10n), 0, 0n, 10n))).toEqual([0n, 7n, 10n]);
    expect(depthSourceOf(depthPushUpdate(st(T1, 7n, 10n), DEPTH_SOURCE.OnChainPool, 2n * T1, 10n).depthSource)).toBe(a);
    expect(depthSourceOf(depthPushUpdate(st(2n * T1, 7n, 10n), DEPTH_SOURCE.OnChainPool, T1, 10n).depthSource)).toBe(DEPTH_SOURCE.OnChainPool);
    let s = depthPushUpdate(st(0n, 0n, 0n), a, 5n * T1, 20n);
    s = depthPushUpdate(s, a, 5n * T1, 20n);
    expect(effectiveDepthE6(s.depthE6, s.depthPrevE6, s.depthSlot, 20n)).toBe(0n);
    expect(depthEver(s.depthSource)).toBe(false);
    s = depthPushUpdate(s, a, 5n * T1, 21n);
    expect(effectiveDepthE6(s.depthE6, s.depthPrevE6, s.depthSlot, 21n)).toBe(5n * T1);
    expect(tri(depthPushUpdate(st(T1, 3n, 10n), a, 2n * T1, 9n))).toEqual([T1, 3n, 10n]);
    expect(tri(depthPushUpdate(st(T1, 3n, 10n), 3, 2n * T1, 11n))).toEqual([0n, T1, 11n]);
  });
  it("W-M1 sticky bookkeeping", () => {
    let s = depthPushUpdate({ depthE6: 0n, depthSlot: 0n, depthPrevE6: 0n, depthSource: 0, lastGoodE6: 0n, lastGoodSlot: 0n }, a, 4n * T1, 100n);
    s = depthPushUpdate(s, a, 2n * T1, 101n);
    expect(depthEver(s.depthSource)).toBe(true);
    expect([s.lastGoodE6, s.lastGoodSlot]).toEqual([2n * T1, 101n]);
    const z = depthPushUpdate(s, DEPTH_SOURCE.None, 0n, 102n);
    expect(z.depthE6).toBe(0n);
    expect(z.depthSource).toBe(DEPTH_EVER | DEPTH_PREV_REAL); // absent current, real previous
    expect([z.lastGoodE6, z.lastGoodSlot]).toEqual([2n * T1, 101n]);
    const f = depthPushUpdate(z, a, 9n * T1, 103n);
    expect(effectiveDepthE6(f.depthE6, f.depthPrevE6, f.depthSlot, 103n)).toBe(0n);
    expect(f.lastGoodE6).toBe(2n * T1);
    const g = depthPushUpdate(f, a, T1, 104n);
    expect([g.lastGoodE6, g.lastGoodSlot]).toEqual([T1, 104n]);
  });
  it("capDepthE6 / stickyDepthE6", () => {
    expect(capDepthE6(a, 7n, 0n, 0n, 0n)).toBe(7n);
    expect(capDepthE6(a | DEPTH_EVER, 0n, 1_000n, 0n, 0n)).toBe(0n); // a fresh real 0 caps at 0
    expect(capDepthE6(DEPTH_EVER, null, 1_000n, 100n, 100n + 8_999n)).toBe(1_000n);
    expect(capDepthE6(DEPTH_EVER, null, 1_000n, 100n, 100n + 9_000n)).toBe(500n);
    expect(capDepthE6(DEPTH_EVER, null, 1_000n, 100n, 100n + 18_000n)).toBe(250n);
    expect(capDepthE6(DEPTH_EVER, null, (1n << 64n) - 1n, 0n, 64n * 9_000n)).toBe(0n);
    expect(capDepthE6(DEPTH_EVER, null, 1_000n, 500n, 100n)).toBe(1_000n);
    expect(capDepthE6(0, null, 1_000n, 100n, 200n)).toBeNull();
    expect(stickyDepthE6(150_000_000_000n, 0n, 18_000n)).toBe(37_500_000_000n);
    expect(stickyDepthE6(150_000_000_000n, 0n, 63n * 9_000n)).toBe(150_000_000_000n >> 63n);
  });
});

describe("a real zero reading closes opens at once (Rust r2_fresh_real_zero_reading_closes_at_once)", () => {
  const a = DEPTH_SOURCE.Attested;
  const fresh = (x: DepthState, now: bigint): bigint | null => freshDepthE6(x.depthE6, x.depthPrevE6, x.depthSlot, x.depthSource, now);
  const empty: DepthState = { depthE6: 0n, depthSlot: 0n, depthPrevE6: 0n, depthSource: 0, lastGoodE6: 0n, lastGoodSlot: 0n };
  it("attested 0 and DEX 0 are Some(0) at once; positive after a real 0 stays 0 until its own min-of-two", () => {
    let s = depthPushUpdate(empty, a, 4n * T1, 100n);
    s = depthPushUpdate(s, a, 4n * T1, 101n);
    expect(fresh(s, 101n)).toBe(4n * T1);
    const z = depthPushUpdate(s, a, 0n, 102n);
    expect(fresh(z, 102n)).toBe(0n);
    expect([z.lastGoodE6, z.lastGoodSlot]).toEqual([0n, 102n]);
    expect(capDepthE6(z.depthSource, fresh(z, 102n), z.lastGoodE6, z.lastGoodSlot, 102n)).toBe(0n);
    expect(venueTier(0n, z.depthSource, tierThresholdsE6([0, 0, 0]), 3)).toBe(0);
    const d = depthPushUpdate(empty, DEPTH_SOURCE.OnChainPool, 0n, 7n);
    expect([fresh(d, 7n), depthEver(d.depthSource)]).toEqual([0n, true]);
    const p1 = depthPushUpdate(z, a, 4n * T1, 103n);
    expect(fresh(p1, 103n)).toBe(0n);
    const p2 = depthPushUpdate(p1, a, 4n * T1, 104n);
    expect(fresh(p2, 104n)).toBe(4n * T1);
    expect(p2.lastGoodE6).toBe(4n * T1);
  });
  it("absent (35 B / mode 0) is NOT zero: sticky last good", () => {
    let s = depthPushUpdate(empty, a, 4n * T1, 100n);
    s = depthPushUpdate(s, a, 4n * T1, 101n);
    const ab = depthPushUpdate(s, DEPTH_SOURCE.None, 0n, 102n);
    expect(fresh(ab, 102n)).toBeNull();
    expect(ab.lastGoodE6).toBe(4n * T1);
    const ab2 = depthPushUpdate(ab, a, 4n * T1, 103n);
    expect(fresh(ab2, 103n)).toBeNull(); // first real sample after an absent one
  });
  it("same slot: a real 0 beats an absent 0; an absent push cannot undo a real 0; a stale real 0 is absent", () => {
    let s = depthPushUpdate(empty, a, 4n * T1, 100n);
    s = depthPushUpdate(s, a, 4n * T1, 101n);
    const z = depthPushUpdate(s, a, 0n, 102n);
    const ab = depthPushUpdate(s, DEPTH_SOURCE.None, 0n, 102n);
    expect(fresh(depthPushUpdate(ab, a, 0n, 102n), 102n)).toBe(0n);
    expect(fresh(depthPushUpdate(z, DEPTH_SOURCE.None, 0n, 102n), 102n)).toBe(0n);
    expect(fresh(z, 102n + 151n)).toBeNull();
    expect(capDepthE6(z.depthSource, null, z.lastGoodE6, z.lastGoodSlot, 302n)).toBe(0n);
    expect(depthSourceByteOk(DEPTH_EVER | DEPTH_PREV_REAL | DEPTH_SOURCE.OnChainPool)).toBe(true);
    expect(depthSourceByteOk(0x08)).toBe(false);
  });
  it("freshDepthE6 table", () => {
    const rp = a | DEPTH_PREV_REAL;
    expect(freshDepthE6(5n, 3n, 100n, rp, 100n)).toBe(3n);
    expect(freshDepthE6(5n, 3n, 100n, a, 100n)).toBeNull();
    expect(freshDepthE6(0n, 3n, 100n, a, 100n)).toBe(0n);
    expect(freshDepthE6(5n, 0n, 100n, rp, 100n)).toBe(0n);
    expect(freshDepthE6(5n, 3n, 100n, rp, 250n)).toBe(3n);
    expect(freshDepthE6(5n, 3n, 100n, rp, 251n)).toBeNull();
    expect(freshDepthE6(5n, 3n, 101n, rp, 100n)).toBeNull();
    expect(freshDepthE6(5n, 3n, 100n, DEPTH_PREV_REAL, 100n)).toBeNull();
  });
});

describe("N_cap (Rust g8_n_cap_...)", () => {
  const cM = 1_000_000_000n;
  it("identity off the clamp: stored lambda, depth ignored", () => {
    for (const [lam, d] of [[10_000, null], [30_000, 1n], [10_000, T1], [10_000, 0n]] as const) {
      expect(nCapG8Q({ clamp: false, cM, lambdaBps: lam, tier: 1, capDepth: d, priceE6: M })).toBe(nCapQ(cM, lam, M));
      expect(growthMatcherCapsG8({ clamp: false, hlockActive: false, cM, lambdaBps: lam, tier: 1, capDepth: d, priceE6: M })).toEqual(growthMatcherCapsV3({ lambdaBps: lam }, cM, M, false));
    }
  });
  it("on the clamp", () => {
    expect(nCapG8Q({ clamp: true, cM, lambdaBps: 30_000, tier: 0, capDepth: null, priceE6: M })).toBe(nCapQ(cM, 10_000, M));
    expect(nCapG8Q({ clamp: true, cM, lambdaBps: 10_000, tier: 0, capDepth: 100_000_000n, priceE6: M })).toBe(50_000_000n);
    expect(depthCapQ(0, null, M)).toBe((1n << 128n) - 1n);
    expect(depthCapQ(1, 100_000_000n, 0n)).toBe(0n);
    expect(depthNotionalCapE6(3, 100n)).toBe(200n);
    expect(growthMatcherCapsG8({ clamp: true, hlockActive: false, cM, lambdaBps: 10_000, tier: 0, capDepth: 100_000_000n, priceE6: M })).toEqual({ inventoryCapQ: 50_000_000n, liquidityNotionalE6: 200_000_000n });
    expect(growthMatcherCapsG8({ clamp: true, hlockActive: true, cM, lambdaBps: 10_000, tier: 0, capDepth: 100_000_000n, priceE6: M })).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
  });
  it("sticky: never uncapped, 0 closes opens", () => {
    const c = 1_000_000_000_000n;
    expect(nCapG8Q({ clamp: true, cM: c, lambdaBps: 10_000, tier: 0, capDepth: 100_000_000n, priceE6: M })).toBe(50_000_000n);
    expect(nCapG8Q({ clamp: true, cM: c, lambdaBps: 10_000, tier: 0, capDepth: 0n, priceE6: M })).toBe(0n);
    expect(growthMatcherCapsG8({ clamp: true, hlockActive: false, cM: c, lambdaBps: 10_000, tier: 0, capDepth: 0n, priceE6: M })).toEqual({ inventoryCapQ: 0n, liquidityNotionalE6: 0n });
    // mutant (round 1: absent depth = no cap) would leave the whole capital cap
    expect(nCapG8Q({ clamp: true, cM: c, lambdaBps: 10_000, tier: 0, capDepth: null, priceE6: M })).toBe(c);
  });
  it("tier 2 and 3 use lambda_eff and kappa; explainer numbers", () => {
    // tier 2: backing $120k, depth $150k: min(120k * 2, 150k * 1) = $150k (lambda stored 2x)
    expect(nCapG8Q({ clamp: true, cM: 120_000n * M, lambdaBps: 20_000, tier: 2, capDepth: 150_000n * M, priceE6: M })).toBe(150_000n * M);
    // default lambda 1x: 120k binds
    expect(nCapG8Q({ clamp: true, cM: 120_000n * M, lambdaBps: 10_000, tier: 2, capDepth: 150_000n * M, priceE6: M })).toBe(120_000n * M);
    // tier 3: min(600k * 3, 700k * 2) = 1.4M
    expect(nCapG8Q({ clamp: true, cM: 600_000n * M, lambdaBps: 30_000, tier: 3, capDepth: 700_000n * M, priceE6: M })).toBe(1_400_000n * M);
    // tier 0 thin market: min(10k * 1, 8k * .5) = 4k
    expect(nCapG8Q({ clamp: true, cM: 10_000n * M, lambdaBps: 10_000, tier: 0, capDepth: 8_000n * M, priceE6: M })).toBe(4_000n * M);
  });
});

describe("target / ceiling / ratchet (Rust g8_target_ceiling_ratchet_and_force_down)", () => {
  const tab = tierLeverage([0, 0, 0], 500, 2_000);
  it("target", () => {
    expect(targetCeilingX100(false, false, 300, 1_000, 500)).toBe(300);
    expect(targetCeilingX100(true, true, 300, 1_000, 500)).toBe(300);
    expect(targetCeilingX100(true, false, 500, 2_000, lTableX100(2, tab))).toBe(1_000);
    expect(targetCeilingX100(true, false, 500, 2_000, lTableX100(3, tab))).toBe(2_000);
    expect(targetCeilingX100(true, false, 300, 1_000, 2_000)).toBe(1_000);
    expect(targetCeilingX100(true, false, 800, 1_000, 500)).toBe(800);
  });
  it("ceiling in force", () => {
    expect(ceilingInForceX100(false, 900, 900, 300, 1_000)).toBe(300);
    expect(ceilingInForceX100(true, 900, 400, 300, 1_000)).toBe(400);
    expect(ceilingInForceX100(true, 400, 900, 300, 1_000)).toBe(400);
  });
  const gr = (o: { prev: number; slot: bigint; cl: bigint; cm: bigint; grad: boolean; force: boolean; tab: number; now: bigint }): [number, bigint, bigint] => {
    const r = graduationRatchet({ prevCeilX100: o.prev, prevSlot: o.slot, cLaunchAtoms: o.cl, cM: o.cm, graduation: o.grad, forceDown: o.force, lLaunchX100: 500, lTierX100: 2_000, lTableTierX100: o.tab, nowSlot: o.now });
    return [r.ceilX100, r.ceilSlot, r.cLaunchAtoms];
  };
  it("ratchet writer", () => {
    expect(gr({ prev: 500, slot: 0n, cl: 0n, cm: 5_000_000_000n, grad: true, force: false, tab: 1_000, now: 50_000n })).toEqual([500, 0n, 5_000_000_000n]);
    expect(gr({ prev: 500, slot: 0n, cl: 0n, cm: 1n, grad: true, force: false, tab: 1_000, now: 50_000n })).toEqual([500, 0n, 1_000_000_000n]);
    const c = 1_000_000_000n;
    const base = { cl: c, cm: 1n, grad: true, force: false, tab: 1_000 };
    expect(gr({ ...base, prev: 500, slot: 0n, now: 8_999n })).toEqual([500, 0n, c]);
    expect(gr({ ...base, prev: 500, slot: 0n, now: 9_000n })).toEqual([600, 9_000n, c]);
    expect(gr({ ...base, prev: 600, slot: 9_000n, now: 18_000n })).toEqual([700, 18_000n, c]);
    expect(gr({ ...base, prev: 1_000, slot: 18_000n, now: 40_000n })).toEqual([1_000, 18_000n, c]);
    expect(gr({ ...base, grad: false, tab: 500, prev: 1_000, slot: 18_000n, now: 40_001n })).toEqual([500, 40_001n, c]);
    expect(gr({ ...base, force: true, prev: 1_000, slot: 18_000n, now: 40_001n })).toEqual([500, 40_001n, c]);
    expect(gr({ ...base, prev: 2_000, slot: 18_000n, now: 40_001n })).toEqual([1_000, 40_001n, c]);
  });
  it("fall-only", () => {
    const f = (prev: number, slot: bigint, grad: boolean, tabv: number) => { const r = graduationFallOnly({ prevCeilX100: prev, prevSlot: slot, graduation: grad, forceDown: false, lLaunchX100: 500, lTierX100: 2_000, lTableTierX100: tabv, nowSlot: 99n }); return [r.ceilX100, r.ceilSlot]; };
    expect(f(500, 7n, true, 1_000)).toEqual([500, 7n]);
    expect(f(1_000, 7n, false, 500)).toEqual([500, 99n]);
    expect(f(2_000, 7n, true, 1_000)).toEqual([1_000, 99n]);
  });
  it("ratchet primitive", () => {
    expect(ratchetCeilingX100(500, 0n, 1_000, 500, false, 9_000n)).toEqual({ ceilX100: 600, ceilSlot: 9_000n });
    expect(ratchetCeilingX100(500, 0n, 550, 500, false, 9_000n)).toEqual({ ceilX100: 550, ceilSlot: 9_000n });
    expect(ratchetCeilingX100(900, 5n, 400, 500, false, 6n)).toEqual({ ceilX100: 400, ceilSlot: 6n });
  });
  it("graduationOn", () => {
    expect(graduationOn(true, 130, 1) && !graduationOn(false, 130, 1) && !graduationOn(true, 130, 0) && !graduationOn(true, 0, 1)).toBe(true);
  });
});

// ── view and quote ─────────────────────────────────────────────────────────────────────────

interface RecOver {
  lambda?: number; lLaunch?: number; lTier?: number; ceil?: number; ceilSlot?: bigint; cLaunch?: bigint; rGap?: number;
  src?: number; attested?: number; depth?: bigint; prev?: bigint; slot?: bigint; lastGood?: bigint; lastGoodSlot?: bigint;
  th?: [number, number, number]; lv?: [number, number, number];
}
function g(o: RecOver): AssetGrowthV19 {
  const b = new Uint8Array(ASSET_GROWTH_LEN);
  const v = new DataView(b.buffer);
  v.setBigUint64(0, o.cLaunch ?? 1_000_000_000n, true);
  v.setBigUint64(8, o.ceilSlot ?? 0n, true);
  v.setUint32(16, o.lambda ?? 10_000, true);
  v.setUint16(20, o.lLaunch ?? 500, true);
  v.setUint16(22, o.lTier ?? 2_000, true);
  v.setUint16(24, o.ceil ?? o.lLaunch ?? 500, true);
  v.setUint16(26, 5_000, true);
  v.setUint16(28, o.rGap ?? 3445, true);
  b[38] = 1;
  b[44] = o.src ?? 0;
  b[45] = o.attested ?? 0;
  v.setBigUint64(56, o.depth ?? 0n, true);
  v.setBigUint64(64, o.slot ?? 0n, true);
  v.setBigUint64(72, o.prev ?? 0n, true);
  v.setBigUint64(80, o.lastGood ?? 0n, true);
  v.setBigUint64(88, o.lastGoodSlot ?? 0n, true);
  (o.th ?? [0, 0, 0]).forEach((x, i) => v.setUint32(96 + 4 * i, x, true));
  (o.lv ?? [0, 0, 0]).forEach((x, i) => v.setUint16(108 + 2 * i, x, true));
  return decodeAssetGrowthRecordV19(b)!;
}
const BAND = 1000; // G(1000) = 3445
const NOW = 1_000n;
const dex = (usd: bigint, extra: RecOver = {}): RecOver => ({ src: DEPTH_SOURCE.OnChainPool | DEPTH_EVER | DEPTH_PREV_REAL, depth: usd * M, prev: usd * M, slot: 990n, lastGood: usd * M, lastGoodSlot: 990n, ...extra });

describe("growthCeilingView: explainer worked examples (tiered 20x meme market, launch 5x)", () => {
  it("tier 0: thin pool $8k, backing $10k -> 5x, tier 0", () => {
    const v = growthCeilingView(g(dex(8_000n)), BAND, NOW, 10_000n * M, false);
    expect([v.tier, v.venueTier, v.bookTier, v.ceilingX100, v.targetX100, v.graduationOn]).toEqual([0, 0, 0, 500, 500, false]);
    // next: tier 1 needs $25k depth and $25k backing; 5x is the table's L1 = launch, so no gain -> tier 2 (10x) is the first that raises it
    expect(v.nextTierUnlock).toEqual({ kind: "both", tier: 2, depthUsd: 100_000, backingUsd: 100_000, thresholdUsd: 100_000, leverageX100: 1_000 });
  });
  it("tier 1: depth $30k, backing $40k -> 5x; 10x needs both at $100k", () => {
    const v = growthCeilingView(g(dex(30_000n)), BAND, NOW, 40_000n * M, false);
    expect([v.tier, v.ceilingX100]).toEqual([1, 500]);
    expect(v.nextUnlock).toEqual({ kind: "both", tier: 2, depthUsd: 100_000, backingUsd: 100_000, thresholdUsd: 100_000, leverageX100: 1_000 });
  });
  it("tier 2: depth $150k, backing $120k -> target 10x, ceiling climbs +1x per hour; ETA in minutes", () => {
    const v = growthCeilingView(g(dex(150_000n)), BAND, NOW, 120_000n * M, false);
    expect([v.tier, v.venueTier, v.bookTier, v.targetX100, v.ceilingX100]).toEqual([2, 2, 2, 1_000, 500]);
    // stored ceil 500 stamped at slot 0: next step allowed at slot 9000, now 1000 -> 8000 slots = 3200 s = 53.3 min -> 54
    expect(v.nextUnlock).toEqual({ kind: "ratchet", leverageX100: 600, etaSlots: 8_000n, etaMinutes: 54 });
    expect(v.nextTierUnlock).toEqual({ kind: "both", tier: 3, depthUsd: 500_000, backingUsd: 500_000, thresholdUsd: 500_000, leverageX100: 2_000 });
    // once the ceiling reached 8x the step is 9x
    const v8 = growthCeilingView(g(dex(150_000n, { ceil: 800, ceilSlot: 500n })), BAND, NOW, 120_000n * M, false);
    expect(v8.ceilingX100).toBe(800);
    expect(v8.nextUnlock).toEqual({ kind: "ratchet", leverageX100: 900, etaSlots: 8_500n, etaMinutes: 57 });
    // fully climbed: only the tier requirement is left
    const v10 = growthCeilingView(g(dex(150_000n, { ceil: 1_000 })), BAND, NOW, 120_000n * M, false);
    expect(v10.nextUnlock.kind).toBe("both");
  });
  it("backing falls to $90k at hour 3: tier drops to 1 and the cap goes straight to 5x", () => {
    const v = growthCeilingView(g(dex(150_000n, { ceil: 800 })), BAND, NOW, 90_000n * M, false);
    expect([v.tier, v.bookTier, v.ceilingX100]).toEqual([1, 1, 500]);
    expect(v.nextUnlock).toEqual({ kind: "backing", tier: 2, backingUsd: 100_000, thresholdUsd: 100_000, leverageX100: 1_000 });
  });
  it("tier 3 major: depth $700k backing $600k -> 20x target", () => {
    const v = growthCeilingView(g(dex(700_000n, { ceil: 1_000 })), BAND, NOW, 600_000n * M, false);
    expect([v.tier, v.targetX100, v.ceilingX100]).toEqual([3, 2_000, 1_000]);
    expect(v.nextUnlock.kind).toBe("ratchet");
  });
  it("a market built for 5x never graduates, whatever its depth", () => {
    const v = growthCeilingView(g(dex(700_000n, { lTier: 500 })), BAND, NOW, 600_000n * M, false);
    expect([v.tier, v.targetX100, v.nextUnlock.kind, v.nextTierUnlock.kind]).toEqual([3, 500, "none", "none"]);
  });
  it("keeper-attested depth is tier-1 capped: tier 2 says it needs an on-chain pool; attested_max_tier 3 lifts it", () => {
    const att = { src: DEPTH_SOURCE.Attested | DEPTH_EVER | DEPTH_PREV_REAL };
    const v = growthCeilingView(g(dex(700_000n, att)), BAND, NOW, 600_000n * M, false);
    expect([v.venueTier, v.bookTier, v.tier, v.targetX100]).toEqual([1, 3, 1, 500]);
    expect(v.nextTierUnlock).toMatchObject({ kind: "depth", tier: 2, depthUsd: 100_000, leverageX100: 1_000, needsOnChainDepth: true });
    expect(v.nextTierUnlock.backingUsd).toBeUndefined();
    const v3 = growthCeilingView(g(dex(700_000n, { ...att, attested: 3 })), BAND, NOW, 600_000n * M, false);
    expect([v3.venueTier, v3.tier, v3.targetX100]).toEqual([3, 3, 2_000]);
  });
  it("per-market thresholds and leverage drive tier and target", () => {
    // thresholds $5k / $20k / $100k, leverage 6x / 8x / 12x
    const o = dex(25_000n, { th: [5_000, 20_000, 100_000], lv: [600, 800, 1_200], lTier: 2_000 });
    const v = growthCeilingView(g(o), BAND, NOW, 30_000n * M, false);
    expect([v.tier, v.targetX100]).toEqual([2, 800]);
    expect(v.nextTierUnlock).toMatchObject({ tier: 3, depthUsd: 100_000, leverageX100: 1_200 });
  });
  it("backing needed grows when lambda is below 1x (book capacity = C_m * min(lambda, 1x))", () => {
    const v = growthCeilingView(g(dex(30_000n, { lambda: 5_000 })), BAND, NOW, 40_000n * M, false);
    expect(v.bookDepthE6).toBe(20_000n * M);
    expect(v.nextTierUnlock.backingUsd).toBe(200_000);
  });
  it("unknown LP equity reads book tier 0 (never looser)", () => {
    const v = growthCeilingView(g(dex(700_000n)), BAND, NOW, null, false);
    expect([v.bookTier, v.tier, v.ceilingX100]).toEqual([0, 0, 500]);
  });
  it("off the clamp: launch ceiling, nothing to unlock, tier 0", () => {
    const v = growthCeilingView(g(dex(700_000n, { rGap: 400, ceil: 1_000 })), BAND, NOW, 600_000n * M, false);
    expect([v.clampEnforced, v.tier, v.ceilingX100, v.nextUnlock.kind]).toEqual([false, 0, 500, "none"]);
    expect(growthCeilingView(g(dex(700_000n)), 0, NOW, 600_000n * M, false).clampEnforced).toBe(false);
  });
  it("force-down gives the launch ceiling", () => {
    const v = growthCeilingView(g(dex(700_000n, { ceil: 1_000 })), BAND, NOW, 600_000n * M, true);
    expect([v.ceilingX100, v.targetX100, v.nextUnlock.kind]).toEqual([500, 500, "none"]);
  });
  it("stale depth: tier 0 for leverage, sticky cap for capacity", () => {
    const o = dex(150_000n, { slot: 100n, lastGoodSlot: 100n, ceil: 1_000 });
    const v = growthCeilingView(g(o), BAND, 100n + 18_000n, 120_000n * M, false);
    expect([v.effectiveDepthE6, v.venueTier, v.tier, v.ceilingX100]).toEqual([0n, 0, 0, 500]);
    expect(v.capDepthE6).toBe(37_500n * M);
  });
});

function qin(growth: AssetGrowthV19, cap: bigint, now = NOW, lpPos = 1n): QuoteMaxLeverageInput {
  return {
    engineImrBps: 500n, growth, lpCapital: cap, lpPnl: 0n, lpFeeCredits: 0n, lpEffectivePositionQ: lpPos, assetBound: true,
    oiEffLongQ: 0n, oiEffShortQ: 0n, priceE6: M, bankruptcyHlockActive: false, v22: { bandBps: BAND, nowSlot: now },
  };
}

describe("quoteMaxLeverage (R2.1)", () => {
  it("tier 2 market, ceiling 8x: quote 8x on the thin side, capacity min(backing, depth)", () => {
    const q = quoteMaxLeverage(qin(g(dex(150_000n, { ceil: 800 })), 120_000n * M), "long");
    expect([q.tier, q.venueTier, q.bookTier, q.ceilingX100, q.maxLeverageX100]).toEqual([2, 2, 2, 800, 800]);
    expect(q.nCapQ).toBe(120_000n * M);
    expect(q.nextUnlock.kind).toBe("ratchet");
  });
  it("depth readings stopped (sticky): capacity follows last_good >> k at the tier-0 rate, leverage drops to launch", () => {
    const o = dex(150_000n, { slot: 0n, lastGoodSlot: 0n, ceil: 1_000 });
    const q0 = quoteMaxLeverage(qin(g(o), 120_000n * M, 1_000n), "long"); // still fresh? slot 0 + 150 < 1000 -> stale
    expect(q0.tier).toBe(0);
    expect(q0.ceilingX100).toBe(500);
    expect(q0.capDepthE6).toBe(150_000n * M); // k = 0: last good, undecayed
    expect(q0.nCapQ).toBe(75_000n * M); // 150k * kappa 0.5
    const q1 = quoteMaxLeverage(qin(g(o), 120_000n * M, 9_000n), "long");
    expect(q1.nCapQ).toBe(37_500n * M);
    const q2 = quoteMaxLeverage(qin(g(o), 120_000n * M, 18_000n), "long");
    expect(q2.nCapQ).toBe(18_750n * M);
    const qz = quoteMaxLeverage(qin(g(o), 120_000n * M, 64n * 9_000n), "long");
    expect(qz.closed).toBe(true);
    expect(qz.closedReason).toBe("capacity-zero");
  });
  it("a fresh real zero reading (source 1/2, depth 0) closes new opens at once; the tier falls to 0", () => {
    const q = quoteMaxLeverage(qin(g(dex(0n, { ceil: 800, lastGood: 0n })), 120_000n * M), "long");
    expect([q.tier, q.capDepthE6, q.closed, q.closedReason, q.ceilingX100]).toEqual([0, 0n, true, "capacity-zero", 500]);
    expect(q.reduceOnlyCapacityExempt).toBe(true);
    // a 35 B (absent) reading is NOT zero: sticky last good keeps the cap
    const absent = quoteMaxLeverage(qin(g(dex(0n, { src: DEPTH_EVER | DEPTH_PREV_REAL, lastGood: 150_000n * M, lastGoodSlot: 990n })), 120_000n * M), "long");
    expect([absent.capDepthE6, absent.closed]).toEqual([150_000n * M, false]);
  });
  it("never had a depth: no depth cap, today's capital rule", () => {
    const q = quoteMaxLeverage(qin(g({ ceil: 500 }), 50_000n * M), "long");
    expect(q.capDepthE6).toBeNull();
    expect(q.nCapQ).toBe(50_000n * M);
  });
  it("without v22 input the quote is growth-1 (stored lambda, launch ceiling)", () => {
    const i = qin(g(dex(150_000n, { ceil: 800, lambda: 30_000 })), 100_000n * M);
    delete (i as { v22?: unknown }).v22;
    const q = quoteMaxLeverage(i, "long");
    expect([q.ceilingX100, q.tier, q.nCapQ]).toEqual([500, 0, 300_000n * M]);
  });
});

describe("builders: tag 94 tier block, tag 93 tier trailer", () => {
  const tiers = { thresholdUsd: [25_000, 100_000, 500_000] as [number, number, number], leverageX100: [500, 1_000, 2_000] as [number, number, number] };
  it("tag 94: 23 bytes; the 5-byte form is a prefix", () => {
    const d = encodeInitVaultLpV22Tiers(2_000, 500, tiers, 2_000);
    expect(d.length).toBe(23);
    expect(hex(d)).toBe("5e" + "d007" + "f401" + "a8610000" + "a0860100" + "20a10700" + "f401" + "e803" + "d007");
    expect(hex(d.subarray(0, 5))).toBe(hex(encodeInitVaultLpV19(2_000, 500)));
  });
  it("tag 94 refuses a table the wrapper answers 130 for (when lTier is given)", () => {
    expect(() => encodeInitVaultLpV22Tiers(2_000, 500, { thresholdUsd: [1, 2, 3], leverageX100: [0, 0, 0] }, 2_000)).toThrow(/130/);
    expect(() => encodeInitVaultLpV22Tiers(2_000, 500, { thresholdUsd: [1, 2, 3], leverageX100: [0, 0, 0] })).not.toThrow();
    expect(() => encodeInitVaultLpV22Tiers(2_000, 0, tiers)).toThrow();
    expect(() => encodeInitVaultLpV22Tiers(2_000, 500, { thresholdUsd: [2 ** 32, 0, 0], leverageX100: [0, 0, 0] })).toThrow(/u32/);
    expect(() => encodeInitVaultLpV22Tiers(2_000, 500, { thresholdUsd: [0, 0, 0], leverageX100: [70_000, 0, 0] })).toThrow(/u16/);
  });
  it("tag 93: 71 bytes = tag + asset + 41 zero + 27-byte trailer", () => {
    const d = encodeSetAssetRiskLimitsV22Tiers(2, 10_000, 5_000, tiers, 3, 0, { lLaunchX100: 500, lTierX100: 2_000 });
    expect(d.length).toBe(71);
    expect(hex(d.subarray(0, 3))).toBe("5d0200");
    expect(Array.from(d.subarray(3, 44)).every((x) => x === 0)).toBe(true);
    expect(hex(d.subarray(44))).toBe("10270000" + "8813" + "0000" + "a8610000" + "a0860100" + "20a10700" + "f401" + "e803" + "d007" + "03");
    const u = encodeSetAssetRiskLimitsV22Tiers(2, 10_000, 5_000, { thresholdUsd: [0, 0, 0], leverageX100: [0, 0, 0] }, 0, 600);
    expect(hex(u.subarray(50, 52))).toBe("5802"); // the util-fee dial at trailer offset 6
  });
  it("tag 93 refuses attested_max_tier 4, a bad table and a bad lambda", () => {
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 5_000, tiers, 4)).toThrow(/130/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 10_000, 5_000, { thresholdUsd: [4_999, 20_000, 100_000], leverageX100: [0, 0, 0] }, 1, 0, { lLaunchX100: 500, lTierX100: 2_000 })).toThrow(/\$5,000/);
    expect(() => encodeSetAssetRiskLimitsV22Tiers(0, 0, 5_000, tiers, 1)).toThrow();
  });
});

describe("errors 129 / 130", () => {
  it("calm one-line hints", () => {
    expect(decodeError(129)?.name).toBe("DepthSourceInvalid");
    expect(decodeError(130)?.name).toBe("GrowthTierConfigInvalid");
    for (const c of [129, 130]) { const h = decodeError(c)?.hint ?? ""; expect(h.length).toBeGreaterThan(20); expect(h).not.toMatch(/\n|bps|x100/); }
  });
});
