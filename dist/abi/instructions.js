import { encU8, encU16, encU32, encU64, encI64, encU128, encI128, encPubkey, concatBytes, } from "./encode.js";
/**
 * Oracle price constraints.
 * Maximum oracle price that can be pushed to the on-chain oracle authority.
 */
export const MAX_ORACLE_PRICE = 1000000000000n; // 1 trillion e6 = 1M USD/unit
/**
 * Instruction tags - exact match to Rust ix::Instruction::decode
 */
export const IX_TAG = {
    InitMarket: 0,
    InitUser: 1,
    InitLP: 2,
    DepositCollateral: 3,
    WithdrawCollateral: 4,
    KeeperCrank: 5,
    TradeNoCpi: 6,
    LiquidateAtOracle: 7,
    CloseAccount: 8,
    TopUpInsurance: 9,
    TradeCpi: 10,
    SetRiskThreshold: 11,
    UpdateAdmin: 12,
    CloseSlab: 13,
    UpdateConfig: 14,
    SetMaintenanceFee: 15,
    SetOracleAuthority: 16,
    PushOraclePrice: 17,
    SetOraclePriceCap: 18,
    ResolveMarket: 19,
    WithdrawInsurance: 20,
    AdminForceClose: 21,
    UpdateRiskParams: 22,
    RenounceAdmin: 23,
    CreateInsuranceMint: 24,
    DepositInsuranceLP: 25,
    WithdrawInsuranceLP: 26,
    PauseMarket: 27,
    UnpauseMarket: 28,
    AcceptAdmin: 29,
    SetInsuranceWithdrawPolicy: 30,
    WithdrawInsuranceLimited: 31,
    SetPythOracle: 32,
    UpdateMarkPrice: 33,
    UpdateHyperpMark: 34,
    TradeCpiV2: 35,
    UnresolveMarket: 36,
    CreateLpVault: 37,
    LpVaultDeposit: 38,
    LpVaultWithdraw: 39,
    LpVaultCrankFees: 40,
    /** PERC-306: Fund per-market isolated insurance balance */
    FundMarketInsurance: 41,
    /** PERC-306: Set insurance isolation BPS for a market */
    SetInsuranceIsolation: 42,
    // Tag 43 is ChallengeSettlement on-chain (PERC-314).
    // PERC-305 (ExecuteAdl) is NOT implemented on-chain — do NOT assign tag 43 here.
    // When PERC-305 is implemented, assign a new unused tag (≥47).
    /** PERC-314: Challenge settlement price during dispute window */
    ChallengeSettlement: 43,
    /** PERC-314: Resolve dispute (admin adjudication) */
    ResolveDispute: 44,
    /** PERC-315: Deposit LP vault tokens as perp collateral */
    DepositLpCollateral: 45,
    /** PERC-315: Withdraw LP collateral (position must be closed) */
    WithdrawLpCollateral: 46,
    /** PERC-309: Queue a large LP withdrawal (user; creates withdraw_queue PDA). */
    QueueWithdrawal: 47,
    /** PERC-309: Claim one epoch tranche from a queued LP withdrawal (user). */
    ClaimQueuedWithdrawal: 48,
    /** PERC-309: Cancel a queued withdrawal, refund remaining LP tokens (user). */
    CancelQueuedWithdrawal: 49,
    /** PERC-305: Auto-deleverage — surgically close profitable positions when PnL cap is exceeded (permissionless). */
    ExecuteAdl: 50,
    /** Close a stale slab of an invalid/old layout and recover rent SOL (admin only). */
    CloseStaleSlabs: 51,
    /** Reclaim rent from an uninitialised slab whose market creation failed mid-flow. Slab must sign. */
    ReclaimSlabRent: 52,
    /** Permissionless on-chain audit crank: verifies conservation invariants and pauses market on violation. */
    AuditCrank: 53,
    /** Cross-Market Portfolio Margining: SetOffsetPair */
    SetOffsetPair: 54,
    /** Cross-Market Portfolio Margining: AttestCrossMargin */
    AttestCrossMargin: 55,
    /** PERC-622: Advance oracle phase (permissionless crank) */
    AdvanceOraclePhase: 56,
    /** PERC-623: Top up a market's keeper fund (permissionless) */
    TopUpKeeperFund: 57,
    /** PERC-629: Slash a market creator's deposit (permissionless) */
    SlashCreationDeposit: 58,
    /** PERC-628: Initialize the global shared vault (admin) */
    InitSharedVault: 59,
    /** PERC-628: Allocate virtual liquidity to a market (admin) */
    AllocateMarket: 60,
    /** PERC-628: Queue a withdrawal for the current epoch */
    QueueWithdrawalSV: 61,
    /** PERC-628: Claim a queued withdrawal after epoch elapses */
    ClaimEpochWithdrawal: 62,
    /** PERC-628: Advance the shared vault epoch (permissionless crank) */
    AdvanceEpoch: 63,
    /** PERC-608: Mint a Position NFT for a user's open position. */
    MintPositionNft: 64,
    /** PERC-608: Transfer position ownership via the NFT (keeper-gated). */
    TransferPositionOwnership: 65,
    /** PERC-608: Burn the Position NFT when a position is closed. */
    BurnPositionNft: 66,
    /** PERC-608: Keeper sets pending_settlement flag before a funding transfer. */
    SetPendingSettlement: 67,
    /** PERC-608: Keeper clears pending_settlement flag after KeeperCrank. */
    ClearPendingSettlement: 68,
    /** PERC-608: Internal CPI call from percolator-nft TransferHook to update on-chain owner. */
    TransferOwnershipCpi: 69,
    /** PERC-8111: Set per-wallet position cap (admin only, cap_e6=0 disables). */
    SetWalletCap: 70,
    /** PERC-8110: Set OI imbalance hard-block threshold (admin only). */
    SetOiImbalanceHardBlock: 71,
};
Object.freeze(IX_TAG);
/**
 * Encode a Pyth feed ID (hex string) to 32-byte Uint8Array.
 */
