import { callRapidAPI } from '../../lib/rapidapi.js';

export const HOST = 'instagram-scraper-stable-api.p.rapidapi.com';

/**
 * Get Instagram/FB profile data (v1 basic).
 */
export async function getFbProfile(usernameOrUrl: string, data = 'basic'): Promise<any> {
  try {
    if (!usernameOrUrl) throw new Error('usernameOrUrl is required');
    return await callRapidAPI(HOST, '/ig_get_fb_profile.php', 'POST', {
      username_or_url: usernameOrUrl.trim(),
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramScraperStable.getFbProfile] Failed for "${usernameOrUrl}": ${message}`,
    );
  }
}

/**
 * Get Instagram/FB profile data (v3 full deep metadata).
 */
export async function getFbProfileV3(usernameOrUrl: string): Promise<any> {
  try {
    if (!usernameOrUrl) throw new Error('usernameOrUrl is required');
    return await callRapidAPI(HOST, '/ig_get_fb_profile_v3.php', 'POST', {
      username_or_url: usernameOrUrl.trim(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramScraperStable.getFbProfileV3] Failed for "${usernameOrUrl}": ${message}`,
    );
  }
}

/**
 * Get Instagram user posts (amount up to 12).
 */
export async function getUserPosts(
  usernameOrUrl: string,
  amount: number = 12,
  paginationToken: string = '',
): Promise<any> {
  try {
    if (!usernameOrUrl) throw new Error('usernameOrUrl is required');
    return await callRapidAPI(HOST, '/get_ig_user_posts.php', 'POST', {
      username_or_url: usernameOrUrl.trim(),
      amount: String(amount),
      pagination_token: paginationToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramScraperStable.getUserPosts] Failed for "${usernameOrUrl}": ${message}`,
    );
  }
}

/**
 * Get Instagram user followers list.
 */
export async function getUserFollowers(
  usernameOrUrl: string,
  amount: number = 12,
  startFrom: number = 0,
  searchQuery: string = '',
): Promise<any> {
  try {
    if (!usernameOrUrl) throw new Error('usernameOrUrl is required');
    return await callRapidAPI(HOST, '/get_ig_user_followers.php', 'POST', {
      username_or_url: usernameOrUrl.trim(),
      data: 'followers',
      amount: String(amount),
      start_from: String(startFrom),
      search_query: searchQuery,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramScraperStable.getUserFollowers] Failed for "${usernameOrUrl}": ${message}`,
    );
  }
}

/**
 * Get Instagram user story highlights collection.
 */
export async function getUserHighlights(usernameOrUrl: string): Promise<any> {
  try {
    if (!usernameOrUrl) throw new Error('usernameOrUrl is required');
    return await callRapidAPI(HOST, '/get_ig_user_highlights.php', 'POST', {
      username_or_url: usernameOrUrl.trim(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramScraperStable.getUserHighlights] Failed for "${usernameOrUrl}": ${message}`,
    );
  }
}

export const instagramScraperStable = {
  HOST,
  getFbProfile,
  getFbProfileV3,
  getUserPosts,
  getUserFollowers,
  getUserHighlights,
};

export default instagramScraperStable;
