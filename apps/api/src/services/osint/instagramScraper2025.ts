import { callRapidAPI } from '../../lib/rapidapi.js';

export const HOST = 'instagram-scraper-20251.p.rapidapi.com';

/**
 * Get Instagram user information by username or user ID using instagram-scraper-20251 API.
 * GET /userinfo/?url_embed_safe=true&include_about=true&username_or_id={username_or_id}
 */
export async function getUserInfo(
  usernameOrId: string,
  urlEmbedSafe = true,
  includeAbout = true,
): Promise<any> {
  try {
    if (!usernameOrId) throw new Error('username_or_id is required');
    const cleanHandle = usernameOrId.replace(/^@/, '').trim();
    const query = new URLSearchParams({
      url_embed_safe: String(urlEmbedSafe),
      include_about: String(includeAbout),
      username_or_id: cleanHandle,
    });

    return await callRapidAPI(
      HOST,
      `/userinfo/?${query.toString()}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[instagramScraper2025.getUserInfo] Failed for "${usernameOrId}": ${message}`);
  }
}

export const instagramScraper2025 = {
  HOST,
  getUserInfo,
};

export default instagramScraper2025;
