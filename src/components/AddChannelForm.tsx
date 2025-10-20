import React, { useState } from 'react';

interface AddChannelFormProps {
  onAddChannel: (url: string) => Promise<void>;
  onClose: () => void;
  loading: boolean;
}

const AddChannelForm: React.FC<AddChannelFormProps> = ({ onAddChannel, onClose, loading }) => {
  const [url, setUrl] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      await onAddChannel(url);
      setUrl('');
    }
  };

  return (
    <div className="my-4 p-4 bg-white rounded-lg shadow">
      <form onSubmit={handleSubmit}>
        <label htmlFor="url-input" className="block text-gray-700 text-sm font-bold mb-2">
          YouTube Channel or GitHub Repo URL
        </label>
        <div className="flex items-center">
          <input
            id="url-input"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/channel/... or https://github.com/..."
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            disabled={loading}
          />
          <button
            type="submit"
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded ml-2 disabled:bg-gray-400"
            disabled={loading || !url.trim()}
          >
            {loading ? 'Adding...' : 'Add'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded ml-2"
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddChannelForm;