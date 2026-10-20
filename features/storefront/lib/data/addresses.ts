import { storefrontGraphQL, throwGraphQLErrors } from './graphql';

/** A customer-saved delivery address (Address.isSaved). Order addresses are snapshots and are not listed here. */
export type SavedAddress = {
  id: string;
  firstName: string;
  lastName: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
};

export type SavedAddressInput = Omit<SavedAddress, 'id'>;

const FIELDS = 'id firstName lastName address1 address2 city province postalCode phone';
const LIMIT = 20;

/** The signed-in customer's address book. Owner and Store scope are enforced by the Address access rules. */
export async function getSavedAddresses(): Promise<{ addresses: SavedAddress[]; error: string | null }> {
  try {
    const { data, errors } = await storefrontGraphQL<{ addresses: SavedAddress[] | null }>(
      `query SavedAddresses($take: Int!) { addresses(where: { isSaved: { equals: true } }, orderBy: [{ updatedAt: desc }], take: $take) { ${FIELDS} } }`,
      { take: LIMIT },
      { cache: 'no-store' },
    );
    throwGraphQLErrors(errors);
    return { addresses: data?.addresses || [], error: null };
  } catch {
    return { addresses: [], error: 'Your saved addresses could not be loaded.' };
  }
}

function clean(input: SavedAddressInput): SavedAddressInput {
  const value = (text: string, max: number) => String(text || '').trim().slice(0, max);
  return {
    firstName: value(input.firstName, 120), lastName: value(input.lastName, 120),
    address1: value(input.address1, 200), address2: value(input.address2, 200),
    city: value(input.city, 120), province: value(input.province, 120),
    postalCode: value(input.postalCode, 20), phone: value(input.phone, 40),
  };
}

export function savedAddressProblem(input: SavedAddressInput): string | null {
  const address = clean(input);
  if (!address.firstName && !address.lastName) return 'Enter the name for this address.';
  if (!address.address1) return 'Enter the street address.';
  if (!address.city) return 'Enter the city.';
  if (!address.postalCode) return 'Enter the postal code.';
  return null;
}

export async function saveAddress(id: string | null, input: SavedAddressInput): Promise<SavedAddress> {
  const problem = savedAddressProblem(input);
  if (problem) throw new Error(problem);
  const data = clean(input);
  const result = id
    ? await storefrontGraphQL<{ updateAddress: SavedAddress | null }>(`mutation SaveAddress($id: ID!, $data: AddressUpdateInput!) { updateAddress(where: { id: $id }, data: $data) { ${FIELDS} } }`, { id, data })
    : await storefrontGraphQL<{ createAddress: SavedAddress | null }>(`mutation AddAddress($data: AddressCreateInput!) { createAddress(data: $data) { ${FIELDS} } }`, { data: { ...data, isSaved: true } });
  throwGraphQLErrors(result.errors);
  const saved = (result.data as { updateAddress?: SavedAddress | null; createAddress?: SavedAddress | null } | undefined);
  const address = saved?.updateAddress || saved?.createAddress;
  if (!address) throw new Error('This address could not be saved. Try again.');
  return address;
}

export async function deleteAddress(id: string): Promise<void> {
  const result = await storefrontGraphQL<{ deleteAddress: { id: string } | null }>('mutation DeleteAddress($id: ID!) { deleteAddress(where: { id: $id }) { id } }', { id });
  throwGraphQLErrors(result.errors);
  if (!result.data?.deleteAddress?.id) throw new Error('This address could not be removed. Try again.');
}