const HEX_RE = /^[0-9a-fA-F]{64}$/;
function encodeFeedId(feedId) {
    const hex = feedId.startsWith("0x") ? feedId.slice(2) : feedId;
    if (!HEX_RE.test(hex)) {
        throw new Error(`Invalid feed ID: expected 64 hex chars, got "${hex.length === 64 ? "non-hex characters" : hex.length + " chars"}"`);
    }
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 64; i += 2) {
        const byte = parseInt(hex.substring(i, i + 2), 16);
        if (Number.isNaN(byte)) {
            throw new Error(`Failed to parse hex byte at position ${i}: "${hex.substring(i, i + 2)}"`);
        }
        bytes[i / 2] = byte;
    }
    return bytes;
}
const INIT_MARKET_DATA_LEN = 264;
export function encodeInitMarket(args) {
    const data = concatBytes(encU8(IX_TAG.InitMarket), encPubkey(args.admin), encPubkey(args.collateralMint), encodeFeedId(args.indexFeedId), encU64(args.maxStalenessSecs), encU16(args.confFilterBps), encU8(args.invert), encU32(args.unitScale), encU64(args.initialMarkPriceE6), encU64(args.warmupPeriodSlots), encU64(args.maintenanceMarginBps), encU64(args.initialMarginBps), encU64(args.tradingFeeBps), encU64(args.maxAccounts), encU128(args.newAccountFee), encU128(args.riskReductionThreshold), encU128(args.maintenanceFeePerSlot), encU64(args.maxCrankStalenessSlots), encU64(args.liquidationFeeBps), encU128(args.liquidationFeeCap), encU64(args.liquidationBufferBps), encU128(args.minLiquidationAbs));
    if (data.length !== INIT_MARKET_DATA_LEN) {
        throw new Error(`encodeInitMarket: expected ${INIT_MARKET_DATA_LEN} bytes, got ${data.length}`);
    }
    return data;
}
export function encodeInitUser(args) {
    return concatBytes(encU8(IX_TAG.InitUser), encU64(args.feePayment));
}
export function encodeInitLP(args) {
    return concatBytes(encU8(IX_TAG.InitLP), encPubkey(args.matcherProgram), encPubkey(args.matcherContext), encU64(args.feePayment));
}
export function encodeDepositCollateral(args) {
    return concatBytes(encU8(IX_TAG.DepositCollateral), encU16(args.userIdx), encU64(args.amount));
}
export function encodeWithdrawCollateral(args) {
    return concatBytes(encU8(IX_TAG.WithdrawCollateral), encU16(args.userIdx), encU64(args.amount));
}
export function encodeKeeperCrank(args) {
    return concatBytes(encU8(IX_TAG.KeeperCrank), encU16(args.callerIdx), encU8(args.allowPanic ? 1 : 0));
}
export function encodeTradeNoCpi(args) {
    return concatBytes(encU8(IX_TAG.TradeNoCpi), encU16(args.lpIdx), encU16(args.userIdx), encI128(args.size));
}
export function encodeLiquidateAtOracle(args) {
    return concatBytes(encU8(IX_TAG.LiquidateAtOracle), encU16(args.targetIdx));
}
export function encodeCloseAccount(args) {
    return concatBytes(encU8(IX_TAG.CloseAccount), encU16(args.userIdx));
}
export function encodeTopUpInsurance(args) {
    return concatBytes(encU8(IX_TAG.TopUpInsurance), encU64(args.amount));
}
export function encodeTradeCpi(args) {
    return concatBytes(encU8(IX_TAG.TradeCpi), encU16(args.lpIdx), encU16(args.userIdx), encI128(args.size));
}
export function encodeTradeCpiV2(args) {
    return concatBytes(encU8(IX_TAG.TradeCpiV2), encU16(args.lpIdx), encU16(args.userIdx), encI128(args.size), encU8(args.bump));
}
export function encodeSetRiskThreshold(args) {
    return concatBytes(encU8(IX_TAG.SetRiskThreshold), encU128(args.newThreshold));
}
export function encodeUpdateAdmin(args) {
    return concatBytes(encU8(IX_TAG.UpdateAdmin), encPubkey(args.newAdmin));
}
/**
 * CloseSlab instruction data (1 byte)
 */
