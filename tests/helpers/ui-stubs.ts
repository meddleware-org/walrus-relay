// Stand-ins for the two @meddleware/ui primitives the widget renders. Their prebuilt dist does not
// render under these jsdom tests (a separate Vue copy); they are covered by @meddleware/ui's own tests
// and, in a real browser, by the contrast gate (e2e/contrast.spec.ts).
import { defineComponent, h } from 'vue'

export const UiDialog = defineComponent({
  props: { open: Boolean, title: String, dismissible: { type: Boolean, default: true }, width: String },
  setup(props, { slots }) {
    return () =>
      props.open
        ? h('dialog', { open: true, 'aria-labelledby': 'dlg-title' }, [
            h('article', [
              h('header', [h('h2', { id: 'dlg-title' }, props.title)]),
              slots.default?.(),
              slots.actions ? h('footer', slots.actions()) : null,
            ]),
          ])
        : null
  },
})

export const UiStepper = defineComponent({
  props: { steps: Array, modelValue: Number },
  setup(props) {
    return () => h('ol', (props.steps as { id: string; label: string }[]).map((s) => h('li', { key: s.id }, s.label)))
  },
})
