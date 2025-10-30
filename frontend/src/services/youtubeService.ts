import type { Channel } from '../types';
const ENV_BASE = import.meta.env.VITE_BACKEND_BASE as string | undefined;
const BACKEND_BASE = ENV_BASE && ENV_BASE.trim() ? ENV_BASE.trim() : window.location.origin;

export type Suggestion = {
  channelId: string;
  title: string;
  thumbnail?: string;
  subscribers?: string;
  description?: string;
};

export async function suggestChannels(query: string): Promise<Suggestion[]> {
  const r = await fetch(`${BACKEND_BASE}/suggest?` + new URLSearchParams({ query }));
  if (!r.ok) return [];
  const data = await r.json();
  return (data.suggestions || []) as Suggestion[];
}

export async function getChannelDetails(input: string): Promise<Channel> {
  const r = await fetch(`${BACKEND_BASE}/resolve?` + new URLSearchParams({ input }));
  if (r.status === 404) {
    const data = await r.json().catch(() => ({}));
    // If backend says ambiguous, the caller should ask user to pick
    if (data?.suggestions) throw Object.assign(new Error('ambiguous'), { suggestions: data.suggestions });
    throw new Error('Channel not found');
  }
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

export type YouTubeVideo = { id: string; title: string; published?: string; link?: string; thumbnail?: string; };

export async function getChannelVideos(channelId: string): Promise<YouTubeVideo[]> {
  const r = await fetch(`${BACKEND_BASE}/feed?` + new URLSearchParams({ channelId }));
  if (!r.ok) throw new Error('Feed fetch failed');
  const data = await r.json();
  return (data.videos || []) as YouTubeVideo[];
}

export const fetchYouTubeChannel = getChannelDetails;
export default { getChannelDetails, getChannelVideos, suggestChannels };

