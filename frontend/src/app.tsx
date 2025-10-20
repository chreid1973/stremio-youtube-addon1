// frontend/src/app.tsx
import React, { useState } from 'react';
import Header from './components/header';              // NOTE: lowercase to match file name
import ChannelCard from './components/ChannelCard';
import { useSuggestions } from './hooks/useSuggestions';
import { useChannels } from './hooks/useChannels';

export default function App() {
  const { channels, addChannel, removeChannel, loading, error } = useChannels();
  const [url, setUrl] = useState('');
  const { results: suggestions, loading: sugLoading } = useSuggestions(url);


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
        <div className="bg-white shadow rounded p-4 mb-6 relative">
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Add a YouTube channel (URL, @handle, UC id, or name)
  </label>
  <div className="flex gap-2">
    <input
      value={url}
      onChange={(e) => setUrl(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
      className="flex-1 border border-gray-300 rounded px-3 py-2"
      placeholder="e.g. https://youtube.com/@MKBHD or “Linus Sebastian”"
    />
    <button
      onClick={handleAdd}
      disabled={loading}
      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded"
    >
      {loading ? 'Adding…' : 'Add'}
    </button>
  </div>

  {/* Suggestions dropdown */}
  {!!url.trim() && suggestions.length > 0 && (
    <div className="absolute z-10 mt-1 w-full max-h-80 overflow-auto bg-white border border-gray-200 rounded shadow">
      {suggestions.map(s => (
        <button
          key={s.channelId}
          onClick={async () => {
            // Add immediately using the known channelId
            await addChannel(`https://www.youtube.com/channel/${s.channelId}`);
            setUrl('');
          }}
          className="w-full text-left p-2 hover:bg-gray-50 flex items-center gap-3"
        >
          <img src={s.thumbnail || 'https://via.placeholder.com/48?text=%20'} alt="" className="w-12 h-12 rounded" />
          <div className="min-w-0">
            <div className="font-medium truncate">{s.title}</div>
            <div className="text-xs text-gray-500 truncate">{s.subscribers || s.description || s.channelId}</div>
          </div>
        </button>
      ))}
    </div>
  )}

  {sugLoading && !!url.trim() && (
    <div className="absolute mt-1 p-2 text-sm text-gray-500 bg-white border border-gray-200 rounded shadow">
      Searching…
    </div>
  )}

  {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
</div>