export function encodeCloseSlab() {
    return encU8(IX_TAG.CloseSlab);
}
export function encodeUpdateConfig(args) {
    return concatBytes(encU8(IX_TAG.UpdateConfig), encU64(args.fundingHorizonSlots), encU64(args.fundingKBps), encU128(args.fundingInvScaleNotionalE6), encI64(args.fundingMaxPremiumBps), // Rust: i64 (can be negative)
    encI64(args.fundingMaxBpsPerSlot), // Rust: i64 (can be negative)
    encU128(args.threshFloor), encU64(args.threshRiskBps), encU64(args.threshUpdateIntervalSlots), encU64(args.threshStepBps), encU64(args.threshAlphaBps), encU128(args.threshMin), encU128(args.threshMax), encU128(args.threshMinStep));
}
export function encodeSetMaintenanceFee(args) {
    return concatBytes(encU8(IX_TAG.SetMaintenanceFee), encU128(args.newFee));
}
export function encodeSetOracleAuthority(args) {
    return concatBytes(encU8(IX_TAG.SetOracleAuthority), encPubkey(args.newAuthority));
}
/**
 * Encode PushOraclePrice instruction data with validation.
 *
 * Validates oracle price constraints:
 * - Price cannot be zero (division by zero in on-chain engine)
 * - Price cannot exceed MAX_ORACLE_PRICE (prevents overflow in price math)
 *
 * @param args - PushOraclePrice arguments
 * @returns Encoded instruction data (17 bytes)
 * @throws Error if price is 0 or exceeds MAX_ORACLE_PRICE
 */
export function encodePushOraclePrice(args) {
    const price = typeof args.priceE6 === "string" ? BigInt(args.priceE6) : args.priceE6;
    if (price === 0n) {
        throw new Error("encodePushOraclePrice: price cannot be zero (division by zero in engine)");
    }
    if (price > MAX_ORACLE_PRICE) {
        throw new Error(`encodePushOraclePrice: price exceeds maximum (${MAX_ORACLE_PRICE}), got ${price}`);
    }
    return concatBytes(encU8(IX_TAG.PushOraclePrice), encU64(price), encI64(args.timestamp));
}
export function encodeSetOraclePriceCap(args) {
    return concatBytes(encU8(IX_TAG.SetOraclePriceCap), encU64(args.maxChangeE2bps));
}
/**
 * ResolveMarket instruction data (1 byte)
 * Resolves a binary/premarket - sets RESOLVED flag, positions force-closed via crank.
 * Requires admin oracle price (authority_price_e6) to be set first.
 */
export function encodeResolveMarket() {
    return encU8(IX_TAG.ResolveMarket);
}
/**
 * WithdrawInsurance instruction data (1 byte)
 * Withdraw insurance fund to admin (requires RESOLVED and all positions closed).
 */
export function encodeWithdrawInsurance() {
    return encU8(IX_TAG.WithdrawInsurance);
}
export function encodeAdminForceClose(args) {
    return concatBytes(encU8(IX_TAG.AdminForceClose), encU16(args.targetIdx));
}
export function encodeUpdateRiskParams(args) {
    const parts = [
        encU8(IX_TAG.UpdateRiskParams),
        encU64(args.initialMarginBps),
        encU64(args.maintenanceMarginBps),
    ];
    if (args.tradingFeeBps !== undefined) {
        parts.push(encU64(args.tradingFeeBps));
    }
    return concatBytes(...parts);
}
/**
 * On-chain confirmation code for RenounceAdmin (must match program constant).
 * ASCII "RENOUNCE" as u64 LE = 0x52454E4F554E4345.
 */
