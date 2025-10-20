// frontend/src/types.ts

// Base shape your UI uses everywhere
export type Channel = {
  id: string;
  type: 'youtube' | 'github' | 'custom';
  url: string;
  name: string;
  description?: string;
  imageUrl?: string;
  subscriberCount?: number | string;
  videoCount?: number | string;
};

// What ChannelCard was expecting to import (provide aliases)
export type YouTubeChannel = Channel & { type: 'youtube' };
export type GitHubRepo   = Channel & { type: 'github'; stars?: number };

// Minimal details returned by githubService (internal to hooks/services)
export type RepoDetails = {
  owner?: string;
  name?: string;
  description?: string;
  stars?: number;
  url?: string;
};

