import { useState, useEffect } from 'react';
import { Channel } from '../types';
import { getRepoDetails } from '../services/githubService';
import { getChannelDetails } from '../services/youtubeService';

export const useChannels = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedChannels = localStorage.getItem('channels');
      if (savedChannels) {
        setChannels(JSON.parse(savedChannels));
      }
    } catch (e) {
      console.error('Failed to load channels from local storage', e);
      setError('Could not load saved channels.');
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('channels', JSON.stringify(channels));
    } catch (e) {
      console.error('Failed to save channels to local storage', e);
      setError('Could not save channels.');
    }
  }, [channels]);

  const addChannel = async (url: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      let newChannel: Channel | null = null;
      if (url.includes('youtube.com')) {
        newChannel = await getChannelDetails(url);
      } else if (url.includes('github.com')) {
        newChannel = await getRepoDetails(url);
      } else {
        throw new Error('Invalid URL. Please provide a valid YouTube channel or GitHub repository URL.');
      }

      if (newChannel) {
        if (!channels.find(c => c.id === newChannel.id && c.type === newChannel.type)) {
          setChannels(prevChannels => [newChannel, ...prevChannels]);
          return true; // Indicate success
        } else {
          throw new Error('Channel or repository has already been added.');
        }
      }
      // This path should ideally not be hit if services throw errors, but it's a safeguard.
      throw new Error('Failed to retrieve channel or repository details.');
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      return false; // Indicate failure
    } finally {
      setLoading(false);
    }
  };

  const removeChannel = (id: string) => {
    setChannels(prevChannels => prevChannels.filter(channel => channel.id !== id));
  };

  return { channels, addChannel, removeChannel, loading, error };
};