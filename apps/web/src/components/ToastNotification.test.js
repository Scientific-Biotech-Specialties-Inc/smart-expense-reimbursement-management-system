// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ToastNotification from '@/components/ToastNotification.vue'
import { useToast } from '@/composables/useToast'

describe('ToastNotification component and useToast composable', () => {
  beforeEach(() => {
    const { toasts } = useToast()
    toasts.value = []
  })

  it('renders a danger/error toast with solid white background and red border', async () => {
    const { addToast } = useToast()
    addToast({
      title: 'Audit Failed',
      message: 'Invalid password. Please try again.',
      type: 'danger'
    })

    const wrapper = mount(ToastNotification)
    const toastItem = wrapper.find('.toast-item')
    expect(toastItem.exists()).toBe(true)
    expect(toastItem.classes()).toContain('bg-white')
    expect(toastItem.classes()).toContain('border-l-danger')
    expect(wrapper.text()).toContain('Audit Failed')
    expect(wrapper.text()).toContain('Invalid password. Please try again.')
  })

  it('renders an error type toast properly', async () => {
    const { addToast } = useToast()
    addToast({
      message: 'Something went wrong',
      type: 'error'
    })

    const wrapper = mount(ToastNotification)
    const toastItem = wrapper.find('.toast-item')
    expect(toastItem.exists()).toBe(true)
    expect(toastItem.classes()).toContain('bg-white')
    expect(toastItem.classes()).toContain('border-l-danger')
    expect(wrapper.text()).toContain('Something went wrong')
  })

  it('renders a warning toast with warning border', async () => {
    const { addToast } = useToast()
    addToast({
      title: 'Warning',
      message: 'Please review receipt before submitting',
      type: 'warning'
    })

    const wrapper = mount(ToastNotification)
    const toastItem = wrapper.find('.toast-item')
    expect(toastItem.classes()).toContain('border-l-warning')
  })

  it('renders a success toast with success border', async () => {
    const { addToast } = useToast()
    addToast({
      title: 'Settlement Approved',
      message: 'The liquidation was approved.',
      type: 'success'
    })

    const wrapper = mount(ToastNotification)
    const toastItem = wrapper.find('.toast-item')
    expect(toastItem.classes()).toContain('border-l-success')
  })

  it('removes a toast when the close button is clicked', async () => {
    const { addToast } = useToast()
    addToast({
      message: 'Test message',
      type: 'info'
    })

    const wrapper = mount(ToastNotification)
    expect(wrapper.findAll('.toast-item').length).toBe(1)

    const closeBtn = wrapper.find('button')
    await closeBtn.trigger('click')

    expect(wrapper.findAll('.toast-item').length).toBe(0)
  })

  it('positions the toast container at the bottom-right of the viewport', () => {
    const wrapper = mount(ToastNotification)
    expect(wrapper.classes()).toContain('fixed')
    expect(wrapper.classes()).toContain('bottom-6')
    expect(wrapper.classes()).toContain('right-6')
    expect(wrapper.classes()).not.toContain('top-6')
  })
})
