import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Eye, EyeOff, Check, AlertCircle, InfoIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface PlatformCredentialsFormProps {
  platformName: string;
  displayName: string;
  description?: React.ReactNode;
}

export function PlatformCredentialsForm({ platformName, displayName, description }: PlatformCredentialsFormProps) {
  const [apiKey, setApiKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Get existing credentials status
  const credentials = useQuery(api.platforms.getPlatformCredentials, { platformName });
  const storeCredentials = useMutation(api.platforms.storePlatformCredentials);

  // Reset form state when credentials load or platform changes
  useEffect(() => {
    setSaveStatus('idle');
    setErrorMessage('');
  }, [platformName, credentials]);

  const handleSave = async () => {
    try {
      setSaveStatus('saving');
      setErrorMessage('');

      // Basic validation
      if (!apiKey) {
        setErrorMessage('API Key is required');
        setSaveStatus('error');
        return;
      }

      // Save credentials to backend
      await storeCredentials({
        platformName,
        credentials: {
          apiKey,
          privateKey: privateKey || undefined
        }
      });

      setSaveStatus('success');

      // Reset form after successful save (but keep the values)
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    } catch (error) {
      console.error('Error saving credentials:', error);
      setSaveStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred');
    }
  };

  const getStatusBadge = () => {
    if (!credentials) return null;
    
    if (credentials.configured) {
      return <Badge className="bg-green-500 text-white dark:bg-green-600 dark:text-gray-100">Credentials Configured</Badge>;
    }
    return <Badge className="bg-yellow-500 text-white dark:bg-yellow-600 dark:text-gray-100">Not Configured</Badge>;
  };

  return (
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000] rounded-lg p-5 mb-6 dark:bg-gray-800 dark:border-black dark:shadow-[4px_4px_0px_0px_#000]">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold dark:text-gray-100">{displayName} API Credentials</h3>
          <div className="text-sm text-gray-500 dark:text-gray-400">{getStatusBadge()}</div>
        </div>
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="credentials">
          <AccordionTrigger className="py-2 dark:text-gray-200">
            <div className="flex items-center">
              <span>Configure Credentials</span>
              {saveStatus === 'success' && (
                <Badge className="bg-green-500 text-white ml-2 dark:bg-green-600">
                  <Check size={12} className="mr-1" />
                  Saved
                </Badge>
              )}
            </div>
          </AccordionTrigger>
                    <AccordionContent className="px-1">
            {description && (
              <Alert className="mb-4">
                <InfoIcon className="h-4 w-4" />
                <AlertTitle>Information</AlertTitle>
                <AlertDescription>{description}</AlertDescription>
              </Alert>
            )}

            {saveStatus === 'error' && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{errorMessage || 'Failed to save credentials'}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div>
                <Label htmlFor="apiKey" className="dark:text-gray-300">API Key ID</Label>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                    placeholder="Enter your API Key ID"
                    className="pr-10 dark:bg-gray-700 dark:border-black dark:text-gray-100 dark:placeholder-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 dark:text-gray-400 hover:dark:text-gray-200"
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="privateKey" className="dark:text-gray-300">
                  Private Key (RSA format)
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">(Optional)</span>
                </Label>
                <div className="relative">
                  <Textarea
                    id="privateKey"
                    value={privateKey}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrivateKey(e.target.value)}
                    placeholder="Paste your RSA private key here"
                    className="min-h-[100px] font-mono text-xs pr-10 dark:bg-gray-700 dark:border-black dark:text-gray-100 dark:placeholder-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    className="absolute top-2 right-2 flex items-center dark:text-gray-400 hover:dark:text-gray-200"
                    aria-label={showPrivateKey ? 'Hide private key' : 'Show private key'}
                  >
                    {showPrivateKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  For enhanced security, the private key is stored securely and never exposed after saving.
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => void handleSave()} // Use void to ignore the Promise
                  disabled={saveStatus === 'saving'}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md border-2 border-black shadow-[4px_4px_0px_0px_#000] active:shadow-[2px_2px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] transition-all dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  {saveStatus === 'saving' ? 'Saving...' : 'Save Credentials'}
                </Button>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