export const RENOUNCE_ADMIN_CONFIRMATION = 0x52454e4f554e4345n;
/**
 * On-chain confirmation code for UnresolveMarket (must match program constant).
 */
export const UNRESOLVE_CONFIRMATION = 0xdeadbeefcafe1234n;
/**
 * RenounceAdmin instruction data (9 bytes)
 * Irreversibly set admin to all zeros. After this, all admin-only instructions fail.
 *
 * Requires the confirmation code 0x52454E4F554E4345 ("RENOUNCE" as u64 LE)
 * to prevent accidental invocation.
 */
export function encodeRenounceAdmin() {
    return concatBytes(encU8(IX_TAG.RenounceAdmin), encU64(RENOUNCE_ADMIN_CONFIRMATION));
}
/**
 * CreateInsuranceMint instruction data (1 byte)
 * Creates the SPL mint PDA for insurance LP tokens. Admin only, once per market.
 */
export function encodeCreateInsuranceMint() {
    return encU8(IX_TAG.CreateInsuranceMint);
}
export function encodeDepositInsuranceLP(args) {
    return concatBytes(encU8(IX_TAG.DepositInsuranceLP), encU64(args.amount));
}
export function encodeWithdrawInsuranceLP(args) {
    return concatBytes(encU8(IX_TAG.WithdrawInsuranceLP), encU64(args.lpAmount));
}
export function encodeLpVaultWithdraw(args) {
    return concatBytes(encU8(IX_TAG.LpVaultWithdraw), encU64(args.lpAmount));
}
/**
 * PauseMarket instruction data (1 byte)
 * Pauses the market — disables trading, deposits, and withdrawals.
 */
export function encodePauseMarket() {
    return encU8(IX_TAG.PauseMarket);
}
/**
 * UnpauseMarket instruction data (1 byte)
 * Unpauses the market — re-enables trading, deposits, and withdrawals.
 */
export function encodeUnpauseMarket() {
    return encU8(IX_TAG.UnpauseMarket);
}
export function encodeSetPythOracle(args) {
    if (args.feedId.length !== 32)
        throw new Error('feedId must be 32 bytes');
    if (args.maxStalenessSecs <= 0n)
        throw new Error('maxStalenessSecs must be > 0');
    const buf = new Uint8Array(43);
    const dv = new DataView(buf.buffer);
    // Tag 32 (SetPythOracle)
    buf[0] = 32;
    buf.set(args.feedId, 1);
    dv.setBigUint64(33, args.maxStalenessSecs, /* little-endian */ true);
    dv.setUint16(41, args.confFilterBps, true);
    return buf;
}
/**
 * Derive the expected Pyth PriceUpdateV2 account address for a given feed ID.
 * Uses PDA seeds: [shard_id(2), feed_id(32)] under the Pyth Receiver program.
 *
 * @param feedId  32-byte Pyth feed ID
 * @param shardId Shard index (default 0 for mainnet/devnet)
 */
export const PYTH_RECEIVER_PROGRAM_ID = 'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ';
export async function derivePythPriceUpdateAccount(feedId, shardId = 0) {
    const { PublicKey } = await import('@solana/web3.js');
    const shardBuf = new Uint8Array(2);
    new DataView(shardBuf.buffer).setUint16(0, shardId, true);
    const [pda] = PublicKey.findProgramAddressSync([shardBuf, feedId], new PublicKey(PYTH_RECEIVER_PROGRAM_ID));
    return pda.toBase58();
}
// SetPythOracle tag (32) is already defined in IX_TAG above.
// PERC-118: Mark Price EMA Instructions
// ============================================================================
// Tag 33 — permissionless mark price EMA crank (defined in IX_TAG above).
/**
 * UpdateMarkPrice (Tag 33) — permissionless EMA mark price crank.
 *
 * Reads the current oracle price on-chain, applies 8-hour EMA smoothing
 * with circuit breaker, and writes result to authority_price_e6.
 *
 * Instruction data: 1 byte (tag only — all params read from on-chain state)
 *
 * Accounts:
 *   0. [writable] Slab
 *   1. []         Oracle account (Pyth PriceUpdateV2 / Chainlink / DEX AMM)
 *   2. []         Clock sysvar (SysvarC1ock11111111111111111111111111111111)
 *   3..N []       Remaining accounts (PumpSwap vaults, etc. if needed)
 */
export function encodeUpdateMarkPrice() {
    return new Uint8Array([33]);
}
/**
 * Mark price EMA parameters (must match program/src/percolator.rs constants).
 */
