import React, { useState } from 'react';
import {
  Users,
  UserCheck,
  Image as ImageIcon,
  MapPin,
  Mail,
  Phone,
  Globe,
  Lock,
  Unlock,
  CheckCircle2,
  Briefcase,
  GraduationCap,
  Tag,
  Copy,
  Check,
  ExternalLink,
  FileText,
  Bookmark,
  Heart,
  MessageSquare,
  Shield,
  Activity,
  Sparkles,
} from 'lucide-react';
import type { Entity } from '@nexusgraph/shared';

interface SocialProfileDetailListProps {
  entity: Entity;
  onCopy?: (text: string) => void;
}

function parseStatsFromValue(val: string): {
  username?: string;
  followers?: string;
  following?: string;
  posts?: string;
  likes?: string;
} {
  const res: {
    username?: string;
    followers?: string;
    following?: string;
    posts?: string;
    likes?: string;
  } = {};

  const userMatch = val.match(/@([a-zA-Z0-9._]+)/);
  if (userMatch) res.username = userMatch[1];

  const followerMatch = val.match(/([\d.,KkMmBb]+)\s*Followers/i);
  if (followerMatch) res.followers = followerMatch[1];

  const followingMatch = val.match(/([\d.,KkMmBb]+)\s*Following/i);
  if (followingMatch) res.following = followingMatch[1];

  const postsMatch = val.match(/([\d.,KkMmBb]+)\s*Posts/i);
  if (postsMatch) res.posts = postsMatch[1];

  const likesMatch = val.match(/([\d.,KkMmBb]+)\s*Likes/i);
  if (likesMatch) res.likes = likesMatch[1];

  return res;
}

