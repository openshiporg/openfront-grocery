'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/platform/lib/platformClient';

export type DepartmentFormValues = { name: string; handle: string; description: string; imageUrl: string; sortOrder: string; isActive: boolean; temperatureZone: string };
export type DepartmentActionState = { ok: boolean; error: string | null; message: string | null; values?: DepartmentFormValues };

const ZONES = new Set(['ambient', 'refrigerated', 'frozen']);

/**
 * Create or edit a department through the product-managed Department list
 * (Store scope and permissions are enforced there). Required licenses are
 * never written here, so an existing licensing requirement is kept as is.
 */
export async function saveDepartmentAction(_previous: DepartmentActionState, formData: FormData): Promise<DepartmentActionState> {
  const id = String(formData.get('id') || '');
  const values: DepartmentFormValues = {
    name: String(formData.get('name') || '').trim(),
    handle: String(formData.get('handle') || '').trim().toLowerCase(),
    description: String(formData.get('description') || '').trim(),
    imageUrl: String(formData.get('imageUrl') || '').trim(),
    sortOrder: String(formData.get('sortOrder') || '0').trim(),
    isActive: formData.get('isActive') === 'on',
    temperatureZone: String(formData.get('temperatureZone') || 'ambient'),
  };
  const fail = (error: string): DepartmentActionState => ({ ok: false, error, message: null, values });
  if (!values.name || values.name.length > 120) return fail('Enter a department name of up to 120 characters.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.handle) || values.handle.length > 80) return fail('Use a handle of lowercase letters, numbers and single hyphens, for example “meat-seafood”.');
  if (values.description.length > 1000) return fail('Keep the description under 1,000 characters.');
  if (values.imageUrl && (!/^https:\/\/\S+$/.test(values.imageUrl) || values.imageUrl.length > 2048)) return fail('The image must be an https:// address.');
  if (!/^-?\d{1,5}$/.test(values.sortOrder)) return fail('Display order is a whole number, for example 10.');
  if (!ZONES.has(values.temperatureZone)) return fail('Choose ambient, refrigerated or frozen storage.');
  const data = { name: values.name, handle: values.handle, description: values.description, imageUrl: values.imageUrl, sortOrder: Number(values.sortOrder), isActive: values.isActive, temperatureZone: values.temperatureZone };
  const response = id
    ? await keystoneClient<any>('mutation($id:ID!,$data:DepartmentUpdateInput!){ updateDepartment(where:{id:$id},data:$data){ id name } }', { id, data }, { cache: 'no-store' })
    : await keystoneClient<any>('mutation($data:DepartmentCreateInput!){ createDepartment(data:$data){ id name } }', { data }, { cache: 'no-store' });
  if (!response.success) {
    const error = response.error || 'The department could not be saved.';
    return fail(/unique constraint|handle/i.test(error) ? 'Another department already uses this handle. Choose a different one.' : error);
  }
  revalidatePath('/dashboard/platform/merchandising');
  return { ok: true, error: null, message: id ? `Saved ${values.name}.` : `Created ${values.name}.`, values: id ? values : undefined };
}
