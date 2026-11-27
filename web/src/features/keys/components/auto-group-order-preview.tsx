/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { cn } from '@/lib/utils'

import { GroupRatioBadge, type GroupRatio } from './auto-group-visuals'

export type AutoGroupOrderPreviewItem = {
  value: string
  label: string
  desc?: string
  ratio?: GroupRatio
}

type AutoGroupOrderPreviewProps = {
  items: AutoGroupOrderPreviewItem[]
  ariaLabel: string
  /** Render the `›` flow connectors between groups. */
  showConnectors?: boolean
  className?: string
}

export function AutoGroupOrderPreview(props: AutoGroupOrderPreviewProps) {
  const showConnectors = props.showConnectors ?? true

  return (
    <ol
      data-slot='auto-group-order-preview'
      aria-label={props.ariaLabel}
      className={cn(
        'flex max-h-24 flex-wrap content-start gap-1.5 overflow-y-auto',
        props.className
      )}
    >
      {props.items.map((item, index) => (
        <li key={item.value} className='flex min-w-0 items-center gap-1'>
          {showConnectors && index > 0 && (
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={2}
              aria-hidden='true'
              data-slot='auto-group-order-preview-connector'
              className='text-muted-foreground size-3.5 shrink-0'
            />
          )}
          <span
            data-slot='auto-group-order-preview-chip'
            title={item.desc}
            className='bg-muted/30 flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1'
          >
            <span
              data-slot='auto-group-order-preview-index'
              aria-hidden='true'
              className='bg-primary/10 text-primary flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums'
            >
              {index + 1}
            </span>
            <span
              data-slot='auto-group-order-preview-name'
              className='max-w-40 truncate text-xs font-medium'
            >
              {item.label}
            </span>
            {item.desc && (
              <span
                data-slot='auto-group-order-preview-description'
                className='sr-only'
              >
                {item.desc}
              </span>
            )}
            <GroupRatioBadge ratio={item.ratio} />
          </span>
        </li>
      ))}
    </ol>
  )
}
