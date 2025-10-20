import React from 'react';
import { Channel } from '../types';
import ChannelCard from './ChannelCard';

interface ChannelListProps {
  channels: Channel[];
  onRemoveChannel: (id: string) => void;
}

const ChannelList: React.FC<ChannelListProps> = ({ channels, onRemoveChannel }) => {
  if (channels.length === 0) {
    return (
      <div className="text-center p-8 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-700">No channels added yet.</h2>
        <p className="text-gray-500">Click "Add Channel" to get started!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {channels.map(channel => (
        <ChannelCard key={channel.id} channel={channel} onRemove={onRemoveChannel} />
      ))}
    </div>
  );
};

export default ChannelList;