export const MARK_PRICE_EMA_WINDOW_SLOTS = 72000n;
export const MARK_PRICE_EMA_ALPHA_E6 = 2000000n / (MARK_PRICE_EMA_WINDOW_SLOTS + 1n);
/**
 * Compute the next EMA mark price step (TypeScript mirror of the on-chain function).
 */
export function computeEmaMarkPrice(markPrevE6, oracleE6, dtSlots, alphaE6 = MARK_PRICE_EMA_ALPHA_E6, capE2bps = 0n) {
    if (oracleE6 === 0n)
        return markPrevE6;
    if (markPrevE6 === 0n || dtSlots === 0n)
        return oracleE6;
    let oracleClamped = oracleE6;
    if (capE2bps > 0n) {
        // Avoid overflow: divide early to reduce intermediate product
        const maxDelta = (markPrevE6 * capE2bps / 1000000n) * dtSlots;
        const lo = markPrevE6 > maxDelta ? markPrevE6 - maxDelta : 0n;
        const hi = markPrevE6 + maxDelta;
        if (oracleClamped < lo)
            oracleClamped = lo;
        if (oracleClamped > hi)
            oracleClamped = hi;
    }
    const effectiveAlpha = alphaE6 * dtSlots > 1000000n ? 1000000n : alphaE6 * dtSlots;
    const oneMinusAlpha = 1000000n - effectiveAlpha;
    return (oracleClamped * effectiveAlpha + markPrevE6 * oneMinusAlpha) / 1000000n;
}
// PERC-119: Hyperp EMA Oracle for Permissionless Tokens
// ============================================================================
// Tag 34 — permissionless Hyperp mark price oracle (defined in IX_TAG above).
/**
 * UpdateHyperpMark (Tag 34) — permissionless Hyperp EMA oracle crank.
 *
 * Reads the spot price from a PumpSwap, Raydium CLMM, or Meteora DLMM pool,
 * applies 8-hour EMA smoothing with circuit breaker, and writes the new mark
 * to authority_price_e6 on the slab.
 *
 * This is the core mechanism for permissionless token markets — no Pyth or
 * Chainlink feed is needed. The DEX AMM IS the oracle.
 *
 * Instruction data: 1 byte (tag only)
 *
 * Accounts:
 *   0. [writable] Slab
 *   1. []         DEX pool account (PumpSwap / Raydium CLMM / Meteora DLMM)
 *   2. []         Clock sysvar (SysvarC1ock11111111111111111111111111111111)
 *   3..N []       Remaining accounts (e.g. PumpSwap vault0 + vault1)
 */
export function encodeUpdateHyperpMark() {
    return new Uint8Array([34]);
}
// ============================================================================
// PERC-306: Per-Market Insurance Isolation
// ============================================================================
/**
 * Fund per-market isolated insurance balance.
 * Accounts: [admin(signer,writable), slab(writable), admin_ata(writable), vault(writable), token_program]
 */
export function encodeFundMarketInsurance(args) {
    return concatBytes(encU8(IX_TAG.FundMarketInsurance), encU64(args.amount));
}
/**
 * Set insurance isolation BPS for a market.
 * Accounts: [admin(signer), slab(writable)]
 */
export function encodeSetInsuranceIsolation(args) {
    return concatBytes(encU8(IX_TAG.SetInsuranceIsolation), encU16(args.bps));
}
// ============================================================================
// NOTE: encodeExecuteAdl() was historically removed when it was discovered
// that PERC-305 was NOT implemented on-chain and tag 43 was ChallengeSettlement.
// PERC-305 (ExecuteAdl) is now live at tag 50. Encoder added below.
// ============================================================================
// ============================================================================
// PERC-309: QueueWithdrawal / ClaimQueuedWithdrawal / CancelQueuedWithdrawal
// ============================================================================
/**
 * QueueWithdrawal (Tag 47, PERC-309) — queue a large LP withdrawal.
 *
 * Creates a withdraw_queue PDA. The LP tokens are claimed in epoch tranches
 * via ClaimQueuedWithdrawal. Call CancelQueuedWithdrawal to abort.
 *
 * Accounts: [user(signer,writable), slab(writable), lpVaultState, withdrawQueue(writable), systemProgram]
 *
 * @param lpAmount - Amount of LP tokens to queue for withdrawal.
 *
 * @example
 * ```ts
 * const data = encodeQueueWithdrawal({ lpAmount: 1_000_000_000n });
 * ```
 */
