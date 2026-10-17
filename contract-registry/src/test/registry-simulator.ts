// This file is part of HushLuxe/sigil.
// SPDX-License-Identifier: Apache-2.0

import {
  type CircuitContext,
  sampleContractAddress,
  createConstructorContext,
  createCircuitContext,
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  type Ledger,
  ledger,
} from "../managed/sigil-registry/contract/index.js";
import { type RegistryPrivateState, witnesses } from "../witnesses.js";

export class RegistrySimulator {
  readonly contract: Contract<RegistryPrivateState>;
  circuitContext: CircuitContext<RegistryPrivateState>;

  constructor(initial: RegistryPrivateState, blockTime: number = 0) {
    this.contract = new Contract<RegistryPrivateState>(witnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(
      createConstructorContext(initial, "0".repeat(64)),
    );
    this.circuitContext = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
      undefined,
      undefined,
      blockTime,
    );
  }

  public getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public registerPrincipal(pin: bigint): Ledger {
    this.circuitContext = this.contract.impureCircuits.registerPrincipal(
      this.circuitContext,
      pin,
    ).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public registerAgent(pin: bigint, agentCommitment: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.registerAgent(
      this.circuitContext,
      pin,
      agentCommitment,
    ).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public revokeAgent(pin: bigint, agentCommitment: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.revokeAgent(
      this.circuitContext,
      pin,
      agentCommitment,
    ).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public isAgentAuthorized(
    principal: Uint8Array,
    agent: Uint8Array,
  ): boolean {
    return this.contract.circuits.isAgentAuthorized(
      this.circuitContext,
      principal,
      agent,
    ).result;
  }
}
