/**
 * ItemPage - Server Component
 * Based on Keystone's ItemPage but adapted for server-side rendering
 */

import { getItemAction } from '../../actions/getItemAction'
import { getListByPath } from '../../actions/getListByPath'
import { getAdminMetaAction, getItemValidationAction } from '../../actions'
import { notFound } from 'next/navigation'
import { ItemPageClient } from './ItemPageClient'

interface ItemPageParams {
  params: Promise<{
    listKey: string
    id: string
  }>
}

export async function ItemPage({ params }: ItemPageParams) {
  const resolvedParams = await params
  const listKey = resolvedParams.listKey
  const itemId = resolvedParams.id

  const list = await getListByPath(listKey)

  if (!list) {
    notFound()
  }

  // Fetch item data with cache options
  const cacheOptions = {
    next: {
      tags: [`item-${list.key}-${itemId}`],
      revalidate: 3600,
    },
  }

  // Use the working dashboard action for item data
  const response = await getItemAction(list, itemId, {}, cacheOptions)

  let fetchedItem: Record<string, unknown> | null = response.success ? (response.data?.item as Record<string, unknown> | null) ?? null : null
  // A record whose relationship cannot be read (a broken link) still exists: query it again without
  // the relationship fields, show it, and mark those fields unavailable. A null record is a real 404.
  const unavailable: string[] = []
  if (!fetchedItem) {
    const relationshipPaths = Object.values(list.fields as Record<string, any>)
      .filter((field: any) => typeof field.viewsIndex === 'number' && field.fieldMeta?.refListKey && field.path !== 'id')
      .map((field: any) => field.path as string)
    if (relationshipPaths.length) {
      const safeList = {
        ...list,
        fields: Object.fromEntries(Object.entries(list.fields as Record<string, any>).filter(([path]) => !relationshipPaths.includes(path))),
      }
      const safe = await getItemAction(safeList, itemId, {}, cacheOptions)
      const safeItem = safe.success ? (safe.data?.item as Record<string, unknown> | null) : null
      if (safeItem) {
        fetchedItem = { ...safeItem }
        for (const path of relationshipPaths) { fetchedItem[path] = null; unavailable.push(path) }
      }
    }
  }
  if (!fetchedItem) notFound()
  // Get adminMeta for the list structure
  const adminMetaResponse = await getAdminMetaAction(list.key)
  
  // Get item-specific validation data (including isRequired)
  const validationResponse = await getItemValidationAction(list.key, itemId)
  
  // Extract the list with proper field metadata if successful
  const adminMetaList = adminMetaResponse.success ? adminMetaResponse.data.list : null
  
  // Create enhanced list with validation data
  const enhancedList = adminMetaList || list
  
  // Add validation data to the enhanced list
  if (validationResponse.success && enhancedList.fields) {
    Object.keys(enhancedList.fields).forEach(fieldPath => {
      const validation = validationResponse.data?.[fieldPath]
      if (validation && enhancedList.fields[fieldPath]) {
        enhancedList.fields[fieldPath].itemView = {
          ...enhancedList.fields[fieldPath].itemView,
          ...validation
        }
      }
    })
  }

  const unavailableLabel = (path: string) => (path === 'user' ? 'Customer' : String(enhancedList.fields?.[path]?.label || path)) + ' unavailable'
  return (
    <>
      {unavailable.length > 0 && (
        <div role="status" className="mb-4 rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {unavailable.map(unavailableLabel).join(' · ')}: the linked record could not be read, so it is shown empty here.
        </div>
      )}
      <ItemPageClient
        list={enhancedList}
        item={fetchedItem}
        itemId={itemId}
      />
    </>
  )
}

export default ItemPage