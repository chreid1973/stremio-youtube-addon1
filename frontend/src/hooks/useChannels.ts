// frontend/src/hooks/useChannels.ts
import { useEffect, useState } from 'react';
import type { Channel, RepoDetails } from '../types';
import { getRepoDetails } from '../services/githubService';
import { getChannelDetails } from '../services/youtubeService';

const STORAGE_KEY = 'channels';

function looksLikeYouTube(input: string) {
  const s = input.trim();
  return /(^@)|youtube\.com|youtu\.be/i.test(s);
}

function looksLikeGitHub(input: string) {
  const s = input.trim();
  return /github\.com\//i.test(s);
}

// Convert a minimal RepoDetails into a renderable Channel
function repoToChannel(repo: RepoDetails): Channel {
  const owner = repo.owner ? `${repo.owner}/` : '';
  const name = repo.name ?? 'repository';
  const url = repo.url ?? (owner ? `https://github.com/${owner}${name}` : `https://github.com/${name}`);
  return {
    id: repo.url ?? `${owner}${name}`,
    type: 'github',
    url,
    name: `${owner}${name}`,
    description: repo.description,
    imageUrl: undefined,
    // Optional fields your UI might read (kept loose)
    // @ts-expect-error optional UI-only field
    stars: repo.stars
  };
}

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

      let newChannel: Channel | null = null;

      if (looksLikeYouTube(url)) {
        // Backend RSS path → already returns a Channel
        newChannel = await getChannelDetails(url);
      } else if (looksLikeGitHub(url)) {
        // GitHub path → returns RepoDetails, convert it
        const repo: RepoDetails | null = await getRepoDetails(url);
        newChannel = repo ? repoToChannel(repo) : null;
      } else {
        throw new Error('Please enter a valid YouTube channel (@handle/URL) or GitHub repository URL.');
      }

      if (!newChannel) {
        throw new Error('Failed to retrieve details. Please check the URL and try again.');
      }

      // Deduplicate by (id + type)
      const exists = channels.some(c => c.id === newChannel!.id && c.type === newChannel!.type);
      if (exists) {
        throw new Error('That item is already in your list.');
      }

      setChannels(prev => [newChannel!, ...prev]);
      return true;
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred.');
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
