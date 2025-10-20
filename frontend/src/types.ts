// frontend/src/types.ts

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

// If you ever use GitHub repos in UI:
export type RepoDetails = {
  owner?: string;
  name?: string;
  description?: string;
  stars?: number;
  url?: string;
};
