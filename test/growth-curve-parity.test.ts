/**
 * Continuous leverage / capacity curve: BIT-EXACT parity against the REAL wrapper functions
 * (percolator-prog `feat/v22-continuous-leverage` @ e699d7da, `src/growth_v19.rs`: `log2_q16`, `curve_pos`, `curve_value`,
 * `smooth_dials_and_venue_l`, `venue_depth_capped`, `n_cap_g8_q_dials`, `growth_matcher_caps_g8_dials`).
 *
 * Fixture: test/fixtures/growth-curve-parity.json, emitted by scripts/growth-curve-parity (a crate that depends on the
 * wrapper by path and calls its functions; nothing is re-implemented on the Rust side). Coverage: every anchor, anchor +-1..3,
 * T1/4, every power of two +-1, seeded uniform and log-uniform depths in every segment, u64::MAX; 14 threshold configs
 * (incl. saturated, non-increasing, T1 < 4 so anchor 0 is 0) x 9 tables (L tables, κ, λ_depth, non-monotone, a > 2^32 span).
 *
 * Negative controls (in-suite): the removed round-3 25% ramp ({@link tierRampU64}) and the round-2 step table must FAIL the
 * same parity check with many mismatches.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CURVE_POS_FAIL,
  KAPPA_TABLE_BPS,
  LAMBDA_DEPTH_TABLE_BPS,
  curveAnchors,
  curveDepthForLeverageX100,
  curvePos,
  curveU64,
  curveValue,
  depthTierFor,
  growthMatcherCapsG8,
  log2Q16,
  nCapG8Q,
  smoothDials,
  smoothDialsAndVenueL,
  tierRampU64,
  venueDepthCapped,
} from "../src/abi/growth-v19.js";
import type { Triple } from "../src/abi/growth-v19.js";

type Tab = [bigint, bigint, bigint, bigint];
interface Fx {
  meta: { wrapper_commit: string };
  tables: Record<string, string[]>;
  log2: [string, number | null][];
  curve: { name: string; th: string[]; anchors: string[]; cases: (string | number)[][] }[];
  fail_pos: { seg: number; num: number; den: number; values: string[] };
  l_tables: [number, number, number, number][];
  dials: (string | number)[][];
  venue_cap: (string | number)[][];
  ncap: (string | number | null)[][];
}
const FX = JSON.parse(readFileSync(new URL("./fixtures/growth-curve-parity.json", import.meta.url), "utf8")) as Fx;
const tableNames = Object.keys(FX.tables);
const tables: Tab[] = tableNames.map((n) => (FX.tables[n] as string[]).map((x) => BigInt(x)) as Tab);
const th3 = (xs: string[]): Triple<bigint> => [BigInt(xs[0] as string), BigInt(xs[1] as string), BigInt(xs[2] as string)];
const U64_MAX = (1n << 64n) - 1n;

/** Count curve-value mismatches of `f(d, th, t)` against the Rust values over every (config, depth, table). */
function curveMismatches(f: (d: bigint, th: Triple<bigint>, t: Tab) => bigint): { n: number; total: number; first: string | null } {
  let n = 0;
  let total = 0;
  let first: string | null = null;
  for (const c of FX.curve) {
    const th = th3(c.th);
    for (const row of c.cases) {
      const d = BigInt(row[0] as string);
      tables.forEach((t, k) => {
        total++;
        const want = BigInt(row[4 + k] as string);
        const got = f(d, th, t);
        if (got !== want) {
          n++;
          if (first === null) first = `${c.name} d=${d} ${tableNames[k]}: got ${got}, rust ${want}`;
        }
      });
    }
  }
  return { n, total, first };
}

