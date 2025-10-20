import React, { useState, useEffect } from 'react';
import { Channel, YouTubeChannel, GitHubRepo } from '../types';
import { getSummary } from '../services/geminiService';

interface ChannelCardProps {
  channel: Channel;
  onRemove: (id: string) => void;
}

const ChannelCard: React.FC<ChannelCardProps> = ({ channel, onRemove }) => {
  const [summary, setSummary] = useState<string>('');
  const [loadingSummary, setLoadingSummary] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      setLoadingSummary(true);
      const result = await getSummary(channel);
      setSummary(result);
      setLoadingSummary(false);
    };

    fetchSummary();
  }, [channel]);

  const renderDetails = () => {
    if (channel.type === 'youtube') {
      const ytChannel = channel as YouTubeChannel;
      return (
        <div className="text-sm text-gray-600">
          <span>Subscribers: {Number(ytChannel.subscriberCount).toLocaleString()}</span>
          <span className="mx-2">|</span>
          <span>Videos: {Number(ytChannel.videoCount).toLocaleString()}</span>
        </div>
      );
    } else {
      const ghRepo = channel as GitHubRepo;
      return (
        <div className="text-sm text-gray-600">
          <span>Stars: {ghRepo.stars.toLocaleString()}</span>
          <span className="mx-2">|</span>
          <span>Forks: {ghRepo.forks.toLocaleString()}</span>
        </div>
      );
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col justify-between">
      <div className="p-4">
        <div className="flex items-start justify-between mb-4">
            <div className="flex items-center min-w-0">
                <img className="w-12 h-12 rounded-full mr-4 flex-shrink-0" src={channel.imageUrl} alt={channel.name} />
                <div className="min-w-0">
                    <a href={channel.url} target="_blank" rel="noopener noreferrer" className="font-bold text-lg hover:underline truncate block">{channel.name}</a>
                    <p className="text-sm text-gray-500 capitalize">{channel.type}</p>
                </div>
            </div>
            <button onClick={() => onRemove(channel.id)} className="text-gray-400 hover:text-red-500 text-2xl font-bold flex-shrink-0 ml-2">&times;</button>
        </div>
        
        {renderDetails()}

        <div className="mt-4">
          <p className="text-sm text-gray-800">{channel.description}</p>
        </div>

        <div className="text-gray-700 text-sm mt-4 p-3 bg-gray-50 rounded">
          <p className="font-semibold text-gray-600">AI Summary:</p>
          <p className="italic text-gray-600">{loadingSummary ? 'Loading...' : summary}</p>
        </div>
      </div>
    </div>
  );
};

export default ChannelCard;