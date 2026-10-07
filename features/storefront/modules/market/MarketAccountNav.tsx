import Link from 'next/link';

const links = [
  ['overview', '/account', 'Overview'], ['orders', '/account/orders', 'Orders'],
  ['lists', '/lists', 'Shopping lists'], ['favorites', '/favorites', 'Favorites'],
  ['subscriptions', '/subscriptions', 'Recurring & rewards'],
  ['profile', '/account/profile', 'Profile'], ['privacy', '/account/privacy', 'Privacy'],
];

export default function MarketAccountNav({ active }: { active: string }) {
  return <nav aria-label="Your account" className="sf-account-nav sf-scroll-row border-b border-[var(--sf-rule)] pb-3">
    {links.map(([key, href, label]) => <Link key={key} href={href} aria-current={key === active ? 'page' : undefined}>{label}</Link>)}
  </nav>;
}
