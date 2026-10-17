// This file is part of HushLuxe/sigil.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { RegistrySimulator } from "./registry-simulator.js";
import { pureCircuits } from "../managed/sigil-registry/contract/index.js";
import type { RegistryPrivateState } from "../witnesses.js";

const secret = new Uint8Array(32);
for (let i = 0; i < 32; i++) secret[i] = (i + 11) & 0xff;

const pin = 1337n;
const wrongPin = pin + 1n;

const agentA = new Uint8Array(32);
agentA[31] = 0xaa;
const agentB = new Uint8Array(32);
agentB[31] = 0xbb;

function makeState(): RegistryPrivateState {
  return { secret };
}

function freshSim() {
  return new RegistrySimulator(makeState(), 0);
}

describe("Sigil Registry — registerPrincipal", () => {
  it("registers a principal commitment and increments the counter", () => {
    const sim = freshSim();
    sim.registerPrincipal(pin);

    const l = sim.getLedger();
    expect(l.registeredPrincipals).toBe(1n);
    expect(l.principals.size()).toBe(1n);
  });

  it("rejects a second registration by the same principal (same secret + pin)", () => {
    const sim = freshSim();
    sim.registerPrincipal(pin);
    expect(() => sim.registerPrincipal(pin)).toThrow(/Principal already registered/);
  });
});

describe("Sigil Registry — registerAgent", () => {
  it("authorises an agent under a registered principal", () => {
    const sim = freshSim();
    sim.registerPrincipal(pin);
    sim.registerAgent(pin, agentA);

    const l = sim.getLedger();
    expect(l.registeredAgents).toBe(1n);
    expect(l.authorisedPairs.size()).toBe(1n);
  });

  it("authorises multiple distinct agents", () => {
    const sim = freshSim();
    sim.registerPrincipal(pin);
    sim.registerAgent(pin, agentA);
    sim.registerAgent(pin, agentB);

    expect(sim.getLedger().registeredAgents).toBe(2n);
    expect(sim.getLedger().authorisedPairs.size()).toBe(2n);
  });

  it("rejects registering an agent under an unknown principal", () => {
    const sim = freshSim();
    expect(() => sim.registerAgent(pin, agentA)).toThrow(/Unknown principal/);
  });

  it("rejects a duplicate (principal, agent) registration", () => {
    const sim = freshSim();
    sim.registerPrincipal(pin);
    sim.registerAgent(pin, agentA);
    expect(() => sim.registerAgent(pin, agentA)).toThrow(/Agent already registered/);
  });

  it("rejects when the witness PIN does not match the principal", () => {
    const sim = freshSim();
    sim.registerPrincipal(pin);
    expect(() => sim.registerAgent(wrongPin, agentA)).toThrow(/Unknown principal/);
  });
});

describe("Sigil Registry — revokeAgent", () => {
  it("revokes a previously authorised agent and records the revocation", () => {
    const sim = freshSim();
    sim.registerPrincipal(pin);
    sim.registerAgent(pin, agentA);
    sim.revokeAgent(pin, agentA);

    const l = sim.getLedger();
    expect(l.authorisedPairs.size()).toBe(0n);
    expect(l.revokedPairs.size()).toBe(1n);
    expect(l.revokedAgentsCount).toBe(1n);
  });

  it("rejects revoking an agent that was never registered", () => {
    const sim = freshSim();
    sim.registerPrincipal(pin);
    expect(() => sim.revokeAgent(pin, agentA)).toThrow(/Agent not registered/);
  });

  it("rejects revoking the same (principal, agent) pair twice", () => {
    const sim = freshSim();
    sim.registerPrincipal(pin);
    sim.registerAgent(pin, agentA);
    sim.revokeAgent(pin, agentA);
    expect(() => sim.revokeAgent(pin, agentA)).toThrow(/Already revoked/);
  });

  it("blocks re-registration of a revoked agent (must be explicit no-op until the contract grows a lift primitive)", () => {
    const sim = freshSim();
    sim.registerPrincipal(pin);
    sim.registerAgent(pin, agentA);
    sim.revokeAgent(pin, agentA);
    expect(() => sim.registerAgent(pin, agentA)).toThrow(/Agent was revoked/);
  });
});

describe("Sigil Registry — isAgentAuthorized (query)", () => {
  it("returns true for an authorised pair", () => {
    const sim = freshSim();
    sim.registerPrincipal(pin);
    sim.registerAgent(pin, agentA);

    const pc = pureCircuits.derivePrincipalCommitment(secret, pin);
    expect(sim.isAgentAuthorized(pc, agentA)).toBe(true);
  });

  it("returns false for an unauthorised pair", () => {
    const sim = freshSim();
    sim.registerPrincipal(pin);
    const pc = pureCircuits.derivePrincipalCommitment(secret, pin);
    expect(sim.isAgentAuthorized(pc, agentA)).toBe(false);
  });

  it("returns false after revocation", () => {
    const sim = freshSim();
    sim.registerPrincipal(pin);
    sim.registerAgent(pin, agentA);
    sim.revokeAgent(pin, agentA);

    const pc = pureCircuits.derivePrincipalCommitment(secret, pin);
    expect(sim.isAgentAuthorized(pc, agentA)).toBe(false);
  });
});
