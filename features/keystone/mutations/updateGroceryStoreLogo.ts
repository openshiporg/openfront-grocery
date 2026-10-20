import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { sanitizeStoreLogoSvg } from '../utils/storeLogo';
import { normalizeStoreLogoColor } from '../../lib/store-logo';

export async function updateGroceryStoreLogo(
  _root: unknown,
  args: { logoIcon?: string | null; logoColor: string },
  context: Context,
) {
  await requireFreshCapability(context, 'canManageOnboarding');
  const store = await requireSessionStore(context);
  if (!Object.prototype.hasOwnProperty.call(args, 'logoIcon')) {
    throw new Error('Choose a logo or explicitly use the existing logo path');
  }
  const logoIcon = args.logoIcon ? sanitizeStoreLogoSvg(args.logoIcon) : null;
  if (args.logoIcon && !logoIcon) throw new Error('Logo must be a valid, safe SVG document');
  const settings = await context.prisma.storeSettings.findUnique({
    where: { storeId: store.id },
    select: { id: true },
  });
  if (!settings) throw new Error('Store settings are not initialized');
  // Keep list access, store filters and model sanitizer hooks in the write path.
  const updated = await context.db.StoreSettings.updateOne({
    where: { id: String(settings.id) },
    data: { logoIcon, logoColor: normalizeStoreLogoColor(args.logoColor) },
  });
  return {
    logoIcon: sanitizeStoreLogoSvg(updated.logoIcon || '') || null,
    logoColor: normalizeStoreLogoColor(updated.logoColor),
  };
}
