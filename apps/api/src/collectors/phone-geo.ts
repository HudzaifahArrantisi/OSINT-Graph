/**
 * Phone Geo Collector — parses an international phone number and derives
 * its registered geographic region from the country calling code.
 *
 * Data integrity notes:
 * - Uses libphonenumber metadata (Google's libphonenumber dataset) for parsing,
 *   validation, number type, and country attribution.
 * - Coordinates come from a static reference table of ISO country centroids
 *   (factual reference data, NOT synthetic findings).
 * - Precision is COUNTRY-level by design. A precise GPS fix for a subscriber
 *   is technically impossible without carrier/LEA access and is never faked.
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { normalizePhone } from '@nexusgraph/shared';
import { parsePhoneNumberWithError, isPossiblePhoneNumber } from 'libphonenumber-js/max';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { safeFetch } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';

const execFileAsync = promisify(execFile);

export interface GetContactResult {
  displayName?: string | null;
  tagCount?: number;
  tags?: Array<{ tag: string; count: number }>;
}

function parseGtcJson(rawOutput: string): any {
  if (!rawOutput) return null;
  const firstBrace = rawOutput.indexOf('{');
  const lastBrace = rawOutput.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    const jsonSubstring = rawOutput.slice(firstBrace, lastBrace + 1);
    return JSON.parse(jsonSubstring);
  }
  return JSON.parse(rawOutput.trim());
}

/**
 * Queries GetContact intelligence via local gtc.py if credentials exist.
 */
export async function queryGetContact(e164: string, requestId?: string): Promise<GetContactResult | null> {
  if (process.env.NODE_ENV === 'test' && !process.env.TEST_LIVE_GTC) {
    return null;
  }

  const customConfigDir = process.env.GTC_CONFIG_DIR;
  const credPaths = [
    customConfigDir ? path.join(customConfigDir, 'credentials.json') : null,
    path.join(os.homedir(), '.config', 'gtc', 'credentials.json'),
    path.resolve(process.cwd(), '.config', 'gtc', 'credentials.json'),
    path.resolve(process.cwd(), '..', '.config', 'gtc', 'credentials.json'),
    path.resolve('c:/laragon/www/OSINT Investigation Graph/.config/gtc/credentials.json'),
  ].filter(Boolean) as string[];

  const credPath = credPaths.find((p) => fs.existsSync(p));
  if (!credPath) {
    logger.info('GetContact lookup skipped: no credentials.json found', { requestId });
    return null;
  }

  // Find gtc.py in project root or current directory
  const possiblePaths = [
    path.resolve(process.cwd(), 'gtc.py'),
    path.resolve(process.cwd(), '..', 'gtc.py'),
    path.resolve(process.cwd(), '..', '..', 'gtc.py'),
    path.resolve('c:/laragon/www/OSINT Investigation Graph/gtc.py'),
    path.join(__dirname, '../../../../gtc.py'),
    path.join(__dirname, '../../../gtc.py'),
  ];
  const gtcScript = possiblePaths.find((p) => fs.existsSync(p));
  if (!gtcScript) {
    logger.warn('GetContact lookup skipped: gtc.py not found', { requestId, possiblePaths });
    return null;
  }

  const activeConfigDir = path.dirname(credPath);

  try {
    let tagsList: Array<{ tag: string; count: number }> = [];
    let displayName: string | null = null;
    let tagCount = 0;

    // 1. First attempt: Query tags (-t tags)
    try {
      const { stdout: tagsOut } = await execFileAsync('python', [gtcScript, 'search', e164, '-t', 'tags', '--json'], {
        timeout: 15000,
        env: { ...process.env, GTC_CONFIG_DIR: activeConfigDir, PYTHONIOENCODING: 'utf-8' },
      });

      const tagsData = parseGtcJson(tagsOut);
      const rawTags = tagsData?.result?.tags;
      if (Array.isArray(rawTags) && rawTags.length > 0) {
        tagsList = rawTags
          .map((t: any) => ({
            tag: String(t.tag || '').trim(),
            count: Number(t.count || 1),
          }))
          .filter((t: any) => t.tag.length > 0);

        if (tagsList.length > 0) {
          displayName = tagsList[0]?.tag || null;
        }
      }

      if (typeof tagsData?.result?.tagCount === 'number') {
        tagCount = tagsData.result.tagCount;
      } else if (tagsList.length > 0) {
        tagCount = tagsList.length;
      }
    } catch (err: any) {
      logger.warn('GetContact -t tags failed, attempting profile fallback', {
        requestId,
        error: err.message,
      });
    }

    // 2. Fallback or Enrichment: Query profile (-t profile)
    try {
      const { stdout: profOut } = await execFileAsync('python', [gtcScript, 'search', e164, '-t', 'profile', '--json'], {
        timeout: 15000,
        env: { ...process.env, GTC_CONFIG_DIR: activeConfigDir, PYTHONIOENCODING: 'utf-8' },
      });

      const profData = parseGtcJson(profOut);
      const profile = profData?.result?.profile;
      if (profile?.displayName) {
        displayName = profile.displayName;
      }
      if (typeof profile?.tagCount === 'number' && profile.tagCount > tagCount) {
        tagCount = profile.tagCount;
      }
      if (typeof profData?.result?.tagCount === 'number' && profData.result.tagCount > tagCount) {
        tagCount = profData.result.tagCount;
      }

      // Check if profile also returned tags and merge them
      const pTags = profData?.result?.tags;
      if (Array.isArray(pTags) && pTags.length > 0) {
        const existingTags = new Set(tagsList.map((t) => t.tag.toLowerCase()));
        for (const pt of pTags) {
          const tagStr = String(pt.tag || '').trim();
          if (tagStr && !existingTags.has(tagStr.toLowerCase())) {
            tagsList.push({
              tag: tagStr,
              count: Number(pt.count || 1),
            });
            existingTags.add(tagStr.toLowerCase());
          }
        }
      }
    } catch (err: any) {
      logger.warn('GetContact -t profile failed', {
        requestId,
        error: err.message,
      });
    }

    if (!displayName && tagsList.length === 0 && tagCount === 0) {
      return null;
    }

    return {
      displayName: displayName || (tagsList.length > 0 ? tagsList[0].tag : null),
      tags: tagsList,
      tagCount: tagCount || tagsList.length,
    };
  } catch (err: any) {
    logger.warn('GetContact lookup skipped or error', {
      requestId,
      e164,
      error: err.message,
    });
    return null;
  }
}

