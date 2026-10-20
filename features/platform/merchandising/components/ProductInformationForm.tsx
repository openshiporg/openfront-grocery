'use client';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { Apple, Search } from 'lucide-react';
import { GROCERY_ALLERGENS } from '@/features/keystone/lib/productInformation';
import { findInformationProducts, findRootProducts, saveProductInformation } from '../informationActions';
import { PlatformCheckboxRow, PlatformDisclosure, PlatformFeedback, PlatformField, PlatformFieldset } from '@/features/platform/components/PlatformForm';
import { platformButton, platformCheckbox, platformInput, platformSelect } from '@/features/platform/components/platformStyles';

const nutritionFields = [['servingSize', 'Serving size'], ['ingredients', 'Ingredients'], ['calories', 'Calories'], ['fatGrams', 'Fat (g)'], ['saturatedFatGrams', 'Saturated fat (g)'], ['carbohydrateGrams', 'Carbohydrate (g)'], ['sugarGrams', 'Sugar (g)'], ['proteinGrams', 'Protein (g)'], ['sodiumMilligrams', 'Sodium (mg)']];
const textFields = ['servingSize', 'ingredients'];

type Feedback = { tone: 'success' | 'error'; text: string } | null;
type RootOption = { id: string; title: string };

function ProductInformationEditor({ product }: { product: any }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  // The current root product is always an option, whatever the root search returns.
  const currentParent: RootOption | null = product.variantOf?.id ? { id: product.variantOf.id, title: product.variantOf.title || 'Current root product' } : null;
  const [parentId, setParentId] = useState(currentParent?.id || '');
  const [rootOptions, setRootOptions] = useState<RootOption[]>(currentParent ? [currentParent] : []);
  const [rootSearch, setRootSearch] = useState('');
  // One request key per exact payload: an unchanged resubmission after an uncertain response reuses it.
  const requestKeys = useRef(new Map<string, string>());

  const findRoots = () => startTransition(async () => {
    try {
      const rows = (await findRootProducts(rootSearch)).filter((row) => row.id !== product.id);
      setRootOptions([...(currentParent && !rows.some((row) => row.id === currentParent.id) ? [currentParent] : []), ...rows]);
    } catch { setFeedback({ tone: 'error', text: 'Root product search is unavailable. Try again.' }); }
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nutrition = Object.fromEntries(nutritionFields.flatMap(([name]) => {
      const value = String(form.get(name) || '').trim();
      return value ? [[name, textFields.includes(name) ? value : Number(value)]] : [];
    }));
    const input = Object.freeze({ nutrition, allergens: form.getAll('allergens').map(String), sourceReference: String(form.get('source') || ''), packBaseUnitsMilli: Math.round(Number(form.get('factor')) * 1000), variantLabel: String(form.get('label') || ''), variantOfId: parentId || null });
    const fingerprint = JSON.stringify(input);
    const key = requestKeys.current.get(fingerprint) || crypto.randomUUID();
    requestKeys.current.set(fingerprint, key);
    setFeedback(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveProductInformation>>;
      try { result = await saveProductInformation(product.id, input, key); }
      catch {
        setFeedback({ tone: 'error', text: 'We couldn’t confirm the save. Save again without changes to retry safely.' });
        return;
      }
      if (!result.ok) { setFeedback({ tone: 'error', text: result.error }); return; }
      requestKeys.current.clear();
      setFeedback({ tone: 'success', text: result.reused ? 'This information version was already saved.' : 'Information version saved.' });
    });
  }

  return (
    <form className="space-y-5 rounded-lg border bg-muted/20 p-4" onSubmit={submit} aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PlatformField label="Source document / reference" className="sm:col-span-2"><input className={platformInput} name="source" defaultValue={product.informationSource} required /></PlatformField>
          <PlatformField label="Variant label"><input className={platformInput} name="label" defaultValue={product.variantLabel} /></PlatformField>
          <PlatformField label="Base units per pack"><input className={`${platformInput} tabular-nums`} type="number" name="factor" min="0.001" step="0.001" defaultValue={(product.packBaseUnitsMilli || 1000) / 1000} /></PlatformField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <PlatformField label="Root product" hint={currentParent ? `Currently a pack of ${currentParent.title}. Choose Standalone to detach it.` : 'Standalone unless you choose a root product.'}>
            <select className={platformSelect} value={parentId} onChange={(event) => setParentId(event.target.value)}>
              <option value="">Standalone / root</option>
              {rootOptions.map((option) => <option value={option.id} key={option.id}>{option.title}</option>)}
            </select>
          </PlatformField>
          <div className="flex items-end gap-2">
            <PlatformField label="Find a root product" className="flex-1"><input className={platformInput} value={rootSearch} onChange={(event) => setRootSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); findRoots(); } }} placeholder="Product name" /></PlatformField>
            <button type="button" className={platformButton('secondary', 'md')} onClick={findRoots}><Search aria-hidden="true" />Find</button>
          </div>
        </div>
        <PlatformFieldset legend="Allergen declarations">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{GROCERY_ALLERGENS.map((value) => <PlatformCheckboxRow key={value}><input className={platformCheckbox} type="checkbox" name="allergens" value={value} defaultChecked={product.allergens?.includes(value)} /><span className="capitalize">{value.replaceAll('_', ' ')}</span></PlatformCheckboxRow>)}</div>
        </PlatformFieldset>
        <PlatformFieldset legend="Nutrition and ingredients" hint="Copy the serving basis and facts from the supplier source. Leave a field empty when the source doesn't state it.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{nutritionFields.map(([name, label]) => <PlatformField label={label} key={name} className={name === 'ingredients' ? 'sm:col-span-2 lg:col-span-3' : ''}><input className={`${platformInput} ${textFields.includes(name) ? '' : 'tabular-nums'}`} name={name} defaultValue={product.nutrition?.[name] ?? ''} type={textFields.includes(name) ? 'text' : 'number'} min="0" step="any" /></PlatformField>)}</div>
        </PlatformFieldset>
        <button type="submit" className={platformButton('primary', 'md')}>{pending ? 'Saving…' : 'Save information version'}</button>
      </fieldset>
      {feedback ? <PlatformFeedback tone={feedback.tone}>{feedback.text}</PlatformFeedback> : null}
    </form>
  );
}

