/**
 * @module adl
 * Percolator ADL (Auto-Deleveraging) client utilities.
 *
 * PERC-8278 / PERC-8312 / PERC-305: ADL is triggered when `pnl_pos_tot > max_pnl_cap`
 * on a market (PnL cap exceeded) AND the insurance fund is fully depleted (balance == 0).
 * The most profitable positions on the dominant side are deleveraged first.
 *
 * **Note on caller permissions:** `ExecuteAdl` (tag 50) requires the caller to be the
 * market admin/keeper key (`header.admin`). It is NOT permissionless despite the
 * instruction being structurally available to any signer.
 *
 * API surface:
 *  - fetchAdlRankedPositions() — fetch slab + rank all open positions by PnL%
 *  - rankAdlPositions()        — pure (no-RPC) variant for already-fetched slab bytes
 *  - isAdlTriggered()          — check if slab's pnl_pos_tot exceeds max_pnl_cap
 *  - buildAdlInstruction()     — build a single ExecuteAdl TransactionInstruction
 *  - buildAdlTransaction()     — fetch + rank + pick top target + return instruction
 *  - parseAdlEvent()           — decode AdlEvent from transaction log lines
 *  - fetchAdlRankings()        — call /api/adl/rankings HTTP endpoint
 *  - AdlRankedPosition         — position record with adl_rank and computed pnlPct
 *  - AdlRankingResult          — full ranking with trigger status
 *  - AdlEvent                  — decoded on-chain AdlEvent log entry (tag 0xAD1E_0001)
 *  - AdlApiRanking             — single ranked position from /api/adl/rankings
 *  - AdlApiResult              — full result from /api/adl/rankings
 *  - AdlSide                   — "long" | "short"
 */
import { TransactionInstruction, SYSVAR_CLOCK_PUBKEY, } from "@solana/web3.js";
import { fetchSlab, parseAllAccounts, parseEngine, parseConfig, detectSlabLayout, AccountKind, } from "./slab.js";
import { encodeExecuteAdl } from "../abi/instructions.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Compute PnL% in basis points for a position.
 * Returns 0n when capital is 0 to avoid division by zero.
 */
function computePnlPct(pnl, capital) {
    if (capital === 0n)
        return 0n;
    return (pnl * 10000n) / capital;
}
// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------
/**
 * Check whether ADL is currently triggered on a slab.
 *
 * ADL triggers when pnl_pos_tot > max_pnl_cap (max_pnl_cap must be > 0).
 *
 * @param slabData - Raw slab account bytes.
 * @returns true if ADL is triggered.
 *
 * @example
 * ```ts
 * const data = await fetchSlab(connection, slabKey);
 * if (isAdlTriggered(data)) {
 *   const ranking = await fetchAdlRankedPositions(connection, slabKey);
 * }
 * ```
 */
export function isAdlTriggered(slabData) {
    const layout = detectSlabLayout(slabData.length);
    if (!layout) {
        return false;
    }
    try {
        const engine = parseEngine(slabData);
        if (engine.pnlPosTot === 0n)
            return false;
        const config = parseConfig(slabData, layout);
        if (config.maxPnlCap === 0n)
            return false;
        return engine.pnlPosTot > config.maxPnlCap;
    }
    catch {
        return false;
    }
}
/**
 * Fetch a slab and rank all open user positions by PnL% for ADL targeting.
 *
 * Positions are ranked separately per side:
 * - Longs: rank 0 = highest positive PnL% (most profitable long)
 * - Shorts: rank 0 = highest negative PnL% by abs value (most profitable short)
 *
 * Rank ordering matches the on-chain ADL engine in percolator-prog (PERC-8273):
 * the position at rank 0 of the dominant side is deleveraged first.
 *
 * @param connection - Solana connection.
 * @param slab       - Slab (market) public key.
 * @returns AdlRankingResult with ranked longs, ranked shorts, and trigger status.
 *
 * @example
 * ```ts
 * const { ranked, longs, isTriggered } = await fetchAdlRankedPositions(connection, slabKey);
 * if (isTriggered && longs.length > 0) {
 *   const target = longs[0]; // highest PnL long
 *   const ix = buildAdlInstruction(caller, slabKey, oracleKey, programId, target.idx);
 * }
 * ```
 */
