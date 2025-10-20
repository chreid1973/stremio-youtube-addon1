const ENV_BASE = import.meta.env.VITE_BACKEND_BASE as string | undefined;
const BACKEND_BASE = ENV_BASE && ENV_BASE.trim() ? ENV_BASE.trim() : window.location.origin;

export type AddonResponse = {
  token: string;
  manifest_url: string;
  web_stremio_install: string;
};

export async function createAddonConfig(channels: string[], lowQuota = true): Promise<AddonResponse> {
  const r = await fetch(`${BACKEND_BASE}/create-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channels, lowQuota })
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Create config failed (${r.status}): ${text}`);
  }
  return r.json();
}
