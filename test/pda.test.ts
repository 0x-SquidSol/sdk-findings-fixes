import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { deriveVaultAuthority, deriveLpPda, derivePythPushOraclePDA } from "../src/solana/pda.js";

const PROGRAM_ID = new PublicKey("EXsr2Tfz8ntWYP3vgCStdknFBoafvJQugJKAh4nFdo8f");
const SLAB = new PublicKey("11111111111111111111111111111111");

describe("deriveVaultAuthority", () => {
  it("returns deterministic results", () => {
    const [pda1, bump1] = deriveVaultAuthority(PROGRAM_ID, SLAB);
    const [pda2, bump2] = deriveVaultAuthority(PROGRAM_ID, SLAB);
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
    expect(bump1).toBeGreaterThanOrEqual(0);
    expect(bump1).toBeLessThanOrEqual(255);
  });

  it("different slabs produce different PDAs", () => {
    const slab2 = PublicKey.unique();
    const [pda1] = deriveVaultAuthority(PROGRAM_ID, SLAB);
    const [pda2] = deriveVaultAuthority(PROGRAM_ID, slab2);
    expect(pda1.equals(pda2)).toBe(false);
  });
});

describe("deriveLpPda", () => {
  it("returns deterministic results", () => {
    const [pda1, bump1] = deriveLpPda(PROGRAM_ID, SLAB, 0);
    const [pda2, bump2] = deriveLpPda(PROGRAM_ID, SLAB, 0);
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
  });

  it("different indices produce different PDAs", () => {
    const [pda1] = deriveLpPda(PROGRAM_ID, SLAB, 0);
    const [pda2] = deriveLpPda(PROGRAM_ID, SLAB, 1);
    expect(pda1.equals(pda2)).toBe(false);
  });
});

describe("derivePythPushOraclePDA", () => {
  const VALID_FEED = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

  it("returns deterministic results for valid hex", () => {
    const [pda1, bump1] = derivePythPushOraclePDA(VALID_FEED);
    const [pda2, bump2] = derivePythPushOraclePDA(VALID_FEED);
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
  });

  it("accepts 0x-prefixed feed IDs", () => {
    const [pda1] = derivePythPushOraclePDA(VALID_FEED);
    const [pda2] = derivePythPushOraclePDA("0x" + VALID_FEED);
    expect(pda1.equals(pda2)).toBe(true);
  });

  it("rejects non-hex characters", () => {
    expect(() => derivePythPushOraclePDA("g".repeat(64))).toThrow("non-hex");
  });

  it("rejects wrong length", () => {
    expect(() => derivePythPushOraclePDA("abcd1234")).toThrow("8 chars");
  });
});
