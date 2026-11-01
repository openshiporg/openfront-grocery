import React from 'react';
import { Apple, Baby, Beef, Carrot, Croissant, CupSoda, Egg, Fish, Milk, PawPrint, Sandwich, ShoppingBasket, Snowflake, Sparkles, Wheat, Cookie, type LucideIcon } from 'lucide-react';

/** A line icon for an aisle, chosen from its handle or name. Unknown aisles get a basket. */
const rules: Array<[RegExp, LucideIcon]> = [
  [/produce|fruit|veg/i, Carrot],
  [/dairy|milk|cheese/i, Milk],
  [/egg/i, Egg],
  [/seafood|fish/i, Fish],
  [/meat|butcher|poultry/i, Beef],
  [/bakery|bread/i, Croissant],
  [/frozen|freez/i, Snowflake],
  [/pantry|grain|dry/i, Wheat],
  [/beverage|drink/i, CupSoda],
  [/deli|prepared/i, Sandwich],
  [/snack|sweet|candy/i, Cookie],
  [/baby/i, Baby],
  [/pet/i, PawPrint],
  [/personal|health|beauty|household|clean/i, Sparkles],
  [/organic/i, Apple],
];

export function departmentIcon(department: { handle?: string; name?: string }): LucideIcon {
  const key = `${department.handle || ''} ${department.name || ''}`;
  return rules.find(([pattern]) => pattern.test(key))?.[1] || ShoppingBasket;
}

export function DepartmentIcon({ department, className }: { department: { handle?: string; name?: string }; className?: string }) {
  return React.createElement(departmentIcon(department), { className, 'aria-hidden': true });
}
