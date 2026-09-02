import { callRapidAPI } from '../../lib/rapidapi.js';

export const HOST = process.env.LINKEDIN_RAPIDAPI_HOST || 'linkedin-api8.p.rapidapi.com';

/**
 * Get LinkedIn full profile data by username (Main Endpoint).
 * GET /?username={username}
 */
export async function getProfileByUsername(username) {
  try {
    if (!username) throw new Error('username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[linkedin.getProfileByUsername] Failed for "${username}": ${message}`);
  }
}

/**
 * Get LinkedIn profile data by full profile URL.
 * GET /get-profile-data-by-url?url={url}
 */
export async function getProfileByUrl(url) {
  try {
    if (!url) throw new Error('url is required');
    return await callRapidAPI(
      HOST,
      `/get-profile-data-by-url?url=${encodeURIComponent(url.trim())}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[linkedin.getProfileByUrl] Failed for url "${url}": ${message}`);
  }
}

/**
 * Get LinkedIn profile recent activity timestamp.
 * GET /get-profile-recent-activity-time?username={username}
 */
export async function getProfileRecentActivity(username) {
  try {
    if (!username) throw new Error('username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/get-profile-recent-activity-time?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[linkedin.getProfileRecentActivity] Failed for "${username}": ${message}`,
    );
  }
}

/**
 * Get LinkedIn user profile posts.
 * GET /get-profile-posts?username={username}
 */
export async function getProfilePosts(username) {
  try {
    if (!username) throw new Error('username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/get-profile-posts?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[linkedin.getProfilePosts] Failed for "${username}": ${message}`);
  }
}

/**
 * Get LinkedIn connection count.
 * GET /connection-count?username={username}
 */
export async function getConnectionCount(username) {
  try {
    if (!username) throw new Error('username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/connection-count?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[linkedin.getConnectionCount] Failed for "${username}": ${message}`);
  }
}

/**
 * Get LinkedIn data connection count.
 * GET /data-connection-count?username={username}
 */
export async function getDataConnectionCount(username) {
  try {
    if (!username) throw new Error('username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/data-connection-count?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[linkedin.getDataConnectionCount] Failed for "${username}": ${message}`);
  }
}

/**
 * Get "About This Profile" metadata for LinkedIn profile.
 * GET /about-this-profile?username={username}
 */
export async function getAboutProfile(username) {
  try {
    if (!username) throw new Error('username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/about-this-profile?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[linkedin.getAboutProfile] Failed for "${username}": ${message}`);
  }
}

/**
 * Search locations on LinkedIn.
 * GET /search-locations?keyword={keyword}
 */
export async function searchLocations(keyword) {
  try {
    if (!keyword) throw new Error('keyword is required');
    return await callRapidAPI(
      HOST,
      `/search-locations?keyword=${encodeURIComponent(keyword.trim())}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[linkedin.searchLocations] Failed for "${keyword}": ${message}`);
  }
}

/**
 * Get schools of interest for profile.
 * POST /profiles/interests/schools
 */
export async function getInterestsSchools(username, page = 1) {
  try {
    if (!username) throw new Error('username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      '/profiles/interests/schools',
      'POST',
      { username: cleanUsername, page },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[linkedin.getInterestsSchools] Failed for "${username}": ${message}`);
  }
}

/**
 * Get companies of interest for profile.
 * POST /profiles/interests/companies
 */
export async function getInterestsCompanies(username, page = 1) {
  try {
    if (!username) throw new Error('username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      '/profiles/interests/companies',
      'POST',
      { username: cleanUsername, page },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[linkedin.getInterestsCompanies] Failed for "${username}": ${message}`);
  }
}

export const getAllProfileData = getProfileByUsername;
export const getProfileConnectionCountPosts = getDataConnectionCount;

export const linkedin = {
  HOST,
  getProfileByUsername,
  getProfileByUrl,
  getProfileRecentActivity,
  getProfilePosts,
  getConnectionCount,
  getDataConnectionCount,
  getAboutProfile,
  searchLocations,
  getInterestsSchools,
  getInterestsCompanies,
  getAllProfileData,
  getProfileConnectionCountPosts,
};

export default linkedin;
