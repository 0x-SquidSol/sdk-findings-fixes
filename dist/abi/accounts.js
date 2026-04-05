import { SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY, SystemProgram, } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
// ============================================================================
// ACCOUNT ORDERINGS - Single source of truth
// ============================================================================
/**
 * InitMarket: 9 accounts (Pyth Pull - feed_id is in instruction data, not as accounts)
 */
export const ACCOUNTS_INIT_MARKET = [
    { name: "admin", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "mint", signer: false, writable: false },
    { name: "vault", signer: false, writable: false },
    { name: "tokenProgram", signer: false, writable: false },
    { name: "clock", signer: false, writable: false },
    { name: "rent", signer: false, writable: false },
    { name: "dummyAta", signer: false, writable: false },
    { name: "systemProgram", signer: false, writable: false },
];
/**
 * InitUser: 5 accounts (clock/oracle removed in commit 410f947)
 */
export const ACCOUNTS_INIT_USER = [
    { name: "user", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "userAta", signer: false, writable: true },
    { name: "vault", signer: false, writable: true },
    { name: "tokenProgram", signer: false, writable: false },
];
/**
 * InitLP: 5 accounts (clock/oracle removed in commit 410f947)
 */
export const ACCOUNTS_INIT_LP = [
    { name: "user", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "userAta", signer: false, writable: true },
    { name: "vault", signer: false, writable: true },
    { name: "tokenProgram", signer: false, writable: false },
];
/**
 * DepositCollateral: 6 accounts
 */
export const ACCOUNTS_DEPOSIT_COLLATERAL = [
    { name: "user", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "userAta", signer: false, writable: true },
    { name: "vault", signer: false, writable: true },
    { name: "tokenProgram", signer: false, writable: false },
    { name: "clock", signer: false, writable: false },
];
/**
 * WithdrawCollateral: 8 accounts
 */
export const ACCOUNTS_WITHDRAW_COLLATERAL = [
    { name: "user", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "vault", signer: false, writable: true },
    { name: "userAta", signer: false, writable: true },
    { name: "vaultPda", signer: false, writable: false },
    { name: "tokenProgram", signer: false, writable: false },
    { name: "clock", signer: false, writable: false },
    { name: "oracleIdx", signer: false, writable: false },
];
/**
 * KeeperCrank: 4 accounts
 */
export const ACCOUNTS_KEEPER_CRANK = [
    { name: "caller", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "clock", signer: false, writable: false },
    { name: "oracle", signer: false, writable: false },
];
/**
 * TradeNoCpi: 4 accounts (PERC-199: clock sysvar removed — uses Clock::get() syscall)
 */
export const ACCOUNTS_TRADE_NOCPI = [
    { name: "user", signer: true, writable: true },
    { name: "lp", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "oracle", signer: false, writable: false },
];
/**
 * LiquidateAtOracle: 4 accounts
 * Note: account[0] is unused but must be present
 */
export const ACCOUNTS_LIQUIDATE_AT_ORACLE = [
    { name: "unused", signer: false, writable: false },
    { name: "slab", signer: false, writable: true },
    { name: "clock", signer: false, writable: false },
    { name: "oracle", signer: false, writable: false },
];
/**
 * CloseAccount: 8 accounts
 */
export const ACCOUNTS_CLOSE_ACCOUNT = [
    { name: "user", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "vault", signer: false, writable: true },
    { name: "userAta", signer: false, writable: true },
    { name: "vaultPda", signer: false, writable: false },
    { name: "tokenProgram", signer: false, writable: false },
    { name: "clock", signer: false, writable: false },
    { name: "oracle", signer: false, writable: false },
];
/**
 * TopUpInsurance: 5 accounts
 */
export const ACCOUNTS_TOPUP_INSURANCE = [
    { name: "user", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "userAta", signer: false, writable: true },
    { name: "vault", signer: false, writable: true },
    { name: "tokenProgram", signer: false, writable: false },
];
/**
 * TradeCpi: 7 accounts (PERC-199: clock sysvar removed — uses Clock::get() syscall)
 */
