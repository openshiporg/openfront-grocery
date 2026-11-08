/**
 * JSON field view - Keystone implementation with Shadcn UI
 */

import React from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { FieldContainer } from '@/components/ui/field-container'
import { FieldLabel } from '@/components/ui/field-label'
import { FieldDescription } from '@/components/ui/field-description'
import { JSON_LIST_PICKERS, ListPicker, parseKeyList, siblingSelectValue } from './ListPicker'
import { useList } from '@/features/dashboard/hooks/useAdminMeta'
import type {
  FieldController,
  FieldControllerConfig,
  FieldProps,
} from '../../types'

interface JSONFieldProps {
  field: {
    path: string
    label: string
    description?: string
    listKey?: string
  }
  value: string
  onChange?: (value: string) => void
  autoFocus?: boolean
  forceValidation?: boolean
  itemValue?: unknown
}

interface CellProps {
  item: Record<string, any>
  field: any
  value?: any
}

export function Field({
  field,
  value,
  onChange,
  autoFocus,
  forceValidation,
  itemValue,
}: JSONFieldProps) {
  const isReadOnly = onChange === undefined
  const errorMessage = forceValidation ? 'Invalid JSON' : undefined
  const picker = field.listKey ? JSON_LIST_PICKERS[`${field.listKey}.${field.path}`] : undefined
  const keys = picker ? parseKeyList(value) : null
  const switched = Boolean(picker?.switchedBy && siblingSelectValue(itemValue, picker.switchedBy.field) === picker.switchedBy.value)
  const { list: optionsList } = useList(picker?.switchedBy?.optionsFrom.listKey ?? '')
  const staticOptions = switched && picker?.switchedBy
    ? ((optionsList?.fields as any)?.[picker.switchedBy.optionsFrom.field]?.fieldMeta?.options ?? []).map((option: { label: string; value: string | number }) => ({ label: option.label, value: String(option.value) }))
    : undefined

  // Lists of record keys are picked by name; anything that isn't a plain list stays editable as JSON so it can be repaired.
  if (picker && keys) {
    return (
      <FieldContainer>
        <FieldLabel htmlFor={`field-${field.path}`}>{field.label}</FieldLabel>
        {field.description && (
          <FieldDescription>{field.description}</FieldDescription>
        )}
        <ListPicker
          id={`field-${field.path}`}
          picker={picker}
          keys={keys}
          staticOptions={staticOptions}
          onChange={isReadOnly ? undefined : (next) => onChange?.(JSON.stringify(next))}
        />
      </FieldContainer>
    )
  }

  return (
    <FieldContainer>
      <FieldLabel htmlFor={`field-${field.path}`} className={errorMessage ? "text-red-600" : ""}>
        {field.label}
      </FieldLabel>
      {field.description && (
        <FieldDescription>{field.description}</FieldDescription>
      )}
      <Textarea
        id={`field-${field.path}`}
        autoFocus={autoFocus}
        readOnly={isReadOnly}
        onChange={(e) => onChange?.(e.target.value)}
        value={value}
        className={`font-mono text-sm ${errorMessage ? 'border-red-500' : ''}`}
        rows={8}
        placeholder={`{\n  "key": "value"\n}`}
      />
      {errorMessage && (
        <div className="text-sm text-red-600" role="alert">{errorMessage}</div>
      )}
    </FieldContainer>
  )
}

export function Cell({ item, field, value }: CellProps) {
  const fieldValue = value ?? item[field.path]
  return (
    <div className="flex items-center gap-2">
      {fieldValue ? (
        <>
          <span className="text-sm font-mono text-muted-foreground truncate max-w-32">
            {JSON.stringify(fieldValue)}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </div>
  )
}

export function CardValue({ item, field }: CellProps) {
  const value = item[field.path]
  return (
    <div>
      <div className="text-sm font-medium">{field.label}</div>
      <div className="text-sm text-muted-foreground">
        {value ? (
          <div className="space-y-1">
            <Badge variant="secondary" className="text-xs">JSON</Badge>
            <pre className="text-xs font-mono bg-muted p-2 rounded overflow-auto max-h-32">
              {JSON.stringify(value, null, 2)}
            </pre>
          </div>
        ) : (
          '—'
        )}
      </div>
    </div>
  )
}

type Config = FieldControllerConfig<{ defaultValue: any }>

export function controller(config: Config): FieldController<string> & { listKey: string } {
  return {
    path: config.path,
    label: config.label,
    description: config.description,
    listKey: config.listKey,
    graphqlSelection: config.path,
    defaultValue:
      config.fieldMeta?.defaultValue === null
        ? ''
        : JSON.stringify(config.fieldMeta?.defaultValue, null, 2),
    validate: value => {
      if (!value) return true
      try {
        JSON.parse(value)
        return true
      } catch (e) {
        return false
      }
    },
    deserialize: data => {
      const value = data[config.path]
      // null is equivalent to Prisma.DbNull, and we show that as an empty input
      if (value === null) return ''
      return JSON.stringify(value, null, 2)
    },
    serialize: value => {
      if (!value) return { [config.path]: null }
      try {
        return { [config.path]: JSON.parse(value) }
      } catch (e) {
        return { [config.path]: undefined }
      }
    },
  }
}

Cell.supportsLinkTo = false