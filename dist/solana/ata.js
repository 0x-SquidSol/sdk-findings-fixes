import { getAssociatedTokenAddress, getAssociatedTokenAddressSync, getAccount, TOKEN_PROGRAM_ID, } from "@solana/spl-token";
/**
 * Get the associated token address for an owner and mint.
 * Supports both standard SPL Token and Token2022 via optional tokenProgramId.
 */
export async function getAta(owner, mint, allowOwnerOffCurve = false, tokenProgramId = TOKEN_PROGRAM_ID) {
    return getAssociatedTokenAddress(mint, owner, allowOwnerOffCurve, tokenProgramId);
}
/**
 * Synchronous version of getAta.
 * Supports both standard SPL Token and Token2022 via optional tokenProgramId.
 */
export function getAtaSync(owner, mint, allowOwnerOffCurve = false, tokenProgramId = TOKEN_PROGRAM_ID) {
    return getAssociatedTokenAddressSync(mint, owner, allowOwnerOffCurve, tokenProgramId);
}
/**
 * Fetch token account info.
 * Supports both standard SPL Token and Token2022 via optional tokenProgramId.
 * Throws if account doesn't exist.
 */
export async function fetchTokenAccount(connection, address, tokenProgramId = TOKEN_PROGRAM_ID) {
    return getAccount(connection, address, undefined, tokenProgramId);
}