export function SocialProfileDetailList({ entity, onCopy }: SocialProfileDetailListProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const meta: Record<string, any> = (entity.metadata as Record<string, any>) || {};
  const val = String(entity.value || '');
  const parsedStats = parseStatsFromValue(val);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    if (onCopy) onCopy(text);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const platform =
    meta.platform ||
    (val.includes('instagram.com') || val.toLowerCase().includes('instagram') ? 'instagram' : null) ||
    (val.includes('tiktok.com') || val.toLowerCase().includes('tiktok') ? 'tiktok' : null) ||
    (val.includes('linkedin.com') || val.toLowerCase().includes('linkedin') ? 'linkedin' : null);

  const username =
    meta.username ||
    meta.uniqueId ||
    meta.unique_id ||
    parsedStats.username ||
    (entity.type === 'USERNAME' ? val.replace(/^@/, '') : null);

  const followers = meta.followers_count ?? meta.followers ?? parsedStats.followers;
  const following = meta.following_count ?? meta.following ?? parsedStats.following;
  const posts = meta.posts_count ?? meta.posts ?? parsedStats.posts;
  const likes = meta.likes_count ?? meta.likes ?? parsedStats.likes;
  const connections = meta.connections ?? meta.connection_count;
  const uid = meta.user_id || meta.uid || meta.sec_uid || meta.public_identifier || meta.member_id;
  const biography = meta.biography || meta.signature || meta.full_biography || meta.summary || meta.about;
  const category = meta.category || meta.business_category_name || meta.category_name;
  const location = meta.city || meta.country || meta.address || meta.location;
  const avatarUrl = meta.avatar_url || meta.profile_pic_url || meta.profile_pic_url_hd || meta.avatar;
  const headline = meta.headline;
  const isVerified = meta.is_verified || meta.verified;
  const isPrivate = meta.is_private;
  const isBusiness = meta.is_business || meta.is_business_account;

  const isStatsNode =
    val.toLowerCase().includes('stats') ||
    val.toLowerCase().includes('followers') ||
    followers !== undefined;

  const isPostNode =
    val.toLowerCase().startsWith('📸 post:') ||
    val.toLowerCase().includes('instagram post') ||
    meta.post_url !== undefined;

  const isHighlightNode =
    val.toLowerCase().includes('highlight') || meta.highlight_id !== undefined;

  const isBioNode =
    val.toLowerCase().startsWith('bio:') ||
    val.toLowerCase().includes('instagram bio') ||
    meta.full_biography !== undefined;

  return (
    <div className="space-y-3">
      {/* Header Profile Badge Card */}
      {(username || platform || avatarUrl) && (
        <div className="p-3 bg-gradient-to-br from-surface-2 to-surface-3/80 rounded-card border border-border-subtle flex items-center gap-3 shadow-sm">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={username || 'Avatar'}
              className="w-12 h-12 rounded-full object-cover border-2 border-primary/40 shrink-0 bg-surface-1"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0 text-primary font-bold text-lg">
              {username ? username[0].toUpperCase() : 'OS'}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm text-text font-mono truncate">
                {meta.full_name || (username ? `@${username}` : val)}
              </span>
              {isVerified && (
                <span title="Verified Account" className="inline-flex">
                  <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0 fill-sky-400/20" />
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted flex-wrap">
              {platform && (
                <span className="capitalize font-semibold text-primary text-[11px] bg-primary/10 px-1.5 py-0.2 rounded border border-primary/20">
                  {platform}
                </span>
              )}
              {username && meta.full_name && (
                <span className="font-mono text-[11px] text-text-secondary">@{username}</span>
              )}
              {isPrivate !== undefined && (
                <span className="flex items-center gap-0.5 text-[10px] text-text-muted">
                  {isPrivate ? (
                    <>
                      <Lock className="w-3 h-3 text-amber-400" /> Private
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3 h-3 text-emerald-400" /> Public
                    </>
                  )}
                </span>
              )}
              {isBusiness && (
                <span className="text-[10px] bg-blue-500/10 text-blue-300 px-1 rounded border border-blue-500/20">
                  Business
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Structured Overview Attributes List */}
      <div className="bg-surface-2 rounded-card border border-border-subtle overflow-hidden">
        <div className="px-3 py-2 bg-surface-3/50 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Detail Intelligence ({platform ? platform.toUpperCase() : entity.type})</span>
          </div>
          <span className="text-[10px] text-text-muted font-mono uppercase">Structured Attributes</span>
        </div>

        <div className="divide-y divide-border-subtle/60 text-xs">
          {/* Followers */}
          {followers !== undefined && (
            <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors">
              <div className="flex items-center gap-2 text-text-muted">
                <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Followers:</span>
              </div>
              <span className="font-mono font-bold text-emerald-300">
                {typeof followers === 'number' ? followers.toLocaleString() : followers}
              </span>
            </div>
          )}

          {/* Following */}
          {following !== undefined && (
            <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors">
              <div className="flex items-center gap-2 text-text-muted">
                <UserCheck className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Following:</span>
              </div>
              <span className="font-mono font-semibold text-text">
                {typeof following === 'number' ? following.toLocaleString() : following}
              </span>
            </div>
          )}

          {/* Total Posts */}
          {posts !== undefined && (
            <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors">
              <div className="flex items-center gap-2 text-text-muted">
                <ImageIcon className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Total Posts / Uploads:</span>
              </div>
              <span className="font-mono font-semibold text-indigo-300">
                {typeof posts === 'number' ? posts.toLocaleString() : posts}
              </span>
            </div>
          )}

          {/* TikTok Likes */}
          {likes !== undefined && (
            <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors">
              <div className="flex items-center gap-2 text-text-muted">
                <Heart className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Total Likes:</span>
              </div>
              <span className="font-mono font-bold text-rose-300">
                {typeof likes === 'number' ? likes.toLocaleString() : likes}
              </span>
            </div>
          )}

          {/* LinkedIn Connections */}
          {connections !== undefined && (
            <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors">
              <div className="flex items-center gap-2 text-text-muted">
                <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>LinkedIn Connections:</span>
              </div>
              <span className="font-mono font-bold text-cyan-300">
                {typeof connections === 'number' ? connections.toLocaleString() : connections}
              </span>
            </div>
          )}

          {/* Numerical User ID */}
          {uid && (
            <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors">
              <div className="flex items-center gap-2 text-text-muted">
                <Tag className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Internal User ID (UID):</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-semibold text-amber-300">{String(uid)}</span>
                <button
                  onClick={() => handleCopy('uid', String(uid))}
                  className="p-1 hover:bg-surface-3 rounded text-text-muted hover:text-text transition-colors"
                  title="Salin UID"
                >
                  {copiedKey === 'uid' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Category */}
          {category && (
            <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors">
              <div className="flex items-center gap-2 text-text-muted">
                <Shield className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Account Category:</span>
              </div>
              <span className="font-medium text-purple-200 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 text-[11px]">
                {category}
              </span>
            </div>
          )}

          {/* Location / City */}
          {location && (
            <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors">
              <div className="flex items-center gap-2 text-text-muted">
                <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Location:</span>
              </div>
              <span className="font-medium text-text">{location}</span>
            </div>
          )}

          {/* Headline (LinkedIn) */}
          {headline && (
            <div className="p-2.5 space-y-1 hover:bg-surface-3/30 transition-colors">
              <div className="flex items-center gap-2 text-text-muted">
                <Briefcase className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Professional Headline:</span>
              </div>
              <p className="text-text font-medium pl-6 text-[11px] leading-relaxed">{headline}</p>
            </div>
          )}

          {/* Bio / Description */}
          {biography && (
            <div className="p-2.5 space-y-1 hover:bg-surface-3/30 transition-colors">
              <div className="flex items-center gap-2 text-text-muted">
                <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Biography / Status:</span>
              </div>
              <p className="text-neutral-200 bg-surface-1/60 p-2 rounded border border-border-subtle font-sans text-[11px] leading-relaxed whitespace-pre-wrap">
                {biography}
              </p>
            </div>
          )}

          {/* External URL */}
          {(meta.external_url || meta.bio_link || meta.profile_url) && (
            <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors">
              <div className="flex items-center gap-2 text-text-muted">
                <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>External Link / Bio:</span>
              </div>
              <a
                href={meta.external_url || meta.bio_link || meta.profile_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-cyan-300 hover:text-cyan-200 hover:underline flex items-center gap-1 truncate max-w-[200px]"
              >
                <span className="truncate">{meta.external_url || meta.bio_link || meta.profile_url}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
          )}

          {/* Contact Email */}
          {(meta.public_email || meta.email) && (
            <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors">
              <div className="flex items-center gap-2 text-text-muted">
                <Mail className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Public Email:</span>
              </div>
              <a
                href={`mailto:${meta.public_email || meta.email}`}
                className="font-mono text-amber-300 hover:underline"
              >
                {meta.public_email || meta.email}
              </a>
            </div>
          )}

          {/* Contact Phone */}
          {(meta.contact_phone_number || meta.phone) && (
            <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors">
              <div className="flex items-center gap-2 text-text-muted">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Public Phone:</span>
              </div>
              <a
                href={`tel:${meta.contact_phone_number || meta.phone}`}
                className="font-mono text-emerald-300 hover:underline"
              >
                {meta.contact_phone_number || meta.phone}
              </a>
            </div>
          )}

          {/* Holehe Masked Recovery Email */}
          {meta.emailrecovery && (
            <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors bg-amber-500/5">
              <div className="flex items-center gap-2 text-amber-300">
                <Mail className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Recovery Email (Masked):</span>
              </div>
              <span className="font-mono font-semibold text-amber-200 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">
                {String(meta.emailrecovery)}
              </span>
            </div>
          )}

          {/* Holehe Masked Recovery Phone */}
          {meta.phoneNumber && (
            <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors bg-emerald-500/5">
              <div className="flex items-center gap-2 text-emerald-300">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Recovery Phone (Masked):</span>
              </div>
              <span className="font-mono font-semibold text-emerald-200 bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/30">
                {String(meta.phoneNumber)}
              </span>
            </div>
          )}

          {/* Holehe Verified Engine Attribution */}
          {meta.engine === 'holehe-python' && (
            <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors bg-primary/5">
              <div className="flex items-center gap-2 text-text-muted">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Account Status:</span>
              </div>
              <span className="font-semibold text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[11px]">
                Registered & Active (Holehe Verified)
              </span>
            </div>
          )}

          {/* Post Node Specific Details */}
          {isPostNode && (
            <>
              {meta.likes_count !== undefined && (
                <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors">
                  <div className="flex items-center gap-2 text-text-muted">
                    <Heart className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Post Likes:</span>
                  </div>
                  <span className="font-mono font-bold text-rose-300">
                    {Number(meta.likes_count).toLocaleString()}
                  </span>
                </div>
              )}
              {meta.comments_count !== undefined && (
                <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors">
                  <div className="flex items-center gap-2 text-text-muted">
                    <MessageSquare className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Post Comments:</span>
                  </div>
                  <span className="font-mono font-bold text-sky-300">
                    {Number(meta.comments_count).toLocaleString()}
                  </span>
                </div>
              )}
              {meta.caption && (
                <div className="p-2.5 space-y-1 hover:bg-surface-3/30 transition-colors">
                  <span className="text-text-muted block">Post Caption:</span>
                  <p className="text-neutral-200 bg-surface-1/60 p-2 rounded border border-border-subtle font-sans text-[11px] leading-relaxed whitespace-pre-wrap">
                    {meta.caption}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Highlight Node Details */}
          {isHighlightNode && (
            <>
              {meta.title && (
                <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors">
                  <div className="flex items-center gap-2 text-text-muted">
                    <Bookmark className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Highlight Title:</span>
                  </div>
                  <span className="font-semibold text-amber-300">{meta.title}</span>
                </div>
              )}
              {meta.media_count !== undefined && (
                <div className="p-2.5 flex items-center justify-between hover:bg-surface-3/30 transition-colors">
                  <div className="flex items-center gap-2 text-text-muted">
                    <ImageIcon className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Media Count in Highlight:</span>
                  </div>
                  <span className="font-mono font-semibold text-text">{meta.media_count}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SocialProfileDetailList;
