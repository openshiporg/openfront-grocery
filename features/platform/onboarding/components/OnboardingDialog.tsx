'use client';

import React from 'react';
import {
  AlertCircle,
  AppWindowIcon as Apps,
  ArrowUpRight,
  Building2,
  CircleCheck,
  Loader2,
  Package,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge-button';
import { CustomSetupSteps } from './CustomSetupSteps';
import { SectionRenderer } from './SectionRenderer';
import { STORE_TEMPLATES, SECTION_DEFINITIONS, type TemplateType } from '../config/templates';
import { useOnboardingState } from '../hooks/useOnboardingState';
import { useOnboardingApi } from '../hooks/useOnboardingApi';

interface OnboardingDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const templateIconMap = {
  minimal: Package,
  full: Building2,
  custom: SlidersHorizontal,
} as const;

const OnboardingDialog: React.FC<OnboardingDialogProps> = ({ isOpen, onClose }) => {
  const onboardingState = useOnboardingState();
  const {
    step,
    selectedTemplate,
    currentJsonData,
    customJsonApplied,
    progressMessage,
    loadingItems,
    completedItems,
    error,
    itemErrors,
    isLoading,
    setSelectedTemplate,
    setCurrentJsonData,
    setCustomJsonApplied,
    setStep,
    setProgress,
    setItemLoading,
    setItemCompleted,
    setItemError,
    setError,
    setIsLoading,
    resetOnboardingState,
  } = onboardingState;

  const { runOnboarding } = useOnboardingApi({
    selectedTemplate,
    currentJsonData,
    completedItems,
    setProgress,
    setItemLoading,
    setItemCompleted,
    setItemError,
    setStep,
    setError,
    setIsLoading,
    resetOnboardingState,
  });

  if (!isOpen) return null;

  const displayNames = SECTION_DEFINITIONS.reduce((acc, section) => {
    acc[section.type] = (currentJsonData?.[section.type] || []).map((item: any) => {
      switch (section.type) {
        case 'departments':
          return item.name;
        case 'suppliers':
          return item.name;
        case 'products':
          return item.title;
        case 'inventoryLots':
          return item.lotNumber;
        case 'deliverySlots':
        case 'pickupSlots':
          return item.label;
        case 'parkingSpots':
          return item.spotNumber;
        case 'paymentProviders':
          return item.name || item.code;
        case 'customers':
          return item.name;
        case 'orders':
          return `Order #${item.displayId}`;
        case 'coupons':
          return item.code;
        case 'loyaltyPrograms':
          return item.name;
        default:
          return 'Item';
      }
    });
    return acc;
  }, {} as Record<string, string[]>);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[95vw] flex-col overflow-hidden p-0 gap-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-4 sm:px-6 py-4 mb-0 shrink-0">
          <DialogTitle>Grocery onboarding</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="order-1 flex shrink-0 flex-col lg:order-none lg:w-80 lg:justify-between lg:border-r">
            <div className="flex-1">
              <div className="p-4 sm:p-6">
                <div className="flex items-center space-x-3">
                  <div className="inline-flex shrink-0 items-center justify-center rounded-sm bg-muted p-3">
                    <Apps className="size-5 text-foreground" aria-hidden={true} />
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-medium text-foreground">Demo grocery seed</h3>
                    <p className="text-sm text-muted-foreground">
                      {step === 'done'
                        ? 'Your grocery demo data is ready'
                        : selectedTemplate === 'custom'
                        ? 'Customize the grocery seed JSON'
                        : 'Choose a grocery demo template'}
                    </p>
                  </div>
                </div>

                <Separator className="my-4" />

                {step === 'done' ? (
                  <>
                    <h4 className="text-sm font-medium text-foreground mb-2">Setup complete</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Your {selectedTemplate === 'minimal' ? 'basic' : selectedTemplate === 'full' ? 'complete' : 'custom'} grocery demo dataset is ready.
                    </p>
                    <div className="flex items-center space-x-2 text-sm text-emerald-600 dark:text-emerald-500 mb-4">
                      <CircleCheck className="h-4 w-4 fill-emerald-500 text-background" />
                      <span>Onboarding complete</span>
                    </div>

                    <div className="space-y-3 text-sm">
                      {SECTION_DEFINITIONS.map((section) => (
                        <div key={section.type} className="flex items-center space-x-2 text-muted-foreground">
                          <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                          <span className="font-medium">
                            {displayNames[section.type]?.length || 0} {section.label.toLowerCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : !isLoading ? (
                  <>
                    <h4 className="text-sm font-medium text-foreground mb-4">Template</h4>

                    <div className="block lg:hidden">
                      <Select
                        value={selectedTemplate}
                        onValueChange={(value) => setSelectedTemplate(value as TemplateType)}
                      >
                        <SelectTrigger className="w-full h-auto py-3">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STORE_TEMPLATES).map(([key, template]) => (
                            <SelectItem key={key} value={key}>
                              <div className="flex flex-col items-start text-left">
                                <span className="font-medium">{template.name}</span>
                                <span className="text-xs text-muted-foreground">{template.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="hidden lg:block">
                      <RadioGroup
                        value={selectedTemplate}
                        onValueChange={(value) => setSelectedTemplate(value as TemplateType)}
                        className="space-y-4"
                      >
                        {(Object.keys(STORE_TEMPLATES) as TemplateType[]).map((key) => {
                          const template = STORE_TEMPLATES[key];
                          const Icon = templateIconMap[key];
                          const active = selectedTemplate === key;

                          return (
                            <div
                              key={key}
                              className={`border p-4 rounded-md transition-colors cursor-pointer ${
                                active ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'hover:border-blue-200'
                              }`}
                              onClick={() => setSelectedTemplate(key)}
                            >
                              <div className="flex gap-4">
                                <div className="flex-shrink-0 mt-[3px]">
                                  <Icon className={`h-5 w-5 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}`} />
                                </div>
                                <div className="flex-1">
                                  <RadioGroupItem value={key} id={key} className="sr-only" />
                                  <Label htmlFor={key} className="flex-1 cursor-pointer">
                                    <div className="font-medium text-base mb-1">{template.name}</div>
                                    <div className="text-sm text-muted-foreground">{template.description}</div>
                                  </Label>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </RadioGroup>
                    </div>
                  </>
                ) : (
                  <>
                    <h4 className="text-sm font-medium text-foreground">Seeding grocery demo data</h4>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{progressMessage}</p>
                  </>
                )}
              </div>
            </div>

            <div className="hidden lg:flex flex-col border-t mt-auto">
              {error && !isLoading && step !== 'done' && (
                <Badge color="rose" className="rounded-none gap-3 text-sm border-b">
                  <AlertCircle className="size-4 sm:size-7" />
                  <span className="text-xs sm:text-sm">{error}</span>
                </Badge>
              )}

              <div className="flex items-center justify-between p-4">
                {step === 'done' ? (
                  <div className="flex flex-col sm:flex-row gap-2 w-full">
                    <DialogClose asChild>
                      <Button type="button" variant="outline" className="w-full sm:w-auto">
                        Close
                      </Button>
                    </DialogClose>
                    <Button asChild className="w-full sm:w-auto">
                      <a href="/" target="_blank" rel="noopener noreferrer">
                        View storefront
                        <ArrowUpRight className="ml-1.5 h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2 w-full">
                    <DialogClose asChild>
                      <Button type="button" variant="ghost" disabled={isLoading} className="w-full sm:w-auto">
                        Cancel
                      </Button>
                    </DialogClose>
                    {isLoading ? (
                      <Button disabled className="w-full sm:w-auto">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Seeding...
                      </Button>
                    ) : (
                      <Button onClick={runOnboarding} className="w-full sm:w-auto">
                        Seed demo data
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="order-2 min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:order-none">
            {selectedTemplate === 'custom' && !customJsonApplied ? (
              <CustomSetupSteps
                currentJson={currentJsonData}
                onJsonUpdate={(newJsonData) => {
                  setCurrentJsonData(newJsonData);
                  setCustomJsonApplied(true);
                }}
                onBack={() => {
                  setSelectedTemplate('minimal');
                  setStep('template');
                }}
              />
            ) : (
              <SectionRenderer
                sections={SECTION_DEFINITIONS}
                selectedTemplate={selectedTemplate}
                isLoading={isLoading}
                loadingItems={loadingItems}
                completedItems={completedItems}
                itemErrors={itemErrors}
                error={error}
                step={step}
                currentJsonData={currentJsonData}
              />
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col border-t lg:hidden">
          {error && !isLoading && step !== 'done' && (
            <Badge color="rose" className="rounded-none gap-3 text-sm border-b">
              <AlertCircle className="size-4 sm:size-7" />
              <span className="text-xs sm:text-sm">{error}</span>
            </Badge>
          )}

          <div className="flex items-center justify-between p-4">
            {step === 'done' ? (
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="flex-1">
                    Close
                  </Button>
                </DialogClose>
                <Button asChild className="flex-1">
                  <a href="/" target="_blank" rel="noopener noreferrer">
                    View storefront
                    <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </a>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <DialogClose asChild>
                  <Button type="button" variant="ghost" disabled={isLoading} className="flex-1">
                    Cancel
                  </Button>
                </DialogClose>
                {isLoading ? (
                  <Button disabled className="flex-1">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Seeding...
                  </Button>
                ) : (
                  <Button onClick={runOnboarding} className="flex-1">
                    Seed demo data
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingDialog;
