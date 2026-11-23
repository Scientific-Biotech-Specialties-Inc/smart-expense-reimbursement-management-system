// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import DeleteConfirmModal from './DeleteConfirmModal.vue'

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: { email: 'admin@example.com' },
  }),
}))

describe('DeleteConfirmModal Idempotency Shield', () => {
  it('disables delete button and ignores enter key when isSubmitting is true', async () => {
    const wrapper = mount(DeleteConfirmModal, {
      props: {
        modelValue: true,
        isSubmitting: true,
      },
      global: {
        stubs: {
          BaseModal: {
            template: '<div><slot /></div>',
          },
        },
      },
    })

    const input = wrapper.find('input[type="password"]')
    expect(input.exists()).toBe(true)
    await input.setValue('secret123')
    await input.trigger('keyup.enter')

    expect(wrapper.emitted('confirm')).toBeFalsy()

    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('Confirm Delete'))
    expect(confirmBtn.attributes('disabled')).toBeDefined()
  })

  it('renders action buttons aligned to the right side of the modal (justify-end)', () => {
    const wrapper = mount(DeleteConfirmModal, {
      props: {
        modelValue: true,
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
