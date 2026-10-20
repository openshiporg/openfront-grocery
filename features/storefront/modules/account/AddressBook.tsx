'use client';

import { useState, useTransition } from 'react';
import { deleteAddress, saveAddress, type SavedAddress, type SavedAddressInput } from '../../lib/data/addresses';
import { UrbanButton, UrbanTextInput } from '../urban/UrbanPrimitives';

const empty: SavedAddressInput = { firstName: '', lastName: '', address1: '', address2: '', city: '', province: '', postalCode: '', phone: '' };

function AddressForm({ initial, pending, onSubmit, onCancel }: { initial: SavedAddressInput; pending: boolean; onSubmit: (value: SavedAddressInput) => void; onCancel?: () => void }) {
  return <form className="sf-form grid gap-4 sm:grid-cols-2" onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit(Object.fromEntries(Object.keys(empty).map((key) => [key, String(form.get(key) || '')])) as SavedAddressInput);
  }}>
    <label className="sf-label">First name<UrbanTextInput name="firstName" autoComplete="given-name" maxLength={120} defaultValue={initial.firstName} disabled={pending} /></label>
    <label className="sf-label">Last name<UrbanTextInput name="lastName" autoComplete="family-name" maxLength={120} defaultValue={initial.lastName} disabled={pending} /></label>
    <label className="sf-label sm:col-span-2">Street address<UrbanTextInput name="address1" autoComplete="address-line1" required maxLength={200} defaultValue={initial.address1} disabled={pending} /></label>
    <label className="sf-label sm:col-span-2">Apartment, suite or floor (optional)<UrbanTextInput name="address2" autoComplete="address-line2" maxLength={200} defaultValue={initial.address2} disabled={pending} /></label>
    <label className="sf-label">City<UrbanTextInput name="city" autoComplete="address-level2" required maxLength={120} defaultValue={initial.city} disabled={pending} /></label>
    <label className="sf-label">State / province<UrbanTextInput name="province" autoComplete="address-level1" maxLength={120} defaultValue={initial.province} disabled={pending} /></label>
    <label className="sf-label">Postal code<UrbanTextInput name="postalCode" autoComplete="postal-code" required maxLength={20} defaultValue={initial.postalCode} disabled={pending} /></label>
    <label className="sf-label">Phone<UrbanTextInput name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={initial.phone} disabled={pending} /></label>
    <div className="flex flex-wrap gap-2 sm:col-span-2">
      <UrbanButton type="submit" variant="dark" disabled={pending}>{pending ? 'Saving…' : 'Save address'}</UrbanButton>
      {onCancel ? <UrbanButton type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancel</UrbanButton> : null}
    </div>
  </form>;
}

/** Saved delivery addresses (E-commerce address book). Editing one never changes past orders, which keep their own snapshot. */
export function AddressBook({ initialAddresses, loadError }: { initialAddresses: SavedAddress[]; loadError: string | null }) {
  const [addresses, setAddresses] = useState(initialAddresses);
  const [editing, setEditing] = useState<string | 'new' | null>(initialAddresses.length ? null : 'new');
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(loadError ? { text: loadError, failed: true } : null);
  const [pending, start] = useTransition();

  function submit(id: string | null, value: SavedAddressInput) {
    setMessage(null);
    start(async () => {
      try {
        const saved = await saveAddress(id, value);
        setAddresses((current) => id ? current.map((address) => address.id === id ? saved : address) : [saved, ...current]);
        setEditing(null);
        setMessage({ text: 'Address saved.', failed: false });
      } catch (error) {
        setMessage({ text: error instanceof Error ? error.message : 'This address could not be saved.', failed: true });
      }
    });
  }
  function remove(id: string) {
    setMessage(null);
    start(async () => {
      try {
        await deleteAddress(id);
        setAddresses((current) => current.filter((address) => address.id !== id));
        setMessage({ text: 'Address removed.', failed: false });
      } catch (error) {
        setMessage({ text: error instanceof Error ? error.message : 'This address could not be removed.', failed: true });
      }
    });
  }

  return <section className="sf-panel space-y-5 p-5 sm:p-7" aria-labelledby="address-book-title" aria-busy={pending}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="address-book-title" className="sf-subtitle">Saved addresses</h2><p className="sf-copy mt-1.5">Choose one at checkout to fill in your delivery details.</p></div>
      {editing !== 'new' ? <UrbanButton type="button" variant="ghost" onClick={() => setEditing('new')} disabled={pending}>Add an address</UrbanButton> : null}
    </div>
    {message ? <p role={message.failed ? 'alert' : 'status'} className={`rounded-[var(--sf-radius-md)] px-3 py-2.5 text-sm font-medium ${message.failed ? 'bg-[var(--sf-danger-bg)] text-[var(--sf-danger)]' : 'bg-[var(--sf-sage-light)] text-[var(--sf-sage)]'}`}>{message.text}</p> : null}
    {editing === 'new' ? <AddressForm initial={empty} pending={pending} onSubmit={(value) => submit(null, value)} onCancel={addresses.length ? () => setEditing(null) : undefined} /> : null}
    {addresses.length ? <ul className="divide-y divide-[var(--sf-rule)]">
      {addresses.map((address) => <li key={address.id} className="py-4">
        {editing === address.id
          ? <AddressForm initial={address} pending={pending} onSubmit={(value) => submit(address.id, value)} onCancel={() => setEditing(null)} />
          : <div className="flex flex-wrap items-start justify-between gap-3">
            <address className="not-italic text-sm leading-6">
              <span className="font-semibold">{[address.firstName, address.lastName].filter(Boolean).join(' ')}</span><br />
              {address.address1}{address.address2 ? `, ${address.address2}` : ''}<br />
              {[address.city, address.province, address.postalCode].filter(Boolean).join(', ')}
              {address.phone ? <><br />{address.phone}</> : null}
            </address>
            <div className="flex gap-2">
              <UrbanButton type="button" variant="ghost" onClick={() => setEditing(address.id)} disabled={pending}>Edit</UrbanButton>
              <UrbanButton type="button" variant="ghost" onClick={() => remove(address.id)} disabled={pending}>Remove</UrbanButton>
            </div>
          </div>}
      </li>)}
    </ul> : editing !== 'new' ? <p className="text-sm text-[var(--sf-ink-muted)]">No saved addresses yet.</p> : null}
  </section>;
}
