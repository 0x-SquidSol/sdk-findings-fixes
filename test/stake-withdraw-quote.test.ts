/**
 * quoteStakeWithdrawNowV5 against the E2E-A FCAFL recorded numbers (2026-10-17 steps 62-64): liquid 10.96M, deployed 5.48M after the
 * 30.48M loss (units 10.96M -> 5.48M), full redeem 16,439,178 refused Custom 36, a 10M LP partial paid 8.22M.
 */
import { describe, it, expect } from "vitest";
import { quoteStakeWithdrawNowV5, collateralForLpV5 } from "../src/abi/v22-stake.js";

const pool = { totalDeposited: 21_920_000n, totalWithdrawn: 0n, totalFlushed: 10_960_000n, totalReturned: 0n, totalFeesEarned: 0n, realizedJuniorLoss: 0n, totalLpSupply: 20_000_000n };
const units = { unitsStake: 10_960_000n, unitsTotal: 65_280_000n }; // 10.96M of 65.28M units; insurance 36.30M -> 6.09M? pinned below via exitInsurance
describe("quoteStakeWithdrawNowV5", () => {
  // exit reading chosen so deployed = 5.48M exactly: 10.96M * ins / 65.28M = 5.48M -> ins = 32.64M
  const ins = 32_640_000n;
  it("cap binds after a loss: max now = liquid, rest deferred; the quoted LP burn fits the cap and +1 LP does not", () => {
    const q = quoteStakeWithdrawNowV5(pool, units, ins, 10_960_000n, 20_000_000n)!;
    expect(q.liquidCap).toBe(10_960_000n);
    expect(q.redeemable).toBeGreaterThan(q.liquidCap);
    expect(q.capBinds).toBe(true);
    expect(q.maxCollateralNow).toBe(10_960_000n);
    expect(q.deferred).toBe(q.redeemable - 10_960_000n);
    const pv = 10_960_000n + 5_480_000n;
    expect(collateralForLpV5(q.maxLpNow, pool.totalLpSupply, pv)! <= q.liquidCap).toBe(true);
    expect(collateralForLpV5(q.maxLpNow + 1n, pool.totalLpSupply, pv)! > q.liquidCap).toBe(true);
    // the recorded partial: 10M LP paid 8.22M (<= liquid), so it is within maxLpNow
    expect(collateralForLpV5(10_000_000n, pool.totalLpSupply, pv)).toBe(8_220_000n);
    expect(q.maxLpNow >= 10_000_000n).toBe(true);
  });
  it("no loss: cap does not bind, max = balance", () => {
    const q = quoteStakeWithdrawNowV5({ ...pool, totalFlushed: 0n }, { unitsStake: 0n, unitsTotal: 0n }, 0n, 21_920_000n, 5_000_000n)!;
    expect(q.capBinds).toBe(false);
    expect(q.maxLpNow).toBe(5_000_000n);
    expect(q.deferred).toBe(0n);
  });
  it("vault balance below liquid also caps; empty supply is null", () => {
    expect(quoteStakeWithdrawNowV5({ ...pool, totalFlushed: 0n }, { unitsStake: 0n, unitsTotal: 0n }, 0n, 1_000_000n, 20_000_000n)!.liquidCap).toBe(1_000_000n);
    expect(quoteStakeWithdrawNowV5({ ...pool, totalLpSupply: 0n }, units, ins, 1n, 1n)).toBeNull();
  });
});