export async function fetchAdlRankedPositions(connection, slab) {
    const data = await fetchSlab(connection, slab);
    return rankAdlPositions(data);
}
/**
 * Pure (no-RPC) variant — rank positions from already-fetched slab bytes.
 * Useful when you already have the slab data (e.g., from a subscription).
 */
export function rankAdlPositions(slabData) {
    const layout = detectSlabLayout(slabData.length);
    let pnlPosTot = 0n;
    try {
        const engine = parseEngine(slabData);
        pnlPosTot = engine.pnlPosTot;
    }
    catch (err) {
        console.warn(`[rankAdlPositions] parseEngine failed:`, err instanceof Error ? err.message : err);
    }
    let maxPnlCap = 0n;
    let isTriggered = false;
    if (layout) {
        try {
            const config = parseConfig(slabData, layout);
            maxPnlCap = config.maxPnlCap;
            isTriggered = maxPnlCap > 0n && pnlPosTot > maxPnlCap;
        }
        catch {
            // If config parse fails, leave isTriggered=false; ranking still useful.
        }
    }
    // Parse all used accounts.
    const accounts = parseAllAccounts(slabData);
    // Build ranked position list (user accounts with non-zero position only).
    const positions = [];
    for (const { idx, account } of accounts) {
        if (account.kind !== AccountKind.User)
            continue;
        if (account.positionSize === 0n)
            continue;
        // Determine side from sign convention: long (> 0), short (< 0).
        // If positionSize is 0, it was already skipped above.
        const side = account.positionSize > 0n ? "long" : "short";
        // Validate sign convention: longs must be positive, shorts must be negative.
        if (side === "long" && account.positionSize <= 0n) {
            console.warn(`[fetchAdlRankedPositions] account idx=${idx}: side=long but positionSize=${account.positionSize}`);
            continue;
        }
        if (side === "short" && account.positionSize >= 0n) {
            console.warn(`[fetchAdlRankedPositions] account idx=${idx}: side=short but positionSize=${account.positionSize}`);
            continue;
        }
        // For shorts, positionSize is negative — PnL computation is symmetric:
        // a short profits when price falls, so pnl stored in the slab already
        // reflects mark-to-market gain/loss for both sides.
        const pnlPct = computePnlPct(account.pnl, account.capital);
        positions.push({
            idx,
            owner: account.owner,
            positionSize: account.positionSize,
            pnl: account.pnl,
            capital: account.capital,
            pnlPct,
            side,
            adlRank: -1, // assigned below
        });
    }
    // Rank longs: descending pnlPct (most profitable first).
    const longs = positions
        .filter(p => p.side === "long")
        .sort((a, b) => (b.pnlPct > a.pnlPct ? 1 : b.pnlPct < a.pnlPct ? -1 : 0));
    longs.forEach((p, i) => { p.adlRank = i; });
    // Rank shorts: descending pnlPct (most profitable short = highest pnlPct
    // magnitude, but pnlPct can be negative; sort descending still puts
    // the "least negative" aka "most profitable" short first).
    const shorts = positions
        .filter(p => p.side === "short")
        .sort((a, b) => (b.pnlPct > a.pnlPct ? 1 : b.pnlPct < a.pnlPct ? -1 : 0));
    shorts.forEach((p, i) => { p.adlRank = i; });
    // Overall ranked list = longs + shorts merged, still sorted by pnlPct desc.
    const ranked = [...longs, ...shorts].sort((a, b) => (b.pnlPct > a.pnlPct ? 1 : b.pnlPct < a.pnlPct ? -1 : 0));
    return { ranked, longs, shorts, isTriggered, pnlPosTot, maxPnlCap };
}
/**
 * Build a single `ExecuteAdl` TransactionInstruction (tag 50, PERC-305).
 *
 * Does NOT fetch the slab or check trigger status — use `fetchAdlRankedPositions`
 * first to determine the correct `targetIdx`.
 *
 * **Caller requirement:** The on-chain handler requires the caller to be the market
 * admin/keeper authority (`header.admin`). Passing any other signer will result in
 * `EngineUnauthorized`.
 *
 * @param caller     - Signer — must be the market keeper/admin authority.
 * @param slab       - Slab (market) public key.
 * @param oracle     - Primary oracle public key for this market.
 * @param programId  - Percolator program ID.
 * @param targetIdx  - Account index to deleverage (from `AdlRankedPosition.idx`).
 * @param backupOracles - Optional additional oracle accounts (non-Hyperp markets).
 *
 * @example
 * ```ts
 * import { fetchAdlRankedPositions, buildAdlInstruction } from "@percolator/sdk";
 *
 * const { longs, isTriggered } = await fetchAdlRankedPositions(connection, slabKey);
 * if (isTriggered && longs.length > 0) {
 *   const ix = buildAdlInstruction(
 *     caller.publicKey, slabKey, oracleKey, PROGRAM_ID, longs[0].idx
 *   );
 *   await sendAndConfirmTransaction(connection, new Transaction().add(ix), [caller]);
 * }
 * ```
 */
