import { describe, it, expect } from "vitest";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  encodeStakeInitPool,
  encodeStakeDeposit,
  encodeStakeWithdraw,
  encodeStakeFlushToInsurance,
  encodeStakeUpdateConfig,
  encodeStakeTransferAdmin,
  encodeStakeAdminSetOracleAuthority,
  encodeStakeAdminSetRiskThreshold,
  encodeStakeAdminSetMaintenanceFee,
  encodeStakeAdminResolveMarket,
  encodeStakeAdminWithdrawInsurance,
  encodeStakeAccrueFees,
  encodeStakeInitTradingPool,
  encodeStakeAdminSetHwmConfig,
  encodeStakeAdminSetTrancheConfig,
  encodeStakeDepositJunior,
  encodeStakeAdminSetInsurancePolicy,
  deriveStakePool,
  deriveStakeVaultAuth,
  deriveDepositPda,
  STAKE_IX,
} from "../src/solana/stake.js";

describe("stake instruction encoders return Uint8Array (not Buffer)", () => {
  const pk = Keypair.generate().publicKey;

  it("encodeStakeInitPool", () => {
    const data = encodeStakeInitPool(100n, 500n);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.InitPool);
    expect(data.length).toBe(1 + 8 + 8);
  });

  it("encodeStakeDeposit", () => {
    const data = encodeStakeDeposit(1_000_000n);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.Deposit);
    expect(data.length).toBe(1 + 8);
  });

  it("encodeStakeWithdraw", () => {
    const data = encodeStakeWithdraw(500_000n);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.Withdraw);
    expect(data.length).toBe(1 + 8);
  });

  it("encodeStakeFlushToInsurance", () => {
    const data = encodeStakeFlushToInsurance(200n);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.FlushToInsurance);
    expect(data.length).toBe(1 + 8);
  });

  it("encodeStakeUpdateConfig (both set)", () => {
    const data = encodeStakeUpdateConfig(50n, 1000n);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.UpdateConfig);
    expect(data[1]).toBe(1);
    expect(data[10]).toBe(1);
    expect(data.length).toBe(1 + 1 + 8 + 1 + 8);
  });

  it("encodeStakeUpdateConfig (none set)", () => {
    const data = encodeStakeUpdateConfig();
    expect(data[1]).toBe(0);
    expect(data[10]).toBe(0);
  });

  it("encodeStakeTransferAdmin", () => {
    const data = encodeStakeTransferAdmin();
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.TransferAdmin);
    expect(data.length).toBe(1);
  });

  it("encodeStakeAdminSetOracleAuthority", () => {
    const data = encodeStakeAdminSetOracleAuthority(pk);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminSetOracleAuthority);
    expect(data.length).toBe(1 + 32);
  });

  it("encodeStakeAdminSetRiskThreshold", () => {
    const data = encodeStakeAdminSetRiskThreshold(1000n);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminSetRiskThreshold);
    expect(data.length).toBe(1 + 16);
  });

  it("encodeStakeAdminSetMaintenanceFee", () => {
    const data = encodeStakeAdminSetMaintenanceFee(500n);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminSetMaintenanceFee);
    expect(data.length).toBe(1 + 16);
  });

  it("encodeStakeAdminResolveMarket", () => {
    const data = encodeStakeAdminResolveMarket();
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminResolveMarket);
    expect(data.length).toBe(1);
  });

  it("encodeStakeAdminWithdrawInsurance", () => {
    const data = encodeStakeAdminWithdrawInsurance(100n);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminWithdrawInsurance);
    expect(data.length).toBe(1 + 8);
  });

  it("encodeStakeAccrueFees", () => {
    const data = encodeStakeAccrueFees();
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AccrueFees);
    expect(data.length).toBe(1);
  });

  it("encodeStakeInitTradingPool", () => {
    const data = encodeStakeInitTradingPool(200n, 10_000n);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.InitTradingPool);
    expect(data.length).toBe(1 + 8 + 8);
  });

  it("encodeStakeAdminSetHwmConfig", () => {
    const data = encodeStakeAdminSetHwmConfig(true, 5000);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminSetHwmConfig);
    expect(data[1]).toBe(1);
    expect(data.length).toBe(1 + 1 + 2);
  });

  it("encodeStakeAdminSetTrancheConfig", () => {
    const data = encodeStakeAdminSetTrancheConfig(2000);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminSetTrancheConfig);
    expect(data.length).toBe(1 + 2);
  });

  it("encodeStakeDepositJunior", () => {
    const data = encodeStakeDepositJunior(750_000n);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.DepositJunior);
    expect(data.length).toBe(1 + 8);
  });

  it("encodeStakeAdminSetInsurancePolicy", () => {
    const data = encodeStakeAdminSetInsurancePolicy(pk, 100n, 5000, 300n);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data[0]).toBe(STAKE_IX.AdminSetInsurancePolicy);
    expect(data.length).toBe(1 + 32 + 8 + 2 + 8);
  });
});

describe("stake PDA derivations work without Buffer", () => {
  const slab = Keypair.generate().publicKey;
  const user = Keypair.generate().publicKey;
  const programId = Keypair.generate().publicKey;

  it("deriveStakePool returns a valid PublicKey", () => {
    const [pda, bump] = deriveStakePool(slab, programId);
    expect(pda).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
  });

  it("deriveStakeVaultAuth returns a valid PublicKey", () => {
    const [pool] = deriveStakePool(slab, programId);
    const [pda, bump] = deriveStakeVaultAuth(pool, programId);
    expect(pda).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });

  it("deriveDepositPda returns a valid PublicKey", () => {
    const [pool] = deriveStakePool(slab, programId);
    const [pda, bump] = deriveDepositPda(pool, user, programId);
    expect(pda).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });

  it("deterministic — same inputs always produce same PDA", () => {
    const [pda1] = deriveStakePool(slab, programId);
    const [pda2] = deriveStakePool(slab, programId);
    expect(pda1.toBase58()).toBe(pda2.toBase58());
  });
});
