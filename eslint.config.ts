import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginA11y from 'eslint-plugin-vuejs-accessibility'

// Flat ESLint config for the component library. Layers vue-a11y (WAI-ARIA
// linting for templates) on top of the standard Vue + TypeScript recommended
// rules, so accessibility regressions are caught in CI.
export default defineConfigWithVueTs(
  {
    name: 'walrus-relay/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/coverage/**', '**/*.d.ts']),

  ...pluginVue.configs['flat/essential'],
  ...pluginA11y.configs['flat/recommended'],
  vueTsConfigs.recommended,

  {
    name: 'walrus-relay/a11y-overrides',
    rules: {
      // <ol role="list"> is an intentional workaround: Safari/VoiceOver drops
      // list semantics when list-style is removed, so the explicit role stays.
      'vuejs-accessibility/no-redundant-roles': 'off',
      // Accept both valid label-association patterns: a label wrapping its
      // control (nesting) or a label[for] pointing at a control[id]. Both are
      // used by the form primitives (UiSegmentedControl nests; UiFormField uses for/id).
      'vuejs-accessibility/label-has-for': [
        'error',
        { required: { some: ['nesting', 'id'] } },
      ],
    },
  },
)
