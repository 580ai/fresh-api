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
/* eslint-disable react-refresh/only-export-components */
import { useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  ListOrdered,
  Shuffle,
  SlidersHorizontal,
} from 'lucide-react'
import { useState, useMemo, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { BadgeListCell } from '@/components/data-table'
import { GroupBadge } from '@/components/group-badge'
import { ProviderBadge } from '@/components/provider-badge'
import { StatusBadge } from '@/components/status-badge'
import { TableId } from '@/components/table-id'
import { TruncatedText } from '@/components/truncated-text'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  formatQuotaWithCurrency,
  getCurrencyLabel,
} from '@/lib/currency'
import { toIntlLocale } from '@/i18n/languages'
import { formatTimestampToDate } from '@/lib/format'
import { truncateText } from '@/lib/utils'

import { getCodexUsage } from '../api'
import { CHANNEL_STATUS_CONFIG, MODEL_FETCHABLE_TYPES } from '../constants'
import {
  formatRelativeTime,
  formatResponseTime,
  getChannelTypeIcon,
  getChannelTypeLabel,
  getResponseTimeConfig,
  isMultiKeyChannel,
  parseModelsList,
  parseGroupsList,
  parseChannelSettings,
  handleUpdateChannelField,
  handleUpdateTagField,
  computeUpstreamRecon,
  isTagAggregateRow,
  type TagRow,
} from '../lib'
import { parseUpstreamUpdateMeta } from '../lib/upstream-update-utils'
import type { Channel } from '../types'
import { ChannelRowActionsLayoutContext } from './channel-row-actions-context'
import { useChannels } from './channels-provider'
import { DataTableRowActions } from './data-table-row-actions'
import { DataTableTagRowActions } from './data-table-tag-row-actions'
import {
  CodexUsageDialog,
  type CodexUsageDialogData,
} from './dialogs/codex-usage-dialog'
import { NumericSpinnerInput } from './numeric-spinner-input'

function parseIonetMeta(otherInfo: string | null | undefined): null | {
  source?: string
  deployment_id?: string
} {
  if (!otherInfo) {
    return null
  }
  try {
    const parsed = JSON.parse(otherInfo)
    if (parsed && typeof parsed === 'object') {
      return parsed
    }
  } catch {
    return null
  }
  return null
}

/**
 * Upstream update tags (+N / -N) shown on channel name for model-fetchable channels
 */
function UpstreamUpdateTags({ channel }: { channel: Channel }) {
  const { upstream, setCurrentRow } = useChannels()
  if (!MODEL_FETCHABLE_TYPES.has(channel.type)) {
    return null
  }

  const meta = parseUpstreamUpdateMeta(channel.settings)
  if (!meta.enabled) {
    return null
  }

  const addCount = meta.pendingAddModels.length
  const removeCount = meta.pendingRemoveModels.length
  if (addCount === 0 && removeCount === 0) {
    return null
  }

  return (
    <div className='flex items-center gap-0.5'>
      {addCount > 0 && (
        <StatusBadge
          label={`+${addCount}`}
          variant='success'
          size='sm'
          copyable={false}
          className='cursor-pointer'
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation()
            setCurrentRow(channel)
            upstream.openModal(
              channel,
              meta.pendingAddModels,
              meta.pendingRemoveModels,
              'add'
            )
          }}
        />
      )}
      {removeCount > 0 && (
        <StatusBadge
          label={`-${removeCount}`}
          variant='danger'
          size='sm'
          copyable={false}
          className='cursor-pointer'
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation()
            setCurrentRow(channel)
            upstream.openModal(
              channel,
              meta.pendingAddModels,
              meta.pendingRemoveModels,
              'remove'
            )
          }}
        />
      )}
    </div>
  )
}

/**
 * Priority cell component with inline editing
 */
