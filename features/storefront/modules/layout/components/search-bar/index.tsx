'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      router.push(`/products?search=${encodeURIComponent(trimmed)}`);
    }
  };

  return (
    <form onSubmit={handleSearch} className="relative">
      <label htmlFor="grocery-search" className="sr-only">
        Search groceries
      </label>
      <div className="relative overflow-hidden rounded-full border border-emerald-950/10 bg-white shadow-[0_16px_30px_-24px_rgba(18,56,34,0.65)]">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-800/55" />
        <input
          id="grocery-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search produce, pantry staples, milk, salmon…"
          className="h-12 w-full bg-transparent pl-11 pr-28 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          className="absolute right-1.5 top-1.5 inline-flex h-9 items-center justify-center rounded-full bg-emerald-700 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-800"
        >
          Search
        </button>
      </div>
    </form>
  );
}
