import React, { useState } from "react";
import { Copy, Check, Clipboard, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DataCard } from "./DataCard";
import { groceryOnboardingSeedSchema, type GroceryOnboardingSeed } from "../lib/groceryOnboardingSeed";

interface CustomSetupStepsProps {
  currentJson?: unknown;
  onJsonUpdate?: (newJson: GroceryOnboardingSeed) => void;
  onBack?: () => void;
}

function useCopyToClipboard(): [
  string | null,
  (text: string) => Promise<boolean>
] {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copy = React.useCallback(async (text: string) => {
    if (!navigator?.clipboard) {
      console.warn("Clipboard not supported");
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      return true;
    } catch (error) {
      console.warn("Copy failed", error);
      setCopiedText(null);
      return false;
    }
  }, []);

  return [copiedText, copy];
}

export function CustomSetupSteps({
  currentJson,
  onJsonUpdate = () => {},
  onBack,
}: CustomSetupStepsProps) {
  const [, copy] = useCopyToClipboard();
  const [copiedItems, setCopiedItems] = useState<Record<string, boolean>>({});
  const [customJson, setCustomJson] = useState("");
  const [jsonError, setJsonError] = useState("");

  // Use complete setup JSON as the base
  const completeJson = currentJson;

  const copyToClipboard = async (text: string, itemKey: string) => {
    try {
      const success = await copy(text);
      if (success) {
        setCopiedItems((prev) => ({ ...prev, [itemKey]: true }));
        setTimeout(() => {
          setCopiedItems((prev) => ({ ...prev, [itemKey]: false }));
        }, 2000);
      } else {
        setJsonError("Clipboard access is unavailable. Select and copy the text manually.");
      }
    } catch {
      setJsonError("Clipboard access is unavailable. Select and copy the text manually.");
    }
  };

  // Generate the AI prompt focused on user questions rather than editing existing JSON
  const generateAIPrompt = () => {
    return `Help me customize an Openfront Grocery onboarding configuration.

First summarize the supplied JSON: the Store profile, departments, suppliers, catalog products, inventory lots, rolling delivery and pickup windows, curbside parking, coupons, and the static Stripe adapter registry. Then ask what I want to change.

Preserve every top-level section and every field. Keep product handles, supplier emails, department handles, and inventory-lot references connected. Do not add customers, orders, payment history, loyalty balances, subscription revenue, stock movements, or unsupported business claims. Keep currencyCode as USD, the Store active, the timezone as a valid IANA timezone, and paymentProviders as exactly the pp_stripe_default registry entry. Return only the complete JSON when I say I am finished.`;
  };

  const [jsonApplied, setJsonApplied] = useState(false);

  const validateAndApplyJson = () => {
    try {
      const parsed = JSON.parse(customJson);

      const result = groceryOnboardingSeedSchema.safeParse(parsed);
      if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue.path.length ? ` (${issue.path.join('.')})` : '';
        setJsonError(`${issue.message}${path}`);
        return;
      }

      onJsonUpdate(result.data);
      setJsonApplied(true);
      setJsonError("");
    } catch {
      setJsonError("Invalid JSON format. Please check your syntax.");
    }
  };

  const steps = [
    {
      number: 1,
      title: "Copy Base Configuration",
      description: "Start with the connected grocery template JSON configuration",
      content: (
        <DataCard
          title="Onboarding Data"
          content={JSON.stringify(completeJson, null, 2)}
          onCopy={copyToClipboard}
          copied={copiedItems.json || false}
          copyKey="json"
        />
      ),
    },
    {
      number: 2,
      title: "Copy AI Customization Prompt",
      description:
        "Use this prompt with any AI assistant to get your custom configuration",
      content: (
        <DataCard
          title="AI Prompt"
          content={generateAIPrompt()}
          onCopy={copyToClipboard}
          copied={copiedItems.prompt || false}
          copyKey="prompt"
        />
      ),
    },
    {
      number: 3,
      title: "Chat with AI",
      description:
        "The AI will ask you questions about your business and products, what fulfillment windows you offer, and help you customize your setup",
      content: (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            The AI will ask you questions about your business such as:
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 ml-4">
            <li>• What products do you want to sell?</li>
            <li>• Which delivery and pickup windows do you offer?</li>
            <li>• What grocery departments do you need?</li>
            <li>• What inventory and suppliers do you need?</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Answer the AI&apos;s questions to get your custom JSON configuration.
          </p>
        </div>
      ),
    },
    {
      number: 4,
      title: "Paste Your Custom JSON",
      description: "Paste the AI-generated configuration here",
      content: (
        <div className="rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-muted border-b">
            <span className="text-sm font-medium text-muted-foreground">
              Custom Onboarding Data
            </span>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Paste custom grocery JSON"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  setCustomJson(text);
                  setJsonError("");
                } catch {
                  setJsonError("Clipboard access is unavailable. Paste into the editor manually.");
                }
              }}
              className="h-6 w-6 p-0 hover:bg-background/80"
            >
              <Clipboard className="h-3 w-3 text-muted-foreground" />
            </Button>
          </div>
          <div className="bg-background">
            <Textarea
              aria-label="Custom grocery onboarding JSON"
              aria-invalid={Boolean(jsonError)}
              placeholder="Paste your customized JSON configuration here..."
              value={customJson}
              onChange={(e) => {
                setCustomJson(e.target.value);
                setJsonError("");
              }}
              className="min-h-[200px] font-mono text-xs resize-none border-0 bg-transparent focus:outline-none p-4 rounded-none"
            />
          </div>
          {jsonError && (
            <div className="px-4 pb-4">
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2">
                <p role="alert" className="text-xs text-destructive">{jsonError}</p>
              </div>
            </div>
          )}
          <div className="flex items-center justify-end px-4 py-2 bg-muted border-t">
            <Button
              size="sm"
              onClick={validateAndApplyJson}
              disabled={!customJson.trim()}
            >
              Apply Configuration
            </Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {jsonApplied && onBack && (
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setJsonApplied(false);
              onBack();
            }}
            className="h-8 px-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Custom Setup
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-medium">
          Custom Setup Configuration
        </Label>
        <p className="text-xs text-muted-foreground">
          Follow these steps to create a personalized store setup using AI
          assistance.
        </p>
      </div>

      <div className="space-y-0">
        {steps.map((step, index) => (
          <div key={step.number} className="relative">
            {/* Connecting line between sections */}
            {index < steps.length - 1 && (
              <div className="absolute left-3 top-3 bottom-0 w-[1px] bg-border"></div>
            )}

            {/* Section header with number badge */}
            <div className="flex items-center space-x-3 mb-2 relative">
              <div className="inline-flex size-6 items-center justify-center rounded-sm border border-border bg-background text-sm text-foreground shadow-sm z-10">
                {step.number}
              </div>
              <Label className="text-sm font-medium text-foreground">
                {step.title}
              </Label>
            </div>

            {/* Section items */}
            <div className="pl-9">
              <div className="pb-6">
                <p className="text-xs text-muted-foreground mb-3">
                  {step.description}
                </p>
                {step.content}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
