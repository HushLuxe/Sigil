// This file is part of HushLuxe/sigil.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { SigilSimulator } from "./sigil-simulator.js";
import { pureCircuits } from "../managed/sigil/contract/index.js";
import type { SigilPolicy } from "../witnesses.js";
import type { SigilPrivateState } from "../witnesses.js";

// The simulator's on-chain block time (the value the stdlib
// blockTimeGte / blockTimeLte oracles read against). Every circuit call
// in this suite runs against a block at this timestamp; the test
// exercises both "currentTime in the past" and "currentTime in the
// future" relative to it.
const blockTime = 1_700_000_000n;
const now = blockTime; // alias: the simulator's "wall clock"
const future = now + 3600n;
const past = now - 3600n;

// 32-byte address-like identifiers used as targets.
const targetA = new Uint8Array(32);
targetA[31] = 0xa1;

const targetB = new Uint8Array(32);
targetB[31] = 0xb2;

const secret = new Uint8Array(32);
for (let i = 0; i < 32; i++) secret[i] = (i + 7) & 0xff;

const pin = 4242n;
const wrongPin = pin + 1n;

function makePolicy(overrides: Partial<SigilPolicy> = {}): SigilPolicy {
  return {
    principalPk: new Uint8Array(32), // overwritten below to match secret+pin
    rule: { target: targetA, selector: 0xa9059cbbn, perCallCap: 1_000_000n },
    dailyCap: 5_000_000n,
    expiresAt: future,
    paused: false,
    ...overrides,
  };
}

function makeState(overrides: Partial<SigilPolicy> = {}): SigilPrivateState {
  const policy = makePolicy(overrides);
  policy.principalPk = pureCircuits.derivePrincipalPk(secret, pin);
  return { secret, policy };
}

// A simulator pinned to the suite's block time. Use a fresh instance per
// test so each test controls its own time-relative state.
function freshSim(stateOverrides: Partial<SigilPolicy> = {}) {
  return new SigilSimulator(makeState(stateOverrides), Number(blockTime));
}

describe("Sigil — publishPolicy", () => {
  it("registers a policy and binds it to the derived principal", () => {
    const sim = freshSim();
    sim.publishPolicy(pin);

    const l = sim.getLedger();
    expect(l.authorizedCount).toBe(0n);
    expect(l.nullifiers.size()).toBe(0n);
    expect(l.policies.size()).toBe(1n);
    expect(l.principals.size()).toBe(1n);
  });
});

describe("Sigil — authorize (happy path)", () => {
  it("authorizes a valid intent at the on-chain block time and increments the counter", () => {
    const sim = freshSim();
    sim.publishPolicy(pin);

    sim.authorize(pin, targetA, 0xa9059cbbn, 500_000n, 1n, now);

    const l = sim.getLedger();
    expect(l.authorizedCount).toBe(1n);
    expect(l.nullifiers.size()).toBe(1n);
  });

  it("accepts a currentTime earlier than the on-chain block time (caller records a past moment)", () => {
    const sim = freshSim();
    sim.publishPolicy(pin);

    sim.authorize(pin, targetA, 0xa9059cbbn, 100n, 2n, past);
    expect(sim.getLedger().authorizedCount).toBe(1n);
  });

  it("authorizes multiple distinct intents in sequence", () => {
    const sim = freshSim();
    sim.publishPolicy(pin);

    sim.authorize(pin, targetA, 0xa9059cbbn, 100n, 1n, now);
    sim.authorize(pin, targetA, 0xa9059cbbn, 200n, 2n, now);

    expect(sim.getLedger().authorizedCount).toBe(2n);
    expect(sim.getLedger().nullifiers.size()).toBe(2n);
  });
});

describe("Sigil — authorize (rejections)", () => {
  it("rejects a target that the policy does not allow", () => {
    const sim = freshSim();
    sim.publishPolicy(pin);

    expect(() =>
      sim.authorize(pin, targetB, 0xa9059cbbn, 100n, 10n, now),
    ).toThrow(/Target not allowed/);
  });

  it("rejects a selector that the policy does not allow", () => {
    const sim = freshSim();
    sim.publishPolicy(pin);

    expect(() =>
      sim.authorize(pin, targetA, 0xdeadbeefn, 100n, 11n, now),
    ).toThrow(/Selector not allowed/);
  });

  it("rejects a value above the per-call cap", () => {
    const sim = freshSim();
    sim.publishPolicy(pin);

    expect(() =>
      sim.authorize(pin, targetA, 0xa9059cbbn, 2_000_000n, 12n, now),
    ).toThrow(/Exceeds per-call cap/);
  });

  it("rejects a value above the daily cap", () => {
    const sim = freshSim({
      rule: { target: targetA, selector: 0xa9059cbbn, perCallCap: 10_000_000n },
      dailyCap: 1_000_000n,
    });
    sim.publishPolicy(pin);

    expect(() =>
      sim.authorize(pin, targetA, 0xa9059cbbn, 2_000_000n, 13n, now),
    ).toThrow(/Exceeds daily cap/);
  });

  it("rejects an expired policy (on-chain time past expiresAt)", () => {
    const sim = freshSim({ expiresAt: past });
    sim.publishPolicy(pin);

    expect(() =>
      sim.authorize(pin, targetA, 0xa9059cbbn, 100n, 14n, now),
    ).toThrow(/Policy expired/);
  });

  it("rejects a paused policy", () => {
    const sim = freshSim({ paused: true });
    sim.publishPolicy(pin);

    expect(() =>
      sim.authorize(pin, targetA, 0xa9059cbbn, 100n, 15n, now),
    ).toThrow(/Policy paused/);
  });

  // Audit-grade time check: mirrors PollPower LD-C-1 / L-3. The caller
  // cannot claim a currentTime that is after the on-chain block time.
  it("rejects a currentTime in the future (blockTimeGte guard)", () => {
    const sim = freshSim();
    sim.publishPolicy(pin);

    expect(() =>
      sim.authorize(pin, targetA, 0xa9059cbbn, 100n, 20n, future),
    ).toThrow(/currentTime is in the future/);
  });

  it("rejects a replayed requestId (same secret + id)", () => {
    const sim = freshSim();
    sim.publishPolicy(pin);

    sim.authorize(pin, targetA, 0xa9059cbbn, 100n, 99n, now);
    expect(() =>
      sim.authorize(pin, targetA, 0xa9059cbbn, 100n, 99n, now),
    ).toThrow(/Request already authorized/);
  });

  it("rejects when the witness PIN does not match the policy principal", () => {
    const sim = freshSim();
    sim.publishPolicy(pin);

    expect(() =>
      sim.authorize(wrongPin, targetA, 0xa9059cbbn, 100n, 16n, now),
    ).toThrow(/Identity mismatch/);
  });
});
