import { GitHubRepo } from '../types';

const API_URL = 'https://api.github.com/repos/';

function extractRepoPath(url: string): string | null {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'github.com') {
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            if (pathParts.length >= 2) {
                return `${pathParts[0]}/${pathParts[1]}`;
            }
        }
    } catch (e) {
        // Ignore invalid URLs
    }
    return null;
}

export const fetchGitHubRepo = async (url: string): Promise<GitHubRepo> => {
    const repoPath = extractRepoPath(url);
    if (!repoPath) {
        throw new Error('Invalid GitHub repository URL. Expected format: https://github.com/owner/repo');
    }

    const response = await fetch(`${API_URL}${repoPath}`);
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to fetch GitHub repository: ${errorData.message || response.statusText}`);
    }

    const data = await response.json();

    return {
        id: data.id.toString(),
        type: 'github',
        url: data.html_url,
        name: data.full_name,
        description: data.description || 'No description provided.',
        imageUrl: data.owner.avatar_url,
        stars: data.stargazers_count,
        forks: data.forks_count,
    };
};