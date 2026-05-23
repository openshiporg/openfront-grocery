/**
 * Get List Counts - dashboard server action to fetch item counts for visible lists.
 *
 * Counts are best-effort. Some vertical models have stricter query permissions
 * than the dashboard landing page itself, so one denied count field should not
 * make the whole dashboard look broken.
 */

'use server'

import { keystoneClient } from '../lib/keystoneClient'

type CountableList = {
  key: string;
  isSingleton?: boolean;
  graphql?: {
    names?: {
      listQueryCountName?: string;
    };
  };
}

export async function getListCounts(lists: CountableList[]) {
  const listsToCount = lists.filter(
    (list) => !list.isSingleton && list.graphql?.names?.listQueryCountName
  )

  if (listsToCount.length === 0) return { success: true, data: {} }

  const countEntries = await Promise.all(
    listsToCount.map(async (list) => {
      const countName = list.graphql?.names?.listQueryCountName
      if (!countName) return [list.key, null] as const

      const response = await keystoneClient<{ count: number }>(
        `query Get${list.key}Count { count: ${countName} }`,
        {},
        {
          next: {
            revalidate: 60,
            tags: ['list-counts', `list-counts:${list.key}`],
          },
        }
      )

      if (!response.success) {
        console.warn(`Skipping inaccessible count for ${list.key}:`, response.error)
        return [list.key, null] as const
      }

      return [list.key, response.data.count] as const
    })
  )

  return {
    success: true,
    data: Object.fromEntries(countEntries),
  }
}
