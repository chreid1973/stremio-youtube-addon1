export type ChannelType = 'youtube' | 'github';

export interface BaseChannel {
  id: string;
  type: ChannelType;
  url: string;
  name: string;
  description: string;
  imageUrl: string;
}

export interface YouTubeChannel extends BaseChannel {
  type: 'youtube';
  subscriberCount: string;
  videoCount: string;
}

export interface GitHubRepo extends BaseChannel {
  type: 'github';
  stars: number;
  forks: number;
}

export type Channel = YouTubeChannel | GitHubRepo;