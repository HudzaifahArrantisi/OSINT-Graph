/**
 * RapidAPI Social Media OSINT Collector — gathers rich public profile metadata
 * across Instagram, TikTok, and LinkedIn using all available engines in services/osint.
 * Converts complete JSON intelligence responses directly into typed graph nodes and relationships.
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { instagramScraper } from '../services/osint/instagramScraper.js';
import { instagramFastReliable } from '../services/osint/instagramFastReliable.js';
import { instagramBestExperience } from '../services/osint/instagramBestExperience.js';
import { instagramScraperStable } from '../services/osint/instagramScraperStable.js';
import { tiktok } from '../services/osint/tiktok.js';
import { tiktokBestExperience } from '../services/osint/tiktokBestExperience.js';
import { linkedin } from '../services/osint/linkedin.js';
import { logger } from '../lib/logger.js';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?(\d{1,3}))?[-. (]*(\d{2,4})[-. )]*(\d{3,4})[-. ]*(\d{3,5})/g;
const URL_REGEX = /https?:\/\/[^\s$.?#].[^\s]*/gi;
const MENTION_REGEX = /(?:^|\s)@([a-zA-Z0-9._]{2,30})/g;

function extractEmails(text?: string | null): string[] {
  if (!text) return [];
  const matches = text.match(EMAIL_REGEX);
  return matches ? Array.from(new Set(matches.map((e) => e.toLowerCase()))) : [];
}

function extractPhones(text?: string | null): string[] {
  if (!text) return [];
  const matches = text.match(PHONE_REGEX);
  if (!matches) return [];
  return Array.from(
    new Set(
      matches
        .map((p) => p.trim())
        .filter((p) => p.replace(/\D/g, '').length >= 9 && p.replace(/\D/g, '').length <= 15),
    ),
  );
}

function extractUrls(text?: string | null): string[] {
  if (!text) return [];
  const matches = text.match(URL_REGEX);
  return matches ? Array.from(new Set(matches.map((u) => u.trim()))) : [];
}

function extractMentions(text?: string | null): string[] {
  if (!text) return [];
  const results: string[] = [];
  let match;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    if (match[1]) results.push(match[1].toLowerCase());
  }
  return Array.from(new Set(results));
}

function cleanUsername(input: string): string {
  let cleaned = input.trim();
  if (cleaned.includes('instagram.com/')) {
    cleaned = cleaned.split('instagram.com/')[1]?.split('/')[0]?.split('?')[0] || cleaned;
  } else if (cleaned.includes('tiktok.com/@')) {
    cleaned = cleaned.split('tiktok.com/@')[1]?.split('/')[0]?.split('?')[0] || cleaned;
  } else if (cleaned.includes('linkedin.com/in/')) {
    cleaned = cleaned.split('linkedin.com/in/')[1]?.split('/')[0]?.split('?')[0] || cleaned;
  }
  return cleaned.replace(/^@/, '').trim();
}

