import React, { useState } from 'react';
import { PlusCircle, Play, StopCircle, Eye, AlertTriangle, CheckCircle, Zap } from 'lucide-react';

// TODO: Replace with actual data fetching and type from Convex or API
interface Playbook {
  _id: string;
  name: string;
  description: string;
  status: 'Running' | 'Stopped' | 'Idle' | 'Error';
  lastRun?: string; // ISO date string
  triggerConditions: string[];
  actionsToTake: string[];
}

const mockPlaybooks: Playbook[] = [
  {
    _id: 'playbook_1',
    name: 'Arbitrage Finder Bot',
    description: 'Scans for arbitrage opportunities across linked exchanges and executes trades if profit margin exceeds 0.5%.',
    status: 'Running',
    lastRun: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    triggerConditions: ['Price difference > 0.5% on ETH/USD', 'Sufficient balance on both exchanges'],
    actionsToTake: ['Execute buy on Exchange A', 'Execute sell on Exchange B', 'Log transaction'],
  },
  {
    _id: 'playbook_2',
    name: 'Market Monitoring Alert',
    description: 'Monitors BTC/USD for significant price swings (>5% in 1hr) and sends alerts.',
    status: 'Idle',
    triggerConditions: ['BTC/USD price change > 5% within 1 hour'],
    actionsToTake: ['Send email alert', 'Push notification to mobile app'],
  },
  {
    _id: 'playbook_3',
    name: 'Portfolio Rebalancer',
    description: 'Automatically rebalances portfolio to target allocations if drift exceeds 2%. Currently experiencing issues.',
    status: 'Error',
    lastRun: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    triggerConditions: ['Portfolio allocation drift > 2% for any asset'],
    actionsToTake: ['Calculate rebalancing trades', 'Execute trades (partially failed)', 'Notify admin of error'],
  },
  {
    _id: 'playbook_4',
    name: 'Stop-Loss Executor',
    description: 'Places and manages stop-loss orders for active positions based on predefined risk parameters.',
    status: 'Stopped',
    triggerConditions: ['Active position exists', 'Price nears stop-loss threshold'],
    actionsToTake: ['Place stop-loss order', 'Monitor order status'],
  },
];

