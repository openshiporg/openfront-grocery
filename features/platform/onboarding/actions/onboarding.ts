'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'dismissed';

export async function runGroceryOnboardingAction(seed: Record<string, unknown>) {
  const response = await keystoneClient<{
    runGroceryOnboarding: { completed: boolean; reused: boolean; counts: Record<string, number> };
  }>(`
    mutation RunGroceryOnboarding($seed: JSON!) {
      runGroceryOnboarding(seed: $seed) {
        completed
        reused
        counts
      }
    }
  `, { seed });

  if (!response.success) return { success: false as const, error: response.error };
  revalidatePath('/dashboard');
  return { success: true as const, data: response.data.runGroceryOnboarding };
}

export async function updateOnboardingStatus(status: OnboardingStatus) {
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

    // Revalidate dashboard pages to reflect the change
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/(admin)');

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

export async function completeOnboarding() {
  return updateOnboardingStatus('completed');
}