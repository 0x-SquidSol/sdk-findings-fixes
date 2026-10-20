/**
 * Random differential: @percolatorct/sdk growth curve vs the wrapper's OWN Rust functions (percolator-prog 21b8ccfd, contlev3).
 *
 *   cd scripts/growth-curve-parity && BIG=1000000 SEED=1 cargo run --release > /tmp/cases.jsonl
 *   npx tsx scripts/growth-curve-diff.ts /tmp/cases.jsonl            # the SDK (expects 0 mismatches)
 *   npx tsx scripts/growth-curve-diff.ts /tmp/cases.jsonl --3198539a # negative control: 3198539a's κ / λ_depth + continuous stress cap
 *
 * Per case: leading + lagging curve positions, lagging κ / λ_depth, the dials and venue L at (venue, book), the combined tier, the stress
 * cap and the stressed target at every level 0..4, and N_cap at the dials. Exit 1 on any mismatch (or, with --3198539a, on NONE).
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import {
  KAPPA_TABLE_BPS,
  LAMBDA_DEPTH_TABLE_BPS,
  combinedTier,
  curveLagU64,
  curvePos,
  curvePosLag,
  curveU64,
  depthTierFor,
  graduationOn,
  nCapG8Q,
  smoothDialsAndVenueL,
  stressCapCurveX100,
  stressCapX100,
  targetCeilingX100,
  tierLeverage,
} from "../src/abi/growth-v19.js";
import type { SmoothDials, Triple } from "../src/abi/growth-v19.js";

type Tab = readonly [bigint, bigint, bigint, bigint];
const file = process.argv[2];
const old = process.argv.includes("--3198539a");
if (!file) throw new Error("usage: growth-curve-diff.ts <cases.jsonl> [--3198539a]");

/** 3198539a's dials (κ / λ_depth on the leading curve): the negative control. */
function dialsOld(v: bigint, b: bigint, th: Triple<bigint>, lt: readonly [number, number, number, number]): { dials: SmoothDials; venueLX100: number } {
  const o = smoothDialsAndVenueL(v, b, th, lt);
  const m2 = (t: Tab): number => { const x = curveU64(v, th, t); const y = curveU64(b, th, t); return Number(x < y ? x : y); };
  return { dials: { lSignalX100: o.dials.lSignalX100, kappaBps: m2(KAPPA_TABLE_BPS), lambdaDepthBps: m2(LAMBDA_DEPTH_TABLE_BPS) }, venueLX100: o.venueLX100 };
}

const counts: Record<string, number> = {};
const bump = (k: string): void => { counts[k] = (counts[k] ?? 0) + 1; };
let cases = 0;
let bad = 0;
const firsts: string[] = [];
const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line) continue;
  const r = JSON.parse(line) as unknown[];
  cases++;
  const ths = r[0] as [string, string, string];
  const th: Triple<bigint> = [BigInt(ths[0]), BigInt(ths[1]), BigInt(ths[2])];
  const v = BigInt(r[1] as string);
  const b = BigInt(r[2] as string);
  const stored = r[3] as Triple<number>;
  const la = r[4] as number;
  const lt = r[5] as number;
  const tab = tierLeverage(stored, la, lt);
  const pv = curvePos(v, th);
  const qv = curvePosLag(pv, v, th);
  const kLag = old ? curveU64(v, th, KAPPA_TABLE_BPS) : curveLagU64(v, th, KAPPA_TABLE_BPS);
  const lLag = old ? curveU64(v, th, LAMBDA_DEPTH_TABLE_BPS) : curveLagU64(v, th, LAMBDA_DEPTH_TABLE_BPS);
  const dv = old ? dialsOld(v, b, th, tab) : smoothDialsAndVenueL(v, b, th, tab);
  const tier = combinedTier(depthTierFor(v, th), depthTierFor(b, th));
  const cells: number[] = [];
  for (let st = 0; st <= 4; st++) {
    const cap = old ? stressCapCurveX100(st, v <= b ? pv : curvePos(b, th), tab) : stressCapX100(st, tier, tab);
    cells.push(cap, targetCeilingX100(graduationOn(true, 64, tier), st, la, lt, dv.dials.lSignalX100, cap));
  }
  const capDepth = r[31] === null ? null : BigInt(r[31] as string);
  const nc = nCapG8Q({ clamp: true, cM: BigInt(r[29] as string), lambdaBps: r[30] as number, tier: 0, capDepth, priceE6: BigInt(r[32] as string), dials: dv.dials });
  const checks: [string, unknown, unknown][] = [
    ["pos", [pv.seg, pv.num, pv.den], r.slice(6, 9)],
    ["lag_pos", [qv.seg, qv.num, qv.den], r.slice(9, 12)],
    ["lag_kappa", kLag.toString(), r[12]],
    ["lag_lambda", lLag.toString(), r[13]],
    ["dials", [dv.dials.lSignalX100, dv.dials.kappaBps, dv.dials.lambdaDepthBps, dv.venueLX100], r.slice(14, 18)],
    ["tier", tier, r[18]],
    ["stress_cap_target", cells, r.slice(19, 29)],
    ["ncap", nc === null ? null : nc.toString(), r[33]],
  ];
  let ok = true;
  for (const [k, got, want] of checks) {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      ok = false;
      bump(k);
      if (firsts.length < 5) firsts.push(`${k}: ${JSON.stringify(got)} vs rust ${JSON.stringify(want)} (line ${cases})`);
    }
  }
  // coverage counters: the lag segment, the leading segment, stress cells strictly between anchors
  bump(`cov_lead_seg_${pv.seg}`);
  bump(`cov_lag_seg_${qv.seg}`);
  if (pv.seg >= 1 && pv.seg <= 3 && pv.num > 0 && pv.num < pv.den) bump("cov_between_anchors");
  if (cells[3]! < 0xffff && cells[3] !== cells[1]) bump("cov_draw_cut");
  if (!ok) bad++;
}
console.log(JSON.stringify({ mode: old ? "3198539a (negative control)" : "sdk", cases, mismatchedCases: bad, byCheck: counts, first: firsts }, null, 1));
process.exit(old ? (bad > 0 ? 0 : 1) : bad === 0 ? 0 : 1);