export function encodeQueueWithdrawal(args) {
    return concatBytes(encU8(IX_TAG.QueueWithdrawal), encU64(args.lpAmount));
}
/**
 * ClaimQueuedWithdrawal (Tag 48, PERC-309) — claim one epoch tranche from a queued withdrawal.
 *
 * Burns LP tokens and releases one tranche of SOL to the user.
 * Call once per epoch until epochs_remaining == 0.
 *
 * Accounts: [user(signer,writable), slab(writable), withdrawQueue(writable),
 *            lpVaultMint(writable), userLpAta(writable), vault(writable),
 *            userAta(writable), vaultAuthority, tokenProgram, lpVaultState(writable)]
 */
export function encodeClaimQueuedWithdrawal() {
    return encU8(IX_TAG.ClaimQueuedWithdrawal);
}
/**
 * CancelQueuedWithdrawal (Tag 49, PERC-309) — cancel a queued withdrawal, refund remaining LP.
 *
 * Closes the withdraw_queue PDA and returns its rent lamports to the user.
 * The queued LP amount that was not yet claimed is NOT refunded — it is burned.
 * Use only to abandon a partial withdrawal.
 *
 * Accounts: [user(signer,writable), slab, withdrawQueue(writable)]
 */
export function encodeCancelQueuedWithdrawal() {
    return encU8(IX_TAG.CancelQueuedWithdrawal);
}
export function encodeExecuteAdl(args) {
    return concatBytes(encU8(IX_TAG.ExecuteAdl), encU16(args.targetIdx));
}
// ============================================================================
// CloseStaleSlabs (Tag 51) / ReclaimSlabRent (Tag 52) — Slab recovery
// ============================================================================
/**
 * CloseStaleSlabs (Tag 51) — close a slab of an invalid/old layout and recover rent SOL.
 *
 * Admin only. Skips slab_guard; validates header magic + admin authority instead.
 * Use for slabs created by old program layouts (e.g. pre-PERC-120 devnet deploys)
 * whose size does not match any current valid tier.
 *
 * Accounts: [dest(signer,writable), slab(writable)]
 */
export function encodeCloseStaleSlabs() {
    return encU8(IX_TAG.CloseStaleSlabs);
}
/**
 * ReclaimSlabRent (Tag 52) — reclaim rent from an uninitialised slab.
 *
 * For use when market creation failed mid-flow (slab funded but InitMarket not called).
 * The slab account must sign (proves the caller holds the slab keypair).
 * Cannot close an initialised slab (magic == PERCOLAT) — use CloseSlab (tag 13).
 *
 * Accounts: [dest(signer,writable), slab(signer,writable)]
 */
export function encodeReclaimSlabRent() {
    return encU8(IX_TAG.ReclaimSlabRent);
}
// ============================================================================
// AuditCrank (Tag 53) — Permissionless on-chain invariant check
// ============================================================================
/**
 * AuditCrank (Tag 53) — verify conservation invariants on-chain (permissionless).
 *
 * Walks all accounts and verifies: capital sum, pnl_pos_tot, total_oi, LP consistency,
 * and solvency. Sets FLAG_PAUSED on violation (with a 150-slot cooldown guard to
 * prevent DoS from transient failures).
 *
 * Accounts: [slab(writable)]
 *
 * @example
 * ```ts
 * const data = encodeAuditCrank();
 * ```
 */
export function encodeAuditCrank() {
    return encU8(IX_TAG.AuditCrank);
}
/** Magic bytes identifying a vAMM matcher context: "PERCMATC" as u64 LE */
export const VAMM_MAGIC = 0x504552434d415443n;
/** Offset into matcher context where vAMM params start */
export const CTX_VAMM_OFFSET = 64;
const BPS_DENOM = 10000n;
/**
 * Compute execution price for a given LP quote.
 * For buys (isLong=true): price above oracle.
 * For sells (isLong=false): price below oracle.
 */
