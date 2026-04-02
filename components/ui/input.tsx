import * as React from 'react'

import { cn } from '@/lib/utils'
import { useWheelStep } from '@/hooks/useWheelStep'

/**
 * shadcn/ui Input with focus-gated scroll-wheel support for number inputs.
 *
 * When `type="number"`, clicking the input (giving it focus) enables
 * scroll-wheel adjustment. Scrolling without focus passes through
 * to the parent container. Hold Shift for fine-stepping (step/10).
 */
function Input({ className, type, onChange, ...props }: React.ComponentProps<'input'>) {
  const ref = React.useRef<HTMLInputElement>(null)
  const isNumber = type === 'number'

  // Store onChange in a ref so the wheel handler always has the latest
  const onChangeRef = React.useRef(onChange)
  onChangeRef.current = onChange

  // Parse wheel-step params from the input's min/max/step/value props
  const min = isNumber ? parseFloat(String(props.min ?? 0)) : 0
  const max = isNumber ? parseFloat(String(props.max ?? 100)) : 100
  const step = isNumber ? parseFloat(String(props.step ?? 1)) : 1
  const numValue = isNumber ? parseFloat(String(props.value ?? 0)) || 0 : 0

  useWheelStep(
    isNumber ? ref : { current: null },
    {
      value: numValue,
      min,
      max,
      step,
      onChange: (v) => {
        const el = ref.current
        if (!el || !onChangeRef.current) return
        // Set the DOM value so e.target.value reads correctly
        el.value = String(v)
        // Call React onChange directly with a synthetic-like event
        onChangeRef.current({
          target: el,
          currentTarget: el,
        } as React.ChangeEvent<HTMLInputElement>)
      },
    },
  )

  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      onChange={onChange}
      className={cn(
        'console-input file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground h-9 w-full min-w-0 rounded-md px-3 py-1 text-base outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:ring-0',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