export function buildAdlInstruction(caller, slab, oracle, programId, targetIdx, backupOracles = []) {
    if (!Number.isInteger(targetIdx) || targetIdx < 0) {
        throw new Error(`buildAdlInstruction: targetIdx must be a non-negative integer, got ${targetIdx}`);
    }
    const dataBytes = encodeExecuteAdl({ targetIdx });
    const data = Buffer.from(dataBytes);
    const keys = [
        { pubkey: caller, isSigner: true, isWritable: false },
        { pubkey: slab, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: oracle, isSigner: false, isWritable: false },
        ...backupOracles.map(k => ({ pubkey: k, isSigner: false, isWritable: false })),
    ];
    return new TransactionInstruction({ keys, programId, data });
}
/**
 * Convenience builder: fetch slab, rank positions, pick the highest-ranked
 * target on the given side, and return a ready-to-send `TransactionInstruction`.
 *
 * Returns `null` when ADL is not triggered or no eligible positions exist.
 *
 * @param connection    - Solana connection.
 * @param caller        - Signer — must be the market keeper/admin authority.
 * @param slab          - Slab (market) public key.
 * @param oracle        - Primary oracle public key.
 * @param programId     - Percolator program ID.
 * @param preferSide    - Optional: target "long" or "short" side only.
 *                        If omitted, picks the overall top-ranked position.
 * @param backupOracles - Optional extra oracle accounts.
 *
 * @example
 * ```ts
 * const ix = await buildAdlTransaction(
 *   connection, caller.publicKey, slabKey, oracleKey, PROGRAM_ID
 * );
 * if (ix) {
 *   await sendAndConfirmTransaction(connection, new Transaction().add(ix), [caller]);
 * }
 * ```
 */
export async function buildAdlTransaction(connection, caller, slab, oracle, programId, preferSide, backupOracles = []) {
    const ranking = await fetchAdlRankedPositions(connection, slab);
    if (!ranking.isTriggered)
        return null;
    let target;
    if (preferSide === "long") {
        target = ranking.longs[0];
    }
    else if (preferSide === "short") {
        target = ranking.shorts[0];
    }
    else {
        target = ranking.ranked[0];
    }
    if (!target)
        return null;
    return buildAdlInstruction(caller, slab, oracle, programId, target.idx, backupOracles);
}
/** Magic discriminator for the ADL event log line. */
const ADL_EVENT_TAG = 0xad1e0001n;
/**
 * Parse the AdlEvent from a transaction's log messages.
 *
 * Searches for a "Program log: <a> <b> <c> <d> <e>" line where the first
 * decimal value equals `0xAD1E_0001` (2970353665). Returns `null` if not found.
 *
 * @param logs - Array of log message strings (from `tx.meta.logMessages`).
 * @returns Decoded `AdlEvent` or `null` if the log is not present.
 *
 * @example
 * ```ts
 * const event = parseAdlEvent(tx.meta?.logMessages ?? []);
 * if (event) {
 *   console.log(`ADL: idx=${event.targetIdx} price=${event.price} closed=${event.closedAbs}`);
 * }
 * ```
 */
