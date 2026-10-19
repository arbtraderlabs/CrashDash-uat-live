/* Static-contract validation for the application shell's data artifacts. */

import { loadBundle } from "./browser.js?v=20261019T132550Z";
import { normaliseDashboard, normaliseRealBundle, normaliseInstrumentDetail, isInstrumentContractPayload } from "./real_contract.js?v=20261019T132550Z";

export { normaliseDashboard, normaliseRealBundle, normaliseInstrumentDetail, isInstrumentContractPayload };

export function normaliseHistory(payload) {
  const history = loadBundle(payload);
  if (!Array.isArray(history.records)) {
    throw new Error("invalid historical signal collection contract");
  }
  return history;
}
