/**
 * Geo coordinate sanitization and accurate Indonesian campus/corporate resolution.
 * Ensures map pins match verified real-world Google Maps locations rather than
 * legacy provincial centroids or false-positive geocoding.
 */

export interface AccurateGeoResolution {
  lat: number;
  lng: number;
  precision: string;
  matchedName?: string;
  googleMapsUrl?: string;
  isCorrected?: boolean;
}

/**
 * Checks if coordinates match or closely surround the legacy default Jakarta centroid (-6.20880, 106.84560).
 */
export function isNearJakartaFallback(lat?: number | null, lng?: number | null): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return Math.abs(lat - -6.2088) < 0.05 && Math.abs(lng - 106.8456) < 0.05;
}

/**
 * Resolves accurate coordinates for known Indonesian corporate and educational campuses,
 * with priority over erroneous or legacy provincial fallback coordinates.
 */
export function resolveAccurateLocation(
  addressOrText: string = '',
  domain: string = '',
  currentLat?: number | null,
  currentLng?: number | null
): AccurateGeoResolution | null {
  const text = (addressOrText || '').toLowerCase();
  const normDomain = (domain || '').toLowerCase().replace(/^(?:www\.)?/, '');

  // 1. Nurul Fikri (Kampus A - Jl. Situ Indah No. 116, Tugu, Cimanggis, Depok)
  // Google Maps verified: -6.36276, 106.84382
  const isNurulFikriDomain = normDomain.includes('nurulfikri') || normDomain.includes('nf.ac.id');
  const isKampusACimanggis =
    text.includes('situ indah') ||
    ((text.includes('cimanggis') || text.includes('tugu')) && text.includes('depok')) ||
    (isNurulFikriDomain && (text.includes('kampus a') || text.includes('cimanggis') || (!text.includes('lenteng') && !text.includes('kampus b'))));

  if (isKampusACimanggis) {
    return {
      lat: -6.36276,
      lng: 106.84382,
      precision: 'STREET_ADDRESS',
      matchedName: 'Kampus A STT Terpadu Nurul Fikri, Jl. Situ Indah 116, Tugu, Cimanggis, Depok',
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=-6.36276,106.84382',
      isCorrected: true,
    };
  }

  // 2. Nurul Fikri (Kampus B - Jl. Raya Lenteng Agung No. 20-21, Srengseng Sawah, Jagakarsa, Jakarta Selatan)
  // Google Maps verified: -6.34241, 106.83154
  const isKampusBJagakarsa =
    text.includes('lenteng agung') ||
    text.includes('srengseng sawah') ||
    (text.includes('jagakarsa') && isNurulFikriDomain) ||
    (isNurulFikriDomain && text.includes('kampus b'));

  if (isKampusBJagakarsa) {
    return {
      lat: -6.34241,
      lng: 106.83154,
      precision: 'STREET_ADDRESS',
      matchedName: 'Kampus B STT Terpadu Nurul Fikri, Jl. Raya Lenteng Agung 20-21, Jagakarsa, Jakarta Selatan',
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=-6.34241,106.83154',
      isCorrected: true,
    };
  }

  // 3. Daarut Tauhiid Bandung (Kampus I - Gegerkalong Girang, Bandung)
  // Google Maps verified: -6.86250, 107.59100
  const isDaarutTauhiid = normDomain.includes('smkdtbs') || normDomain.includes('daaruttauhiid');
  const isDtbsBandung =
    text.includes('gegerkalong') ||
    (text.includes('setiabudi') && text.includes('bandung')) ||
    (isDaarutTauhiid && (text.includes('kampus i') || text.includes('kampus 1') || !text.includes('cigugur')));

  if (isDtbsBandung) {
    return {
      lat: -6.86250,
      lng: 107.59100,
      precision: 'STREET_ADDRESS',
      matchedName: 'Kampus I SMK Daarut Tauhiid Boarding School Bandung, Gegerkalong Girang',
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=-6.86250,107.59100',
      isCorrected: true,
    };
  }

  // 4. Daarut Tauhiid Parongpong (Kampus II - Cigugur Girang, Parongpong, Bandung Barat)
  // Google Maps verified: -6.83350, 107.57500
  const isDtbsParongpong =
    text.includes('cigugur') ||
    text.includes('parongpong') ||
    (isDaarutTauhiid && (text.includes('kampus ii') || text.includes('kampus 2')));

  if (isDtbsParongpong) {
    return {
      lat: -6.83350,
      lng: 107.57500,
      precision: 'STREET_ADDRESS',
      matchedName: 'Kampus II SMK Daarut Tauhiid Boarding School, Cigugur Girang, Parongpong',
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=-6.83350,107.57500',
      isCorrected: true,
    };
  }

  // 5. If existing coordinates are the legacy Jakarta fallback (-6.2088, 106.8456) but address explicitly points outside Central Jakarta:
  const isLegacyJakarta = isNearJakartaFallback(currentLat, currentLng);
  if (isLegacyJakarta) {
    if (text.includes('cimanggis')) {
      return {
        lat: -6.3650,
        lng: 106.8650,
        precision: 'DISTRICT_LEVEL',
        matchedName: 'Kecamatan Cimanggis, Depok',
        googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=-6.3650,106.8650',
        isCorrected: true,
      };
    }
    if (text.includes('depok')) {
      return {
        lat: -6.4025,
        lng: 106.7942,
        precision: 'CITY_LEVEL',
        matchedName: 'Kota Depok, Jawa Barat',
        googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=-6.4025,106.7942',
        isCorrected: true,
      };
    }
    if (text.includes('jagakarsa')) {
      return {
        lat: -6.3325,
        lng: 106.8250,
        precision: 'DISTRICT_LEVEL',
        matchedName: 'Kecamatan Jagakarsa, Jakarta Selatan',
        googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=-6.3325,106.8250',
        isCorrected: true,
      };
    }
  }

  return null;
}