export function ProductInformationForm() {
  const [products, setProducts] = useState<any[]>([]), [selected, setSelected] = useState<any>(null), [searchError, setSearchError] = useState(''), [searched, setSearched] = useState(false);
  const [searching, startSearch] = useTransition();
  return <PlatformDisclosure icon={Apple} title="Product information & pack variants" description="Record nutrition, allergens and pack relationships from a named supplier source. Each save is kept as a version.">
    <div className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-2">
        <form className="flex items-end gap-2" aria-busy={searching} onSubmit={(event) => {
          event.preventDefault();
          const search = String(new FormData(event.currentTarget).get('search') || '');
          startSearch(async () => {
            try { setProducts(await findInformationProducts(search)); setSearched(true); setSearchError(''); }
            catch { setSearchError('Product search is unavailable. Try again.'); }
          });
        }}>
          <PlatformField label="Find product by name" className="flex-1"><input className={platformInput} name="search" placeholder="e.g. Greek yogurt" /></PlatformField>
          <button className={platformButton('secondary', 'md')} disabled={searching}><Search aria-hidden="true" />Find</button>
        </form>
        <PlatformField label={searched ? `Product · ${products.length} found` : 'Product'}>
          <select className={platformSelect} value={selected?.id || ''} disabled={!products.length} onChange={(event) => setSelected(products.find((product) => product.id === event.target.value) || null)}><option value="">{products.length ? 'Choose product' : 'Search first'}</option>{products.map((product) => <option key={product.id} value={product.id}>{product.title} · {product.sku}</option>)}</select>
        </PlatformField>
      </div>
      {selected ? <ProductInformationEditor key={selected.id} product={selected} /> : null}
      {searchError ? <PlatformFeedback tone="error">{searchError}</PlatformFeedback> : null}
    </div>
  </PlatformDisclosure>;
}
