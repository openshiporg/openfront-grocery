type InventoryLotDisplayInput = {
  safetyStatus?: string | null;
  conditionStatus?: string | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
  quantityRemaining: number;
};

const safetyLabels: Record<string, string> = {
  held: 'Held',
  quarantined: 'Quarantined',
  recalled: 'Recalled',
};

const conditionLabels: Record<string, string> = {
  inspection_pending: 'Inspection pending',
  rejected: 'Rejected',
};

export function inventoryLotDisplayState(lot: InventoryLotDisplayInput) {
  const blockedStates: string[] = [];
  if (lot.safetyStatus !== 'available') blockedStates.push(safetyLabels[lot.safetyStatus || ''] || 'Eligibility unknown');
  if (lot.conditionStatus !== 'accepted') blockedStates.push(conditionLabels[lot.conditionStatus || ''] || 'Eligibility unknown');
  if (lot.isExpired) blockedStates.push('Expired');
  if (blockedStates.length) return { label: [...new Set(blockedStates)].join(' · '), status: 'failed' };
  if (lot.quantityRemaining <= 0) return { label: 'Empty', status: 'cancelled' };
  if (lot.isExpiringSoon) return { label: 'Expiring soon', status: 'processing' };
  return { label: 'Eligible now', status: 'active' };
}