describe("growth curve parity (wrapper e699d7da)", () => {
  it("pins the wrapper commit the fixture came from", () => {
    expect(FX.meta.wrapper_commit).toBe("e699d7da");
  });

  it("log2Q16 equals log2_q16 at every probed input", () => {
    expect(FX.log2.length).toBeGreaterThan(3_000);
    let bad = 0;
    for (const [x, want] of FX.log2) if (log2Q16(BigInt(x)) !== want) bad++;
    expect(bad).toBe(0);
    expect(log2Q16(0n)).toBeNull();
    expect(log2Q16(1n << 64n)).toBeNull(); // outside u64: fail closed
    expect(log2Q16(-1n)).toBeNull();
  });

  it("fixture covers every anchor, anchor +-1 and T1/4 of every config", () => {
    for (const c of FX.curve) {
      const ds = new Set(c.cases.map((r) => r[0] as string));
      const a = curveAnchors(th3(c.th));
      expect(a.map(String)).toEqual(c.anchors);
      for (const x of a) {
        for (const dl of [-1n, 0n, 1n]) {
          const y = x + dl;
          if (y >= 0n && y <= U64_MAX) expect(ds.has(y.toString()), `${c.name} missing ${y}`).toBe(true);
        }
      }
    }
    expect(FX.curve.reduce((s, c) => s + c.cases.length, 0)).toBeGreaterThan(8_000);
  });

  it("curvePos equals curve_pos (seg, num, den) at every depth of every config", () => {
    let bad = 0;
    let first = "";
    for (const c of FX.curve) {
      const th = th3(c.th);
      for (const r of c.cases) {
        const p = curvePos(BigInt(r[0] as string), th);
        if (p.seg !== r[1] || p.num !== r[2] || p.den !== r[3]) {
          bad++;
          if (!first) first = `${c.name} d=${r[0]}: ${JSON.stringify(p)} vs ${r.slice(1, 4)}`;
        }
      }
    }
    expect(first).toBe("");
    expect(bad).toBe(0);
  });

  it("curveU64 equals curve_value for all 9 tables (L, κ, λ_depth, non-monotone, wide span)", () => {
    const r = curveMismatches((d, th, t) => curveU64(d, th, t));
    expect(r.first).toBeNull();
    expect(r.n).toBe(0);
    expect(r.total).toBeGreaterThan(80_000);
  });

  it("CURVE_POS_FAIL reads t[0] for every table", () => {
    expect([CURVE_POS_FAIL.seg, CURVE_POS_FAIL.num, CURVE_POS_FAIL.den]).toEqual([FX.fail_pos.seg, FX.fail_pos.num, FX.fail_pos.den]);
    expect(tables.map((t) => curveValue(CURVE_POS_FAIL, t).toString())).toEqual(FX.fail_pos.values);
  });

  it("smoothDials / smoothDialsAndVenueL equal smooth_dials_and_venue_l at every (venue, book) pair", () => {
    let bad = 0;
    let first = "";
    for (const r of FX.dials) {
      const th = th3(FX.curve[r[0] as number]!.th);
      const lt = FX.l_tables[r[1] as number]!;
      const v = BigInt(r[2] as string);
      const b = BigInt(r[3] as string);
      const want = { lSignalX100: r[4], kappaBps: r[5], lambdaDepthBps: r[6] };
      const got = smoothDials(v, b, th, lt);
      const both = smoothDialsAndVenueL(v, b, th, lt);
      if (JSON.stringify(got) !== JSON.stringify(want) || JSON.stringify(both.dials) !== JSON.stringify(want) || both.venueLX100 !== r[7]) {
        bad++;
        if (!first) first = `v=${v} b=${b}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`;
      }
    }
    expect(FX.dials.length).toBeGreaterThan(2_000);
    expect(first).toBe("");
    expect(bad).toBe(0);
  });

  it("venueDepthCapped equals venue_depth_capped (attested cap = the anchor T_m)", () => {
    let bad = 0;
    for (const r of FX.venue_cap) {
      const th = th3(FX.curve[r[0] as number]!.th);
      if (venueDepthCapped(BigInt(r[3] as string), r[1] as number, th, r[2] as number).toString() !== r[4]) bad++;
    }
    expect(FX.venue_cap.length).toBeGreaterThan(500);
    expect(bad).toBe(0);
  });

  it("nCapG8Q / growthMatcherCapsG8 at the curve dials equal n_cap_g8_q_dials / growth_matcher_caps_g8_dials", () => {
    let bad = 0;
    for (const r of FX.ncap) {
      const th = th3(FX.curve[r[0] as number]!.th);
      const lt = FX.l_tables[r[1] as number]!;
      const d = smoothDials(BigInt(r[2] as string), BigInt(r[3] as string), th, lt);
      const base = {
        clamp: true, cM: BigInt(r[4] as string), lambdaBps: r[5] as number, tier: 0,
        capDepth: r[6] === null ? null : BigInt(r[6] as string), priceE6: BigInt(r[7] as string), dials: d,
      };
      const n = nCapG8Q(base);
      const caps = growthMatcherCapsG8({ ...base, hlockActive: false });
      if ((n === null ? null : n.toString()) !== r[8] || caps.inventoryCapQ.toString() !== r[9] || caps.liquidityNotionalE6.toString() !== r[10]) bad++;
    }
    expect(FX.ncap.length).toBeGreaterThan(500);
    expect(bad).toBe(0);
  });

  it("matches the build ledger's curve table (default thresholds, 6 decimals, 5x/10x/20x)", () => {
    const th: Triple<bigint> = [25_000_000_000n, 100_000_000_000n, 500_000_000_000n];
    const usd = (x: number): bigint => BigInt(x) * 1_000_000n;
    const L: Tab = [500n, 500n, 1_000n, 2_000n];
    const row = (x: number) => [curveU64(usd(x), th, L), curveU64(usd(x), th, KAPPA_TABLE_BPS), curveU64(usd(x), th, LAMBDA_DEPTH_TABLE_BPS)].map(Number);
    expect(row(5_000)).toEqual([500, 5_000, 10_000]);
    expect(row(10_000)).toEqual([500, 6_695, 10_000]);
    expect(row(20_000)).toEqual([500, 9_195, 10_000]);
    expect(row(25_000)).toEqual([500, 10_000, 10_000]);
    expect(row(40_000)).toEqual([669, 10_000, 13_390]);
    expect(row(50_000)).toEqual([750, 10_000, 15_000]);
    expect(row(75_000)).toEqual([896, 10_000, 17_924]);
    expect(row(100_000)).toEqual([1_000, 10_000, 20_000]);
    expect(row(200_000)).toEqual([1_430, 14_306, 24_306]);
    expect(row(300_000)).toEqual([1_682, 16_826, 26_826]);
    expect(row(500_000)).toEqual([2_000, 20_000, 30_000]);
    expect(row(1_000_000)).toEqual([2_000, 20_000, 30_000]);
  });

  it("curveDepthForLeverageX100 returns the smallest depth the bit-exact curve reaches", () => {
    const th: Triple<bigint> = [25_000_000_000n, 100_000_000_000n, 500_000_000_000n];
    const lt: [number, number, number, number] = [500, 500, 1_000, 2_000];
    const L: Tab = [500n, 500n, 1_000n, 2_000n];
    for (const x of [501, 600, 669, 750, 896, 999, 1_000, 1_001, 1_430, 1_999, 2_000]) {
      const d = curveDepthForLeverageX100(x, th, lt)!;
      expect(curveU64(d, th, L) >= BigInt(x)).toBe(true);
      expect(curveU64(d - 1n, th, L) < BigInt(x)).toBe(true);
    }
    expect(curveDepthForLeverageX100(500, th, lt)).toBe(0n);
    expect(curveDepthForLeverageX100(2_001, th, lt)).toBeNull();
    // 7.5x is first reached a hair below $50k (Q.16 log2 granularity): 49,999.642592 tokens
    expect(curveDepthForLeverageX100(750, th, lt)).toBe(49_999_642_592n);
  });

  it("NEGATIVE CONTROL: the removed 25% ramp and the round-2 step table FAIL the same parity check", () => {
    const ramp = curveMismatches((d, th, t) => tierRampU64(d, th, t));
    const step = curveMismatches((d, th, t) => t[depthTierFor(d, th)] as bigint);
    // a stale mirror disagrees with the program at a large share of the probed points
    expect(ramp.n).toBeGreaterThan(10_000);
    expect(step.n).toBeGreaterThan(10_000);
    // and at the founder's example: $50k on the default table is 7.5x on chain, 5x on the old mirrors
    const th: Triple<bigint> = [25_000_000_000n, 100_000_000_000n, 500_000_000_000n];
    const L: Tab = [500n, 500n, 1_000n, 2_000n];
    expect(curveU64(50_000_000_000n, th, L)).toBe(750n);
    expect(tierRampU64(50_000_000_000n, th, L)).toBe(500n);
  });
});
