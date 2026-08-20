import { runGroceryOnboardingAction } from '../actions/onboarding';
import type { SeedSectionKey, TemplateType } from '../config/templates';
import type { OnboardingStep } from './useOnboardingState';

interface OnboardingApiProps {
  selectedTemplate: TemplateType;
  currentJsonData: Record<string, any>;
  completedItems: Record<string, string[]>;
  setProgress: (message: string) => void;
  setItemLoading: (type: SeedSectionKey, item: string) => void;
  setItemCompleted: (type: SeedSectionKey, item: string) => void;
  setItemError: (type: SeedSectionKey, item: string, errorMessage: string) => void;
  setStep: (step: OnboardingStep) => void;
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  resetOnboardingState: () => void;
}

function itemLabel(item: any, fallback: string) {
  return item?.name || item?.title || item?.code || item?.handle || item?.email ||
    item?.lotNumber || item?.label || item?.spotNumber ||
    (item?.displayId ? `Order #${item.displayId}` : fallback);
}

export function useOnboardingApi({
  currentJsonData,
  setProgress,
  setItemLoading,
  setItemCompleted,
  setItemError,
  setStep,
  setError,
  setIsLoading,
  resetOnboardingState,
}: OnboardingApiProps) {
  const runOnboarding = async () => {
    setIsLoading(true);
    setError(null);
    resetOnboardingState();
    setStep('progress');
    setProgress('Applying the Store-owned launch baseline atomically...');

    const pending = Object.entries(currentJsonData).flatMap(([section, value]) => {
      const items = Array.isArray(value) ? value : value ? [value] : [];
      return items.map((item, index) => ({
        section: section as SeedSectionKey,
        label: itemLabel(item, `${section} ${index + 1}`),
      }));
    });
    pending.forEach(({ section, label }) => setItemLoading(section, label));

    try {
      const result = await runGroceryOnboardingAction(currentJsonData);
      if (!result.success || !result.data.completed) {
        throw new Error(result.success ? 'Grocery onboarding did not complete' : result.error);
      }

      pending.forEach(({ section, label }) => setItemCompleted(section, label));
      setProgress('Grocery launch baseline complete!');
      setStep('done');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to complete grocery onboarding';
      pending.forEach(({ section, label }) => setItemError(section, label, message));
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return { runOnboarding };
}