export const ACCOUNTS_TRADE_CPI = [
    { name: "user", signer: true, writable: true },
    { name: "lpOwner", signer: false, writable: false }, // LP delegated to matcher - no signature needed
    { name: "slab", signer: false, writable: true },
    { name: "oracle", signer: false, writable: false },
    { name: "matcherProg", signer: false, writable: false },
    { name: "matcherCtx", signer: false, writable: true },
    { name: "lpPda", signer: false, writable: false },
];
/**
 * SetRiskThreshold: 2 accounts
 */
export const ACCOUNTS_SET_RISK_THRESHOLD = [
    { name: "admin", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
];
/**
 * UpdateAdmin: 2 accounts
 */
export const ACCOUNTS_UPDATE_ADMIN = [
    { name: "admin", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
];
/**
 * CloseSlab: 2 accounts
 */
export const ACCOUNTS_CLOSE_SLAB = [
    { name: "admin", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
];
/**
 * UpdateConfig: 2 accounts
 */
export const ACCOUNTS_UPDATE_CONFIG = [
    { name: "admin", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
];
/**
 * SetMaintenanceFee: 2 accounts
 */
export const ACCOUNTS_SET_MAINTENANCE_FEE = [
    { name: "admin", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
];
/**
 * SetOracleAuthority: 2 accounts
 * Sets the oracle price authority (admin only)
 */
export const ACCOUNTS_SET_ORACLE_AUTHORITY = [
    { name: "admin", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
];
/**
 * SetOraclePriceCap: 2 accounts
 * Set oracle price circuit breaker cap (admin only)
 */
export const ACCOUNTS_SET_ORACLE_PRICE_CAP = [
    { name: "admin", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
];
/**
 * PushOraclePrice: 2 accounts
 * Push oracle price (oracle authority only)
 */
export const ACCOUNTS_PUSH_ORACLE_PRICE = [
    { name: "authority", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
];
/**
 * ResolveMarket: 2 accounts
 * Resolves a binary/premarket (admin only)
 */
export const ACCOUNTS_RESOLVE_MARKET = [
    { name: "admin", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
];
/**
 * WithdrawInsurance: 6 accounts
 * Withdraw insurance fund after market resolution (admin only)
 */
export const ACCOUNTS_WITHDRAW_INSURANCE = [
    { name: "admin", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "adminAta", signer: false, writable: true },
    { name: "vault", signer: false, writable: true },
    { name: "tokenProgram", signer: false, writable: false },
    { name: "vaultPda", signer: false, writable: false },
];
/**
 * PauseMarket: 2 accounts
 */
export const ACCOUNTS_PAUSE_MARKET = [
    { name: "admin", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
];
/**
 * UnpauseMarket: 2 accounts
 */
export const ACCOUNTS_UNPAUSE_MARKET = [
    { name: "admin", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
];
// ============================================================================
// ACCOUNT META BUILDERS
// ============================================================================
/**
 * Build AccountMeta array from spec and provided pubkeys.
 *
 * Accepts either:
 *   - `PublicKey[]`  — ordered array, one entry per spec account (legacy form)
 *   - `Record<string, PublicKey>` — named map keyed by account `name` (preferred form)
 *
 * Named-map form resolves accounts by spec name so callers don't have to
 * remember the positional order, and errors clearly on missing names.
 */
export function buildAccountMetas(spec, keys) {
    let keysArray;
    if (Array.isArray(keys)) {
        keysArray = keys;
    }
    else {
        // Named map: resolve by spec name
        keysArray = spec.map((s) => {
            const key = keys[s.name];
            if (!key) {
                throw new Error(`buildAccountMetas: missing key for account "${s.name}". ` +
                    `Provided keys: [${Object.keys(keys).join(", ")}]`);
            }
            return key;
        });
    }
    if (keysArray.length !== spec.length) {
        throw new Error(`Account count mismatch: expected ${spec.length}, got ${keysArray.length}`);
    }
    return spec.map((s, i) => ({
        pubkey: keysArray[i],
        isSigner: s.signer,
        isWritable: s.writable,
    }));
}
/**
 * CreateInsuranceMint: 9 accounts
 * Creates SPL mint PDA for insurance LP tokens. Admin only, once per market.
 */
export const ACCOUNTS_CREATE_INSURANCE_MINT = [
    { name: "admin", signer: true, writable: false },
    { name: "slab", signer: false, writable: false },
    { name: "insLpMint", signer: false, writable: true },
    { name: "vaultAuthority", signer: false, writable: false },
    { name: "collateralMint", signer: false, writable: false },
    { name: "systemProgram", signer: false, writable: false },
    { name: "tokenProgram", signer: false, writable: false },
    { name: "rent", signer: false, writable: false },
    { name: "payer", signer: true, writable: true },
];
/**
 * DepositInsuranceLP: 8 accounts
 * Deposit collateral into insurance fund, receive LP tokens.
 */
export const ACCOUNTS_DEPOSIT_INSURANCE_LP = [
    { name: "depositor", signer: true, writable: false },
    { name: "slab", signer: false, writable: true },
    { name: "depositorAta", signer: false, writable: true },
    { name: "vault", signer: false, writable: true },
    { name: "tokenProgram", signer: false, writable: false },
    { name: "insLpMint", signer: false, writable: true },
    { name: "depositorLpAta", signer: false, writable: true },
    { name: "vaultAuthority", signer: false, writable: false },
];
/**
 * WithdrawInsuranceLP: 8 accounts
 * Burn LP tokens and withdraw proportional share of insurance fund.
 */
export const ACCOUNTS_WITHDRAW_INSURANCE_LP = [
    { name: "withdrawer", signer: true, writable: false },
    { name: "slab", signer: false, writable: true },
    { name: "withdrawerAta", signer: false, writable: true },
    { name: "vault", signer: false, writable: true },
    { name: "tokenProgram", signer: false, writable: false },
    { name: "insLpMint", signer: false, writable: true },
    { name: "withdrawerLpAta", signer: false, writable: true },
    { name: "vaultAuthority", signer: false, writable: false },
];
// ============================================================================
// PERC-627 / GH#1926: LpVaultWithdraw (tag 39)
// ============================================================================
/**
 * LpVaultWithdraw: 10 accounts (tag 39, PERC-627 / GH#1926 / PERC-8287)
 *
 * Burn LP vault tokens and withdraw proportional collateral from the LP vault.
 *
 * accounts[9] = creatorLockPda is REQUIRED since percolator-prog PR#170.
 * Non-creator withdrawers must pass the derived PDA key; if no lock exists
 * on-chain the enforcement is a no-op. Omitting it was the bypass vector
 * fixed in GH#1926. Use `deriveCreatorLockPda(programId, slab)` to compute.
 *
 * Accounts:
 *  [0] withdrawer        signer, read-only
 *  [1] slab              writable
 *  [2] withdrawerAta     writable (collateral destination)
 *  [3] vault             writable (collateral source)
 *  [4] tokenProgram      read-only
 *  [5] lpVaultMint       writable (LP tokens burned from here)
 *  [6] withdrawerLpAta   writable (LP tokens source)
 *  [7] vaultAuthority    read-only (PDA that signs token transfers)
 *  [8] lpVaultState      writable
 *  [9] creatorLockPda    writable (REQUIRED — derived from ["creator_lock", slab])
 */
export const ACCOUNTS_LP_VAULT_WITHDRAW = [
    { name: "withdrawer", signer: true, writable: false },
    { name: "slab", signer: false, writable: true },
    { name: "withdrawerAta", signer: false, writable: true },
    { name: "vault", signer: false, writable: true },
    { name: "tokenProgram", signer: false, writable: false },
    { name: "lpVaultMint", signer: false, writable: true },
    { name: "withdrawerLpAta", signer: false, writable: true },
    { name: "vaultAuthority", signer: false, writable: false },
    { name: "lpVaultState", signer: false, writable: true },
    { name: "creatorLockPda", signer: false, writable: true },
];
/**
 * FundMarketInsurance: 5 accounts (PERC-306)
 * Fund per-market isolated insurance balance.
 */
export const ACCOUNTS_FUND_MARKET_INSURANCE = [
    { name: "admin", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "adminAta", signer: false, writable: true },
    { name: "vault", signer: false, writable: true },
    { name: "tokenProgram", signer: false, writable: false },
];
/**
 * SetInsuranceIsolation: 2 accounts (PERC-306)
 * Set max % of global fund this market can access.
 */
export const ACCOUNTS_SET_INSURANCE_ISOLATION = [
    { name: "admin", signer: true, writable: false },
    { name: "slab", signer: false, writable: true },
];
// ============================================================================
// PERC-309: QueueWithdrawal / ClaimQueuedWithdrawal / CancelQueuedWithdrawal
// ============================================================================
/**
 * QueueWithdrawal: 5 accounts (PERC-309)
 * User queues a large LP withdrawal. Creates withdraw_queue PDA.
 */
export const ACCOUNTS_QUEUE_WITHDRAWAL = [
    { name: "user", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "lpVaultState", signer: false, writable: false },
    { name: "withdrawQueue", signer: false, writable: true },
    { name: "systemProgram", signer: false, writable: false },
];
/**
 * ClaimQueuedWithdrawal: 10 accounts (PERC-309)
 * Burns LP tokens and releases one epoch tranche of SOL.
 */
export const ACCOUNTS_CLAIM_QUEUED_WITHDRAWAL = [
    { name: "user", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "withdrawQueue", signer: false, writable: true },
    { name: "lpVaultMint", signer: false, writable: true },
    { name: "userLpAta", signer: false, writable: true },
    { name: "vault", signer: false, writable: true },
    { name: "userAta", signer: false, writable: true },
    { name: "vaultAuthority", signer: false, writable: false },
    { name: "tokenProgram", signer: false, writable: false },
    { name: "lpVaultState", signer: false, writable: true },
];
/**
 * CancelQueuedWithdrawal: 3 accounts (PERC-309)
 * Cancels queue, closes withdraw_queue PDA, returns rent to user.
 */
export const ACCOUNTS_CANCEL_QUEUED_WITHDRAWAL = [
    { name: "user", signer: true, writable: true },
    { name: "slab", signer: false, writable: false },
    { name: "withdrawQueue", signer: false, writable: true },
];
// ============================================================================
// PERC-305: ExecuteAdl (tag 50) — Auto-Deleverage
// ============================================================================
/**
 * ExecuteAdl: 4+ accounts (PERC-305, tag 50)
 * Permissionless — surgically close/reduce the most profitable position
 * when pnl_pos_tot > max_pnl_cap. For non-Hyperp markets with backup oracles,
 * pass additional oracle accounts at accounts[4..].
 */
export const ACCOUNTS_EXECUTE_ADL = [
    { name: "caller", signer: true, writable: false },
    { name: "slab", signer: false, writable: true },
    { name: "clock", signer: false, writable: false },
    { name: "oracle", signer: false, writable: false },
];
// ============================================================================
// CloseStaleSlabs (tag 51) / ReclaimSlabRent (tag 52)
// ============================================================================
/**
 * CloseStaleSlabs: 2 accounts (tag 51)
 * Admin closes a slab of an invalid/old layout and recovers rent SOL.
 */
export const ACCOUNTS_CLOSE_STALE_SLABS = [
    { name: "dest", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
];
/**
 * ReclaimSlabRent: 2 accounts (tag 52)
 * Reclaim rent from an uninitialised slab. Both dest and slab must sign.
 */
export const ACCOUNTS_RECLAIM_SLAB_RENT = [
    { name: "dest", signer: true, writable: true },
    { name: "slab", signer: true, writable: true },
];
// ============================================================================
// AuditCrank (tag 53) — Permissionless invariant check
// ============================================================================
/**
 * AuditCrank: 1 account (tag 53)
 * Permissionless. Verifies conservation invariants; pauses market on violation.
 */
export const ACCOUNTS_AUDIT_CRANK = [
    { name: "slab", signer: false, writable: true },
];
// ============================================================================
// PERC-622: AdvanceOraclePhase (permissionless)
// ============================================================================
/**
 * AdvanceOraclePhase: 1 account
 * Permissionless — no signer required beyond fee payer.
 */
export const ACCOUNTS_ADVANCE_ORACLE_PHASE = [
    { name: "slab", signer: false, writable: true },
];
// ============================================================================
// PERC-623: Keeper Fund Instructions
// ============================================================================
/**
 * TopUpKeeperFund: 3 accounts
 * Permissionless — anyone can fund. Transfers lamports directly (no system program).
 */
export const ACCOUNTS_TOPUP_KEEPER_FUND = [
    { name: "funder", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "keeperFund", signer: false, writable: true },
];
// Note: WithdrawKeeperReward has no separate instruction.
// Rewards are paid automatically during KeeperCrank (tag 5).
// ============================================================================
// PERC-8110: SetOiImbalanceHardBlock
// ============================================================================
/**
 * SetOiImbalanceHardBlock: 2 accounts
 * Sets the OI imbalance hard-block threshold (admin only)
 */
export const ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK = [
    { name: "admin", signer: true, writable: false },
    { name: "slab", signer: false, writable: true },
];
// ============================================================================
// PERC-608: Position NFT Instructions (tags 64–69)
// ============================================================================
/**
 * MintPositionNft: 10 accounts
 * Creates a Token-2022 position NFT for an open position.
 */
export const ACCOUNTS_MINT_POSITION_NFT = [
    { name: "payer", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "positionNftPda", signer: false, writable: true },
    { name: "nftMint", signer: false, writable: true },
    { name: "ownerAta", signer: false, writable: true },
    { name: "owner", signer: true, writable: false },
    { name: "vaultAuthority", signer: false, writable: false },
    { name: "token2022Program", signer: false, writable: false },
    { name: "systemProgram", signer: false, writable: false },
    { name: "rent", signer: false, writable: false },
];
/**
 * TransferPositionOwnership: 8 accounts
 * Transfer position NFT and update on-chain owner. Requires pending_settlement == 0.
 */
export const ACCOUNTS_TRANSFER_POSITION_OWNERSHIP = [
    { name: "currentOwner", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "positionNftPda", signer: false, writable: true },
    { name: "nftMint", signer: false, writable: true },
    { name: "currentOwnerAta", signer: false, writable: true },
    { name: "newOwnerAta", signer: false, writable: true },
    { name: "newOwner", signer: false, writable: false },
    { name: "token2022Program", signer: false, writable: false },
];
/**
 * BurnPositionNft: 7 accounts
 * Burns NFT and closes PositionNft + mint PDAs after position is closed.
 */
export const ACCOUNTS_BURN_POSITION_NFT = [
    { name: "owner", signer: true, writable: true },
    { name: "slab", signer: false, writable: true },
    { name: "positionNftPda", signer: false, writable: true },
    { name: "nftMint", signer: false, writable: true },
    { name: "ownerAta", signer: false, writable: true },
    { name: "vaultAuthority", signer: false, writable: false },
    { name: "token2022Program", signer: false, writable: false },
];
/**
 * SetPendingSettlement: 3 accounts
 * Keeper/admin sets pending_settlement flag before funding transfer.
 * Protected by admin allowlist (GH#1475).
 */
export const ACCOUNTS_SET_PENDING_SETTLEMENT = [
    { name: "keeper", signer: true, writable: false },
    { name: "slab", signer: false, writable: false },
    { name: "positionNftPda", signer: false, writable: true },
];
/**
 * ClearPendingSettlement: 3 accounts
 * Keeper/admin clears pending_settlement flag after KeeperCrank.
 * Protected by admin allowlist (GH#1475).
 */
export const ACCOUNTS_CLEAR_PENDING_SETTLEMENT = [
    { name: "keeper", signer: true, writable: false },
    { name: "slab", signer: false, writable: false },
    { name: "positionNftPda", signer: false, writable: true },
];
// ============================================================================
// PERC-8111: SetWalletCap
// ============================================================================
/**
 * SetWalletCap: 2 accounts
 * Sets the per-wallet position cap (admin only). capE6=0 disables.
 */
export const ACCOUNTS_SET_WALLET_CAP = [
    { name: "admin", signer: true, writable: false },
    { name: "slab", signer: false, writable: true },
];
// ============================================================================
// WELL-KNOWN PROGRAM/SYSVAR KEYS
// ============================================================================
export const WELL_KNOWN = {
    tokenProgram: TOKEN_PROGRAM_ID,
    clock: SYSVAR_CLOCK_PUBKEY,
    rent: SYSVAR_RENT_PUBKEY,
    systemProgram: SystemProgram.programId,
};
