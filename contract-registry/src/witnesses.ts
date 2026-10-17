// This file is part of HushLuxe/sigil.
// SPDX-License-Identifier: Apache-2.0

import { WitnessContext } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import type { Ledger } from "./managed/sigil-registry/contract/index.js";

export interface RegistryPrivateState {
  // The principal's 32-byte secret. The same secret can derive a
  // different principal commitment in the gate contract via a
  // different pin, but the witness is a single slot per principal.
  secret: Uint8Array;
}

export const witnesses = {
  getUserSecret: ({
    privateState,
  }: WitnessContext<Ledger, RegistryPrivateState>): [RegistryPrivateState, Uint8Array] => {
    if (!privateState.secret || privateState.secret.length !== 32) {
      throw new Error("getUserSecret: secret is missing or wrong length");
    }
    return [privateState, privateState.secret];
  },
};