export function parseAdlEvent(logs) {
    for (const line of logs) {
        if (typeof line !== "string")
            continue;
        // sol_log_64 emits: "Program log: a b c d e" (5 space-separated decimals)
        const match = line.match(/^Program log: (\d+) (\d+) (\d+) (\d+) (\d+)$/);
        if (!match)
            continue;
        let tag;
        try {
            tag = BigInt(match[1]);
        }
        catch {
            continue;
        }
        if (tag !== ADL_EVENT_TAG)
            continue;
        try {
            const targetIdxBig = BigInt(match[2]);
            // Validate that targetIdx fits in u16 range before converting to Number
            if (targetIdxBig < 0n || targetIdxBig > 65535n) {
                continue;
            }
            const targetIdx = Number(targetIdxBig);
            const price = BigInt(match[3]);
            const closedLo = BigInt(match[4]);
            const closedHi = BigInt(match[5]);
            // Reassemble i128 from lo/hi u64 parts (little-endian split).
            const closedAbs = (closedHi << 64n) | closedLo;
            return { tag, targetIdx, price, closedAbs };
        }
        catch {
            continue;
        }
    }
    return null;
}
/**
 * Fetch ADL rankings from the Percolator API.
 *
 * Calls `GET <apiBase>/api/adl/rankings?slab=<address>` and returns the
 * parsed result. Use this from the frontend or keeper to determine ADL
 * trigger status and pick the target index.
 *
 * @param apiBase  - Base URL of the Percolator API (e.g. `https://api.percolator.io`).
 * @param slab     - Slab (market) public key or base58 address string.
 * @param fetchFn  - Optional custom fetch implementation (defaults to global `fetch`).
 * @returns Parsed `AdlApiResult`.
 * @throws On HTTP error or JSON parse failure.
 *
 * @example
 * ```ts
 * const result = await fetchAdlRankings("https://api.percolator.io", slabKey);
 * if (result.adlNeeded && result.rankings.length > 0) {
 *   const target = result.rankings[0]; // rank 1 = highest PnL%
 *   const ix = buildAdlInstruction(caller, slabKey, oracleKey, PROGRAM_ID, target.idx);
 * }
 * ```
 */
export async function fetchAdlRankings(apiBase, slab, fetchFn = fetch) {
    const slabStr = typeof slab === "string" ? slab : slab.toBase58();
    const base = apiBase.replace(/\/$/, "");
    const url = `${base}/api/adl/rankings?slab=${encodeURIComponent(slabStr)}`;
    const res = await fetchFn(url);
    if (!res.ok) {
        let body = "";
        try {
            body = await res.text();
        }
        catch { /* ignore */ }
        throw new Error(`fetchAdlRankings: HTTP ${res.status} from ${url}${body ? ` — ${body}` : ""}`);
    }
    const json = await res.json();
    // Runtime validation — the API response shape is not guaranteed
    if (typeof json !== "object" || json === null) {
        throw new Error("fetchAdlRankings: API returned non-object response");
    }
    const obj = json;
    if (!Array.isArray(obj.rankings)) {
        throw new Error("fetchAdlRankings: API response missing rankings array");
    }
    for (const entry of obj.rankings) {
        if (typeof entry !== "object" || entry === null) {
            throw new Error("fetchAdlRankings: invalid ranking entry (not an object)");
        }
        const r = entry;
        if (typeof r.idx !== "number" || !Number.isInteger(r.idx) || r.idx < 0) {
            throw new Error(`fetchAdlRankings: invalid ranking idx: ${r.idx}`);
        }
    }
    return json;
}
