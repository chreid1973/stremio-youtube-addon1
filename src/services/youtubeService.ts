import { YouTubeChannel } from '../types';

const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
const BASE_URL = 'https://www.googleapis.com/youtube/v3';

async function getChannelIdFromUrl(url: string): Promise<string> {
    const channelIdMatch = url.match(/youtube\.com\/channel\/([\w-]+)/);
    if (channelIdMatch) {
        return channelIdMatch[1];
    }

    const handleMatch = url.match(/youtube\.com\/(?:c\/|user\/|@)([\w-]+)/);
    if (handleMatch) {
        // This part is more complex in reality as forUsername is deprecated.
        // A search is the correct way but for simplicity, we'll try a search query for the handle.
        const handle = handleMatch[1];
        const searchUrl = `${BASE_URL}/search?part=snippet&q=${handle}&type=channel&key=${API_KEY}`;
        const response = await fetch(searchUrl);
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            return data.items[0].snippet.channelId;
        }
        throw new Error(`Could not resolve YouTube channel for handle: ${handle}`);
    }

    throw new Error('Invalid YouTube URL format. Please use a /channel/, /c/, /user/, or /@ handle URL.');
}


export const fetchYouTubeChannel = async (url: string): Promise<YouTubeChannel> => {
    if (!API_KEY) {
        throw new Error("VITE_YOUTUBE_API_KEY is not defined in .env file.");
    }
    
    const channelId = await getChannelIdFromUrl(url);

    const detailsUrl = `${BASE_URL}/channels?part=snippet,statistics&id=${channelId}&key=${API_KEY}`;
    const response = await fetch(detailsUrl);
    if (!response.ok) {
        const error = await response.json();
        throw new Error(`YouTube API error: ${error.error.message}`);
    }

    const data = await response.json();
    if (!data.items || data.items.length === 0) {
        throw new Error("YouTube channel not found.");
    }
    
    const item = data.items[0];
    const { id, snippet, statistics } = item;

    return {
        id,
        type: 'youtube',
        url: `https://www.youtube.com/channel/${id}`,
        name: snippet.title,
        description: snippet.description || 'No description provided.',
        imageUrl: snippet.thumbnails.default.url,
        subscriberCount: statistics.subscriberCount,
        videoCount: statistics.videoCount,
    };
};