const getStatusStyles = (status: Playbook['status']) => {
  switch (status) {
    case 'Running':
      return { icon: <Zap size={16} className="mr-1 text-green-600 dark:text-green-400" />, text: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900', border: 'border-green-500 dark:border-black' };
    case 'Stopped':
      return { icon: <StopCircle size={16} className="mr-1 text-gray-500 dark:text-gray-400" />, text: 'text-gray-600 dark:text-gray-300', bg: 'bg-gray-100 dark:bg-gray-700', border: 'border-gray-400 dark:border-black' };
    case 'Idle':
      return { icon: <CheckCircle size={16} className="mr-1 text-blue-600 dark:text-blue-400" />, text: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-900', border: 'border-blue-500 dark:border-black' };
    case 'Error':
      return { icon: <AlertTriangle size={16} className="mr-1 text-red-600 dark:text-red-400" />, text: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900', border: 'border-red-500 dark:border-black' };
    default:
      return { icon: null, text: 'text-gray-700 dark:text-gray-300', bg: 'bg-gray-100 dark:bg-gray-700', border: 'border-gray-400' };
  }
};

export function AutomationView() {
  // TODO: Replace with useQuery(api.automation.getPlaybooks) or similar
  const [playbooks, _setPlaybooks] = useState<Playbook[]>(mockPlaybooks);

  // TODO: Implement actual playbook actions
  const handleStartPlaybook = (id: string) => console.log(`Start playbook: ${id}`);
  const handleStopPlaybook = (id: string) => console.log(`Stop playbook: ${id}`);
  const handleMonitorPlaybook = (id: string) => console.log(`Monitor playbook: ${id}`);
  const handleCreatePlaybook = () => console.log('Create new playbook');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000] p-6 rounded-lg dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Automation Playbooks</h2>
            <p className="text-gray-600 mt-1 font-medium dark:text-gray-400">
              Manage and monitor your automated workflows and trading strategies.
            </p>
          </div>
          <button 
            onClick={handleCreatePlaybook}
            className="mt-4 sm:mt-0 flex items-center px-6 py-3 bg-green-500 text-white text-lg font-semibold border-2 border-black rounded-md shadow-[4px_4px_0px_0px_#000] hover:shadow-[2px_2px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 dark:bg-green-600 dark:hover:bg-green-700 dark:shadow-[4px_4px_0px_0px_#000] dark:hover:shadow-[2px_2px_0px_0px_#000]"
          >
            <PlusCircle size={22} className="mr-2" />
            Create Playbook
          </button>
        </div>
      </div>

      {/* Playbooks List */}
      {playbooks.length === 0 ? (
        <div className="bg-white rounded-lg border-4 border-black p-10 text-center shadow-[8px_8px_0px_0px_#000] dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
          <Zap size={48} className="mx-auto text-gray-400 dark:text-gray-500 mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-200">No Playbooks Yet</h3>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Get started by creating your first automation playbook.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {playbooks.map((playbook) => {
            const statusStyle = getStatusStyles(playbook.status);
            return (
              <div 
                key={playbook._id} 
                className="bg-white rounded-lg border-4 border-black p-6 shadow-[8px_8px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all duration-150 dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000] dark:hover:shadow-[4px_4px_0px_0px_#000]"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start mb-3">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-0">{playbook.name}</h3>
                  <span className={`flex items-center px-3 py-1 rounded-md border-2 ${statusStyle.border} ${statusStyle.bg} text-sm font-bold uppercase tracking-wider ${statusStyle.text}`}>
                    {statusStyle.icon}
                    {playbook.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">{playbook.description}</p>
                
                <div className="mb-4 pt-3 border-t-2 border-dashed border-gray-300 dark:border-black">
                  <h4 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-1">Triggers:</h4>
                  <ul className="list-disc list-inside pl-1 space-y-0.5">
                    {playbook.triggerConditions.map((trigger, index) => (
                      <li key={index} className="text-xs text-gray-600 dark:text-gray-400">{trigger}</li>
                    ))}
                  </ul>
                </div>
                
                <div className="mb-4 pt-3 border-t-2 border-dashed border-gray-300 dark:border-black">
                  <h4 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-1">Actions:</h4>
                  <ul className="list-disc list-inside pl-1 space-y-0.5">
                    {playbook.actionsToTake.map((action, index) => (
                      <li key={index} className="text-xs text-gray-600 dark:text-gray-400">{action}</li>
                    ))}
                  </ul>
                </div>

                {playbook.lastRun && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    Last run: {new Date(playbook.lastRun).toLocaleString()}
                  </p>
                )}

                <div className="flex flex-wrap gap-3 pt-4 border-t-2 border-black dark:border-black">
                  <button 
                    onClick={() => handleStartPlaybook(playbook._id)} 
                    disabled={playbook.status === 'Running'}
                    className="flex items-center px-4 py-2 bg-green-500 text-white text-sm font-semibold border-2 border-black rounded shadow-[2px_2px_0px_0px_#000] hover:shadow-[1px_1px_0px_0px_#000] hover:translate-x-[0.5px] hover:translate-y-[0.5px] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed dark:bg-green-600 dark:hover:bg-green-700 dark:shadow-[2px_2px_0px_0px_#000] dark:hover:shadow-[1px_1px_0px_0px_#000]"
                  >
                    <Play size={16} className="mr-2" /> Start
                  </button>
                  <button 
                    onClick={() => handleStopPlaybook(playbook._id)} 
                    disabled={playbook.status === 'Stopped' || playbook.status === 'Idle'}
                    className="flex items-center px-4 py-2 bg-red-500 text-white text-sm font-semibold border-2 border-black rounded shadow-[2px_2px_0px_0px_#000] hover:shadow-[1px_1px_0px_0px_#000] hover:translate-x-[0.5px] hover:translate-y-[0.5px] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-600 dark:hover:bg-red-700 dark:shadow-[2px_2px_0px_0px_#000] dark:hover:shadow-[1px_1px_0px_0px_#000]"
                  >
                    <StopCircle size={16} className="mr-2" /> Stop
                  </button>
                  <button 
                    onClick={() => handleMonitorPlaybook(playbook._id)} 
                    className="flex items-center px-4 py-2 bg-gray-200 text-gray-800 text-sm font-semibold border-2 border-black rounded shadow-[2px_2px_0px_0px_#000] hover:shadow-[1px_1px_0px_0px_#000] hover:translate-x-[0.5px] hover:translate-y-[0.5px] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-700 dark:shadow-[2px_2px_0px_0px_#000] dark:hover:shadow-[1px_1px_0px_0px_#000]"
                  >
                    <Eye size={16} className="mr-2" /> Monitor / Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