export function computeVammQuote(params, oraclePriceE6, tradeSize, isLong) {
    const absSize = tradeSize < 0n ? -tradeSize : tradeSize;
    const absNotionalE6 = (absSize * oraclePriceE6) / 1000000n;
    // Impact for vAMM mode
    let impactBps = 0n;
    if (params.mode === 1 && params.liquidityNotionalE6 > 0n) {
        impactBps = (absNotionalE6 * BigInt(params.impactKBps)) / params.liquidityNotionalE6;
    }
    // Total = base_spread + trading_fee + impact, capped at max_total
    const maxTotal = BigInt(params.maxTotalBps);
    const baseFee = BigInt(params.baseSpreadBps) + BigInt(params.tradingFeeBps);
    const maxImpact = maxTotal > baseFee ? maxTotal - baseFee : 0n;
    const clampedImpact = impactBps < maxImpact ? impactBps : maxImpact;
    let totalBps = baseFee + clampedImpact;
    if (totalBps > maxTotal)
        totalBps = maxTotal;
    if (isLong) {
        return (oraclePriceE6 * (BPS_DENOM + totalBps)) / BPS_DENOM;
    }
    else {
        // Prevent underflow: if totalBps >= BPS_DENOM, price would go negative
        if (totalBps >= BPS_DENOM)
            return 1n; // minimum 1 micro-dollar
        return (oraclePriceE6 * (BPS_DENOM - totalBps)) / BPS_DENOM;
    }
}
// ============================================================================
// PERC-622: AdvanceOraclePhase (permissionless crank)
// ============================================================================
/**
 * AdvanceOraclePhase (Tag 56) — permissionless oracle phase advancement.
 *
 * Checks if a market should transition from Phase 0→1→2 based on
 * time elapsed and cumulative volume. Anyone can call this.
 *
 * Instruction data: 1 byte (tag only)
 *
 * Accounts:
 *   0. [writable] Slab
 */
export function encodeAdvanceOraclePhase() {
    return encU8(IX_TAG.AdvanceOraclePhase);
}
/** Oracle phase constants matching on-chain values */
export const ORACLE_PHASE_NASCENT = 0;
export const ORACLE_PHASE_GROWING = 1;
export const ORACLE_PHASE_MATURE = 2;
/** Phase transition thresholds (must match program constants) */
export const PHASE1_MIN_SLOTS = 648000n; // ~72h at 400ms
export const PHASE1_VOLUME_MIN_SLOTS = 36000n; // ~4h at 400ms
export const PHASE2_VOLUME_THRESHOLD = 100000000000n; // $100K in e6
export const PHASE2_MATURITY_SLOTS = 3024000n; // ~14 days at 400ms
/**
 * Check if an oracle phase transition is due (TypeScript mirror of on-chain logic).
 *
 * @returns [newPhase, shouldTransition]
 */
export function checkPhaseTransition(currentSlot, marketCreatedSlot, oraclePhase, cumulativeVolumeE6, phase2DeltaSlots, hasMatureOracle) {
    switch (oraclePhase) {
        case 0: {
            const elapsed = currentSlot - (marketCreatedSlot > 0n ? marketCreatedSlot : currentSlot);
            const timeReady = elapsed >= PHASE1_MIN_SLOTS;
            const volumeReady = elapsed >= PHASE1_VOLUME_MIN_SLOTS
                && cumulativeVolumeE6 >= PHASE2_VOLUME_THRESHOLD;
            if (timeReady || volumeReady) {
                return [ORACLE_PHASE_GROWING, true];
            }
            return [ORACLE_PHASE_NASCENT, false];
        }
        case 1: {
            if (hasMatureOracle)
                return [ORACLE_PHASE_MATURE, true];
            const phase2Start = marketCreatedSlot + BigInt(phase2DeltaSlots);
            const elapsedSincePhase2 = currentSlot - phase2Start;
            if (elapsedSincePhase2 >= PHASE2_MATURITY_SLOTS) {
                return [ORACLE_PHASE_MATURE, true];
            }
            return [ORACLE_PHASE_GROWING, false];
        }
        default:
            return [ORACLE_PHASE_MATURE, false];
    }
}
export function encodeTopUpKeeperFund(args) {
    return concatBytes(encU8(IX_TAG.TopUpKeeperFund), encU64(args.amount));
}
// Note: WithdrawKeeperReward does NOT exist as a separate instruction.
// Keeper rewards are paid automatically during KeeperCrank (tag 5).
// The keeper fund PDA is debited in-place when a successful crank is executed.
// ============================================================================
// PERC-629: Dynamic Creation Deposit
// ============================================================================
/**
 * SlashCreationDeposit (Tag 58) — permissionless: slash a market creator's deposit
 * after the spam grace period has elapsed (PERC-629).
 *
 * **WARNING**: Tag 58 is reserved in tags.rs but has NO instruction decoder or
 * handler in the on-chain program. Sending this instruction will fail with
 * `InvalidInstructionData`. Do not use until the on-chain handler is deployed.
 *
 * Instruction data: 1 byte (tag only)
 *
 * Accounts:
 *   0. [signer]           Caller (anyone)
 *   1. []                 Slab
 *   2. [writable]         Creator history PDA
 *   3. [writable]         Insurance vault
 *   4. [writable]         Treasury
 *   5. []                 System program
 *
 * @deprecated Not yet implemented on-chain — will fail with InvalidInstructionData.
 */
