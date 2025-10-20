import type { Channel } from '../types';

const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE;

// A channel as our app uses it
export async function getChannelDetails(input: string): Promise<Channel> {
  const r = await fetch(`${BACKEND_BASE}/resolve?` + new URLSearchParams({ input }), { method: 'GET' });
  if (!r.ok) throw new Error('Resolve failed');
  const data = await r.json();
  return {
    id: data.channelId,
    type: 'youtube',
    url: `https://www.youtube.com/channel/${data.channelId}`,
    name: data.title || `Channel ${data.channelId?.slice(0, 8)}…`,
    imageUrl: data.thumbnail
  };
}

export type YouTubeVideo = {
  id: string;
  title: string;
  published?: string;
  link?: string;
  thumbnail?: string;
};

export async function getChannelVideos(channelId: string): Promise<YouTubeVideo[]> {
  const r = await fetch(`${BACKEND_BASE}/feed?` + new URLSearchParams({ channelId }), { method: 'GET' });
  if (!r.ok) throw new Error('Feed fetch failed');
  const data = await r.json();
  return (data.videos || []) as YouTubeVideo[];
}

// Optional alias to keep older imports working
export const fetchYouTubeChannel = getChannelDetails;
