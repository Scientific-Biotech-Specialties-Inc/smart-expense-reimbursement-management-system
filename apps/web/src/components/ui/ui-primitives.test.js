// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { Button } from './button'
import { Badge } from './badge'
import { Card } from './card'
import { Skeleton } from './skeleton'

describe('Tier 1 UI Primitives', () => {
  it('renders Button with primary variant and Poppins font', () => {
    const wrapper = mount(Button, {
      slots: { default: 'Click Me' },
      props: { variant: 'primary' }
    })
    expect(wrapper.text()).toBe('Click Me')
    expect(wrapper.classes()).toContain('bg-primary')
    expect(wrapper.classes()).toContain('font-sans')
  })

  it('renders Button with cta variant using primary color according to design rules', () => {
    const wrapper = mount(Button, {
      slots: { default: 'New Request' },
      props: { variant: 'cta' }
    })
    expect(wrapper.classes()).toContain('bg-primary')
  })

  it('renders Badge with rounded-full geometry and medium tier', () => {
    const wrapper = mount(Badge, {
      slots: { default: 'Active' },
      props: { variant: 'success' }
    })
    expect(wrapper.text()).toBe('Active')
    expect(wrapper.classes()).toContain('rounded-full')
  })

  it('renders Card with Level 1 elevation and rounded-[14px]', () => {
    const wrapper = mount(Card, {
      slots: { default: '<div class="content">Metric</div>' }
    })
    expect(wrapper.classes()).toContain('rounded-[14px]')
    expect(wrapper.classes()).toContain('shadow-sm')
  })

  it('renders Skeleton with animate-pulse', () => {
    const wrapper = mount(Skeleton)
    expect(wrapper.classes()).toContain('animate-pulse')
  })
})
