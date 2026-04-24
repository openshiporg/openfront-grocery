import { useEffect, useMemo, useState } from 'react';
import seedData from '../lib/seed.json';
import { SECTION_DEFINITIONS, type SeedSectionKey, type TemplateType } from '../config/templates';
import { getItemsFromJsonData, getSeedForTemplate } from '../utils/dataUtils';

export type OnboardingStep = 'template' | 'progress' | 'done';

export interface OnboardingState {
  step: OnboardingStep;
  selectedTemplate: TemplateType;
  currentJsonData: any;
  customJsonApplied: boolean;
  progressMessage: string;
  loadingItems: Record<SeedSectionKey, string[]>;
  completedItems: Record<SeedSectionKey, string[]>;
  error: string | null;
  itemErrors: Record<SeedSectionKey, Record<string, string>>;
  isLoading: boolean;
}

function createItemsState<T>(factory: () => T): Record<SeedSectionKey, T> {
  return SECTION_DEFINITIONS.reduce((acc, section) => {
    acc[section.type] = factory();
    return acc;
  }, {} as Record<SeedSectionKey, T>);
}

const initialItemsState = createItemsState(() => [] as string[]);
const initialErrorState = createItemsState(() => ({} as Record<string, string>));

export function useOnboardingState() {
  const [state, setState] = useState<OnboardingState>({
    step: 'template',
    selectedTemplate: 'minimal',
    currentJsonData: getSeedForTemplate('minimal', seedData),
    customJsonApplied: false,
    progressMessage: '',
    loadingItems: createItemsState(() => [] as string[]),
    completedItems: createItemsState(() => [] as string[]),
    error: null,
    itemErrors: createItemsState(() => ({} as Record<string, string>)),
    isLoading: false,
  });

  useEffect(() => {
    if (state.selectedTemplate === 'custom' && state.customJsonApplied) {
      return;
    }

    setState((prev) => ({
      ...prev,
      currentJsonData: getSeedForTemplate(prev.selectedTemplate, seedData),
      customJsonApplied: prev.selectedTemplate === 'custom' ? prev.customJsonApplied : false,
    }));
  }, [state.selectedTemplate, state.customJsonApplied]);

  const getDisplayNamesFromData = useMemo(
    () => (data: any) =>
      SECTION_DEFINITIONS.reduce((acc, section) => {
        acc[section.type] = getItemsFromJsonData(data, section.type);
        return acc;
      }, {} as Record<SeedSectionKey, string[]>),
    []
  );

  const setStep = (step: OnboardingStep) => setState((prev) => ({ ...prev, step }));
  const setSelectedTemplate = (selectedTemplate: TemplateType) =>
    setState((prev) => ({
      ...prev,
      selectedTemplate,
      customJsonApplied: selectedTemplate === 'custom' ? prev.customJsonApplied : false,
    }));
  const setCurrentJsonData = (currentJsonData: any) =>
    setState((prev) => ({ ...prev, currentJsonData }));
  const setCustomJsonApplied = (customJsonApplied: boolean) =>
    setState((prev) => ({ ...prev, customJsonApplied }));
  const setIsLoading = (isLoading: boolean) => setState((prev) => ({ ...prev, isLoading }));
  const setError = (error: string | null) => setState((prev) => ({ ...prev, error }));
  const setProgress = (progressMessage: string) => setState((prev) => ({ ...prev, progressMessage }));

  const setItemLoading = (type: SeedSectionKey, item: string) => {
    setState((prev) => ({
      ...prev,
      loadingItems: {
        ...prev.loadingItems,
        [type]: prev.loadingItems[type].includes(item)
          ? prev.loadingItems[type]
          : [...prev.loadingItems[type], item],
      },
      itemErrors: {
        ...prev.itemErrors,
        [type]: Object.fromEntries(
          Object.entries(prev.itemErrors[type]).filter(([key]) => key !== item)
        ),
      },
    }));
  };

  const setItemCompleted = (type: SeedSectionKey, item: string) => {
    setState((prev) => ({
      ...prev,
      loadingItems: {
        ...prev.loadingItems,
        [type]: prev.loadingItems[type].filter((value) => value !== item),
      },
      completedItems: {
        ...prev.completedItems,
        [type]: prev.completedItems[type].includes(item)
          ? prev.completedItems[type]
          : [...prev.completedItems[type], item],
      },
      itemErrors: {
        ...prev.itemErrors,
        [type]: Object.fromEntries(
          Object.entries(prev.itemErrors[type]).filter(([key]) => key !== item)
        ),
      },
    }));
  };

  const setItemError = (type: SeedSectionKey, item: string, errorMessage: string) => {
    setState((prev) => ({
      ...prev,
      loadingItems: {
        ...prev.loadingItems,
        [type]: prev.loadingItems[type].filter((value) => value !== item),
      },
      itemErrors: {
        ...prev.itemErrors,
        [type]: {
          ...prev.itemErrors[type],
          [item]: errorMessage,
        },
      },
    }));
  };

  const resetOnboardingState = () => {
    setState((prev) => ({
      ...prev,
      error: null,
      progressMessage: '',
      loadingItems: createItemsState(() => [] as string[]),
      completedItems: createItemsState(() => [] as string[]),
      itemErrors: createItemsState(() => ({} as Record<string, string>)),
    }));
  };

  return {
    ...state,
    setStep,
    setSelectedTemplate,
    setCurrentJsonData,
    setCustomJsonApplied,
    setIsLoading,
    setError,
    setProgress,
    setItemLoading,
    setItemCompleted,
    setItemError,
    resetOnboardingState,
    getDisplayNamesFromData,
  };
}