function PriorityCell({ channel }: { channel: Channel }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isTagRow = isTagAggregateRow(channel)
  const priority = channel.priority
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingValue, setPendingValue] = useState<number | null>(null)

  // Tag row - editable with confirmation for all tag channels
  if (isTagRow) {
    const tag = channel.tag || ''
    const channelCount = channel.children?.length || 0

    return (
      <>
        <NumericSpinnerInput
          value={priority ?? 0}
          onChange={(value) => {
            setPendingValue(value)
            setConfirmOpen(true)
          }}
          min={-999}
        />
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t('Confirm Batch Update')}
          desc={t(
            'This will update the priority to {{value}} for all {{count}} channel(s) with tag "{{tag}}". Continue?',
            { value: pendingValue, count: channelCount, tag }
          )}
          confirmText={t('Update')}
          handleConfirm={() => {
            if (pendingValue !== null) {
              handleUpdateTagField(tag, 'priority', pendingValue, queryClient)
            }
            setConfirmOpen(false)
          }}
        />
      </>
    )
  }

  // Regular channel row - editable
  return (
    <NumericSpinnerInput
      value={priority ?? 0}
      onChange={(value) => {
        handleUpdateChannelField(channel.id, 'priority', value, queryClient)
      }}
      min={-999}
    />
  )
}

/**
 * Weight cell component with inline editing
 */
function WeightCell({ channel }: { channel: Channel }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isTagRow = isTagAggregateRow(channel)
  const weight = channel.weight
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingValue, setPendingValue] = useState<number | null>(null)

  // Tag row - editable with confirmation for all tag channels
  if (isTagRow) {
    const tag = channel.tag || ''
    const channelCount = channel.children?.length || 0

    return (
      <>
        <NumericSpinnerInput
          value={weight ?? 0}
          onChange={(value) => {
            setPendingValue(value)
            setConfirmOpen(true)
          }}
          min={0}
        />
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t('Confirm Batch Update')}
          desc={t(
            'This will update the weight to {{value}} for all {{count}} channel(s) with tag "{{tag}}". Continue?',
            { value: pendingValue, count: channelCount, tag }
          )}
          confirmText={t('Update')}
          handleConfirm={() => {
            if (pendingValue !== null) {
              handleUpdateTagField(tag, 'weight', pendingValue, queryClient)
            }
            setConfirmOpen(false)
          }}
        />
      </>
    )
  }

  // Regular channel row - editable
  return (
    <NumericSpinnerInput
      value={weight ?? 0}
      onChange={(value) => {
        handleUpdateChannelField(channel.id, 'weight', value, queryClient)
      }}
      min={0}
    />
  )
}

/**
 * Inline balance/used values longer than this switch to locale-aware compact
 * notation (e.g. "$28万"); the precise value stays available in the tooltip.
 */
const MAX_INLINE_BALANCE_CHARS = 8
const SENSITIVE_MASK = '••••'

/** 数值符号前缀（避免嵌套三元） */
function signPrefix(value: number): string {
  if (value > 0) {
    return '+'
  }
  if (value < 0) {
    return '-'
  }
  return ''
}

/**
 * 对账单元格：已用 / 误差 / 金额。
 *   已用 = 本站已用 L；误差 = 上游已用÷倍率 − L（>0 亏→红，≤0 赚→黑）；
 *   金额 = L×倍率（对私→红，对公/未标注→黑）。
 *   悬停展开：上游已用(原始)、折1倍率、误差、利润(含利润率)、结算金额。
 *   类型 57(Codex) 保留原「账户信息」弹窗（与对账无关，独立分支）。
 */
