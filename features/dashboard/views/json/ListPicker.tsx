'use client'

/**
 * Some JSON fields hold a plain list of record keys (department handles, product IDs).
 * Staff pick those records by name here; the stored value stays the same JSON array
 * checkout reads, so nothing downstream changes.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CustomMultiSelect, type Option } from '../relationship/client/components/CustomMultiSelect'
import { getRelationshipOptions } from '@/features/dashboard/actions/relationship'

export type JsonListPicker = {
  /** Keystone list the keys point at. */
  listKey: string
  listQueryName: string
  /** Field on that list whose value is stored in the JSON array. */
  valueField: string
  /** Field shown to staff. */
  labelField: string
  placeholder: string
  /**
   * A sibling select that changes what the keys mean. When it holds `value`, the keys are
   * the options of `optionsFrom` (a select field on another list) instead of records.
   */
  switchedBy?: { field: string; value: string; optionsFrom: { listKey: string; field: string } }
}

export const JSON_LIST_PICKERS: Record<string, JsonListPicker> = {
  'Coupon.productCategories': {
    listKey: 'Department', listQueryName: 'departments', valueField: 'handle', labelField: 'name', placeholder: 'Every department',
    // Older coupons match the product's own department select, not the store's departments (see commercialPricing.isCouponLineEligible).
    switchedBy: { field: 'categoryTaxonomy', value: 'legacy_department', optionsFrom: { listKey: 'Product', field: 'department' } },
  },
  'Coupon.excludedProducts': { listKey: 'Product', listQueryName: 'products', valueField: 'id', labelField: 'title', placeholder: 'No products excluded' },
}

/** Parses the field's JSON text as a list of strings; null when it isn't one (the raw editor is shown instead). */
export function parseKeyList(value: string): string[] | null {
  if (!value || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (parsed === null) return []
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string') ? parsed : null
  } catch {
    return null
  }
}

const PAGE = 20

/** The select value a form holds for a sibling field, from either a deserialized select ({ value: { value } }) or a raw string. */
export function siblingSelectValue(itemValue: unknown, field: string): string | null {
  const entry = (itemValue as Record<string, any> | undefined)?.[field]
  if (typeof entry === 'string') return entry
  const chosen = entry?.value?.value ?? entry?.value
  return typeof chosen === 'string' ? chosen : null
}

export function ListPicker(props: {
  picker: JsonListPicker
  keys: string[]
  onChange?: (keys: string[]) => void
  id: string
  /** Fixed choices; when given, no records are fetched. */
  staticOptions?: Option[]
}) {
  if (props.staticOptions) return <StaticPicker {...props} staticOptions={props.staticOptions} />
  return <RecordPicker {...props} />
}

function StaticPicker({ picker, keys, onChange, id, staticOptions }: Parameters<typeof ListPicker>[0] & { staticOptions: Option[] }) {
  const labels = Object.fromEntries(staticOptions.map((option) => [option.value, option.label]))
  return (
    <div id={id}>
      <CustomMultiSelect
        value={keys.map((key) => ({ value: key, label: labels[key] ?? key }))}
        options={staticOptions}
        onChange={onChange ? (next) => onChange(next.map((option) => option.value)) : undefined}
        onInputChange={async (text) => staticOptions.filter((option) => option.label.toLowerCase().includes(text.trim().toLowerCase()))}
        placeholder={picker.placeholder}
        isDisabled={!onChange}
      />
    </div>
  )
}

function RecordPicker({
  picker,
  keys,
  onChange,
  id,
}: Parameters<typeof ListPicker>[0]) {
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [options, setOptions] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const gqlNames = useMemo(() => ({
    whereInputName: `${picker.listKey}WhereInput`,
    listQueryName: picker.listQueryName,
    listQueryCountName: `${picker.listQueryName}Count`,
  }), [picker])

  const fetchOptions = useCallback(async (where: Record<string, unknown>, take: number): Promise<Option[]> => {
    const selection = picker.valueField === 'id' ? '' : picker.valueField
    const result = await getRelationshipOptions(picker.listKey, where, take, 0, picker.labelField, selection, gqlNames)
    const items = result.success ? (result.data?.items ?? []) : []
    return items.map((item: any) => ({ value: String(item[picker.valueField]), label: String(item[picker.labelField] ?? item[picker.valueField]) }))
  }, [picker, gqlNames])

  const keyList = keys.join('\u0000')
  useEffect(() => {
    let cancelled = false
    const wanted = keyList ? keyList.split('\u0000') : []
    Promise.all([
      fetchOptions({}, PAGE),
      wanted.length ? fetchOptions({ [picker.valueField]: { in: wanted } }, wanted.length) : Promise.resolve([] as Option[]),
    ]).then(([first, chosen]) => {
      if (cancelled) return
      setOptions(first)
      setLabels((current) => ({ ...current, ...Object.fromEntries([...first, ...chosen].map((option) => [option.value, option.label])) }))
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [keyList, fetchOptions, picker.valueField])

  const search = useCallback(async (text: string) => {
    const term = text.trim()
    const found = await fetchOptions(term ? { [picker.labelField]: { contains: term, mode: 'insensitive' } } : {}, PAGE)
    setLabels((current) => ({ ...current, ...Object.fromEntries(found.map((option) => [option.value, option.label])) }))
    return found
  }, [fetchOptions, picker.labelField])

  // A key that no longer matches a record (deleted product, older department value) still shows, by its key, so it can be removed.
  const value: Option[] = keys.map((key) => ({ value: key, label: labels[key] ?? (loading ? '…' : key) }))

  return (
    <div id={id}>
      <CustomMultiSelect
        value={value}
        options={options}
        onChange={onChange ? (next) => onChange(next.map((option) => option.value)) : undefined}
        onInputChange={search}
        placeholder={picker.placeholder}
        isLoading={loading}
        isDisabled={!onChange}
      />
    </div>
  )
}
