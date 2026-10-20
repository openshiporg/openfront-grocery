'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/platform/lib/platformClient';

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'dismissed';

export async function runGroceryOnboardingAction(seed: unknown) {
  const started = await startOnboarding();
  if (!started.success) return { success: false as const, error: started.error };

  const response = await keystoneClient<{
    runGroceryOnboarding: { completed: boolean; reused: boolean; missing: string[]; counts: Record<string, number> };
  }>(`
    mutation RunGroceryOnboarding($seed: JSON!) {
      runGroceryOnboarding(seed: $seed) {
        completed
        reused
        missing
        counts
      }
    }
  `, { seed });

  if (!response.success) return { success: false as const, error: response.error };
  revalidatePath('/dashboard', 'layout');
  return { success: true as const, data: response.data.runGroceryOnboarding };
}

export async function updateOnboardingStatus(status: OnboardingStatus) {
  if (!['not_started', 'in_progress', 'dismissed'].includes(status)) {
    return { success: false as const, error: 'Unsupported onboarding status transition' };
  }

  try {
    const query = `
      mutation UpdateOnboardingStatus($data: UserUpdateProfileInput!) {
        updateActiveUser(data: $data) {
          id
          onboardingStatus
        }
      }
    `;

    const response = await keystoneClient(query, {
      data: { onboardingStatus: status }
    });

    if (!response.success) {
      return { success: false, error: response.error };
    }

    revalidatePath('/dashboard', 'layout');

    return { success: true, data: response.data?.updateActiveUser };
  } catch {
    return {
      success: false,
      error: 'Unable to update onboarding status'
    };
  }
}

export async function dismissOnboarding() {
  return updateOnboardingStatus('dismissed');
}

export async function startOnboarding() {
  return updateOnboardingStatus('in_progress');
}