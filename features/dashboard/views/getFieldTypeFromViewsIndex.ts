import { VIEW_ORDER } from '../../keystone/view-order';

/**
 * Get the field type from Keystone's zero-based admin-meta view index.
 * @param viewsIndex The views index of the field
 * @returns The field type name
 */
export function getFieldTypeFromViewsIndex(viewsIndex: number): string {
  const fieldType = VIEW_ORDER[viewsIndex];

  if (typeof fieldType !== 'string') {
    throw new Error(`Invalid views index: ${viewsIndex}. Available indices: 0-${VIEW_ORDER.length - 1}`);
  }

  return fieldType;
}
