import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DataCard } from './DataCard';

interface CustomSetupStepsProps {
  currentJson?: any;
  onJsonUpdate?: (newJson: any) => void;
  onBack?: () => void;
}

export function CustomSetupSteps({
  currentJson,
  onJsonUpdate = () => {},
  onBack,
}: CustomSetupStepsProps) {
  const [copied, setCopied] = useState(false);
  const [jsonError, setJsonError] = useState('');
  const baseJson = useMemo(() => JSON.stringify(currentJson || {}, null, 2), [currentJson]);
  const [customJson, setCustomJson] = useState(baseJson);

  useEffect(() => {
    setCustomJson(baseJson);
  }, [baseJson]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const validateAndApplyJson = () => {
    try {
      const parsed = JSON.parse(customJson);
      const requiredKeys = ['departments', 'suppliers', 'products', 'inventoryLots', 'deliverySlots', 'pickupSlots', 'customers', 'orders'];
      const missingKeys = requiredKeys.filter((key) => !Array.isArray(parsed[key]));

      if (missingKeys.length > 0) {
        setJsonError(`Missing array sections: ${missingKeys.join(', ')}`);
        return;
      }

      onJsonUpdate(parsed);
      setJsonError('');
    } catch {
      setJsonError('Invalid JSON format. Please check your syntax and try again.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Custom grocery seed JSON</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Start from the minimal grocery template, edit it, then apply your custom seed plan.
          </p>
        </div>
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        )}
      </div>

      <DataCard
        title="Base Grocery Seed"
        content={baseJson}
        onCopy={async (text) => copyToClipboard(text)}
        copied={copied}
        copyKey="base-seed"
      />

      <div className="space-y-3">
        <Label htmlFor="custom-seed-json">Paste your edited grocery JSON</Label>
        <Textarea
          id="custom-seed-json"
          value={customJson}
          onChange={(event) => setCustomJson(event.target.value)}
          className="min-h-[320px] font-mono text-xs"
          placeholder="Paste your custom grocery seed JSON here"
        />
        {jsonError && <p className="text-sm text-red-600">{jsonError}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={validateAndApplyJson}>
            <Check className="mr-2 h-4 w-4" />
            Apply custom JSON
          </Button>
          <Button variant="outline" onClick={() => copyToClipboard(customJson)}>
            <Copy className="mr-2 h-4 w-4" />
            Copy edited JSON
          </Button>
        </div>
      </div>
    </div>
  );
}
