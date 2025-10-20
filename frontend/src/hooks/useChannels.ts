import { useEffect, useState } from 'react';
import type { Channel } from '../types';
import { getChannelDetails } from '../services/youtubeService';

const STORAGE_KEY = 'channels';

export const useChannels = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved channels
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setChannels(JSON.parse(saved));
    } catch (e) {
      console.error('Failed to load channels from localStorage', e);
      setError('Could not load saved channels.');
    }
  }, []);

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(channels));
    } catch (e) {
      console.error('Failed to save channels to localStorage', e);
      setError('Could not save channels.');
    }
  }, [channels]);

  const addChannel = async (input: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const url = input.trim();
      if (!url) throw new Error('Please enter a valid YouTube channel handle or URL.');

      const newChannel = await getChannelDetails(url);
      if (!newChannel) throw new Error('Failed to retrieve channel details.');

      const exists = channels.some(c => c.id === newChannel.id);
      if (exists) throw new Error('That channel is already in your list.');

      setChannels(prev => [newChannel, ...prev]);
      return true;
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const removeChannel = (id: string) => {
    setChannels(prev => prev.filter(c => c.id !== id));
  };

  return { channels, addChannel, removeChannel, loading, error };
};
