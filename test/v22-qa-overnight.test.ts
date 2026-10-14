/**
 * QA v2.2 SDK fixes (overnight 2026-10-14): EARN-10 (tag 103 account list), STALE-4 / E-19c (tag 39 refusal code),
 * FUND-2..5 (funding decoder), and the plain-text error entries (wrapper 28, 29, 93, 104; stake 29).
 *
 * Fixture test/fixtures/v22-qa-overnight-2026-10-14.json was captured READ-ONLY from devnet (getAccountInfo and
 * simulateTransaction with sigVerify off; nothing sent) against the deployed v2.2 wrapper
 * 6kpg2wi7vwkn7E9rvodXSktYRhna8TWjiZrC1dBek6NM (devnet/v22-fresh-ids f5aaee85). Each block has a negative control.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ACCOUNTS_VAULT_LP_ALLOCATE_P2B,
  ACCOUNTS_VAULT_LP_ALLOCATE_BOND_P2B,
  buildVaultLpAllocateIxP2b,
  isLpVaultRegistryBondP2b,
  isLpVaultRegistryExtP2b,
  deriveBondTrancheV22,
  deriveLpVaultRegistry,
  deriveLpBackingLedger,
  deriveVaultLpExtP2b,
  deriveVaultLpStateP3,
  staleResolveStatusV22,
  buildResolveStalePermissionlessIxV22,
  parseErrorFromLogs,
  getContextualErrorHint,
  PERCOLATOR_ERRORS,
  STAKE_ERRORS,
  PROGRAM_IDS_DEVNET_V22,
  decodeMarketFundingV22,
  premiumFundingRateE9V22,
  skewFundingRateE9V22,
  combineFundingRateE9V22,
  fundingRatePercentPerDayV22,
  impliedFundingRateE9V22,
  ADL_ONE_V22,
} from "../src/index.js";
import type { VaultLpMarketP3 } from "../src/index.js";

interface Sim { label: string; slot: number; err: unknown; logs: string[]; unitsConsumed: number | null; accounts?: number; wireNowSlot?: string }
const FX = JSON.parse(readFileSync(new URL("./fixtures/v22-qa-overnight-2026-10-14.json", import.meta.url), "utf8")) as {
  program: string;
  accounts: Record<"sol" | "chillhouse" | "solRegistry" | "solAtSimSlot", { slot: number; dataBase64: string }>;
  penguPair: { snaps: { slot: number; dataBase64: string }[] };
  tag103: Sim[];
  tag39: Sim[];
  clusterSlotAtTag39: number;
};
const bytes = (b64: string): Uint8Array => new Uint8Array(Buffer.from(b64, "base64"));
const PROG = new PublicKey(FX.program);
const SOL = new PublicKey("BYFuWyuoUGhP1n8wpD8gXH2ciDsegyF1UJCQvBiVx7T5");
const LP = new PublicKey("59N7KL3PPm5jxLqQ4WacLcsae1g5QPq31SZKDLWpxv78");
const CRANKER = new PublicKey("FbTbDeGWQpjrEqJdqoBHX3sTWHoAmU2xywD7wyxH6WC7");
const m: VaultLpMarketP3 = { programId: PROG, market: SOL, registryDomain: 0, lpPortfolio: LP };
const customOf = (err: unknown): number | undefined => {
  const inner = (err as { InstructionError?: [number, unknown] } | null)?.InstructionError?.[1];
  return typeof inner === "object" && inner !== null ? (inner as { Custom?: number }).Custom : undefined;
};

// ============================================================================
// EARN-10: tag 103 needs the bond tranche at [9] on a bond market
// ============================================================================
describe("EARN-10 tag 103 VaultLpAllocate account list (handle_vault_lp_allocate, v16_program.rs:37972-38021)", () => {
  const sim9 = FX.tag103.find((s) => s.accounts === 9)!;
  const sim10 = FX.tag103.find((s) => s.accounts === 10)!;
  it("devnet evidence: 9 accounts on the SOL bond market -> NotEnoughAccountKeys; 10 accounts (bond tranche [9]) simulates clean", () => {
    expect(sim9.err).toEqual({ InstructionError: [1, "NotEnoughAccountKeys"] });
    expect(sim9.logs.at(-1)).toMatch(/insufficient account keys/);
    expect(sim10.err).toBeNull();
    expect(sim10.logs.join("\n")).toMatch(/p2b_allocate moved=\d+/);
  });
  it("the SOL registry has the ext flag (byte 161) and the bond flag (byte 162) set: that is why [9] is required", () => {
    const reg = bytes(FX.accounts.solRegistry.dataBase64);
    expect(isLpVaultRegistryExtP2b(reg)).toBe(true);
    expect(isLpVaultRegistryBondP2b(reg)).toBe(true);
  });
  it("bond flag decoder: clear -> false; a byte other than 0|1 or a short buffer throws", () => {
    const reg = bytes(FX.accounts.solRegistry.dataBase64).slice();
    reg[162] = 0;
    expect(isLpVaultRegistryBondP2b(reg)).toBe(false);
    reg[162] = 2;
    expect(() => isLpVaultRegistryBondP2b(reg)).toThrow(/0\|1/);
    expect(() => isLpVaultRegistryBondP2b(new Uint8Array(100))).toThrow(/too short/);
  });
  it("pins the account list: 9 + bond tranche = 10, names and flags in handler order", () => {
    expect(ACCOUNTS_VAULT_LP_ALLOCATE_P2B.map((a) => a.name)).toEqual(["cranker", "market", "registry", "vaultLpState", "lpPortfolio", "ledger", "siblingLedger", "vaultLpExt", "systemProgram"]);
    expect(ACCOUNTS_VAULT_LP_ALLOCATE_BOND_P2B.map((a) => a.name)).toEqual([...ACCOUNTS_VAULT_LP_ALLOCATE_P2B.map((a) => a.name), "bondTranche"]);
    expect(ACCOUNTS_VAULT_LP_ALLOCATE_BOND_P2B).toHaveLength(10);
    expect(ACCOUNTS_VAULT_LP_ALLOCATE_BOND_P2B[9]).toEqual({ name: "bondTranche", signer: false, writable: false });
  });
  it("builder with bondTranche emits exactly the 10 keys the simulated transaction used; default stays 9", () => {
    const bond = buildVaultLpAllocateIxP2b(m, CRANKER, (1n << 128n) - 1n, { bondTranche: true });
    const base = buildVaultLpAllocateIxP2b(m, CRANKER);
    expect(base.keys).toHaveLength(9);
    expect(bond.keys).toHaveLength(10);
    expect(bond.keys.slice(0, 9)).toEqual(base.keys);
    const tranche = deriveBondTrancheV22(PROG, SOL)[0];
    expect(tranche.toBase58()).toBe("6CpFCVxSZyPNEnaMcXT8yhvmSbzzuVtnQKwwuJWpH3QM"); // the PDA simulated on devnet
    expect(bond.keys[9]).toEqual({ pubkey: tranche, isSigner: false, isWritable: false });
    expect(bond.keys.map((k) => k.pubkey.toBase58())).toEqual([
      CRANKER, SOL, deriveLpVaultRegistry(PROG, SOL)[0], deriveVaultLpStateP3(PROG, SOL)[0], LP,
      deriveLpBackingLedger(PROG, SOL, 0)[0], deriveLpBackingLedger(PROG, SOL, 1)[0], deriveVaultLpExtP2b(PROG, SOL)[0], SystemProgram.programId, tranche,
    ].map((k) => k.toBase58()));
    expect(Buffer.from(bond.data).toString("hex")).toBe("67" + "ff".repeat(16));
  });
  it("negative control: the 9-key shape is what the program refused with NotEnoughAccountKeys on the bond market", () => {
    expect(buildVaultLpAllocateIxP2b(m, CRANKER).keys).toHaveLength(9);
    expect(sim9.accounts).toBe(9);
    expect(sim9.err).not.toBeNull();
  });
});

// ============================================================================
// STALE-4 / E-19c: tag 39 ignores the wire now_slot; a past or zero value gives 27, not 19
// ============================================================================
describe("STALE-4 / E-19c tag 39 refusal code (handle_resolve_stale_permissionless, v16_program.rs:26833-26857)", () => {
  const solData = bytes(FX.accounts.solAtSimSlot.dataBase64);
  const cluster = BigInt(FX.clusterSlotAtTag39);
  it("devnet: now_slot 0, 1, past, current and far-future ALL return Custom 27 on the not-yet-matured SOL market", () => {
    expect(FX.tag39).toHaveLength(5);
    for (const s of FX.tag39) expect(customOf(s.err), s.label).toBe(27);
  });
  it("the SDK predicts 27 for every wire now_slot (it is ignored; the cluster slot decides)", () => {
    for (const s of FX.tag39) {
      const st = staleResolveStatusV22(solData, cluster, BigInt(s.wireNowSlot!));
      expect(st.refusalCode, s.label).toBe(27);
      expect(st.canResolve).toBe(false);
      expect(customOf(s.err)).toBe(st.refusalCode);
      expect(st.evaluatedAtSlot).toBe(cluster);
      expect(st.wireNowSlot).toBe(BigInt(s.wireNowSlot!));
      expect(st.wireNowSlotIgnored).toBe(BigInt(s.wireNowSlot!) !== cluster);
    }
    // far-future wire value: not resolvable early (the old prediction said canResolve: true here)
    const far = FX.tag39.find((s) => s.label.includes("future"))!;
    expect(staleResolveStatusV22(solData, cluster, BigInt(far.wireNowSlot!)).canResolve).toBe(false);
  });
  it("19 is reachable only when the CLUSTER clock is behind the market's recorded slot, not through the wire value", () => {
    const behind = staleResolveStatusV22(solData, 1n);
    expect(behind.refusalCode).toBe(19);
    expect(getContextualErrorHint(19, { action: "resolve" })).toMatch(/network clock is behind/);
    expect(getContextualErrorHint(19, { action: "other" })).toBe(PERCOLATOR_ERRORS[19]!.hint);
  });
  it("the 27 log decodes to OracleStale with the slots-remaining hint", () => {
    const s = FX.tag39[0]!;
    const st = staleResolveStatusV22(solData, cluster, 0n);
    const p = parseErrorFromLogs(s.logs, { context: { action: "resolve", staleSlotsRemaining: st.slotsRemaining } })!;
    expect(p).toMatchObject({ program: "wrapper", code: 27, name: "OracleStale" });
  });
  it("negative control: treating the wire value as the slot (the old reading) predicts 19 for 0 / past, which the program never returns", () => {
    for (const lab of ["zero", "one", "past"]) {
      const s = FX.tag39.find((x) => x.label.includes(lab))!;
      const old = staleResolveStatusV22(solData, BigInt(s.wireNowSlot!));
      expect(old.refusalCode, s.label).toBe(19);
      expect(customOf(s.err), s.label).toBe(27);
    }
    expect(buildResolveStalePermissionlessIxV22(PROG, SOL, 0n).data).toHaveLength(9);
  });
});

// ============================================================================
// FUND-2..5: funding decoder
// ============================================================================
describe("FUND-2..5 decodeMarketFundingV22 on real devnet accounts", () => {
  const sol = decodeMarketFundingV22(bytes(FX.accounts.sol.dataBase64));
  it("config: max_abs_funding_e9_per_slot, min_funding_lifetime_slots, max_accrual_dt_slots", () => {
    expect(sol.maxAbsFundingE9PerSlot).toBe(111n);
    expect(sol.minFundingLifetimeSlots).toBe(500n);
    expect(sol.maxAccrualDtSlots).toBe(500n);
    expect(sol.assets).toHaveLength(1);
  });
  it("SOL asset 0: pinned indices, scale, price and mode (real bytes)", () => {
    const a = sol.assets[0]!;
    expect(a).toMatchObject({
      assetIndex: 0, aLong: ADL_ONE_V22, aShort: ADL_ONE_V22, oracleMode: 3, vaultLpBound: true,
      kLong: -2864624000000000000000n, kShort: 2864624000000000000000n,
      fLongNum: -5764666333695000000n, fShortNum: 5764666333695000000n,
      effectivePriceE6: 107104183n, fundPxLast: 107104183n, slotLast: 510877209n, fundingMarkE6: 107104183n,
      oiEffLongQ: 1370584n, oiEffShortQ: 1370584n,
    });
    // balanced, mark == index, no skew: no funding right now
    expect(a).toMatchObject({ rateE9PerSlot: 0n, premiumRateE9PerSlot: 0n, skewRateE9PerSlot: 0n, payer: "none", fundingActive: true });
  });
  it("FUND-3: |rate| <= max_abs on every real market in the fixture; CHILLHOUSE (lot market) decodes with zero OI", () => {
    const ch = decodeMarketFundingV22(bytes(FX.accounts.chillhouse.dataBase64));
    expect(ch.maxAbsFundingE9PerSlot).toBe(111n);
    expect(ch.assets[0]).toMatchObject({ fundingActive: false, fLongNum: -173985247088061000000n, fShortNum: 173985247088061000000n });
    for (const d of [sol, ch]) for (const a of d.assets) expect(a.rateE9PerSlot >= -d.maxAbsFundingE9PerSlot && a.rateE9PerSlot <= d.maxAbsFundingE9PerSlot).toBe(true);
  });
  const [s0, s1] = FX.penguPair.snaps.map((s) => decodeMarketFundingV22(bytes(s.dataBase64)).assets[0]!);
  it("FUND-2 sign: vault LP net SHORT (crowd long) -> positive rate, longs pay, long index falls, short index rises", () => {
    expect(s0!.lpNetQ).toBeLessThan(0n);
    expect(s0).toMatchObject({ skewRateE9PerSlot: 55n, premiumRateE9PerSlot: 0n, rateE9PerSlot: 55n, payer: "longs" });
    expect(s1!.fShortNum).toBeGreaterThan(s0!.fShortNum);
    expect(s1!.fLongNum).toBeLessThan(s0!.fLongNum);
  });
  it("FUND-4 zero-sum: the long index moves by exactly minus the short index (a == ADL_ONE); K does not move", () => {
    const dS = s1!.fShortNum - s0!.fShortNum;
    const dL = s1!.fLongNum - s0!.fLongNum;
    expect(dS).toBe(1526776463080000000n);
    expect(dL + dS).toBe(0n);
    expect(s1!.kLong - s0!.kLong).toBe(0n);
  });
  it("FUND-2 units: the observed index delta implies exactly the decoded rate (55 e9/slot) over 356 slots", () => {
    const dt = s1!.slotLast - s0!.slotLast;
    expect(dt).toBe(356n);
    expect(impliedFundingRateE9V22(s1!.fShortNum - s0!.fShortNum, dt, s1!.effectivePriceE6)).toBe(s0!.rateE9PerSlot);
    expect(fundingRatePercentPerDayV22(111n)).toBeCloseTo(2.3976, 4);
  });
  it("rate components mirror the program: premium sign and cap, skew sign and cap, combined clamp", () => {
    expect(premiumFundingRateE9V22(110n, 100n, 200_000_000n)).toBe(100_000_000n);
    expect(premiumFundingRateE9V22(110n, 100n, 20_000_000n)).toBe(20_000_000n);
    expect(premiumFundingRateE9V22(110n, 100n, 111n)).toBe(111n);
    expect(premiumFundingRateE9V22(90n, 100n, 111n)).toBe(-111n);
    expect(premiumFundingRateE9V22(100n, 100n, 111n)).toBe(0n);
    expect(skewFundingRateE9V22(-500n, 1000n, 100n, 1000n)).toBe(50n);
    expect(skewFundingRateE9V22(500n, 1000n, 100n, 1000n)).toBe(-50n);
    expect(skewFundingRateE9V22(-5000n, 1000n, 100n, 1000n)).toBe(100n);
    expect(combineFundingRateE9V22(100n, 50n, 111n)).toBe(111n);
    expect(combineFundingRateE9V22(-100n, -50n, 111n)).toBe(-111n);
  });
  it("negative control: a v2.1 (VERSION 18) market is refused, not misread", () => {
    const v21 = bytes(FX.accounts.sol.dataBase64).slice();
    v21[8] = 18;
    v21[9] = 0;
    expect(() => decodeMarketFundingV22(v21)).toThrow();
    expect(() => decodeMarketFundingV22(new Uint8Array(50))).toThrow();
  });
});

// ============================================================================
// Error table: plain text for wrapper 28, 29, 93, one string for 104, stake 29
// ============================================================================
const JARGON = /growth-v19|N_cap|lambda|IMR|conf_filter|feed ID|h-lock|dead-share|N7|MINIMUM_LIQUIDITY|AccrueFees|PriceUpdateV2|Pyth|bps|u == 1|_e9/;
describe("error table: plain user text for wrapper 28, 29, 93 and stake 29", () => {
  it("wrapper 28 / 29 / 93 keep their on-chain names and carry one plain sentence group, no jargon", () => {
    expect(PERCOLATOR_ERRORS[28]).toMatchObject({ name: "OracleConfTooWide" });
    expect(PERCOLATOR_ERRORS[29]).toMatchObject({ name: "InvalidOracleKey" });
    expect(PERCOLATOR_ERRORS[93]).toMatchObject({ name: "GrowthCapacityFull" });
    for (const c of [28, 29, 93]) {
      const h = PERCOLATOR_ERRORS[c]!.hint;
      expect(h, `code ${c}`).not.toMatch(JARGON);
      expect(h.length, `code ${c}`).toBeLessThan(260);
      expect(h).toMatch(/^[A-Z]/);
    }
    expect(PERCOLATOR_ERRORS[28]!.hint).toMatch(/too uncertain/);
    expect(PERCOLATOR_ERRORS[29]!.hint).toMatch(/not the one this market uses/);
    expect(PERCOLATOR_ERRORS[93]!.hint).toMatch(/^New positions on this side are paused: the market's capacity is full\. Reducing or closing your position is always allowed\./);
  });
  it("93 decodes from a real-shaped wrapper log line", () => {
    const p = parseErrorFromLogs([`Program ${PROGRAM_IDS_DEVNET_V22.percolator} failed: custom program error: 0x5d`])!;
    expect(p).toMatchObject({ program: "wrapper", code: 93, name: "GrowthCapacityFull" });
    expect(p.hint).toBe(PERCOLATOR_ERRORS[93]!.hint);
  });
  it("stake 29 (NoRealLpHolders) decodes with the stake table and a plain line", () => {
    const p = parseErrorFromLogs([`Program ${PROGRAM_IDS_DEVNET_V22.vault} failed: custom program error: 0x1d`])!;
    expect(p).toMatchObject({ program: "stake", code: 29, name: "NoRealLpHolders" });
    expect(p.hint).toMatch(/^No real LP holders yet: nobody has staked in this pool/);
    expect(p.hint).not.toMatch(JARGON);
    expect(STAKE_ERRORS[29]).toBe(p.hint);
  });
  it("negative control: the same code 29 from the WRAPPER is InvalidOracleKey, not the stake text", () => {
    const p = parseErrorFromLogs([`Program ${PROGRAM_IDS_DEVNET_V22.percolator} failed: custom program error: 0x1d`])!;
    expect(p).toMatchObject({ program: "wrapper", name: "InvalidOracleKey" });
    expect(p.hint).not.toMatch(/staked/);
  });
});

describe("error 104 has one canonical message", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : f.endsWith(".ts") ? [join(dir, f)] : []));
  const srcDir = new URL("../src", import.meta.url).pathname;
  it("PERCOLATOR_ERRORS[104] is the only place its user text lives in src/", () => {
    const hint = PERCOLATOR_ERRORS[104]!.hint;
    expect(PERCOLATOR_ERRORS[104]!.name).toBe("PriceBandPinned");
    const needle = hint.slice(0, 40);
    const hits = walk(srcDir).filter((f) => readFileSync(f, "utf8").includes(needle));
    expect(hits.map((f) => f.slice(srcDir.length))).toEqual(["/abi/errors.ts"]);
    // and the file holds it once
    expect(readFileSync(join(srcDir, "abi/errors.ts"), "utf8").split(needle).length - 1).toBe(1);
  });
  it("every route to 104's text returns that one string", () => {
    const hint = PERCOLATOR_ERRORS[104]!.hint;
    expect(getContextualErrorHint(104)).toBe(hint);
    expect(getContextualErrorHint(104, { action: "trade" })).toBe(hint);
    expect(parseErrorFromLogs([`Program ${PROGRAM_IDS_DEVNET_V22.percolator} failed: custom program error: 0x68`])!.hint).toBe(hint);
  });
  it("negative control: the Rust-doc wording (\"resumes in a few seconds\") is not in the table", () => {
    expect(PERCOLATOR_ERRORS[104]!.hint).not.toMatch(/few seconds|catching up; this action/i);
  });
});