export function encodeSlashCreationDeposit() {
    return encU8(IX_TAG.SlashCreationDeposit);
}
export function encodeInitSharedVault(args) {
    return concatBytes(encU8(IX_TAG.InitSharedVault), encU64(args.epochDurationSlots), encU16(args.maxMarketExposureBps));
}
export function encodeAllocateMarket(args) {
    return concatBytes(encU8(IX_TAG.AllocateMarket), encU128(args.amount));
}
export function encodeQueueWithdrawalSV(args) {
    return concatBytes(encU8(IX_TAG.QueueWithdrawalSV), encU64(args.lpAmount));
}
/**
 * ClaimEpochWithdrawal (Tag 62) — user: claim a queued withdrawal after the epoch
 * has elapsed (PERC-628). Receives pro-rata collateral from the vault.
 *
 * Instruction data: 1 byte (tag only)
 *
 * Accounts:
 *   0. [signer]           User
 *   1. [writable]         Shared vault PDA
 *   2. [writable]         Withdraw request PDA
 *   3. []                 Slab
 *   4. [writable]         Vault
 *   5. [writable]         User ATA
 *   6. []                 Vault authority
 *   7. []                 Token program
 */
export function encodeClaimEpochWithdrawal() {
    return encU8(IX_TAG.ClaimEpochWithdrawal);
}
/**
 * AdvanceEpoch (Tag 63) — permissionless crank: move the shared vault to the next
 * epoch once `epoch_duration_slots` have elapsed (PERC-628).
 *
 * Instruction data: 1 byte (tag only)
 *
 * Accounts:
 *   0. [signer]           Caller (anyone)
 *   1. [writable]         Shared vault PDA
 */
export function encodeAdvanceEpoch() {
    return encU8(IX_TAG.AdvanceEpoch);
}
// PERC-628: Tag 63 ─────────────────────────────────────────────────────────
// PERC-8110 ────────────────────────────────────────────────────────────────
/**
 * SetOiImbalanceHardBlock (Tag 71, PERC-8110) — set OI imbalance hard-block threshold (admin only).
 *
 * When `|long_oi − short_oi| / total_oi * 10_000 >= threshold_bps`, any new trade that would
 * *increase* the imbalance is rejected with `OiImbalanceHardBlock` (error code 59).
 *
 * - `threshold_bps = 0`: hard block disabled.
 * - `threshold_bps = 8_000`: block trades that push skew above 80%.
 * - `threshold_bps = 10_000`: never allow >100% skew (always blocks one side when oi > 0).
 *
 * Instruction data layout: tag(1) + threshold_bps(2) = 3 bytes
 *
 * Accounts:
 *   0. [signer]   admin
 *   1. [writable] slab
 *
 * @example
 * ```ts
 * const ix = new TransactionInstruction({
 *   programId: PROGRAM_ID,
 *   keys: buildAccountMetas(ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK, { admin, slab }),
 *   data: Buffer.from(encodeSetOiImbalanceHardBlock({ thresholdBps: 8_000 })),
 * });
 * ```
 */
export function encodeSetOiImbalanceHardBlock(args) {
    if (args.thresholdBps < 0 || args.thresholdBps > 10_000) {
        throw new Error(`encodeSetOiImbalanceHardBlock: thresholdBps must be 0–10_000, got ${args.thresholdBps}`);
    }
    return concatBytes(encU8(IX_TAG.SetOiImbalanceHardBlock), encU16(args.thresholdBps));
}
export function encodeMintPositionNft(args) {
    return concatBytes(encU8(IX_TAG.MintPositionNft), encU16(args.userIdx));
}
export function encodeTransferPositionOwnership(args) {
    return concatBytes(encU8(IX_TAG.TransferPositionOwnership), encU16(args.userIdx));
}
export function encodeBurnPositionNft(args) {
    return concatBytes(encU8(IX_TAG.BurnPositionNft), encU16(args.userIdx));
}
export function encodeSetPendingSettlement(args) {
    return concatBytes(encU8(IX_TAG.SetPendingSettlement), encU16(args.userIdx));
}
export function encodeClearPendingSettlement(args) {
    return concatBytes(encU8(IX_TAG.ClearPendingSettlement), encU16(args.userIdx));
}
export function encodeTransferOwnershipCpi(args) {
    return concatBytes(encU8(IX_TAG.TransferOwnershipCpi), encU16(args.userIdx), encPubkey(args.newOwner));
}
export function encodeSetWalletCap(args) {
    return concatBytes(encU8(IX_TAG.SetWalletCap), encU64(args.capE6));
}
