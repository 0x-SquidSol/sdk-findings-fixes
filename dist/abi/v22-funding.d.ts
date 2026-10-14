/** Engine `FUNDING_DEN`: the divisor of every `*_e9` rate. */
export declare const FUNDING_DEN_V22 = 1000000000n;
/** Engine `ADL_ONE`: the unscaled value of a side's `a` (`a_long` / `a_short`). */
export declare const ADL_ONE_V22 = 1000000000000000n;
/** Slots per day at 400 ms slots. */
export declare const FUNDING_SLOTS_PER_DAY_V22: bigint;
/** Who pays at the current rate. */
export type FundingPayerV22 = "longs" | "shorts" | "none";
/** One asset's funding state. */
export interface AssetFundingV22 {
    assetIndex: number;
    /** Cumulative mark-to-market index, long side (`k_long`). Equal and opposite to `kShort` while `a == ADL_ONE`. */
    kLong: bigint;
    /** Cumulative mark-to-market index, short side (`k_short`). */
    kShort: bigint;
    /** Cumulative funding index numerator, long side (`f_long_num`). FALLS when longs pay (rate > 0). */
    fLongNum: bigint;
    /** Cumulative funding index numerator, short side (`f_short_num`). RISES when longs pay (rate > 0). */
    fShortNum: bigint;
    /** Epoch of the K/F indices, long side (`kf_epoch_long`). Indices reset when it changes. */
    kfEpochLong: bigint;
    kfEpochShort: bigint;
    /** Side scale factors (`a_long`, `a_short`); {@link ADL_ONE_V22} until a side is shrunk by an ADL. */
    aLong: bigint;
    aShort: bigint;
    /** Last price the funding accrual used (`fund_px_last`, e6). */
    fundPxLast: bigint;
    /** The asset's committed mark (`effective_price`, e6): the premium's INDEX. */
    effectivePriceE6: bigint;
    /** Slot of the asset's last accrual (`slot_last`). */
    slotLast: bigint;
    oiEffLongQ: bigint;
    oiEffShortQ: bigint;
    /** Oracle mode byte (0 manual, 1 hybrid, 2 EWMA mark, 3 auth mark). Funding is computed only for 1 to 3. */
    oracleMode: number;
    /** The mark the premium compares with the index: `funding_mark_e6` (or `mark_ewma_e6` when the checkpoint is 0). */
    fundingMarkE6: bigint;
    /** True when a prospective mark is pending past `slotLast`: the wrapper then derives a counterfactual index, so `rateE9PerSlot` is approximate. */
    pendingMark: boolean;
    /** The vault LP is bound on this asset. */
    vaultLpBound: boolean;
    /** Vault LP signed position (engine Q). Negative = the crowd is net long. */
    lpNetQ: bigint;
    skewSlopeE9: bigint;
    skewMaxE9: bigint;
    /** Premium component, e9 per slot, signed (positive: mark above index, longs pay). */
    premiumRateE9PerSlot: bigint;
    /** Vault-LP skew component, e9 per slot, signed (positive: crowd net long, longs pay). */
    skewRateE9PerSlot: bigint;
    /** The rate the wrapper applies, e9 per slot, signed, clamped to `+-maxAbsFundingE9PerSlot`. Positive: longs pay shorts. */
    rateE9PerSlot: bigint;
    /** `"longs"` when the rate is positive, `"shorts"` when negative, `"none"` at zero. */
    payer: FundingPayerV22;
    /** True when both sides have open interest (the engine applies funding only then). */
    fundingActive: boolean;
}
/** The market's funding config plus every asset's state. */
export interface MarketFundingV22 {
    /** `max_abs_funding_e9_per_slot`: the bound on `|rate|`, e9 of notional per slot. 0 disables funding. */
    maxAbsFundingE9PerSlot: bigint;
    minFundingLifetimeSlots: bigint;
    maxAccrualDtSlots: bigint;
    assets: AssetFundingV22[];
}
/**
 * `policy_v16::premium_funding_rate_e9` (percolator-prog `v16_program.rs:11752`): signed, bounded premium of the mark over the index.
 *
 * @param markE6       Mark (`funding_mark_e6`).
 * @param indexE6      Index (`effective_price`).
 * @param maxAbsRateE9 `max_abs_funding_e9_per_slot`.
 * @returns Signed rate, e9 per slot. Positive when the mark is above the index (longs pay).
 * @example
 * ```ts
 * premiumFundingRateE9V22(110n, 100n, 200_000_000n); // 100_000_000n (10% premium, under the cap); a cap of 20_000_000n gives 20_000_000n
 * ```
 */
