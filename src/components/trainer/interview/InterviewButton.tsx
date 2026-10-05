import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'outline'; size?: 'sm' }
export function Button({ variant, size, className, ...props }: Props) {
  return <button type="button" {...props} className={cn(
    'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
    variant === 'outline' ? 'border border-input bg-background hover:bg-accent' : 'bg-primary text-primary-foreground hover:bg-primary/90',
    size === 'sm' ? 'min-h-9 px-3 text-sm' : 'min-h-10 px-4 text-sm', className,
  )} />
}
