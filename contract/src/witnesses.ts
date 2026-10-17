// This file is part of HushLuxe/sigil.
// SPDX-License-Identifier: Apache-2.0
// See LICENSE and NOTICE in the repository root.

// Private state carried by the agent when running the Sigil circuit.
// In production these values are produced by the Sigil SDK and never
// leave the agent's local prover. The simulator in this package uses
// them directly so the contract logic can be exercised off-chain.

import { WitnessContext } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import type { Ledger } from "./managed/sigil/contract/index.js";

// The Compact `SigilPolicy` struct is not re-exported by the generated
// TypeScript bindings, so we mirror its shape here. The structural
// type is what the runtime checks, so this stays in sync with the
// `sigil.compact` declaration and the `getPolicy` witness signature.
export interface SigilPolicy {
  principalPk: Uint8Array;
  rule: { target: Uint8Array; selector: bigint; perCallCap: bigint };
  dailyCap: bigint;
  expiresAt: bigint;
  paused: boolean;
}

export interface SigilPrivateState {
  // The agent's 32-byte secret. In production this is held in the Lace
  // wallet or derived from a passkey. The simulator accepts it as a
  // raw byte array for testability.
  secret: Uint8Array;

  // The plaintext policy the agent is currently acting under. The
  // contract hashes it to a PolicyId and proves membership; the
  // plaintext never leaves the witness.
  policy: SigilPolicy;
}

// Witness wiring. Each function receives the current WitnessContext
// (carrying the public ledger and the private state) and returns the
// next private state together with the value the contract requested.
// This matches the generated `Witnesses<PS>` signature exactly.
export const witnesses = {
  getUserSecret: ({
    privateState,
  }: WitnessContext<Ledger, SigilPrivateState>): [SigilPrivateState, Uint8Array] => {
    if (!privateState.secret || privateState.secret.length !== 32) {
      throw new Error("getUserSecret: secret is missing or wrong length");
    }
    return [privateState, privateState.secret];
  },

  getPolicy: ({
    privateState,
  }: WitnessContext<Ledger, SigilPrivateState>): [SigilPrivateState, SigilPolicy] => {
    return [privateState, privateState.policy];
  },
};
