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
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const themeSchema = z.object({
  theme: z.enum(['default', 'classic']),
})

type ThemeFormValues = z.infer<typeof themeSchema>

type FrontendThemeSectionProps = {
  defaultValue: string
}

/**
 * 前端选型。classic 是本部署保留的自研前端，切换后页面会整页重载到另一套
 * 静态资源；因此这里直接刷新，而不是依赖客户端路由。
 */
export function FrontendThemeSection({
  defaultValue,
}: FrontendThemeSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const current = defaultValue === 'classic' ? 'classic' : 'default'

  const form = useForm<ThemeFormValues>({
    resolver: zodResolver(themeSchema),
    defaultValues: { theme: current },
  })

  useEffect(() => {
    form.reset({ theme: current })
  }, [current, form])

  const onSubmit = async (values: ThemeFormValues) => {
    if (values.theme === current) {
      return
    }
    await updateOption.mutateAsync({
      key: 'theme.frontend',
      value: values.theme,
    })
    // 两套前端是独立的静态资源包，必须整页重载才能切换
    window.location.replace('/')
  }

  return (
    <SettingsSection title={t('Frontend')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save frontend'
          />
          <FormField
            control={form.control}
            name='theme'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Dashboard frontend')}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value='default'>
                        {t('New frontend')}
                      </SelectItem>
                      <SelectItem value='classic'>
                        {t('Classic frontend')}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormDescription>
                  {t(
                    'Switching reloads the page. Classic is the retained dashboard; the new frontend is the upstream SPA.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