export declare function premiumFundingRateE9V22(markE6: bigint, indexE6: bigint, maxAbsRateE9: bigint): bigint;
/**
 * `vault_lp_v18::skew_funding_rate_e9` (percolator-prog `src/vault_lp_v18.rs:247`): the vault-LP skew component.
 * A SHORT vault LP (`lpNetQ < 0`, crowd net long) gives a positive rate (longs pay).
 *
 * @param lpNetQ    Vault LP signed position.
 * @param oiSideQ   `max(oi_eff_long_q, oi_eff_short_q)`.
 * @param slopeE9   `skew_slope_e9`.
 * @param maxE9     `skew_max_e9`.
 * @returns Signed rate, e9 per slot.
 * @example
 * ```ts
 * skewFundingRateE9V22(-500n, 1000n, 100n, 1000n); // 50n
 * ```
 */
export declare function skewFundingRateE9V22(lpNetQ: bigint, oiSideQ: bigint, slopeE9: bigint, maxE9: bigint): bigint;
/**
 * `vault_lp_v18::combine_funding_rate_e9`: premium + skew, clamped to `+-maxAbsE9`.
 *
 * @param premiumE9  Premium component.
 * @param skewE9     Skew component.
 * @param maxAbsE9   `max_abs_funding_e9_per_slot`.
 * @returns The applied rate, e9 per slot.
 * @example
 * ```ts
 * combineFundingRateE9V22(100n, 50n, 111n); // 111n
 * ```
 */
export declare function combineFundingRateE9V22(premiumE9: bigint, skewE9: bigint, maxAbsE9: bigint): bigint;
/**
 * Decode the funding state of every asset of a v2.2 market account.
 *
 * @param marketData  Raw market account bytes (wrapper VERSION 19).
 * @returns Config bound plus per-asset indices, rate components, applied rate and payer.
 * @throws {UnknownLayoutError} If the account is not a v2.2 (VERSION 19) market.
 * @example
 * ```ts
 * const f = decodeMarketFundingV22(info.data);
 * const sol = f.assets[0];
 * // sol.rateE9PerSlot > 0n  =>  longs pay shorts; sol.fLongNum falls and sol.fShortNum rises each accrual.
 * console.log(fundingRatePercentPerDayV22(sol.rateE9PerSlot), "% of notional per day, max", f.maxAbsFundingE9PerSlot);
 * ```
 */
export declare function decodeMarketFundingV22(marketData: Uint8Array): MarketFundingV22;
/**
 * A per-slot e9 funding rate as a percent of notional per day (400 ms slots). Positive: longs pay shorts.
 *
 * @param rateE9PerSlot  Signed rate, e9 per slot.
 * @returns Percent of notional per day, signed.
 * @example
 * ```ts
 * fundingRatePercentPerDayV22(111n); // 2.3976 (%/day)
 * ```
 */
export declare function fundingRatePercentPerDayV22(rateE9PerSlot: bigint): number;
/**
 * Average funding rate that moved a side's `f_*_num` index between two snapshots of the SAME epoch, from the SHORT index
 * (positive delta means longs paid). Inverts `delta = rate_e9 * dt * price_e6 * (a / FUNDING_DEN)`; exact when the price was
 * constant over the interval and `a` is the side's scale, otherwise a price-weighted average (use the mean of `fund_px_last`).
 *
 * @param deltaFShortNum  `f_short_num(after) - f_short_num(before)`.
 * @param dtSlots         Slots between the snapshots (`slot_last` difference).
 * @param priceE6         Price used over the interval (e6).
 * @param aShort          `a_short` (default {@link ADL_ONE_V22}).
 * @returns Average signed rate in e9 per slot (positive: longs paid shorts). Rounds toward zero. 0 when `dtSlots` or `priceE6` is 0.
 * @example
 * ```ts
 * const r = impliedFundingRateE9V22(f1.fShortNum - f0.fShortNum, f1.slotLast - f0.slotLast, f1.effectivePriceE6);
 * ```
 */
export declare function impliedFundingRateE9V22(deltaFShortNum: bigint, dtSlots: bigint, priceE6: bigint, aShort?: bigint): bigint;
