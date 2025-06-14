import { formatDistanceToNow } from 'date-fns';

interface Platform {
  _id: string;
  displayName: string;
  syncStatus: 'active' | 'syncing' | 'error' | 'paused' | 'inactive'; // Added 'paused', kept 'syncing' and 'inactive' for flexibility
  lastSync?: number; // Assuming it's a timestamp
  // Add other relevant fields if necessary
}

interface PlatformStatusListProps {
  platforms: Platform[] | undefined;
}

const statusColors: Record<Platform['syncStatus'], string> = {
  active: 'bg-green-500',
  syncing: 'bg-yellow-500', // For platforms currently in the process of syncing
  error: 'bg-red-500',
  paused: 'bg-gray-400',    // For platforms that are intentionally paused
  inactive: 'bg-red-500',  // Changed inactive to red to indicate needs attention
};

export function PlatformStatusList({ platforms }: PlatformStatusListProps) {
  if (!platforms || platforms.length === 0) {
    return (
      <div className="text-center py-8 bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000] p-6 rounded-lg dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
        <p className="text-gray-500 font-medium dark:text-gray-400">No platforms to display.</p>
      </div>
    );
  }
  
  // Only display Polymarket and Kalshi, and set them to inactive
  const filteredPlatforms = platforms
    .filter(platform => ['polymarket', 'kalshi'].includes(platform.displayName.toLowerCase()))
    .map(platform => ({
      ...platform,
      syncStatus: 'inactive' as Platform['syncStatus']
    }));

  return (
    <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000] p-6 rounded-lg dark:bg-gray-800 dark:border-black dark:shadow-[8px_8px_0px_0px_#000]">
      <h3 className="text-lg font-bold text-gray-900 mb-4 dark:text-white">Platform Connection Status</h3>
      <div className="space-y-4">
        {filteredPlatforms.map((platform) => (
          <div 
            key={platform._id} 
            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border-2 border-black shadow-[4px_4px_0px_0px_#000] dark:bg-gray-700 dark:border-black dark:shadow-[4px_4px_0px_0px_#000]"
          >
            <div className="flex items-center space-x-3">
              <div 
                className={`h-3 w-3 rounded-full ${statusColors[platform.syncStatus] || 'bg-gray-500'}`}
                title={platform.syncStatus.charAt(0).toUpperCase() + platform.syncStatus.slice(1)}
              />
              <span className="font-semibold text-gray-900 dark:text-white">{platform.displayName}</span>
            </div>
            <div className="text-right">
              <p className={`text-sm font-medium ${platform.syncStatus === 'error' || platform.syncStatus === 'inactive' ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                {platform.syncStatus.charAt(0).toUpperCase() + platform.syncStatus.slice(1)}
              </p>
              {platform.lastSync && (
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  Last sync: {formatDistanceToNow(new Date(platform.lastSync), { addSuffix: true })}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
