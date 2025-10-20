// frontend/src/app.tsx
import React, { useState } from 'react';
import Header from './components/header';              // NOTE: lowercase to match file name
import ChannelCard from './components/ChannelCard';
import { useChannels } from './hooks/useChannels';

export default function App() {
  const { channels, addChannel, removeChannel, loading, error } = useChannels();
  const [url, setUrl] = useState('');

  async function handleAdd() {
    const trimmed = url.trim();
    if (!trimmed) return;
    await addChannel(trimmed);
    setUrl('');
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header onAddChannel={handleAdd} />

      <main className="container mx-auto px-4 py-6">
        {/* Input row */}
        <div className="bg-white shadow rounded p-4 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Add a YouTube channel (@handle or URL)
          </label>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              className="flex-1 border border-gray-300 rounded px-3 py-2"
              placeholder="e.g. https://www.youtube.com/@Kurzgesagt or https://github.com/vercel/next.js"
            />
            <button
              onClick={handleAdd}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded"
            >
              {loading ? 'Adding…' : 'Add'}
            </button>
          </div>
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        </div>

        {/* List */}
        {channels.length === 0 ? (
          <p className="text-gray-600">No items yet. Add a channel or repo above.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map((ch) => (
              <ChannelCard key={`${ch.type}:${ch.id}`} channel={ch} onRemove={removeChannel} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