export const socialRapidapiCollector: Collector = {
  name: 'social-rapidapi',

  supports(inputType: string): boolean {
    return (
      inputType === 'USERNAME' ||
      inputType === 'SOCIAL_PROFILE' ||
      inputType === 'PERSON' ||
      inputType === 'NAME'
    );
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    const handle = cleanUsername(input);

    if (!handle || handle.length < 2) {
      warnings.push(`Input "${input}" is too short for social media reconnaissance.`);
      return {
        source: 'social-rapidapi',
        collectedAt,
        entities,
        relationships,
        evidence,
        warnings,
      };
    }

    // Determine platforms to target from context (default: all 3)
    const activePlatforms =
      ctx.platforms && ctx.platforms.length > 0
        ? ctx.platforms.map((p) => p.toLowerCase().trim())
        : ['instagram', 'tiktok', 'linkedin'];

    logger.info('RapidAPI social collector executing comprehensive OSINT deep recon', {
      requestId: ctx.requestId,
      handle,
      platforms: activePlatforms,
    });

    const tasks: Promise<void>[] = [];

    // ─── 1. INSTAGRAM DEEP ENGINES ─────────────────────────────────────
    if (activePlatforms.includes('instagram')) {
      tasks.push(
        (async () => {
          try {
            // Run all Instagram engines in parallel
            const [
              scraperRes,
              bestExpRes,
              bestExpIdRes,
              fastRelIdRes,
              stableFbRes,
              stablePostsRes,
              stableHighlightsRes,
              stableFollowersRes,
            ] = await Promise.allSettled([
              instagramScraper.getUserInfo(handle),
              instagramBestExperience.getProfileByUsername(handle),
              instagramBestExperience.getUserIdByUsername(handle),
              instagramFastReliable.getUserIdByUsername(handle),
              instagramScraperStable.getFbProfileV3(handle),
              instagramScraperStable.getUserPosts(handle, 12),
              instagramScraperStable.getUserHighlights(handle),
              instagramScraperStable.getUserFollowers(handle, 6),
            ]);

            // Consolidate extracted profile data
            let igData: any = {};
            if (scraperRes.status === 'fulfilled' && scraperRes.value) {
              const val = scraperRes.value;
              igData = { ...igData, ...(val.user || val.data?.user || val) };
            }
            if (bestExpRes.status === 'fulfilled' && bestExpRes.value) {
              const val = bestExpRes.value;
              igData = { ...igData, ...(val.user || val.data?.user || val) };
            }
            if (bestExpIdRes.status === 'fulfilled' && bestExpIdRes.value) {
              const val = bestExpIdRes.value;
              const uid =
                val.user_id ||
                val.userId ||
                val.id ||
                val.pk ||
                val.data?.user_id ||
                (typeof val === 'string' || typeof val === 'number' ? val : null);
              if (uid) igData.user_id = uid;
            }
            if (fastRelIdRes.status === 'fulfilled' && fastRelIdRes.value) {
              const val = fastRelIdRes.value;
              if (val.userId || val.id) igData.user_id = val.userId || val.id;
            }
            if (stableFbRes.status === 'fulfilled' && stableFbRes.value) {
              const val = stableFbRes.value;
              igData = { ...igData, ...(val.user || val.data?.user || val.data || val) };
            }

            const igUsername = igData.username || handle;
            const igProfileUrl = `https://www.instagram.com/${igUsername}`;
            const igUid = igData.user_id || igData.pk || igData.id || null;
            const igBio = igData.biography ? String(igData.biography).trim() : null;
            const igAvatar = igData.profile_pic_url_hd || igData.profile_pic_url || null;
            const followersCount = igData.follower_count ?? igData.followers ?? null;
            const followingCount = igData.following_count ?? igData.following ?? null;
            const postsCount = igData.media_count ?? igData.posts_count ?? null;

            // 1.1 Main Instagram Profile Node
            entities.push({
              type: 'SOCIAL_PROFILE',
              value: igProfileUrl,
              title: `Instagram: @${igUsername}`,
              confidence: 90,
              metadata: {
                platform: 'instagram',
                username: igUsername,
                user_id: igUid,
                full_name: igData.full_name || null,
                biography: igBio,
                category: igData.category_name || igData.business_category_name || null,
                followers_count: followersCount,
                following_count: followingCount,
                posts_count: postsCount,
                is_verified: !!igData.is_verified,
                is_business: !!igData.is_business_account,
                is_private: !!igData.is_private,
                avatar_url: igAvatar,
                external_url: igData.external_url || null,
                source: {
                  collector: 'social-rapidapi',
                  collectedAt,
                },
              },
            });

            evidence.push({
              source_type: 'SOCIAL_API',
              source_url: igProfileUrl,
              title: `Instagram Profile Data (@${igUsername})`,
              extracted_value: igProfileUrl,
              confidence: 90,
              metadata: {
                platform: 'instagram',
                user_id: igUid,
                full_name: igData.full_name,
                followers: followersCount,
                biography: igBio,
              },
            });

            // 1.2 Bio / Description Node
            if (igBio && igBio.length > 2) {
              const bioSummary = igBio.length > 120 ? `${igBio.slice(0, 117)}...` : igBio;
              entities.push({
                type: 'DOCUMENT',
                value: `Instagram Bio: "${bioSummary}"`,
                title: `Bio: "${bioSummary}"`,
                confidence: 90,
                metadata: {
                  platform: 'instagram',
                  full_biography: igBio,
                  account: igProfileUrl,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: igProfileUrl,
                target_type: 'DOCUMENT',
                target_value: `Instagram Bio: "${bioSummary}"`,
                relationship_type: 'RELATED_TO',
                confidence: 90,
                reason: 'Public biography / profile description on Instagram',
              });
            }

            // 1.3 Profile Picture / Avatar Node
            if (igAvatar && typeof igAvatar === 'string' && igAvatar.startsWith('http')) {
              entities.push({
                type: 'URL',
                value: igAvatar,
                title: `Avatar: @${igUsername} (Instagram)`,
                confidence: 85,
                metadata: {
                  platform: 'instagram',
                  is_avatar: true,
                  profile: igProfileUrl,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: igProfileUrl,
                target_type: 'URL',
                target_value: igAvatar,
                relationship_type: 'RELATED_TO',
                confidence: 85,
                reason: 'Public profile picture avatar image URL',
              });
            }

            // 1.4 Audience & Activity Stats Node
            if (followersCount !== null || followingCount !== null || postsCount !== null) {
              const statsParts: string[] = [];
              if (followersCount !== null) statsParts.push(`${Number(followersCount).toLocaleString()} Followers`);
              if (followingCount !== null) statsParts.push(`${Number(followingCount).toLocaleString()} Following`);
              if (postsCount !== null) statsParts.push(`${Number(postsCount).toLocaleString()} Posts`);
              const statsTitle = `Instagram Stats (@${igUsername}): ${statsParts.join(' · ')}`;

              entities.push({
                type: 'DOCUMENT',
                value: statsTitle,
                title: statsTitle,
                confidence: 90,
                metadata: {
                  platform: 'instagram',
                  followers: followersCount,
                  following: followingCount,
                  posts: postsCount,
                  is_verified: !!igData.is_verified,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: igProfileUrl,
                target_type: 'DOCUMENT',
                target_value: statsTitle,
                relationship_type: 'RELATED_TO',
                confidence: 90,
                reason: 'Public audience & media engagement metrics',
              });
            }

            // 1.5 Instagram Numeric User ID Node
            if (igUid) {
              const uidString = String(igUid);
              entities.push({
                type: 'DOCUMENT',
                value: `Instagram UID: ${uidString}`,
                title: `Instagram UID: ${uidString}`,
                confidence: 95,
                metadata: {
                  platform: 'instagram',
                  user_id: uidString,
                  account: igProfileUrl,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: igProfileUrl,
                target_type: 'DOCUMENT',
                target_value: `Instagram UID: ${uidString}`,
                relationship_type: 'RELATED_TO',
                confidence: 95,
                reason: 'Unique internal Instagram account identifier (UID)',
              });
            }

            // 1.6 Extracted Person / Display Name
            if (igData.full_name && igData.full_name.trim()) {
              const fullName = igData.full_name.trim();
              entities.push({
                type: 'PERSON',
                value: fullName,
                title: fullName,
                confidence: 85,
                metadata: {
                  source_platform: 'instagram',
                  source_profile: igProfileUrl,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: igProfileUrl,
                target_type: 'PERSON',
                target_value: fullName,
                relationship_type: 'SAME_AS',
                confidence: 85,
                reason: 'Full name stated on public Instagram profile',
              });
            }

            // 1.7 Category / Business Classification Node
            const categoryName = igData.category_name || igData.business_category_name || igData.category;
            if (categoryName && typeof categoryName === 'string' && categoryName.trim()) {
              const cleanCat = categoryName.trim();
              entities.push({
                type: 'ORGANIZATION',
                value: cleanCat,
                title: `Category: ${cleanCat}`,
                confidence: 85,
                metadata: {
                  classification: 'industry_category',
                  source_platform: 'instagram',
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: igProfileUrl,
                target_type: 'ORGANIZATION',
                target_value: cleanCat,
                relationship_type: 'RELATED_TO',
                confidence: 85,
                reason: 'Instagram business category classification',
              });
            }

            // 1.8 Location / City Node
            const cityName = igData.city_name || igData.address_street;
            if (cityName && typeof cityName === 'string' && cityName.trim()) {
              const loc = cityName.trim();
              entities.push({
                type: 'LOCATION',
                value: loc,
                title: loc,
                confidence: 85,
                metadata: {
                  source_platform: 'instagram',
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: igProfileUrl,
                target_type: 'LOCATION',
                target_value: loc,
                relationship_type: 'GEOLOCATED_IN',
                confidence: 85,
                reason: 'Location / address indicated on Instagram profile',
              });
            }

            // 1.9 Extracted Emails
            const igEmails = new Set<string>();
            if (igData.public_email) igEmails.add(igData.public_email.toLowerCase().trim());
            for (const email of extractEmails(igBio)) {
              igEmails.add(email);
            }

            for (const email of igEmails) {
              entities.push({
                type: 'EMAIL',
                value: email,
                title: email,
                confidence: 85,
                metadata: {
                  source_platform: 'instagram',
                  source_profile: igProfileUrl,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: igProfileUrl,
                target_type: 'EMAIL',
                target_value: email,
                relationship_type: 'HAS_PUBLIC_EMAIL',
                confidence: 85,
                reason: 'Public email address found in Instagram bio/contact',
              });
            }

            // 1.10 Extracted Phones
            const igPhones = new Set<string>();
            if (igData.contact_phone_number) igPhones.add(igData.contact_phone_number.trim());
            for (const phone of extractPhones(igBio)) {
              igPhones.add(phone);
            }

            for (const phone of igPhones) {
              entities.push({
                type: 'PHONE',
                value: phone,
                title: phone,
                confidence: 80,
                metadata: {
                  source_platform: 'instagram',
                  source_profile: igProfileUrl,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: igProfileUrl,
                target_type: 'PHONE',
                target_value: phone,
                relationship_type: 'HAS_PUBLIC_PHONE',
                confidence: 80,
                reason: 'Public phone number in Instagram profile',
              });
            }

            // 1.11 Extracted External Websites & Bio Links
            const igUrls = new Set<string>();
            if (igData.external_url && typeof igData.external_url === 'string') {
              igUrls.add(igData.external_url.trim());
            }
            if (Array.isArray(igData.bio_links)) {
              for (const linkObj of igData.bio_links) {
                if (linkObj?.url) igUrls.add(String(linkObj.url).trim());
                if (linkObj?.link) igUrls.add(String(linkObj.link).trim());
              }
            }
            for (const url of extractUrls(igBio)) {
              igUrls.add(url);
            }

            for (const extUrl of igUrls) {
              if (extUrl.startsWith('http')) {
                entities.push({
                  type: 'WEBSITE',
                  value: extUrl,
                  title: extUrl,
                  confidence: 85,
                  metadata: {
                    source_platform: 'instagram',
                  },
                });
                relationships.push({
                  source_type: 'SOCIAL_PROFILE',
                  source_value: igProfileUrl,
                  target_type: 'WEBSITE',
                  target_value: extUrl,
                  relationship_type: 'HAS_WEBSITE',
                  confidence: 85,
                  reason: 'Official website / bio link listed on Instagram',
                });
              }
            }

            // 1.12 Mentions in Bio (@handles)
            const bioMentions = extractMentions(igBio).filter(
              (m) => m !== igUsername.toLowerCase(),
            );
            for (const mention of bioMentions) {
              const mentionUrl = `https://www.instagram.com/${mention}`;
              entities.push({
                type: 'SOCIAL_PROFILE',
                value: mentionUrl,
                title: `Instagram: @${mention}`,
                confidence: 80,
                metadata: {
                  platform: 'instagram',
                  username: mention,
                  discovered_via: 'bio_mention',
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: igProfileUrl,
                target_type: 'SOCIAL_PROFILE',
                target_value: mentionUrl,
                relationship_type: 'MENTIONS',
                confidence: 80,
                reason: `Referenced @${mention} in Instagram bio`,
              });
            }

            // 1.13 Instagram Recent Posts Nodes
            if (stablePostsRes.status === 'fulfilled' && stablePostsRes.value) {
              const postsData = stablePostsRes.value;
              const postItems = Array.isArray(postsData)
                ? postsData
                : postsData.items || postsData.posts || postsData.data || [];
              if (Array.isArray(postItems)) {
                for (const post of postItems.slice(0, 6)) {
                  const pCode = post.code || post.shortcode || post.id;
                  const pUrl = pCode ? `https://www.instagram.com/p/${pCode}` : null;
                  const pCaption =
                    post.caption?.text || post.caption || post.text || post.title || '';
                  const pCaptionStr = String(pCaption).trim();
                  const pCaptionSnippet =
                    pCaptionStr.length > 70 ? `${pCaptionStr.slice(0, 67)}...` : pCaptionStr;

                  const postNodeVal = pUrl || `Instagram Post: ${pCode || Math.random().toString(36).slice(2, 7)}`;
                  const postTitle = pCaptionSnippet
                    ? `📸 Post: "${pCaptionSnippet}"`
                    : `📸 Instagram Post (${pCode || 'Recent'})`;

                  entities.push({
                    type: 'DOCUMENT',
                    value: postNodeVal,
                    title: postTitle,
                    confidence: 90,
                    metadata: {
                      platform: 'instagram',
                      post_url: pUrl,
                      shortcode: pCode,
                      likes_count: post.like_count || post.likes || null,
                      comments_count: post.comment_count || post.comments || null,
                      taken_at: post.taken_at || post.timestamp || null,
                      caption: pCaptionStr,
                    },
                  });

                  relationships.push({
                    source_type: 'SOCIAL_PROFILE',
                    source_value: igProfileUrl,
                    target_type: 'DOCUMENT',
                    target_value: postNodeVal,
                    relationship_type: 'MENTIONS',
                    confidence: 90,
                    reason: 'Published Instagram photo/video post',
                  });
                }
              }
            }

            // 1.14 Instagram Story Highlights Collection Nodes
            if (stableHighlightsRes.status === 'fulfilled' && stableHighlightsRes.value) {
              const hlData = stableHighlightsRes.value;
              const hlItems = Array.isArray(hlData)
                ? hlData
                : hlData.tray || hlData.highlights || hlData.data || [];
              if (Array.isArray(hlItems)) {
                for (const hl of hlItems.slice(0, 5)) {
                  const hlTitle = hl.title || hl.name || 'Highlight';
                  const hlId = hl.id || Math.random().toString(36).slice(2, 7);
                  const hlVal = `Instagram Highlight (@${igUsername}): ${hlTitle} (${hlId})`;

                  entities.push({
                    type: 'DOCUMENT',
                    value: hlVal,
                    title: `⭐ Highlight: ${hlTitle}`,
                    confidence: 85,
                    metadata: {
                      platform: 'instagram',
                      highlight_id: hlId,
                      title: hlTitle,
                      media_count: hl.media_count || null,
                    },
                  });

                  relationships.push({
                    source_type: 'SOCIAL_PROFILE',
                    source_value: igProfileUrl,
                    target_type: 'DOCUMENT',
                    target_value: hlVal,
                    relationship_type: 'RELATED_TO',
                    confidence: 85,
                    reason: `Featured story highlight collection "${hlTitle}"`,
                  });
                }
              }
            }

            // 1.15 Instagram Followers Sample Nodes
            if (stableFollowersRes.status === 'fulfilled' && stableFollowersRes.value) {
              const followersData = stableFollowersRes.value;
              const fItems = Array.isArray(followersData)
                ? followersData
                : followersData.users || followersData.followers || followersData.data || [];
              if (Array.isArray(fItems)) {
                for (const f of fItems.slice(0, 6)) {
                  const fUsername = f.username || f.user?.username;
                  if (fUsername && fUsername.toLowerCase() !== igUsername.toLowerCase()) {
                    const fUrl = `https://www.instagram.com/${fUsername}`;
                    entities.push({
                      type: 'SOCIAL_PROFILE',
                      value: fUrl,
                      title: `Follower: @${fUsername}`,
                      confidence: 80,
                      metadata: {
                        platform: 'instagram',
                        username: fUsername,
                        full_name: f.full_name || f.user?.full_name || null,
                        is_verified: !!(f.is_verified || f.user?.is_verified),
                      },
                    });

                    relationships.push({
                      source_type: 'SOCIAL_PROFILE',
                      source_value: igProfileUrl,
                      target_type: 'SOCIAL_PROFILE',
                      target_value: fUrl,
                      relationship_type: 'RELATED_TO',
                      confidence: 80,
                      reason: `Verified public follower on Instagram`,
                    });
                  }
                }
              }
            }

            // 1.16 Algorithmic Chaining / Related Accounts
            if (igUid) {
              try {
                const chainingRes = await instagramBestExperience.discoverChaining(igUid).catch(() => null);
                const chainedUsers =
                  chainingRes?.users || chainingRes?.edge_chaining?.edges || chainingRes?.data || [];
                if (Array.isArray(chainedUsers)) {
                  for (const cu of chainedUsers.slice(0, 3)) {
                    const cUsername = cu.username || cu.node?.username;
                    if (cUsername && cUsername.toLowerCase() !== igUsername.toLowerCase()) {
                      const cUrl = `https://www.instagram.com/${cUsername}`;
                      entities.push({
                        type: 'SOCIAL_PROFILE',
                        value: cUrl,
                        title: `Instagram: @${cUsername}`,
                        confidence: 75,
                        metadata: {
                          platform: 'instagram',
                          username: cUsername,
                          full_name: cu.full_name || cu.node?.full_name || null,
                          discovered_via: 'algorithmic_chaining',
                        },
                      });
                      relationships.push({
                        source_type: 'SOCIAL_PROFILE',
                        source_value: igProfileUrl,
                        target_type: 'SOCIAL_PROFILE',
                        target_value: cUrl,
                        relationship_type: 'RELATED_TO',
                        confidence: 75,
                        reason: 'Instagram algorithmic recommended related account',
                      });
                    }
                  }
                }
              } catch {
                // Ignore optional chaining error
              }
            }
          } catch (igErr) {
            const msg = igErr instanceof Error ? igErr.message : String(igErr);
            warnings.push(`Instagram Engine: ${msg}`);
          }
        })(),
      );
    }

    // ─── 2. TIKTOK DEEP ENGINES ────────────────────────────────────────
    if (activePlatforms.includes('tiktok')) {
      tasks.push(
        (async () => {
          try {
            const [profileRes, completeRes, bestExpUserRes] = await Promise.allSettled([
              tiktok.getProfile(handle),
              tiktok.getUserComplete(handle),
              tiktokBestExperience.getUserByUsername(handle),
            ]);

            let ttData: any = {};
            if (profileRes.status === 'fulfilled' && profileRes.value) {
              const val = profileRes.value;
              ttData = { ...ttData, ...(val.userInfo?.user || val.user || val) };
            }
            if (completeRes.status === 'fulfilled' && completeRes.value) {
              const val = completeRes.value;
              ttData = { ...ttData, ...(val.userInfo?.user || val.user || val) };
            }
            if (bestExpUserRes.status === 'fulfilled' && bestExpUserRes.value) {
              const val = bestExpUserRes.value;
              ttData = { ...ttData, ...(val.userInfo?.user || val.user || val.data || val) };
            }

            const ttUsername = ttData.uniqueId || ttData.unique_id || handle;
            const ttProfileUrl = `https://www.tiktok.com/@${ttUsername}`;
            const ttUid = ttData.id || ttData.uid || ttData.userId || null;
            const ttSecUid = ttData.secUid || ttData.sec_uid || null;
            const ttBio = ttData.signature ? String(ttData.signature).trim() : null;
            const ttAvatar = ttData.avatarLarger || ttData.avatarMedium || ttData.avatar_168x168?.url_list?.[0] || null;
            const ttFollowers = ttData.followerCount ?? ttData.stats?.followerCount ?? ttData.follower_count ?? null;
            const ttFollowing = ttData.followingCount ?? ttData.stats?.followingCount ?? ttData.following_count ?? null;
            const ttLikes = ttData.heartCount ?? ttData.stats?.heartCount ?? ttData.total_favorited ?? null;

            // 2.1 Main TikTok Profile Node
            entities.push({
              type: 'SOCIAL_PROFILE',
              value: ttProfileUrl,
              title: `TikTok: @${ttUsername}`,
              confidence: 90,
              metadata: {
                platform: 'tiktok',
                username: ttUsername,
                user_id: ttUid,
                sec_uid: ttSecUid,
                nickname: ttData.nickname || null,
                signature: ttBio,
                followers_count: ttFollowers,
                following_count: ttFollowing,
                likes_count: ttLikes,
                is_verified: !!ttData.verified,
                avatar_url: ttAvatar,
                bio_link: ttData.bioLink?.link || null,
                source: {
                  collector: 'social-rapidapi',
                  collectedAt,
                },
              },
            });

            evidence.push({
              source_type: 'SOCIAL_API',
              source_url: ttProfileUrl,
              title: `TikTok Profile Data (@${ttUsername})`,
              extracted_value: ttProfileUrl,
              confidence: 90,
              metadata: {
                platform: 'tiktok',
                user_id: ttUid,
                nickname: ttData.nickname,
                signature: ttBio,
                followers: ttFollowers,
              },
            });

            // 2.2 Bio / Signature Node
            if (ttBio && ttBio.length > 2) {
              const bioSummary = ttBio.length > 120 ? `${ttBio.slice(0, 117)}...` : ttBio;
              entities.push({
                type: 'DOCUMENT',
                value: `TikTok Bio: "${bioSummary}"`,
                title: `Bio: "${bioSummary}"`,
                confidence: 90,
                metadata: {
                  platform: 'tiktok',
                  signature: ttBio,
                  account: ttProfileUrl,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: ttProfileUrl,
                target_type: 'DOCUMENT',
                target_value: `TikTok Bio: "${bioSummary}"`,
                relationship_type: 'RELATED_TO',
                confidence: 90,
                reason: 'Public bio signature on TikTok profile',
              });
            }

            // 2.3 TikTok Avatar Node
            if (ttAvatar && typeof ttAvatar === 'string' && ttAvatar.startsWith('http')) {
              entities.push({
                type: 'URL',
                value: ttAvatar,
                title: `Avatar: @${ttUsername} (TikTok)`,
                confidence: 85,
                metadata: {
                  platform: 'tiktok',
                  is_avatar: true,
                  profile: ttProfileUrl,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: ttProfileUrl,
                target_type: 'URL',
                target_value: ttAvatar,
                relationship_type: 'RELATED_TO',
                confidence: 85,
                reason: 'Public TikTok profile avatar image URL',
              });
            }

            // 2.4 TikTok Audience Metrics Node
            if (ttFollowers !== null || ttFollowing !== null || ttLikes !== null) {
              const statsParts: string[] = [];
              if (ttFollowers !== null) statsParts.push(`${Number(ttFollowers).toLocaleString()} Followers`);
              if (ttFollowing !== null) statsParts.push(`${Number(ttFollowing).toLocaleString()} Following`);
              if (ttLikes !== null) statsParts.push(`${Number(ttLikes).toLocaleString()} Likes`);
              const statsTitle = `📊 TikTok Stats (@${ttUsername}): ${statsParts.join(' · ')}`;

              entities.push({
                type: 'DOCUMENT',
                value: statsTitle,
                title: statsTitle,
                confidence: 90,
                metadata: {
                  platform: 'tiktok',
                  followers: ttFollowers,
                  following: ttFollowing,
                  likes: ttLikes,
                  is_verified: !!ttData.verified,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: ttProfileUrl,
                target_type: 'DOCUMENT',
                target_value: statsTitle,
                relationship_type: 'RELATED_TO',
                confidence: 90,
                reason: 'Public TikTok engagement & follower statistics',
              });
            }

            // 2.5 TikTok UID & SecUID Node
            if (ttUid) {
              const uidString = String(ttUid);
              entities.push({
                type: 'DOCUMENT',
                value: `TikTok UID: ${uidString}`,
                title: `TikTok UID: ${uidString}`,
                confidence: 95,
                metadata: {
                  platform: 'tiktok',
                  user_id: uidString,
                  sec_uid: ttSecUid,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: ttProfileUrl,
                target_type: 'DOCUMENT',
                target_value: `TikTok UID: ${uidString}`,
                relationship_type: 'RELATED_TO',
                confidence: 95,
                reason: 'Unique internal TikTok user identifier (UID)',
              });
            }

            // 2.6 Person / Nickname from TikTok
            if (ttData.nickname && ttData.nickname.trim() && ttData.nickname !== ttUsername) {
              const nickname = ttData.nickname.trim();
              entities.push({
                type: 'PERSON',
                value: nickname,
                title: nickname,
                confidence: 80,
                metadata: {
                  source_platform: 'tiktok',
                  source_profile: ttProfileUrl,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: ttProfileUrl,
                target_type: 'PERSON',
                target_value: nickname,
                relationship_type: 'SAME_AS',
                confidence: 80,
                reason: 'Display nickname on TikTok profile',
              });
            }

            // 2.7 Emails from TikTok signature
            for (const email of extractEmails(ttBio)) {
              entities.push({
                type: 'EMAIL',
                value: email,
                title: email,
                confidence: 80,
                metadata: {
                  source_platform: 'tiktok',
                  source_profile: ttProfileUrl,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: ttProfileUrl,
                target_type: 'EMAIL',
                target_value: email,
                relationship_type: 'HAS_PUBLIC_EMAIL',
                confidence: 80,
                reason: 'Email listed in TikTok bio signature',
              });
            }

            // 2.8 Phones from TikTok signature
            for (const phone of extractPhones(ttBio)) {
              entities.push({
                type: 'PHONE',
                value: phone,
                title: phone,
                confidence: 80,
                metadata: {
                  source_platform: 'tiktok',
                  source_profile: ttProfileUrl,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: ttProfileUrl,
                target_type: 'PHONE',
                target_value: phone,
                relationship_type: 'HAS_PUBLIC_PHONE',
                confidence: 80,
                reason: 'Contact phone listed in TikTok bio signature',
              });
            }

            // 2.9 Extracted Bio Links from TikTok
            const ttUrls = new Set<string>();
            if (ttData.bioLink?.link && typeof ttData.bioLink.link === 'string') {
              ttUrls.add(ttData.bioLink.link.trim());
            }
            for (const url of extractUrls(ttBio)) {
              ttUrls.add(url);
            }

            for (const bioLink of ttUrls) {
              if (bioLink.startsWith('http')) {
                entities.push({
                  type: 'WEBSITE',
                  value: bioLink,
                  title: bioLink,
                  confidence: 80,
                  metadata: {
                    source_platform: 'tiktok',
                  },
                });
                relationships.push({
                  source_type: 'SOCIAL_PROFILE',
                  source_value: ttProfileUrl,
                  target_type: 'WEBSITE',
                  target_value: bioLink,
                  relationship_type: 'HAS_WEBSITE',
                  confidence: 80,
                  reason: 'Website / bio link in TikTok profile',
                });
              }
            }

            // 2.10 Mentions in TikTok signature
            const ttMentions = extractMentions(ttBio).filter(
              (m) => m !== ttUsername.toLowerCase(),
            );
            for (const mention of ttMentions) {
              const mentionUrl = `https://www.tiktok.com/@${mention}`;
              entities.push({
                type: 'SOCIAL_PROFILE',
                value: mentionUrl,
                title: `TikTok: @${mention}`,
                confidence: 80,
                metadata: {
                  platform: 'tiktok',
                  username: mention,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: ttProfileUrl,
                target_type: 'SOCIAL_PROFILE',
                target_value: mentionUrl,
                relationship_type: 'MENTIONS',
                confidence: 80,
                reason: `Referenced @${mention} in TikTok bio signature`,
              });
            }
          } catch (ttErr) {
            const msg = ttErr instanceof Error ? ttErr.message : String(ttErr);
            warnings.push(`TikTok Engine: ${msg}`);
          }
        })(),
      );
    }

    // ─── 3. LINKEDIN DEEP ENGINES ──────────────────────────────────────
    if (activePlatforms.includes('linkedin')) {
      tasks.push(
        (async () => {
          try {
            // Run all LinkedIn endpoints in parallel
            const [
              profileRes,
              aboutRes,
              postsRes,
              connCountRes,
              dataConnRes,
              activityRes,
              schoolsRes,
              companiesRes,
            ] = await Promise.allSettled([
              linkedin.getProfileByUsername(handle),
              linkedin.getAboutProfile(handle),
              linkedin.getProfilePosts(handle),
              linkedin.getConnectionCount(handle),
              linkedin.getDataConnectionCount(handle),
              linkedin.getProfileRecentActivity(handle),
              linkedin.getInterestsSchools(handle),
              linkedin.getInterestsCompanies(handle),
            ]);

            let liData: any = {};
            if (profileRes.status === 'fulfilled' && profileRes.value) {
              const val = profileRes.value;
              if (val.success === false) {
                warnings.push(`LinkedIn RapidAPI: ${val.message || 'Profile lookup unsuccessful'}`);
              } else if (val.data && typeof val.data === 'object') {
                liData = { ...liData, ...val.data };
              } else if (val && typeof val === 'object' && !val.message) {
                liData = { ...liData, ...val };
              }
            }
            if (aboutRes.status === 'fulfilled' && aboutRes.value) {
              const val = aboutRes.value;
              if (val.success === false) {
                warnings.push(`LinkedIn About API: ${val.message || 'About lookup unsuccessful'}`);
              } else if (val.data && typeof val.data === 'object') {
                liData = { ...liData, ...val.data };
              } else if (val && typeof val === 'object' && !val.message) {
                liData = { ...liData, ...val };
              }
            }
            if (postsRes.status === 'fulfilled' && postsRes.value) {
              const val = postsRes.value;
              if (val && val.success !== false) {
                liData.recent_posts = val.data || val;
              }
            }
            if (connCountRes.status === 'fulfilled' && connCountRes.value) {
              const val = connCountRes.value;
              if (val && val.success !== false) {
                const count = val.connection_count ?? val.connections ?? val.count ?? val.data?.connection_count;
                if (count !== undefined) liData.connection_count = count;
              }
            }
            if (dataConnRes.status === 'fulfilled' && dataConnRes.value) {
              const val = dataConnRes.value;
              if (val && val.success !== false) {
                const count = val.connection_count ?? val.connections ?? val.count ?? val.data?.connection_count;
                if (count !== undefined) liData.connection_count = count;
              }
            }
            if (activityRes.status === 'fulfilled' && activityRes.value) {
              const val = activityRes.value;
              if (val && val.success !== false) {
                liData.recent_activity_time = val.recent_activity_time || val.timestamp;
              }
            }
            if (schoolsRes.status === 'fulfilled' && schoolsRes.value) {
              const val = schoolsRes.value;
              if (val && val.success !== false) {
                liData.interests_schools = val.data || val;
              }
            }
            if (companiesRes.status === 'fulfilled' && companiesRes.value) {
              const val = companiesRes.value;
              if (val && val.success !== false) {
                liData.interests_companies = val.data || val;
              }
            }

            const liFullName =
              liData.fullName ||
              liData.full_name ||
              (liData.firstName ? `${liData.firstName} ${liData.lastName || ''}`.trim() : null) ||
              null;
            const liMemberId =
              liData.publicIdentifier ||
              liData.public_identifier ||
              liData.id ||
              liData.urn ||
              null;
            const liProfileUrl =
              liData.profile_url ||
              liData.profileUrl ||
              `https://www.linkedin.com/in/${liMemberId || handle}`;
            const liSummary = liData.summary || liData.about || liData.description || null;
            const liHeadline = liData.headline || liData.title || liData.job_title || null;
            const liConnections =
              liData.connection_count ??
              liData.connections ??
              liData.followerCount ??
              liData.follower_count ??
              null;
            const liAvatar =
              liData.profilePicture ||
              liData.profile_picture ||
              liData.avatar ||
              liData.displayPictureUrl ||
              null;
            const liCity = liData.geoCity || liData.city || liData.location || null;
            const liCountry =
              liData.geoCountryName ||
              liData.country_full_name ||
              liData.country ||
              null;

            // Zero-fake-data invariant: only create profile entity if real profile data was returned
            const hasRealData = Boolean(
              liFullName ||
              liHeadline ||
              liSummary ||
              liAvatar ||
              liConnections !== null ||
              liCity ||
              liCountry ||
              (Array.isArray(liData.recent_posts) && liData.recent_posts.length > 0) ||
              (Array.isArray(liData.interests_schools) && liData.interests_schools.length > 0) ||
              (Array.isArray(liData.interests_companies) && liData.interests_companies.length > 0)
            );

            if (!hasRealData) {
              warnings.push(
                `LinkedIn engine did not find verified profile intelligence for "${handle}" (upstream provider returned no profile data or service is unavailable).`,
              );
              return;
            }

            // 3.1 Main LinkedIn Profile Node
            entities.push({
              type: 'SOCIAL_PROFILE',
              value: liProfileUrl,
              title: `LinkedIn: ${liFullName || handle}`,
              confidence: 90,
              metadata: {
                platform: 'linkedin',
                public_identifier: liMemberId,
                full_name: liFullName,
                headline: liHeadline,
                summary: liSummary,
                city: liCity,
                country: liCountry,
                connections: liConnections,
                avatar_url: liAvatar,
                source: {
                  collector: 'social-rapidapi',
                  collectedAt,
                },
              },
            });

            // Connect seed target to LinkedIn profile
            relationships.push({
              source_type: input.startsWith('http') ? 'SOCIAL_PROFILE' : 'USERNAME',
              source_value: input.trim(),
              target_type: 'SOCIAL_PROFILE',
              target_value: liProfileUrl,
              relationship_type: 'USES_USERNAME',
              confidence: 90,
              reason: 'Public profile exists on LinkedIn',
            });

            evidence.push({
              source_type: 'SOCIAL_API',
              source_url: liProfileUrl,
              title: `LinkedIn Profile Data (${liFullName || handle})`,
              extracted_value: liProfileUrl,
              confidence: 90,
              metadata: {
                platform: 'linkedin',
                member_id: liMemberId,
                full_name: liFullName,
                headline: liHeadline,
                summary: liSummary,
              },
            });

            // 3.2 LinkedIn Summary / Bio Node
            if (liSummary && String(liSummary).trim().length > 2) {
              const sumClean = String(liSummary).trim();
              const sumTitle = sumClean.length > 120 ? `${sumClean.slice(0, 117)}...` : sumClean;
              entities.push({
                type: 'DOCUMENT',
                value: `LinkedIn Summary: "${sumTitle}"`,
                title: `Summary: "${sumTitle}"`,
                confidence: 90,
                metadata: {
                  platform: 'linkedin',
                  full_summary: sumClean,
                  account: liProfileUrl,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: liProfileUrl,
                target_type: 'DOCUMENT',
                target_value: `LinkedIn Summary: "${sumTitle}"`,
                relationship_type: 'RELATED_TO',
                confidence: 90,
                reason: 'Professional summary & bio on LinkedIn profile',
              });
            }

            // 3.3 Headline / Professional Title Node
            if (liHeadline && String(liHeadline).trim().length > 2) {
              const headClean = String(liHeadline).trim();
              entities.push({
                type: 'DOCUMENT',
                value: `Headline: ${headClean}`,
                title: `Headline: ${headClean}`,
                confidence: 90,
                metadata: {
                  platform: 'linkedin',
                  headline: headClean,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: liProfileUrl,
                target_type: 'DOCUMENT',
                target_value: `Headline: ${headClean}`,
                relationship_type: 'RELATED_TO',
                confidence: 90,
                reason: 'Professional headline on LinkedIn profile',
              });
            }

            // 3.4 LinkedIn Connections & Activity Stats Node
            if (liConnections !== null) {
              const statsTitle = `📊 LinkedIn Stats: ${Number(liConnections).toLocaleString()} Connections`;
              entities.push({
                type: 'DOCUMENT',
                value: statsTitle,
                title: statsTitle,
                confidence: 90,
                metadata: {
                  platform: 'linkedin',
                  connections: liConnections,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: liProfileUrl,
                target_type: 'DOCUMENT',
                target_value: statsTitle,
                relationship_type: 'RELATED_TO',
                confidence: 90,
                reason: 'Professional network connection count',
              });
            }

            // 3.5 LinkedIn Member ID Node
            if (liMemberId) {
              const idString = String(liMemberId);
              entities.push({
                type: 'DOCUMENT',
                value: `LinkedIn ID: ${idString}`,
                title: `LinkedIn ID: ${idString}`,
                confidence: 95,
                metadata: {
                  platform: 'linkedin',
                  member_id: idString,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: liProfileUrl,
                target_type: 'DOCUMENT',
                target_value: `LinkedIn ID: ${idString}`,
                relationship_type: 'RELATED_TO',
                confidence: 95,
                reason: 'LinkedIn verified public identifier / member ID',
              });
            }

            // 3.6 Profile Picture / Avatar Node
            if (liAvatar && typeof liAvatar === 'string' && liAvatar.startsWith('http')) {
              entities.push({
                type: 'URL',
                value: liAvatar,
                title: `Avatar: ${liFullName || handle} (LinkedIn)`,
                confidence: 85,
                metadata: {
                  platform: 'linkedin',
                  is_avatar: true,
                  profile: liProfileUrl,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: liProfileUrl,
                target_type: 'URL',
                target_value: liAvatar,
                relationship_type: 'RELATED_TO',
                confidence: 85,
                reason: 'Public LinkedIn profile picture avatar image URL',
              });
            }

            // 3.7 Person Name from LinkedIn
            if (liFullName) {
              entities.push({
                type: 'PERSON',
                value: liFullName,
                title: liFullName,
                confidence: 90,
                metadata: {
                  source_platform: 'linkedin',
                  source_profile: liProfileUrl,
                  headline: liHeadline,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: liProfileUrl,
                target_type: 'PERSON',
                target_value: liFullName,
                relationship_type: 'SAME_AS',
                confidence: 90,
                reason: 'Full name on verified LinkedIn professional profile',
              });
            }

            // 3.8 Workplaces & Experience (Organizations)
            const experiences = Array.isArray(liData.experiences)
              ? liData.experiences
              : Array.isArray(liData.position)
                ? liData.position
                : Array.isArray(liData.positions)
                  ? liData.positions
                  : Array.isArray(liData.experience)
                    ? liData.experience
                    : [];
            for (const exp of experiences.slice(0, 4)) {
              const compName = exp.company || exp.company_name || exp.companyName || exp.name;
              if (compName && typeof compName === 'string' && compName.trim()) {
                const org = compName.trim();
                const jobTitle = exp.title || exp.position || exp.role || null;
                entities.push({
                  type: 'ORGANIZATION',
                  value: org,
                  title: jobTitle ? `${org} (${jobTitle})` : org,
                  confidence: 85,
                  metadata: {
                    source_platform: 'linkedin',
                    title: jobTitle,
                    employment_type: exp.employment_type || exp.employmentType || null,
                    starts_at: exp.starts_at || exp.start || null,
                  },
                });
                relationships.push({
                  source_type: 'SOCIAL_PROFILE',
                  source_value: liProfileUrl,
                  target_type: 'ORGANIZATION',
                  target_value: org,
                  relationship_type: 'BELONGS_TO',
                  confidence: 85,
                  reason: jobTitle ? `Workplace: ${jobTitle} at ${org}` : `Affiliated workplace: ${org}`,
                });
              }
            }

            // 3.9 Education / Academic Affiliations (Organizations)
            const educations = Array.isArray(liData.educations)
              ? liData.educations
              : Array.isArray(liData.education)
                ? liData.education
                : Array.isArray(liData.schools)
                  ? liData.schools
                  : [];
            for (const edu of educations.slice(0, 3)) {
              const schoolName =
                edu.school ||
                edu.school_name ||
                edu.schoolName ||
                edu.institution ||
                edu.name;
              if (schoolName && typeof schoolName === 'string' && schoolName.trim()) {
                const school = schoolName.trim();
                const degree = edu.degree_name || edu.degreeName || edu.degree || null;
                entities.push({
                  type: 'ORGANIZATION',
                  value: school,
                  title: degree ? `${school} (${degree})` : school,
                  confidence: 85,
                  metadata: {
                    source_platform: 'linkedin',
                    degree,
                    field_of_study: edu.field_of_study || edu.fieldOfStudy || null,
                  },
                });
                relationships.push({
                  source_type: 'SOCIAL_PROFILE',
                  source_value: liProfileUrl,
                  target_type: 'ORGANIZATION',
                  target_value: school,
                  relationship_type: 'RELATED_TO',
                  confidence: 85,
                  reason: degree
                    ? `Studied ${degree} at ${school}`
                    : `Academic affiliation at ${school}`,
                });
              }
            }

            // 3.10 Followed / Interested Companies
            const intCompanies = Array.isArray(liData.interests_companies) ? liData.interests_companies : [];
            for (const comp of intCompanies.slice(0, 3)) {
              const compName = comp.company || comp.name || comp.company_name;
              if (compName && typeof compName === 'string' && compName.trim()) {
                const cOrg = compName.trim();
                entities.push({
                  type: 'ORGANIZATION',
                  value: cOrg,
                  title: `Company Interest: ${cOrg}`,
                  confidence: 80,
                  metadata: {
                    source_platform: 'linkedin',
                    interest_type: 'company',
                  },
                });
                relationships.push({
                  source_type: 'SOCIAL_PROFILE',
                  source_value: liProfileUrl,
                  target_type: 'ORGANIZATION',
                  target_value: cOrg,
                  relationship_type: 'RELATED_TO',
                  confidence: 80,
                  reason: `Followed / Interested Company on LinkedIn`,
                });
              }
            }

            // 3.11 Followed / Interested Schools
            const intSchools = Array.isArray(liData.interests_schools) ? liData.interests_schools : [];
            for (const sch of intSchools.slice(0, 3)) {
              const schName = sch.school || sch.name || sch.school_name;
              if (schName && typeof schName === 'string' && schName.trim()) {
                const sOrg = schName.trim();
                entities.push({
                  type: 'ORGANIZATION',
                  value: sOrg,
                  title: `School Interest: ${sOrg}`,
                  confidence: 80,
                  metadata: {
                    source_platform: 'linkedin',
                    interest_type: 'school',
                  },
                });
                relationships.push({
                  source_type: 'SOCIAL_PROFILE',
                  source_value: liProfileUrl,
                  target_type: 'ORGANIZATION',
                  target_value: sOrg,
                  relationship_type: 'RELATED_TO',
                  confidence: 80,
                  reason: `Followed / Interested Academic Institution on LinkedIn`,
                });
              }
            }

            // 3.12 Location from LinkedIn
            const locationParts = [liCity, liCountry].filter(Boolean);
            if (locationParts.length > 0) {
              const locString = locationParts.join(', ');
              entities.push({
                type: 'LOCATION',
                value: locString,
                title: locString,
                confidence: 85,
                metadata: {
                  source_platform: 'linkedin',
                  city: liCity,
                  country: liCountry,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: liProfileUrl,
                target_type: 'LOCATION',
                target_value: locString,
                relationship_type: 'GEOLOCATED_IN',
                confidence: 85,
                reason: 'Geographical location indicated on LinkedIn profile',
              });
            }

            // 3.13 Top Skills / Technologies from LinkedIn
            const skills = Array.isArray(liData.skills) ? liData.skills : [];
            for (const skill of skills.slice(0, 4)) {
              const skillName = typeof skill === 'string' ? skill : skill.name || skill.skill;
              if (skillName && typeof skillName === 'string' && skillName.trim()) {
                const sName = skillName.trim();
                entities.push({
                  type: 'TECHNOLOGY',
                  value: sName,
                  title: `Skill: ${sName}`,
                  confidence: 80,
                  metadata: {
                    source_platform: 'linkedin',
                  },
                });
                relationships.push({
                  source_type: 'SOCIAL_PROFILE',
                  source_value: liProfileUrl,
                  target_type: 'TECHNOLOGY',
                  target_value: sName,
                  relationship_type: 'RELATED_TO',
                  confidence: 80,
                  reason: 'Skill listed on professional LinkedIn profile',
                });
              }
            }

            // 3.14 Recent LinkedIn Posts
            const liPosts = Array.isArray(liData.recent_posts) ? liData.recent_posts : [];
            for (const post of liPosts.slice(0, 4)) {
              const postUrn = post.urn || post.id || Math.random().toString(36).slice(2, 7);
              const postText = post.text || post.commentary || post.title || '';
              const pSnippet = postText.length > 70 ? `${postText.slice(0, 67)}...` : postText;
              const postVal = `LinkedIn Post: ${postUrn}`;
              const postTitle = pSnippet ? `💼 Post: "${pSnippet}"` : `💼 LinkedIn Activity (${postUrn})`;

              entities.push({
                type: 'DOCUMENT',
                value: postVal,
                title: postTitle,
                confidence: 90,
                metadata: {
                  platform: 'linkedin',
                  urn: postUrn,
                  text: postText,
                  num_likes: post.num_likes || post.likes || null,
                  num_comments: post.num_comments || post.comments || null,
                },
              });

              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: liProfileUrl,
                target_type: 'DOCUMENT',
                target_value: postVal,
                relationship_type: 'MENTIONS',
                confidence: 90,
                reason: 'Public LinkedIn post activity',
              });
            }

            // 3.15 Recent Activity Time Node
            if (liData.recent_activity_time) {
              const actTime = String(liData.recent_activity_time);
              entities.push({
                type: 'DOCUMENT',
                value: `LinkedIn Activity Timestamp: ${actTime}`,
                title: `🕒 Active: ${actTime}`,
                confidence: 85,
                metadata: {
                  platform: 'linkedin',
                  recent_activity_time: actTime,
                },
              });
              relationships.push({
                source_type: 'SOCIAL_PROFILE',
                source_value: liProfileUrl,
                target_type: 'DOCUMENT',
                target_value: `LinkedIn Activity Timestamp: ${actTime}`,
                relationship_type: 'RELATED_TO',
                confidence: 85,
                reason: 'Most recent activity recorded on LinkedIn',
              });
            }
          } catch (liErr) {
            const msg = liErr instanceof Error ? liErr.message : String(liErr);
            warnings.push(`LinkedIn Engine: ${msg}`);
          }
        })(),
      );
    }

    await Promise.allSettled(tasks);

    return {
      source: 'social-rapidapi',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};

export default socialRapidapiCollector;
