// @meddleware/walrus-storage-kit — shared Vue 3 UI for the Walrus upload relay.
//
// Consumers must import the design tokens once at their entry:
//   import '@meddleware/design-tokens/tokens.css'
//
// Composables are parameterized (hosts / gate config injected) so both the
// standalone relay app and the token-issuance share one implementation.

export { default as WalrusUpload } from './components/WalrusUpload.vue'
export { default as TipConfigBadge } from './components/TipConfigBadge.vue'
export { default as AccessGateCta } from './components/AccessGateCta.vue'

export { useWalrusRelay, HEALTH_RECHECK_DELAYS_MS } from './composables/useWalrusRelay.js'
export type {
  WalrusRelayHosts,
  RelayAccessOptions,
  RelayOption,
} from './composables/useWalrusRelay.js'

export { useAccessGate, PENDING_PURCHASE_MS } from './composables/useAccessGate.js'
export type {
  RelayGateConfig,
  GateExecutor,
  AccessGateConfig,
  GateClient,
  OwnedObjectsClient,
  PurchaseTerms,
  SuiObjectClient,
} from './composables/useAccessGate.js'

export {
  parseTipFromConfig,
  parseTipConfig,
  estimateTipMist,
  approxEncodedBytes,
  MAX_TIP_MIST,
  MAX_TIP_CONFIG_BYTES,
  describeTip,
  fetchTipConfig,
  readBoundedJson,
  probeRelay,
  requireHttpsHost,
  relayOrigin,
  walrusBlobUrl,
  formatCoinAmount,
  formatCoinExact,
  WALRUS_AGGREGATOR_HOSTS,
  MAX_SINGLE_RESERVATION_EPOCHS,
} from './lib/relay.js'
export type { RelayHealth, RelayTipConfig, TipStatus, WalrusNetwork } from './lib/relay.js'

export { relayGateConfig, assertPinnedGate } from './constants.js'
export type { RelayGateInput } from './constants.js'

export {
  CORE_UPLOAD_STEPS,
  GATED_UPLOAD_STEPS,
  isUploadProgress,
} from './lib/upload-steps.js'
export type { UploadStepDef } from './lib/upload-steps.js'
// The upload conventions (progress, result, certify retry, existing copy) live in
// `@meddleware/walrus-storage-client/flow`; import them from there.
