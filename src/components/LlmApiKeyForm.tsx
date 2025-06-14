import { useState } from 'react';

// For development purposes, we'll use mock implementations
export function LlmApiKeyForm() {
  const [apiKey, setApiKey] = useState('');
  const [isKeySet, setIsKeySet] = useState(false); // Mock initial state
  const [message, setMessage] = useState('');

  // Mock functions for development
  const handleSave = () => {
    if (!apiKey) {
      setMessage('Please enter an API key.');
      return;
    }
    
    // Simulate successful API key saving
    console.log('Mock: Saving API key:', apiKey);
    setMessage('API Key saved successfully! (Development mode)');
    setIsKeySet(true);
    setApiKey('');
  };

  // Mock function for deleting API key
  const handleDelete = () => {
    console.log('Mock: Deleting API key');
    setMessage('API Key cleared successfully! (Development mode)');
    setIsKeySet(false);
  };

  return (
    <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000] p-6 rounded-lg dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
      <h3 className="text-lg font-bold text-gray-900 mb-2 dark:text-white">LLM API Key</h3>
      <p className="text-sm text-gray-600 mb-4 dark:text-gray-400">
        Your Large Language Model (e.g., OpenAI) API key is required for semantic analysis features. It is stored securely and only used for this purpose.
      </p>
      <div className="flex items-center space-x-4">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={isKeySet ? 'API Key is set' : 'Enter your API key'}
          className="flex-grow p-2 border-2 border-black rounded-md dark:bg-gray-700 dark:text-white dark:border-black"
          disabled={isKeySet}
        />
        {!isKeySet ? (
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-500 text-white font-bold rounded-md border-2 border-black shadow-[4px_4px_0px_0px_#000] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
          >
            Save
          </button>
        ) : (
          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-500 text-white font-bold rounded-md border-2 border-black shadow-[4px_4px_0px_0px_#000] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
          >
            Clear Key
          </button>
        )}
      </div>
      {message && <p className="text-sm mt-3 text-gray-700 dark:text-gray-300">{message}</p>}
    </div>
  );
}
