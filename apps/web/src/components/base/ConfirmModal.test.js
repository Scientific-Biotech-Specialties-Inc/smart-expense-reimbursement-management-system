// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ConfirmModal from './ConfirmModal.vue'

describe('ConfirmModal Idempotency Shield', () => {
  it('disables button immediately and emits confirm exactly once on rapid double click', async () => {
    const wrapper = mount(ConfirmModal, {
      props: {
        isOpen: true,
        title: 'Submit Claim',
        message: 'Are you sure?',
      },
      global: {
        stubs: {
          BaseModal: {
            template: '<div><slot /></div>',
          },
        },
      },
    })

    const buttons = wrapper.findAll('button')
    const confirmBtn = buttons.find((b) => b.text().includes('Confirm'))
    expect(confirmBtn).toBeDefined()

    // Simulate rapid double click
    await confirmBtn.trigger('click')
    await confirmBtn.trigger('click')

    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('renders action buttons aligned to the right side of the modal (justify-end)', () => {
    const wrapper = mount(ConfirmModal, {
      props: {
        isOpen: true,
        title: 'Confirm Action',
        message: 'Are you sure?',
      },
      global: {
        stubs: {
          BaseModal: {
            template: '<div><slot /></div>',
          },
        },
      },
    })

    const footer = wrapper.find('.justify-end')
    expect(footer.exists()).toBe(true)
    expect(footer.classes()).toContain('justify-end')
  })
})
