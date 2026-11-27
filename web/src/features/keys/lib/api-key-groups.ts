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
import type { TFunction } from 'i18next'

import { translateServerText } from '@/lib/server-error-message'

import type { ApiKeyGroupOption } from '../components/api-key-group-combobox'

export type UserGroupInfo = {
  desc?: string | null
  ratio?: number | string | null
}

/** Turns the `/api/user/self/groups` map into the options shared by the key drawer and table. */
export function toApiKeyGroupOptions(
  t: TFunction,
  groups: Record<string, UserGroupInfo> | undefined
): ApiKeyGroupOption[] {
  return Object.entries(groups ?? {}).map(([value, info]) => ({
    value,
    label: value,
    desc: info.desc ? translateServerText(t, info.desc) : value,
    ratio: info.ratio ?? undefined,
  }))
}
