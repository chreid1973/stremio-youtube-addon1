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
    // ✅ pass a string, not the whole object
    const text = channel.description ?? channel.name;
    const result = await getSummary(text);
    setSummary(result);
    setLoadingSummary(false);
  };
  fetchSummary();
}, [channel]);

    fetchSummary();
  }, [channel]);

const renderDetails = () => {
  if (channel.type === 'youtube') {
    const yt = channel as YouTubeChannel;
    const subs = yt.subscriberCount ? Number(yt.subscriberCount).toLocaleString() : '—';
    const vids = yt.videoCount ? Number(yt.videoCount).toLocaleString() : '—';
    return (
      <div className="text-sm text-gray-600">
        <span>Subscribers: {subs}</span>
        <span className="mx-2">|</span>
        <span>Videos: {vids}</span>
      </div>
    );
  } else {
    const gh = channel as GitHubRepo;
    const stars = (gh as any).stars != null ? Number((gh as any).stars).toLocaleString() : '—';
    const forks = (gh as any).forks != null ? Number((gh as any).forks).toLocaleString() : '—';
    return (
      <div className="text-sm text-gray-600">
        <span>Stars: {stars}</span>
        <span className="mx-2">|</span>
        <span>Forks: {forks}</span>
      </div>
    );
  }
};


  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col justify-between">
      <div className="p-4">
        <div className="flex items-start justify-between mb-4">
            <div className="flex items-center min-w-0">
                <img
  className="w-12 h-12 rounded-full mr-4 flex-shrink-0"
  src={channel.imageUrl || 'https://via.placeholder.com/96?text=%20'}
  alt={channel.name}
/>
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
