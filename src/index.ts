// @meddleware/walrus-relay — shared Vue 3 UI for the Walrus upload relay.
//
// Consumers must import the design tokens once at their entry:
//   import '@meddleware/design-tokens/tokens.css'
//
// Composables are parameterized (hosts / gate config injected) so both the
// standalone relay app and the token-deployer share one implementation.

export { default as WalrusUpload } from './components/WalrusUpload.vue'
export type { UploadResult } from './components/WalrusUpload.vue'
export { default as TipConfigBadge } from './components/TipConfigBadge.vue'
export { default as AccessGateCta } from './components/AccessGateCta.vue'

export { useWalrusRelay } from './composables/useWalrusRelay.js'
export type {
  WalrusRelayHosts,
  RelayAccessOptions,
  RelayOption,
} from './composables/useWalrusRelay.js'

export { useAccessGate } from './composables/useAccessGate.js'
export type {
  RelayGateConfig,
  GateExecutor,
  AccessGateConfig,
  OwnedObjectsClient,
  PersonalMessageSigner,
} from './composables/useAccessGate.js'

export {
  parseTipFromConfig,
  probeRelay,
  walrusBlobUrl,
  WALRUS_AGGREGATOR_HOSTS,
  MAX_SINGLE_RESERVATION_EPOCHS,
} from './lib/relay.js'
export type { RelayHealth, WalrusNetwork } from './lib/relay.js'

export {
  ACCESS_GATE_PACKAGE_ID,
  ACCESS_GATE_PLATFORM_CONFIG_ID,
  accessGateNftType,
} from './constants.js'