function BalanceCell({ channel }: { channel: Channel }) {
  const { t, i18n } = useTranslation()
  const layout = useContext(ChannelRowActionsLayoutContext)
  const { sensitiveVisible } = useChannels()
  const isTagRow = isTagAggregateRow(channel)
  const recon = computeUpstreamRecon(channel)
  const [isUpdating, setIsUpdating] = useState(false)
  const [codexUsageOpen, setCodexUsageOpen] = useState(false)
  const [codexUsageResponse, setCodexUsageResponse] =
    useState<CodexUsageDialogData | null>(null)
  const currencyLabel = getCurrencyLabel()
  const tokenSuffix = currencyLabel === 'Tokens' ? ' Tokens' : ''
  const withSuffix = (value: string) =>
    tokenSuffix && value !== '-' ? `${value}${tokenSuffix}` : value
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  // 精简展示（超长转紧凑记法）
  const inlineFmt = (value: number) => {
    const full = withSuffix(
      formatQuotaWithCurrency(value, {
        digitsLarge: 2,
        digitsSmall: 4,
        abbreviate: true,
        showSymbol: layout !== 'card',
      })
    )
    if (full.length <= MAX_INLINE_BALANCE_CHARS) {
      return full
    }
    return withSuffix(
      formatQuotaWithCurrency(value, {
        compact: true,
        locale,
        showSymbol: layout !== 'card',
      })
    )
  }
  // 精确展示（tooltip 用）
  const fullFmt = (value: number) =>
    withSuffix(
      formatQuotaWithCurrency(value, {
        digitsLarge: 2,
        digitsSmall: 4,
        abbreviate: false,
        showSymbol: layout !== 'card',
      })
    )
  const signedInline = (value: number) =>
    `${signPrefix(value)}${inlineFmt(Math.abs(value))}`
  const signedFull = (value: number) =>
    `${signPrefix(value)}${fullFmt(Math.abs(value))}`
  const mask = (s: string) => (sensitiveVisible ? s : SENSITIVE_MASK)

  const usedInline = inlineFmt(recon.local)
  const usedFull = fullFmt(recon.local)
  const usedLabel = `${t('Used:')} ${usedFull}`
  const maskedUsedLabel = `${t('Used:')} ${SENSITIVE_MASK}`

  // Tag row: only show cumulative used quota
  if (isTagRow) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <StatusBadge
                label={
                  sensitiveVisible
                    ? `${t('Used:')} ${usedInline}`
                    : maskedUsedLabel
                }
                variant='neutral'
                size='sm'
                copyable={false}
                showDot={false}
                className='-ml-1.5 cursor-help'
              />
            }
          />
          <TooltipContent>
            <p>{sensitiveVisible ? usedLabel : maskedUsedLabel}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // 类型 57(Codex)：保留「账户信息」弹窗
  if (channel.type === 57) {
    const handleCodexClick = async () => {
      if (isUpdating) {
        return
      }
      setIsUpdating(true)
      try {
        const res = await getCodexUsage(channel.id)
        if (!res.success) {
          throw new Error(res.message || t('Failed to fetch usage'))
        }
        setCodexUsageResponse(res)
        setCodexUsageOpen(true)
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t('Failed to fetch usage')
        )
      } finally {
        setIsUpdating(false)
      }
    }
    let codexLabel = SENSITIVE_MASK
    if (sensitiveVisible) {
      codexLabel = isUpdating ? t('Updating...') : t('Account Info')
    }
    return (
      <TooltipProvider>
        <div className='-ml-1.5 flex items-center gap-1'>
          <StatusBadge
            label={sensitiveVisible ? usedInline : SENSITIVE_MASK}
            variant='neutral'
            size='sm'
            copyable={false}
            showDot={false}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <StatusBadge
                  label={codexLabel}
                  variant='info'
                  size='sm'
                  copyable={false}
                  showDot={false}
                  className='cursor-pointer'
                  onClick={handleCodexClick}
                />
              }
            />
            <TooltipContent>
              <p>{t('Click to view Codex usage')}</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <CodexUsageDialog
          open={codexUsageOpen}
          onOpenChange={setCodexUsageOpen}
          channelName={channel.name}
          channelId={channel.id}
          channelDisplayName={sensitiveVisible ? undefined : SENSITIVE_MASK}
          channelDisplayId={sensitiveVisible ? undefined : SENSITIVE_MASK}
          response={codexUsageResponse}
          onRefresh={async () => {
            if (isUpdating) {
              return
            }
            setIsUpdating(true)
            try {
              const res = await getCodexUsage(channel.id)
              if (!res.success) {
                throw new Error(res.message || t('Failed to fetch usage'))
              }
              setCodexUsageResponse(res)
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : t('Failed to fetch usage')
              )
            } finally {
              setIsUpdating(false)
            }
          }}
          isRefreshing={isUpdating}
        />
      </TooltipProvider>
    )
  }

  // 普通渠道：已用 / 误差 / 金额
  const errorVariant =
    recon.hasUpstream && recon.error > 0 ? 'danger' : 'neutral'
  const amountVariant = recon.settlement === 'S' ? 'danger' : 'neutral'
  const errorBadgeVariant = sensitiveVisible ? errorVariant : 'neutral'
  const amountBadgeVariant = sensitiveVisible ? amountVariant : 'neutral'

  let errorTone = t('break-even')
  if (recon.error > 0) {
    errorTone = t('loss')
  } else if (recon.error < 0) {
    errorTone = t('profit')
  }
  let settlementLabel = t('unmarked')
  if (recon.settlement === 'S') {
    settlementLabel = t('private (S)')
  } else if (recon.settlement === 'G') {
    settlementLabel = t('public (G)')
  }
  const ratioLabel =
    recon.ratio === null ? t('unrecognized (÷1)') : `÷${recon.ratio}`
  const ratePart =
    recon.profitRate === null
      ? ''
      : ` (${(recon.profitRate * 100).toFixed(1)}%)`

  const detailRow = (label: string, value: string) => (
    <div className='flex justify-between gap-4'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='font-medium tabular-nums'>{value}</span>
    </div>
  )

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <div className='-ml-1.5 flex flex-wrap items-center gap-1 cursor-help'>
              <StatusBadge
                label={mask(usedInline)}
                variant='neutral'
                size='sm'
                copyable={false}
                showDot={false}
              />
              <StatusBadge
                label={recon.hasUpstream ? mask(signedInline(recon.error)) : '-'}
                variant={errorBadgeVariant}
                size='sm'
                copyable={false}
                showDot={false}
              />
              <StatusBadge
                label={mask(inlineFmt(recon.amount))}
                variant={amountBadgeVariant}
                size='sm'
                copyable={false}
                showDot={false}
              />
            </div>
          }
        />
        <TooltipContent className='max-w-xs'>
          {sensitiveVisible ? (
            <div className='space-y-0.5 text-xs'>
              {detailRow(t('Local used'), usedFull)}
              {recon.hasUpstream ? (
                <>
                  {detailRow(t('Upstream used (raw)'), fullFmt(recon.upstreamRaw))}
                  {detailRow(
                    `${t('Upstream ÷ratio')} (${ratioLabel})`,
                    fullFmt(recon.upstreamAdjusted)
                  )}
                  {detailRow(
                    t('Diff (upstream−local)'),
                    `${fullFmt(recon.upstreamAdjusted)} − ${fullFmt(recon.local)} = ${signedFull(recon.error)} ${errorTone}`
                  )}
                  {detailRow(t('Profit'), `${signedFull(recon.profit)}${ratePart}`)}
                </>
              ) : (
                <p className='text-muted-foreground'>{t('No upstream data yet')}</p>
              )}
              {detailRow(
                `${t('Settlement amount')} (${settlementLabel})`,
                `${fullFmt(recon.local)} × ${recon.ratio ?? 1} = ${fullFmt(recon.amount)}`
              )}
            </div>
          ) : (
            <p>{SENSITIVE_MASK}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Generate channels columns configuration
 */
export function useChannelsColumns(
  options: {
    enableSelection?: boolean
  } = {}
): ColumnDef<Channel>[] {
  const { t, i18n } = useTranslation()
  const { sensitiveVisible } = useChannels()
  const enableSelection = options.enableSelection ?? true
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  // The column definitions only depend on the translation function, the active
  // locale, and sensitive-data visibility. Memoizing keeps the array (and every
  // cell renderer reference) stable across unrelated re-renders, so react-table
  // does not invalidate the whole row model on each parent render.
  return useMemo<ColumnDef<Channel>[]>(
    () => [
      // Checkbox column
      ...(enableSelection
        ? [
            {
              id: 'select',
              header: ({ table }) => (
                <Checkbox
                  checked={table.getIsAllPageRowsSelected()}
                  indeterminate={table.getIsSomePageRowsSelected()}
                  onCheckedChange={(value) =>
                    table.toggleAllPageRowsSelected(!!value)
                  }
                  aria-label={t('Select all')}
                />
              ),
              cell: ({ row }) => {
                const isTagRow = isTagAggregateRow(row.original)

                // Don't show checkbox for tag rows
                if (isTagRow) {
                  return null
                }

                return (
                  <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label={t('Select row')}
                  />
                )
              },
              enableSorting: false,
              enableHiding: false,
              enableResizing: false,
              size: 40,
            } satisfies ColumnDef<Channel>,
          ]
        : []),

      // ID column
      {
        accessorKey: 'id',
        header: t('ID'),
        meta: { mobileHidden: true },
        cell: ({ row }) => {
          const id = row.getValue('id') as number
          return <TableId value={sensitiveVisible ? id : SENSITIVE_MASK} />
        },
        size: 80,
      },
      // Name column
      {
        accessorKey: 'name',
        header: t('Name'),
        meta: { mobileTitle: true },
        cell: ({ row }) => {
          const isTagRow = isTagAggregateRow(row.original)
          const name = row.getValue('name') as string
          const channel = row.original

          // Tag row with expand/collapse
          if (isTagRow) {
            const tag = (row.original as TagRow).tag || name
            const childrenCount = (row.original as TagRow).children?.length || 0

            return (
              <div className='flex items-center gap-2'>
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-6 w-6 p-0'
                  onClick={row.getToggleExpandedHandler()}
                >
                  {row.getIsExpanded() ? (
                    <ChevronDown className='h-4 w-4' />
                  ) : (
                    <ChevronRight className='h-4 w-4' />
                  )}
                </Button>
                <div className='flex items-center gap-1.5'>
                  <span className='font-semibold'>Tag：{tag}</span>
                  <StatusBadge
                    label={`${childrenCount} channels`}
                    variant='blue'
                    size='sm'
                    copyable={false}
                  />
                </div>
              </div>
            )
          }

          // Regular channel row
          const settings = parseChannelSettings(channel.setting)
          const isPassThrough = settings.pass_through_body_enabled === true
          const hasParamOverride = Boolean(channel.param_override?.trim())

          return (
            <div className='flex max-w-full min-w-0 items-center gap-2'>
              <div className='flex max-w-full min-w-0 flex-col gap-1'>
                <div className='flex max-w-full min-w-0 items-center gap-1.5'>
                  <TruncatedText
                    text={sensitiveVisible ? name : SENSITIVE_MASK}
                    className='font-medium'
                    maxWidth='max-w-full'
                  />
                  {isPassThrough && (
                    <TooltipProvider delay={100}>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <AlertTriangle className='h-3.5 w-3.5 flex-shrink-0 text-amber-500' />
                          }
                        />
                        <TooltipContent side='top'>
                          {t(
                            'Request body pass-through is enabled. The request body will be sent directly to the upstream without any conversion.'
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {hasParamOverride && (
                    <TooltipProvider delay={100}>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <SlidersHorizontal className='text-info h-3.5 w-3.5 flex-shrink-0' />
                          }
                        />
                        <TooltipContent side='top'>
                          {t('Override request parameters')}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <UpstreamUpdateTags channel={channel} />
                </div>
                {channel.remark && (
                  <TooltipProvider delay={200}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className='text-muted-foreground text-xs' />
                        }
                      >
                        {truncateText(channel.remark, 40)}
                      </TooltipTrigger>
                      <TooltipContent side='bottom' className='max-w-xs'>
                        {channel.remark}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          )
        },
        size: 260,
        minSize: 200,
      },

      // Type column
      {
        accessorKey: 'type',
        header: t('Type'),
        cell: ({ row }) => {
          const isTagRow = isTagAggregateRow(row.original)

          if (isTagRow) {
            return (
              <StatusBadge
                label={t('Tag Aggregate')}
                variant='blue'
                size='sm'
                copyable={false}
                className='-ml-1.5'
              />
            )
          }

          const type = row.getValue('type') as number
          const typeNameKey = getChannelTypeLabel(type)
          const typeName = t(typeNameKey)
          const iconName = getChannelTypeIcon(type)
          const channel = row.original as Channel
          const isMultiKey = isMultiKeyChannel(channel)
          const multiKeyMode = channel.channel_info?.multi_key_mode ?? 'random'
          const MultiKeyModeIcon =
            multiKeyMode === 'random' ? Shuffle : ListOrdered
          const multiKeyTooltip =
            multiKeyMode === 'random'
              ? t('Multi-key: Random rotation')
              : t('Multi-key: Polling rotation')

          const ionetMeta = parseIonetMeta(channel.other_info)
          const isIonet = ionetMeta?.source === 'ionet'
          const deploymentId =
            typeof ionetMeta?.deployment_id === 'string'
              ? ionetMeta?.deployment_id
              : undefined

          return (
            <div className='flex max-w-full min-w-0 items-center gap-2 overflow-hidden'>
              {isMultiKey && (
                <TooltipProvider delay={100}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className='border-border bg-muted text-primary inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border' />
                      }
                    >
                      <MultiKeyModeIcon className='h-3 w-3' />
                    </TooltipTrigger>
                    <TooltipContent side='top'>
                      {multiKeyTooltip}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <TooltipProvider delay={300}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <div className='max-w-full min-w-0 overflow-hidden' />
                    }
                  >
                    <ProviderBadge
                      iconKey={`${iconName}.Color`}
                      iconSize={18}
                      label={typeName}
                      colorText={false}
                      copyable={false}
                      showDot={false}
                      className='max-w-full min-w-0 overflow-hidden'
                    />
                  </TooltipTrigger>
                  <TooltipContent side='top'>{typeName}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {isIonet && (
                <TooltipProvider delay={100}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          className='flex cursor-pointer items-center gap-1.5 text-xs font-medium'
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!deploymentId) {
                              return
                            }
                            const targetUrl = `/models/deployments?dFilter=${encodeURIComponent(String(deploymentId))}`
                            window.open(targetUrl, '_blank', 'noopener')
                          }}
                        />
                      }
                    >
                      <StatusBadge
                        label='IO.NET'
                        variant='purple'
                        size='sm'
                        copyable={false}
                        className='cursor-pointer'
                      />
                    </TooltipTrigger>
                    <TooltipContent side='top'>
                      <div className='max-w-xs space-y-1'>
                        <div className='text-xs'>
                          {t('From IO.NET deployment')}
                        </div>
                        {deploymentId && (
                          <div className='text-muted-foreground font-mono text-xs'>
                            {t('Deployment ID')}: {deploymentId}
                          </div>
                        )}
                        <div className='text-muted-foreground text-xs'>
                          {t('Click to open deployment')}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          )
        },
        filterFn: (row, id, value) => {
          if (!value || value.length === 0 || value.includes('all')) {
            return true
          }
          return value.includes(String(row.getValue(id)))
        },
        size: 220,
        enableSorting: false,
      },

      // Status column
      {
        accessorKey: 'status',
        header: t('Status'),
        meta: { mobileBadge: true },
        cell: ({ row }) => {
          const isTagRow = isTagAggregateRow(row.original)
          const status = row.getValue('status') as number
          const channel = row.original as Channel

          // Tag row: show aggregated status
          if (isTagRow) {
            const childrenCount = (row.original as TagRow).children?.length || 0
            const hasEnabled = status === 1

            if (hasEnabled) {
              return (
                <StatusBadge
                  label={`Active (${childrenCount})`}
                  variant='success'
                  size='sm'
                  copyable={false}
                  className='-ml-1.5'
                />
              )
            } else {
              return (
                <StatusBadge
                  label={`Inactive (${childrenCount})`}
                  variant='neutral'
                  size='sm'
                  copyable={false}
                  className='-ml-1.5'
                />
              )
            }
          }

          // Regular channel row
          const config =
            CHANNEL_STATUS_CONFIG[
              status as keyof typeof CHANNEL_STATUS_CONFIG
            ] || CHANNEL_STATUS_CONFIG[0]

          const isMultiKey = isMultiKeyChannel(channel)
          const keySize = channel.channel_info?.multi_key_size ?? 0
          const disabledCount = channel.channel_info?.multi_key_status_list
            ? Object.keys(channel.channel_info.multi_key_status_list).length
            : 0
          const enabledCount = Math.max(0, keySize - disabledCount)
          const label =
            isMultiKey && keySize > 0
              ? `${t(config.label)} (${enabledCount}/${keySize})`
              : t(config.label)

          // Auto-disabled: show reason and time tooltip
          if (status === 3) {
            let statusReason = ''
            let statusTime = ''
            try {
              const otherInfo = channel.other_info
                ? JSON.parse(channel.other_info)
                : null
              if (otherInfo) {
                statusReason = otherInfo.status_reason || ''
                statusTime = otherInfo.status_time
                  ? formatTimestampToDate(otherInfo.status_time)
                  : ''
              }
            } catch {
              /* empty */
            }

            if (statusReason || statusTime) {
              return (
                <TooltipProvider delay={100}>
                  <Tooltip>
                    <TooltipTrigger render={<span />}>
                      <StatusBadge
                        label={label}
                        variant={config.variant}
                        size='sm'
                        copyable={false}
                      />
                    </TooltipTrigger>
                    <TooltipContent side='top' className='max-w-xs'>
                      <div className='space-y-1 text-xs'>
                        {statusReason && (
                          <div>
                            {t('Reason:')} {statusReason}
                          </div>
                        )}
                        {statusTime && (
                          <div>
                            {t('Time:')} {statusTime}
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            }
          }

          return (
            <StatusBadge
              label={label}
              variant={config.variant}
              size='sm'
              copyable={false}
            />
          )
        },
        filterFn: (row, id, value) => {
          if (!value || value.length === 0 || value.includes('all')) {
            return true
          }
          const status = row.getValue(id) as number
          if (value.includes('enabled')) {
            return status === 1
          }
          if (value.includes('disabled')) {
            return status !== 1
          }
          return false
        },
        size: 120,
        enableSorting: false,
      },

      // Models column
      {
        accessorKey: 'models',
        header: t('Models'),
        meta: { mobileHidden: true },
        cell: ({ row }) => {
          const models = row.getValue('models') as string
          const modelArray = parseModelsList(models)
          return (
            <BadgeListCell
              items={modelArray.map((model) => (
                <StatusBadge
                  key={model}
                  label={model}
                  autoColor={model}
                  size='sm'
                  className='font-mono'
                />
              ))}
            />
          )
        },
        size: 200,
        enableSorting: false,
      },

      // Group column
      {
        accessorKey: 'group',
        header: t('Groups'),
        meta: { mobileHidden: true },
        cell: ({ row }) => {
          const group = row.getValue('group') as string
          const groupArray = parseGroupsList(group)
          return (
            <BadgeListCell
              items={groupArray.map((g) => (
                <GroupBadge
                  key={g}
                  group={g}
                  label={sensitiveVisible ? undefined : SENSITIVE_MASK}
                  size='sm'
                />
              ))}
            />
          )
        },
        filterFn: (row, id, value) => {
          if (!value || value.length === 0 || value.includes('all')) {
            return true
          }
          const group = row.getValue(id) as string
          const groupArray = parseGroupsList(group)
          return groupArray.some((g) => value.includes(g))
        },
        size: 150,
        enableSorting: false,
      },

      // Tag column
      {
        accessorKey: 'tag',
        header: t('Tag'),
        meta: { mobileHidden: true },
        cell: ({ row }) => {
          const tag = row.getValue('tag') as string | null
          if (!tag) {
            return <span className='text-muted-foreground text-xs'>-</span>
          }

          return (
            <StatusBadge
              label={tag}
              autoColor={tag}
              size='sm'
              className='-ml-1.5'
            />
          )
        },
        size: 120,
        enableSorting: false,
      },

      // Priority column
      {
        accessorKey: 'priority',
        header: t('Priority'),
        meta: { mobileHidden: true },
        cell: ({ row }) => <PriorityCell channel={row.original} />,
        size: 100,
      },

      // Weight column
      {
        accessorKey: 'weight',
        header: t('Weight'),
        meta: { mobileHidden: true },
        cell: ({ row }) => <WeightCell channel={row.original} />,
        size: 90,
        enableSorting: false,
      },

      // 已用 / 误差 / 金额（对账列）
      {
        accessorKey: 'balance',
        header: () => (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className='inline-flex cursor-help items-center gap-1'>
                    {t('Used / Diff / Amount')}
                    <Info className='h-3 w-3 opacity-60' />
                  </span>
                }
              />
              <TooltipContent className='max-w-xs'>
                <p className='whitespace-pre-line text-xs leading-relaxed'>
                  {t(
                    '已用：本站消耗（1倍率）。\n误差：上游已用÷倍率 − 本站已用。>0 亏钱→红，≤0 赚钱→黑。\n金额：本站已用×倍率（折成上游结算额）。对私→红，对公/未标注→黑。\n倍率取渠道名倒数段，命名规范：类型-上游名称-倍率-S/G（S对私 G对公，可省略）。\n悬停单元格可见上游原始已用、利润与利润率。数据来自定时/批量核对。'
                  )}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ),
        cell: ({ row }) => <BalanceCell channel={row.original} />,
        size: 200,
      },

      // Response Time column
      {
        accessorKey: 'response_time',
        header: t('Response'),
        meta: { mobileHidden: true },
        cell: ({ row }) => {
          const responseTime = row.getValue('response_time') as number
          const config = getResponseTimeConfig(responseTime)

          return (
            <StatusBadge
              label={formatResponseTime(responseTime, t)}
              variant={config.variant}
              size='sm'
              copyable={false}
              className='-ml-1.5'
            />
          )
        },
        size: 110,
      },

      // Test Time column
      {
        accessorKey: 'test_time',
        header: t('Last Tested'),
        meta: { mobileHidden: true },
        cell: ({ row }) => {
          const testTime = row.getValue('test_time') as number

          // For invalid timestamps, show "Never" badge
          if (!testTime || testTime === 0) {
            return <span className='text-muted-foreground text-xs'>-</span>
          }

          const timeText = formatRelativeTime(testTime, locale)
          const fullDate = formatTimestampToDate(testTime)

          // For valid timestamps, show tooltip with full date
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <StatusBadge
                      label={timeText}
                      variant='neutral'
                      size='sm'
                      copyable={false}
                      className='-ml-1.5 cursor-pointer'
                    />
                  }
                />
                <TooltipContent side='top'>
                  <p className='font-mono text-sm'>{fullDate}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        },
        size: 120,
        enableSorting: false,
      },

      // Actions column
      {
        id: 'actions',
        header: () => t('Actions'),
        cell: ({ row }) => {
          // Check if this is a tag row (has children)
          const isTagRow = isTagAggregateRow(row.original)

          if (isTagRow) {
            return (
              <DataTableTagRowActions
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                row={row as any}
              />
            )
          }

          return <DataTableRowActions row={row} />
        },
        enableSorting: false,
        enableHiding: false,
        meta: { pinned: 'right' as const },
      },
    ],
    [enableSelection, t, locale, sensitiveVisible]
  )
}
