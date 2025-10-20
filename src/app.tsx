import React, { useState } from 'react';
import Header from './components/Header';
import ChannelList from './components/ChannelList';
import AddChannelForm from './components/AddChannelForm';
import { useChannels } from './hooks/useChannels';

function App() {
  const { channels, addChannel, removeChannel, loading, error } = useChannels();
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <Header onAddChannel={() => setIsAdding(true)} />
      <main className="container mx-auto p-4">
        {isAdding && (
          <AddChannelForm
            onAddChannel={async (url) => {
              await addChannel(url);
              // Only close if there's no error. The error will be displayed above the list.
              if (!error) {
                setIsAdding(false);
              }
            }}
            onClose={() => setIsAdding(false)}
            loading={loading}
          />
        )}
        {error && <p className="text-red-500 bg-red-100 p-3 rounded-md my-4">{error}</p>}
        <ChannelList channels={channels} onRemoveChannel={removeChannel} />
      </main>
    </div>
  );
}

export default './App/index'