export interface TwilioLookupResponse {
  valid?: boolean;
  phone_number?: string;
  national_format?: string;
  country_code?: string;
  calling_country_code?: string;
  line_type_intelligence?: {
    type?: string; // 'mobile' | 'landline' | 'voip' | 'tollFree' | ...
    carrier_name?: string;
    mobile_country_code?: string;
    mobile_network_code?: string;
    error_code?: number | null;
  } | null;
}

/**
 * Queries Twilio Lookup API v2 with Line Type Intelligence.
 * Returns null if credentials are not configured or request fails.
 */
export async function queryTwilioLookup(
  e164: string,
  requestId?: string,
  signal?: AbortSignal,
): Promise<TwilioLookupResponse | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID || accountSid;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !apiKeySecret) {
    return null;
  }

  const authString = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64');
  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`;

  try {
    const res = await safeFetch(url, {
      requestId,
      headers: {
        Authorization: `Basic ${authString}`,
        Accept: 'application/json',
        'User-Agent': 'NexusGraph-OSINT/1.0',
      },
      timeoutMs: 8000,
      signal,
    });

    if (!res.ok) {
      logger.warn('Twilio lookup HTTP error or non-200 status', {
        requestId,
        status: res.status,
        statusText: res.statusText,
      });
      return null;
    }

    const data = (await res.json()) as TwilioLookupResponse;
    return data;
  } catch (err) {
    logger.warn('Twilio lookup failed or timed out', {
      requestId,
      error: (err as Error).message,
    });
    return null;
  }
}

export interface CountryGeo {
  name: string;
  lat: number;
  lng: number;
}
export const COUNTRY_GEO: Record<string, CountryGeo> = {
  AD: { name: 'Andorra', lat: 42.5063, lng: 1.5218 },
  AE: { name: 'United Arab Emirates', lat: 23.4241, lng: 53.8478 },
  AF: { name: 'Afghanistan', lat: 33.9391, lng: 67.71 },
  AG: { name: 'Antigua & Barbuda', lat: 17.0608, lng: -61.796 },
  AL: { name: 'Albania', lat: 41.1533, lng: 20.1683 },
  AM: { name: 'Armenia', lat: 40.0691, lng: 45.0382 },
  AO: { name: 'Angola', lat: -11.2027, lng: 17.8739 },
  AR: { name: 'Argentina', lat: -38.4161, lng: -63.6167 },
  AT: { name: 'Austria', lat: 47.5162, lng: 14.5501 },
  AU: { name: 'Australia', lat: -25.2744, lng: 133.7751 },
  AZ: { name: 'Azerbaijan', lat: 40.1431, lng: 47.5769 },
  BA: { name: 'Bosnia & Herzegovina', lat: 43.9199, lng: 17.6791 },
  BD: { name: 'Bangladesh', lat: 23.685, lng: 90.3563 },
  BE: { name: 'Belgium', lat: 50.5039, lng: 4.4699 },
  BF: { name: 'Burkina Faso', lat: 12.2383, lng: -1.5616 },
  BG: { name: 'Bulgaria', lat: 42.7339, lng: 25.4858 },
  BH: { name: 'Bahrain', lat: 25.9304, lng: 50.6378 },
  BI: { name: 'Burundi', lat: -3.3731, lng: 29.9189 },
  BJ: { name: 'Benin', lat: 9.3077, lng: 2.3158 },
  BN: { name: 'Brunei', lat: 4.5353, lng: 114.7277 },
  BO: { name: 'Bolivia', lat: -16.2902, lng: -63.5887 },
  BR: { name: 'Brazil', lat: -14.235, lng: -51.9253 },
  BS: { name: 'Bahamas', lat: 25.0343, lng: -77.3963 },
  BT: { name: 'Bhutan', lat: 27.5142, lng: 90.4336 },
  BW: { name: 'Botswana', lat: -22.3285, lng: 24.6849 },
  BY: { name: 'Belarus', lat: 53.7098, lng: 27.9534 },
  BZ: { name: 'Belize', lat: 17.1899, lng: -88.4977 },
  CA: { name: 'Canada', lat: 56.1304, lng: -106.3468 },
  CD: { name: 'DR Congo', lat: -4.0383, lng: 21.7587 },
  CF: { name: 'Central African Republic', lat: 6.6111, lng: 20.9394 },
  CG: { name: 'Congo-Brazzaville', lat: -0.228, lng: 15.8277 },
  CH: { name: 'Switzerland', lat: 46.8182, lng: 8.2275 },
  CI: { name: "Côte d'Ivoire", lat: 7.54, lng: -5.5471 },
  CL: { name: 'Chile', lat: -35.6751, lng: -71.543 },
  CM: { name: 'Cameroon', lat: 7.3697, lng: 12.3547 },
  CN: { name: 'China', lat: 35.8617, lng: 104.1954 },
  CO: { name: 'Colombia', lat: 4.5709, lng: -74.2973 },
  CR: { name: 'Costa Rica', lat: 9.7489, lng: -83.7534 },
  CU: { name: 'Cuba', lat: 21.5218, lng: -77.7812 },
  CV: { name: 'Cabo Verde', lat: 16.0021, lng: -24.0132 },
  CY: { name: 'Cyprus', lat: 35.1264, lng: 33.4299 },
  CZ: { name: 'Czechia', lat: 49.8175, lng: 15.473 },
  DE: { name: 'Germany', lat: 51.1657, lng: 10.4515 },
  DJ: { name: 'Djibouti', lat: 11.8251, lng: 42.5903 },
  DK: { name: 'Denmark', lat: 56.2639, lng: 9.5018 },
  DM: { name: 'Dominica', lat: 15.415, lng: -61.371 },
  DO: { name: 'Dominican Republic', lat: 18.7357, lng: -70.1627 },
  DZ: { name: 'Algeria', lat: 28.0339, lng: 1.6596 },
  EC: { name: 'Ecuador', lat: -1.8312, lng: -78.1834 },
  EE: { name: 'Estonia', lat: 58.5953, lng: 25.0136 },
  EG: { name: 'Egypt', lat: 26.8206, lng: 30.8025 },
  ER: { name: 'Eritrea', lat: 15.1794, lng: 39.7823 },
  ES: { name: 'Spain', lat: 40.4637, lng: -3.7492 },
  ET: { name: 'Ethiopia', lat: 9.145, lng: 40.4897 },
  FI: { name: 'Finland', lat: 61.9241, lng: 25.7482 },
  FJ: { name: 'Fiji', lat: -17.7134, lng: 178.065 },
  FM: { name: 'Micronesia', lat: 7.4256, lng: 150.5508 },
  FO: { name: 'Faroe Islands', lat: 61.8926, lng: -6.9118 },
  FR: { name: 'France', lat: 46.2276, lng: 2.2137 },
  GA: { name: 'Gabon', lat: -0.8037, lng: 11.6094 },
  GB: { name: 'United Kingdom', lat: 55.3781, lng: -3.436 },
  GD: { name: 'Grenada', lat: 12.1165, lng: -61.679 },
  GE: { name: 'Georgia', lat: 42.3154, lng: 43.3569 },
  GH: { name: 'Ghana', lat: 7.9465, lng: -1.0232 },
  GM: { name: 'Gambia', lat: 13.4432, lng: -15.3101 },
  GN: { name: 'Guinea', lat: 9.9456, lng: -9.6966 },
  GQ: { name: 'Equatorial Guinea', lat: 1.6508, lng: 10.2679 },
  GR: { name: 'Greece', lat: 39.0742, lng: 21.8243 },
  GT: { name: 'Guatemala', lat: 15.7835, lng: -90.2308 },
  GW: { name: 'Guinea-Bissau', lat: 11.8037, lng: -15.1804 },
  GY: { name: 'Guyana', lat: 4.8604, lng: -58.9302 },
  HK: { name: 'Hong Kong', lat: 22.3193, lng: 114.1694 },
  HN: { name: 'Honduras', lat: 15.1997, lng: -86.2419 },
  HR: { name: 'Croatia', lat: 45.1, lng: 15.2 },
  HT: { name: 'Haiti', lat: 18.9712, lng: -72.2852 },
  HU: { name: 'Hungary', lat: 47.1625, lng: 19.5033 },
  ID: { name: 'Indonesia', lat: -0.7893, lng: 113.9213 },
  IE: { name: 'Ireland', lat: 53.1424, lng: -7.6921 },
  IL: { name: 'Israel', lat: 31.0461, lng: 34.8516 },
  IN: { name: 'India', lat: 20.5937, lng: 78.9629 },
  IQ: { name: 'Iraq', lat: 33.2232, lng: 43.6793 },
  IR: { name: 'Iran', lat: 32.4279, lng: 53.688 },
  IS: { name: 'Iceland', lat: 64.9631, lng: -19.0208 },
  IT: { name: 'Italy', lat: 41.8719, lng: 12.5674 },
  JM: { name: 'Jamaica', lat: 18.1096, lng: -77.2975 },
  JO: { name: 'Jordan', lat: 30.5852, lng: 36.2384 },
  JP: { name: 'Japan', lat: 36.2048, lng: 138.2529 },
  KE: { name: 'Kenya', lat: -0.0236, lng: 37.9062 },
  KG: { name: 'Kyrgyzstan', lat: 41.2044, lng: 74.7661 },
  KH: { name: 'Cambodia', lat: 12.5657, lng: 104.991 },
  KM: { name: 'Comoros', lat: -11.645, lng: 43.3333 },
  KP: { name: 'North Korea', lat: 40.3399, lng: 127.51 },
  KR: { name: 'South Korea', lat: 35.9078, lng: 127.7669 },
  KW: { name: 'Kuwait', lat: 29.3759, lng: 47.9774 },
  KZ: { name: 'Kazakhstan', lat: 48.0196, lng: 66.9237 },
  LA: { name: 'Laos', lat: 19.8563, lng: 102.4955 },
  LB: { name: 'Lebanon', lat: 33.8547, lng: 35.8623 },
  LC: { name: 'Saint Lucia', lat: 13.9094, lng: -60.9789 },
  LK: { name: 'Sri Lanka', lat: 7.8731, lng: 80.7718 },
  LR: { name: 'Liberia', lat: 6.4281, lng: -9.4295 },
  LS: { name: 'Lesotho', lat: -29.61, lng: 28.2336 },
  LT: { name: 'Lithuania', lat: 55.1694, lng: 23.8813 },
  LU: { name: 'Luxembourg', lat: 49.8153, lng: 6.1296 },
  LV: { name: 'Latvia', lat: 56.8796, lng: 24.6032 },
  LY: { name: 'Libya', lat: 26.3351, lng: 17.2283 },
  MA: { name: 'Morocco', lat: 31.7917, lng: -7.0926 },
  MD: { name: 'Moldova', lat: 47.4116, lng: 28.3699 },
  ME: { name: 'Montenegro', lat: 42.7087, lng: 19.3744 },
  MG: { name: 'Madagascar', lat: -18.7669, lng: 46.8691 },
  MK: { name: 'North Macedonia', lat: 41.6086, lng: 21.7453 },
  ML: { name: 'Mali', lat: 17.5707, lng: -3.9962 },
  MM: { name: 'Myanmar', lat: 21.9162, lng: 95.956 },
  MN: { name: 'Mongolia', lat: 46.8625, lng: 103.8467 },
  MO: { name: 'Macau', lat: 22.1987, lng: 113.5439 },
  MR: { name: 'Mauritania', lat: 21.0079, lng: -10.9408 },
  MT: { name: 'Malta', lat: 35.9375, lng: 14.3754 },
  MU: { name: 'Mauritius', lat: -20.3484, lng: 57.5522 },
  MV: { name: 'Maldives', lat: 3.2028, lng: 73.2207 },
  MW: { name: 'Malawi', lat: -13.2543, lng: 34.3015 },
  MX: { name: 'Mexico', lat: 23.6345, lng: -102.5528 },
  MY: { name: 'Malaysia', lat: 4.2105, lng: 101.9758 },
  MZ: { name: 'Mozambique', lat: -18.6657, lng: 35.5296 },
  NA: { name: 'Namibia', lat: -22.9576, lng: 18.4904 },
  NE: { name: 'Niger', lat: 17.6078, lng: 8.0817 },
  NG: { name: 'Nigeria', lat: 9.082, lng: 8.6753 },
  NI: { name: 'Nicaragua', lat: 12.8654, lng: -85.2072 },
  NL: { name: 'Netherlands', lat: 52.1326, lng: 5.2913 },
  NO: { name: 'Norway', lat: 60.472, lng: 8.4689 },
  NP: { name: 'Nepal', lat: 28.3949, lng: 84.124 },
  NZ: { name: 'New Zealand', lat: -40.9006, lng: 174.886 },
  OM: { name: 'Oman', lat: 21.5126, lng: 55.9233 },
  PA: { name: 'Panama', lat: 8.538, lng: -80.7821 },
  PE: { name: 'Peru', lat: -9.19, lng: -75.0152 },
  PG: { name: 'Papua New Guinea', lat: -6.3149, lng: 143.9555 },
  PH: { name: 'Philippines', lat: 12.8797, lng: 121.774 },
  PK: { name: 'Pakistan', lat: 30.3753, lng: 69.3451 },
  PL: { name: 'Poland', lat: 51.9194, lng: 19.1451 },
  PS: { name: 'Palestine', lat: 31.9522, lng: 35.2332 },
  PT: { name: 'Portugal', lat: 39.3999, lng: -8.2245 },
  PY: { name: 'Paraguay', lat: -23.4425, lng: -58.4438 },
  QA: { name: 'Qatar', lat: 25.3548, lng: 51.1839 },
  RO: { name: 'Romania', lat: 45.9432, lng: 24.9668 },
  RS: { name: 'Serbia', lat: 44.0165, lng: 21.0059 },
  RU: { name: 'Russia', lat: 61.524, lng: 105.3188 },
  RW: { name: 'Rwanda', lat: -1.9403, lng: 29.8739 },
  SA: { name: 'Saudi Arabia', lat: 23.8859, lng: 45.0792 },
  SB: { name: 'Solomon Islands', lat: -9.6457, lng: 160.1562 },
  SC: { name: 'Seychelles', lat: -4.6796, lng: 55.492 },
  SD: { name: 'Sudan', lat: 12.8628, lng: 30.2176 },
  SE: { name: 'Sweden', lat: 60.1282, lng: 18.6435 },
  SG: { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
  SI: { name: 'Slovenia', lat: 46.1512, lng: 14.9955 },
  SK: { name: 'Slovakia', lat: 48.669, lng: 19.699 },
  SL: { name: 'Sierra Leone', lat: 8.4606, lng: -11.7797 },
  SM: { name: 'San Marino', lat: 43.9424, lng: 12.4578 },
  SN: { name: 'Senegal', lat: 14.4974, lng: -14.4524 },
  SO: { name: 'Somalia', lat: 5.1521, lng: 46.1996 },
  SR: { name: 'Suriname', lat: 3.9193, lng: -56.0278 },
  SS: { name: 'South Sudan', lat: 6.877, lng: 31.307 },
  ST: { name: 'São Tomé & Príncipe', lat: 0.1864, lng: 6.6131 },
  SV: { name: 'El Salvador', lat: 13.7942, lng: -88.8965 },
  SY: { name: 'Syria', lat: 34.8021, lng: 38.9968 },
  SZ: { name: 'Eswatini', lat: -26.5225, lng: 31.4659 },
  TD: { name: 'Chad', lat: 15.4542, lng: 18.7322 },
  TG: { name: 'Togo', lat: 8.6195, lng: 0.8248 },
  TH: { name: 'Thailand', lat: 15.87, lng: 100.9925 },
  TJ: { name: 'Tajikistan', lat: 38.861, lng: 71.2761 },
  TL: { name: 'Timor-Leste', lat: -8.8742, lng: 125.7275 },
  TM: { name: 'Turkmenistan', lat: 48.9965, lng: 59.5563 },
  TN: { name: 'Tunisia', lat: 33.8869, lng: 9.5375 },
  TO: { name: 'Tonga', lat: -21.179, lng: -175.198 },
  TR: { name: 'Türkiye', lat: 38.9637, lng: 35.2433 },
  TT: { name: 'Trinidad & Tobago', lat: 10.6918, lng: -61.2225 },
  TW: { name: 'Taiwan', lat: 23.6978, lng: 120.9605 },
  TZ: { name: 'Tanzania', lat: -6.369, lng: 34.8888 },
  UA: { name: 'Ukraine', lat: 48.3794, lng: 31.1656 },
  UG: { name: 'Uganda', lat: 1.3733, lng: 32.2903 },
  US: { name: 'United States', lat: 39.8283, lng: -98.5795 },
  UY: { name: 'Uruguay', lat: -32.5228, lng: -55.7658 },
  UZ: { name: 'Uzbekistan', lat: 41.3775, lng: 64.5853 },
  VA: { name: 'Vatican City', lat: 41.9029, lng: 12.4534 },
  VC: { name: 'St Vincent & Grenadines', lat: 12.9843, lng: -61.2989 },
  VE: { name: 'Venezuela', lat: 6.4238, lng: -66.5897 },
  VN: { name: 'Vietnam', lat: 14.0583, lng: 108.2772 },
  VU: { name: 'Vanuatu', lat: -15.3841, lng: 166.9592 },
  WS: { name: 'Samoa', lat: -13.759, lng: -172.1046 },
  XK: { name: 'Kosovo', lat: 42.6026, lng: 20.9029 },
  YE: { name: 'Yemen', lat: 15.5527, lng: 48.5164 },
  ZA: { name: 'South Africa', lat: -30.5595, lng: 22.9375 },
  ZM: { name: 'Zambia', lat: -13.1339, lng: 27.8493 },
  ZW: { name: 'Zimbabwe', lat: -19.0154, lng: 29.1549 },
};

const NUMBER_TYPE_LABELS: Record<string, string> = {
  MOBILE: 'Mobile',
  FIXED_LINE: 'Fixed line',
  FIXED_LINE_OR_MOBILE: 'Fixed line or mobile',
  TOLL_FREE: 'Toll free',
  PREMIUM_RATE: 'Premium rate',
  SHARED_COST: 'Shared cost',
  VOIP: 'VoIP',
  PERSONAL_NUMBER: 'Personal number',
  PAGER: 'Pager',
  UAN: 'Universal access number',
  VOICEMAIL: 'Voicemail',
};

// ─── Indonesia: carrier allocation by mobile prefix ─────────────────
// Source: public numbering allocations (Kominfo / operator numbering plans).
// Factual reference data — prefix identifies the licensed carrier, NOT the
// physical location (Indonesian mobile numbering is non-geographic).

export const ID_MOBILE_CARRIERS: Array<{ prefix: string; carrier: string }> = [
  { prefix: '811', carrier: 'Telkomsel' },
  { prefix: '812', carrier: 'Telkomsel' },
  { prefix: '813', carrier: 'Telkomsel' },
  { prefix: '821', carrier: 'Telkomsel' },
  { prefix: '822', carrier: 'Telkomsel' },
  { prefix: '823', carrier: 'Telkomsel' },
  { prefix: '851', carrier: 'Telkomsel' },
  { prefix: '852', carrier: 'Telkomsel' },
  { prefix: '853', carrier: 'Telkomsel' },
  { prefix: '814', carrier: 'Indosat Ooredoo Hutchison' },
  { prefix: '815', carrier: 'Indosat Ooredoo Hutchison' },
  { prefix: '816', carrier: 'Indosat Ooredoo Hutchison' },
  { prefix: '855', carrier: 'Indosat Ooredoo Hutchison' },
  { prefix: '856', carrier: 'Indosat Ooredoo Hutchison' },
  { prefix: '857', carrier: 'Indosat Ooredoo Hutchison' },
  { prefix: '858', carrier: 'Indosat Ooredoo Hutchison' },
  { prefix: '895', carrier: 'Indosat Ooredoo Hutchison (Tri)' },
  { prefix: '896', carrier: 'Indosat Ooredoo Hutchison (Tri)' },
  { prefix: '897', carrier: 'Indosat Ooredoo Hutchison (Tri)' },
  { prefix: '898', carrier: 'Indosat Ooredoo Hutchison (Tri)' },
  { prefix: '899', carrier: 'Indosat Ooredoo Hutchison (Tri)' },
  { prefix: '817', carrier: 'XL Axiata' },
  { prefix: '818', carrier: 'XL Axiata' },
  { prefix: '819', carrier: 'XL Axiata' },
  { prefix: '859', carrier: 'XL Axiata' },
  { prefix: '877', carrier: 'XL Axiata' },
  { prefix: '878', carrier: 'XL Axiata' },
  { prefix: '831', carrier: 'XL Axiata (Axis)' },
  { prefix: '832', carrier: 'XL Axiata (Axis)' },
  { prefix: '833', carrier: 'XL Axiata (Axis)' },
  { prefix: '838', carrier: 'XL Axiata (Axis)' },
  { prefix: '881', carrier: 'Smartfren' },
  { prefix: '882', carrier: 'Smartfren' },
  { prefix: '883', carrier: 'Smartfren' },
  { prefix: '884', carrier: 'Smartfren' },
  { prefix: '885', carrier: 'Smartfren' },
  { prefix: '886', carrier: 'Smartfren' },
  { prefix: '887', carrier: 'Smartfren' },
  { prefix: '888', carrier: 'Smartfren' },
  { prefix: '889', carrier: 'Smartfren' },
];

export function lookupIdCarrier(nationalNumber: string): string | null {
  const num = nationalNumber.replace(/\D/g, '');
  for (const entry of ID_MOBILE_CARRIERS) {
    if (num.startsWith(entry.prefix)) return entry.carrier;
  }
  return null;
}

// ─── Indonesia: fixed-line area code → city coordinates ─────────────
// Source: national numbering plan for Indonesia (public data).

export interface IdCityGeo extends CountryGeo {
  province: string;
}

export const ID_FIXED_LINE_AREA_CODES: Record<string, IdCityGeo> = {
  '21': { name: 'Jakarta', province: 'DKI Jakarta', lat: -6.2088, lng: 106.8456 },
  '22': { name: 'Bandung', province: 'West Java', lat: -6.9175, lng: 107.6191 },
  '24': { name: 'Semarang', province: 'Central Java', lat: -6.9932, lng: 110.4203 },
  '251': { name: 'Bogor', province: 'West Java', lat: -6.595, lng: 106.8166 },
  '260': { name: 'Bekasi', province: 'West Java', lat: -6.2383, lng: 107.0917 },
  '271': { name: 'Surakarta (Solo)', province: 'Central Java', lat: -7.5755, lng: 110.8243 },
  '274': { name: 'Yogyakarta', province: 'DI Yogyakarta', lat: -7.7597, lng: 110.4144 },
  '31': { name: 'Surabaya', province: 'East Java', lat: -7.2575, lng: 112.7521 },
  '341': { name: 'Malang', province: 'East Java', lat: -7.98, lng: 112.63 },
  '361': { name: 'Denpasar', province: 'Bali', lat: -8.6705, lng: 115.2126 },
  '61': { name: 'Medan', province: 'North Sumatra', lat: 3.5952, lng: 98.6722 },
  '651': { name: 'Banda Aceh', province: 'Aceh', lat: 5.5483, lng: 95.3238 },
  '711': { name: 'Palembang', province: 'South Sumatra', lat: -2.9761, lng: 104.7754 },
  '741': { name: 'Bandar Lampung', province: 'Lampung', lat: -5.3971, lng: 105.2668 },
  '751': { name: 'Padang', province: 'West Sumatra', lat: -0.9471, lng: 100.4172 },
  '761': { name: 'Pekanbaru', province: 'Riau', lat: 0.5071, lng: 101.4478 },
  '771': { name: 'Batam', province: 'Kepulauan Riau', lat: 1.1301, lng: 104.0484 },
  '411': { name: 'Makassar', province: 'South Sulawesi', lat: -5.1477, lng: 119.4327 },
  '431': { name: 'Manado', province: 'North Sulawesi', lat: 1.4748, lng: 124.8421 },
  '451': { name: 'Palu', province: 'Central Sulawesi', lat: -0.8917, lng: 119.8707 },
  '511': { name: 'Banjarmasin', province: 'South Kalimantan', lat: -3.3186, lng: 114.5944 },
  '542': { name: 'Balikpapan', province: 'East Kalimantan', lat: -1.2379, lng: 116.8529 },
  '541': { name: 'Samarinda', province: 'East Kalimantan', lat: -0.4948, lng: 117.1421 },
  '561': { name: 'Pontianak', province: 'West Kalimantan', lat: -0.0263, lng: 109.3425 },
  '901': { name: 'Ambon', province: 'Maluku', lat: -3.6954, lng: 128.1814 },
  '401': { name: 'Balikpapan/Samarinda region', province: 'East Kalimantan', lat: -1.2379, lng: 116.8529 },
};

/** Match longest area-code prefix for an Indonesian fixed-line national number */
export function lookupIdCity(nationalNumber: string): { areaCode: string; city: IdCityGeo } | null {
  const num = nationalNumber.replace(/\D/g, '').replace(/^0+/, '');
  const codes = Object.keys(ID_FIXED_LINE_AREA_CODES).sort((a, b) => b.length - a.length);
  for (const code of codes) {
    if (num.startsWith(code)) {
      return { areaCode: `0${code}`, city: ID_FIXED_LINE_AREA_CODES[code] };
    }
  }
  return null;
}

// ─── Local-format number resolution ─────────────────────────────────
// Countries using trunk prefix '0' or commonly entered without '+'.
// A local-format number is accepted ONLY if it validates against a plan.

const LOCAL_FORMAT_CANDIDATES = [
  'ID', // trunk '0' — 08xx mobiles
  'MY',
  'SG',
  'AU',
  'GB',
  'IN',
  'US',
] as const;

function resolveLocalNumber(digitsOnly: string): ReturnType<typeof parsePhoneNumberWithError> | null {
  for (const country of LOCAL_FORMAT_CANDIDATES) {
    try {
      // Normalize: strip leading trunk '0' handling is done by the parser per region
      const candidate = parsePhoneNumberWithError(
        digitsOnly.replace(/^0+/, ''),
        country as Parameters<typeof parsePhoneNumberWithError>[1],
      );
      if (candidate.isValid()) {
        return candidate;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export const phoneGeoCollector: Collector = {
  name: 'phone-geo',

  supports(inputType: string): boolean {
    return inputType === 'PHONE';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    const raw = input.trim();
    const digitsOnly = raw.replace(/[^\d]/g, '');
    const hasIntlContext = raw.includes('+') || raw.startsWith('00');
    if (!hasIntlContext && !/^\d{7,15}$/.test(digitsOnly)) {
      throw new Error(
        `Invalid phone seed "${raw}": provide an international number with country code (e.g. +628123456789) or local format (e.g. 085219545503)`,
      );
    }

    logger.info('Phone-geo collector started', { requestId: ctx.requestId, input: raw });

    let parsed;
    // 1. Direct or prepended '+' international attempt (e.g. +628... or 628...)
    const intlCandidate = raw.startsWith('+') ? raw : `+${digitsOnly}`;
    try {
      const candidateParsed = parsePhoneNumberWithError(intlCandidate);
      if (candidateParsed.isValid() || candidateParsed.isPossible()) {
        parsed = candidateParsed;
      }
    } catch {
      // continue to trunk/local fallback
    }

    // 2. Trunk '0' prefix local format (e.g. 0852...)
    if (!parsed && raw.startsWith('0')) {
      parsed = resolveLocalNumber(digitsOnly);
    }

    // 3. Fallback: try normalizePhone
    if (!parsed) {
      try {
        parsed = parsePhoneNumberWithError(normalizePhone(raw));
      } catch {
        // ignore
      }
    }

    if (!parsed) {
      throw new Error(
        `"${raw}" has no valid country context. Please include the country calling code, e.g. +628... or local format 08...`,
      );
    }

    const e164 = parsed.number;
    const countryIso = parsed.country;
    const callingCode = parsed.countryCallingCode as string;
    const nationalNumber = parsed.nationalNumber as string;
    const isValid = parsed.isValid();
    const possible = isPossiblePhoneNumber(e164);
    const numberType = parsed.getType();

    // Seed echo: the PHONE itself is the investigation subject
    entities.push({
      type: 'PHONE',
      value: e164,
      title: `Phone: ${parsed.formatInternational()}`,
      confidence: isValid ? 90 : 30,
      metadata: {
        e164,
        internationalFormat: parsed.formatInternational(),
        nationalFormat: parsed.formatNational(),
        countryIso,
        countryCallingCode: `+${callingCode}`,
        nationalNumber,
        valid: isValid,
        possible,
        numberType: numberType ? NUMBER_TYPE_LABELS[numberType] || numberType : null,
        precision: isValid || possible ? 'NUMBER_VALIDATED' : 'UNVALIDATED',
        source: {
          url: `tel:${e164}`,
          collector: 'phone-geo',
          transform: 'phone.parse-metadata',
          derivedFrom: raw,
          collectedAt,
        },
      },
    });

    evidence.push({
      source_url: `tel:${e164}`,
      source_type: 'PHONE_METADATA',
      title: `libphonenumber metadata: ${parsed.formatInternational()}`,
      extracted_value: JSON.stringify({
        e164,
        countryIso,
        countryCallingCode: `+${callingCode}`,
        valid: isValid,
        numberType: numberType || null,
      }),
      confidence: isValid ? 90 : 30,
      metadata: {
        dataset: 'google/libphonenumber (via libphonenumber-js/max)',
        collectedAt,
      },
    });

    // ─── Enrichment: Indonesia-specific carrier + area-code geodata ───
    let carrier: string | null = null;
    let cityMatch: { areaCode: string; city: IdCityGeo } | null = null;
    if (countryIso === 'ID') {
      const isFixedLine =
        numberType === 'FIXED_LINE' || numberType === 'FIXED_LINE_OR_MOBILE';
      if (isFixedLine) {
        cityMatch = lookupIdCity(nationalNumber);
      } else {
        carrier = lookupIdCarrier(nationalNumber);
      }
    }

    // ─── Live Enrichment: Twilio Lookup API (if configured) ───
    const twilioData = await queryTwilioLookup(e164, ctx.requestId, ctx.signal);
    let twilioLineType: string | null = null;
    let isVoip = false;

    if (twilioData?.line_type_intelligence) {
      const lti = twilioData.line_type_intelligence;
      if (lti.carrier_name) {
        carrier = lti.carrier_name;
      }
      twilioLineType = lti.type ? lti.type.toUpperCase() : null;
      isVoip = twilioLineType === 'VOIP';

      if (isVoip) {
        warnings.push(`High fraud risk signal: ${e164} is a VOIP/Virtual number (commonly used in scam/burner operations).`);
      }

      evidence.push({
        source_url: `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}`,
        source_type: 'PHONE_METADATA',
        title: `Twilio Live Telecom Intelligence: ${carrier || twilioLineType}`,
        extracted_value: JSON.stringify({
          e164,
          carrier: lti.carrier_name,
          lineType: lti.type,
          mcc: lti.mobile_country_code,
          mnc: lti.mobile_network_code,
        }),
        confidence: 95,
        metadata: { method: 'Twilio Lookup API v2 Line Type Intelligence' },
      });
    }

    // Attach carrier attribution directly onto the PHONE entity metadata
    if (carrier || twilioLineType) {
      const phoneEntity = entities[0];
      phoneEntity.metadata = {
        ...(phoneEntity.metadata as Record<string, unknown>),
        carrier: carrier || phoneEntity.metadata?.carrier,
        carrierSource: twilioData?.line_type_intelligence?.carrier_name
          ? 'Twilio Lookup v2 (Live Network Intelligence)'
          : 'Public numbering allocation (Kominfo/operator numbering plan)',
        lineType: twilioLineType || phoneEntity.metadata?.numberType,
        isVoip,
        mccMnc: twilioData?.line_type_intelligence?.mobile_country_code && twilioData?.line_type_intelligence?.mobile_network_code
          ? `${twilioData.line_type_intelligence.mobile_country_code}-${twilioData.line_type_intelligence.mobile_network_code}`
          : undefined,
        locationNote:
          'Indonesian mobile numbering is non-geographic — the prefix identifies the licensed carrier, not the subscriber location.',
      };
      if (!twilioData?.line_type_intelligence) {
        evidence.push({
          source_url: `tel:${e164}`,
          source_type: 'PHONE_METADATA',
          title: `Carrier attribution: ${carrier}`,
          extracted_value: JSON.stringify({ e164, prefix: nationalNumber.slice(0, 4), carrier }),
          confidence: 85,
          metadata: { method: 'E.164 mobile prefix → licensed carrier allocation lookup' },
        });
      }

      if (carrier && carrier !== 'Unknown' && carrier !== 'None') {
        entities.push({
          type: 'ORGANIZATION',
          value: carrier,
          title: `${carrier} (Carrier/ISP)`,
          confidence: 90,
          metadata: {
            orgType: 'CARRIER',
            sourcePhone: e164,
            source: {
              url: `tel:${e164}`,
              collector: 'phone-geo',
              transform: 'phone.carrier-lookup',
              derivedFrom: e164,
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: e164,
          source_type: 'PHONE',
          target_value: carrier,
          target_type: 'ORGANIZATION',
          relationship_type: 'BELONGS_TO',
          confidence: 90,
          reason: `Mobile number ${e164} prefix is allocated to carrier "${carrier}"`,
        });
      }
    }

    // Geographic attribution
    const geo = countryIso ? COUNTRY_GEO[countryIso] : undefined;
    if (!countryIso || !geo) {
      warnings.push(
        `No country attribution possible for ${e164}: calling code +${callingCode} not resolvable to a country`,
      );
      logger.warn('Phone-geo: no country attribution', {
        requestId: ctx.requestId,
        e164,
        callingCode,
      });
      return { source: `tel:${e164}`, collectedAt, entities, relationships, evidence, warnings };
    }

    // City-level (fixed-line area code) takes priority over country centroid
    const city = cityMatch?.city;
    const lat = city ? city.lat : geo.lat;
    const lng = city ? city.lng : geo.lng;
    const precision: 'CITY' | 'COUNTRY' = city ? 'CITY' : 'COUNTRY';
    const confidence = city ? 65 : 40;
    const attributionReason = city
      ? `Fixed-line area code ${cityMatch!.areaCode} is assigned to ${city.name}, ${city.province} in the national numbering plan`
      : `Country calling code +${callingCode} is assigned to ${geo.name} (country-level geolocation)`;

    const locationValue = `geo:${lat.toFixed(6)},${lng.toFixed(6)}`;
    entities.push({
      type: 'LOCATION',
      value: locationValue,
      title: city
        ? `${city.name}, ${city.province} (area code ${cityMatch!.areaCode})`
        : `${geo.name} (country-level)`,
      confidence,
      metadata: {
        lat,
        lng,
        latitude: lat,
        longitude: lng,
        precision,
        accuracyNote: city
          ? 'City-level approximation from the fixed-line area code. Subscriber-level GPS position requires carrier/legal access.'
          : 'Country-level approximation from calling code. Subscriber-level GPS position requires carrier/legal access.',
        countryIso,
        countryName: geo.name,
        province: city?.province,
        cityName: city?.name,
        areaCode: cityMatch?.areaCode,
        countryCallingCode: `+${callingCode}`,
        sourcePhone: e164,
        source: {
          url: `tel:${e164}`,
          collector: 'phone-geo',
          transform: 'phone.geo-attribute',
          derivedFrom: e164,
          collectedAt,
        },
      },
    });

    relationships.push({
      source_value: e164,
      source_type: 'PHONE',
      target_value: locationValue,
      target_type: 'LOCATION',
      relationship_type: 'BELONGS_TO',
      confidence,
      reason: attributionReason,
    });

    evidence.push({
      source_url: `tel:${e164}`,
      source_type: 'PHONE_METADATA',
      title: city
        ? `Geographic attribution: ${city.name}, ${city.province}`
        : `Geographic attribution: ${geo.name}`,
      extracted_value: locationValue,
      confidence,
      metadata: {
        method: city
          ? 'National fixed-line area code lookup'
          : 'ITU E.164 country calling code lookup',
        countryIso,
        countryName: geo.name,
        cityName: city?.name,
        province: city?.province,
        carrier,
        lat,
        lng,
        precision,
      },
    });

    // ─── GetContact Intelligence Enrichment ───
    try {
      const gtcData = await queryGetContact(e164, ctx.requestId);
      if (gtcData) {
        if (gtcData.displayName) {
          entities.push({
            type: 'PERSON',
            value: gtcData.displayName,
            title: `${gtcData.displayName} (GetContact)`,
            confidence: 85,
            metadata: {
              sourcePhone: e164,
              source: 'GetContact Caller Directory',
              tagCount: gtcData.tagCount,
            },
          });

          relationships.push({
            source_value: e164,
            source_type: 'PHONE',
            target_value: gtcData.displayName,
            target_type: 'PERSON',
            relationship_type: 'RELATED_TO',
            confidence: 85,
            reason: `Identified subscriber name "${gtcData.displayName}" via GetContact caller directory`,
          });
        }

        // Add all discovered tags as PUBLIC_MENTION nodes
        const allTags = (gtcData.tags || []).filter((t) => t.tag && t.tag.length > 1);

        const seenTagValues = new Set<string>();

        for (const t of allTags) {
          const tagValue = `tag:${t.tag.toLowerCase().replace(/\s+/g, '-')}`;
          if (seenTagValues.has(tagValue)) continue;
          seenTagValues.add(tagValue);

          entities.push({
            type: 'PUBLIC_MENTION',
            value: tagValue,
            title: t.count > 1 ? `${t.tag} (${t.count}x)` : t.tag,
            confidence: 80,
            metadata: {
              rawTag: t.tag,
              count: t.count,
              sourcePhone: e164,
              provider: 'GetContact',
              totalAccountTags: gtcData.tagCount,
            },
          });

          relationships.push({
            source_value: e164,
            source_type: 'PHONE',
            target_value: tagValue,
            target_type: 'PUBLIC_MENTION',
            relationship_type: 'MENTIONS',
            confidence: 80,
            reason: `GetContact user tag: "${t.tag}" (saved by ${t.count} contact(s))`,
          });
        }

        // If GetContact indicates more tags on server than previewed in tier
        if (gtcData.tagCount && gtcData.tagCount > allTags.length) {
          const remainingCount = gtcData.tagCount - allTags.length;
          const summaryTagValue = `gtc:total-tags:${e164}`;
          if (!seenTagValues.has(summaryTagValue)) {
            seenTagValues.add(summaryTagValue);
            entities.push({
              type: 'PUBLIC_MENTION',
              value: summaryTagValue,
              title: `+${remainingCount} Tag Lainnya (${gtcData.tagCount} Total di GetContact)`,
              confidence: 85,
              metadata: {
                totalTags: gtcData.tagCount,
                previewTags: allTags.length,
                remainingTags: remainingCount,
                sourcePhone: e164,
                provider: 'GetContact',
                note: `Nomor ini memiliki total ${gtcData.tagCount} tag tersimpan di GetContact database`,
              },
            });

            relationships.push({
              source_value: e164,
              source_type: 'PHONE',
              target_value: summaryTagValue,
              target_type: 'PUBLIC_MENTION',
              relationship_type: 'MENTIONS',
              confidence: 85,
              reason: `Total ${gtcData.tagCount} tags recorded in GetContact caller directory (${remainingCount} additional encrypted contacts)`,
            });
          }
        }

        evidence.push({
          source_url: `getcontact://phone/${encodeURIComponent(e164)}`,
          source_type: 'PHONE_METADATA',
          title: `GetContact Directory: ${gtcData.displayName || e164} (${gtcData.tags?.length || 0} tags)`,
          extracted_value: JSON.stringify({
            displayName: gtcData.displayName,
            tagCount: gtcData.tagCount,
            tags: gtcData.tags,
          }),
          confidence: 85,
          metadata: {
            method: 'GetContact Public Tag & Identity Lookup',
            displayName: gtcData.displayName,
            tagCount: gtcData.tagCount,
            tags: gtcData.tags,
          },
        });

        // Enrich main phone entity metadata
        if (entities.length > 0) {
          const phoneEntity = entities[0];
          phoneEntity.metadata = {
            ...(phoneEntity.metadata as Record<string, unknown>),
            getcontactDisplayName: gtcData.displayName,
            getcontactTagCount: gtcData.tagCount,
            getcontactTags: gtcData.tags?.map((t) => t.tag),
          };
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isCaptcha = errMsg.includes('User validation is required') || errMsg.includes('403');
      const userWarning = isCaptcha
        ? 'GetContact API memerlukan verifikasi Captcha untuk akun aktif. Silakan jalankan: python gtc.py captcha di terminal untuk membuka sesi.'
        : `GetContact lookup failed: ${errMsg.slice(0, 120)}`;

      logger.warn('Phone-geo GetContact enrichment warning', {
        requestId: ctx.requestId,
        error: errMsg,
        isCaptcha,
      });

      warnings.push(userWarning);
    }

    logger.info('Phone-geo completed', {
      requestId: ctx.requestId,
      e164,
      countryIso,
      entityCount: entities.length,
      relationshipCount: relationships.length,
      evidenceCount: evidence.length,
    });

    return { source: `tel:${e164}`, collectedAt, entities, relationships, evidence, warnings };
  },
};
