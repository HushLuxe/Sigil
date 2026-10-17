// This file is part of HushLuxe/sigil.
// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.

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
} from "../managed/sigil/contract/index.js";
import { type SigilPrivateState, witnesses } from "../witnesses.js";

export class SigilSimulator {
  readonly contract: Contract<SigilPrivateState>;
  circuitContext: CircuitContext<SigilPrivateState>;

  // The on-chain block time is seeded via createCircuitContext's `time`
  // argument and stays constant for this simulator instance, matching the
  // offline-test behavior of a single Midnight block. The contract's
  // blockTimeGte / blockTimeLte oracles read this value.
  constructor(initial: SigilPrivateState, blockTime: number = 0) {
    this.contract = new Contract<SigilPrivateState>(witnesses);
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
      undefined, // gasLimit
      undefined, // costModel
      blockTime, // time — on-chain block time for the simulator
    );
  }

  public getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public getPrivateState(): SigilPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  public publishPolicy(pin: bigint): Ledger {
    this.circuitContext = this.contract.impureCircuits.publishPolicy(
      this.circuitContext,
      pin,
    ).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public authorize(
    pin: bigint,
    target: Uint8Array,
    selector: bigint,
    value: bigint,
    requestId: bigint,
    currentTime: bigint,
  ): Ledger {
    this.circuitContext = this.contract.impureCircuits.authorize(
      this.circuitContext,
      pin,
      target,
      selector,
      value,
      requestId,
      currentTime,
    ).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }
}
