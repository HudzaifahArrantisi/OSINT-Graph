import { describe, it, expect } from 'vitest';
import { phoneGeoCollector, COUNTRY_GEO, lookupIdCarrier, lookupIdCity } from '../collectors/phone-geo.js';
import { executeTransform } from '../transforms/adapter.js';
import { normalizePhone } from '@nexusgraph/shared';

const ctx = {
  caseId: 'test-case',
  requestId: 'test-req',
  signal: new AbortController().signal,
};

describe('phone-geo collector', () => {
  it('supports only PHONE seed type', () => {
    expect(phoneGeoCollector.supports('PHONE')).toBe(true);
    expect(phoneGeoCollector.supports('EMAIL')).toBe(false);
    expect(phoneGeoCollector.supports('DOMAIN')).toBe(false);
  });

  it('parses an Indonesian mobile number and emits a country-level LOCATION', async () => {
    const result = await phoneGeoCollector.run('+6281234567890', ctx);

    const phone = result.entities.find((e) => e.type === 'PHONE');
    expect(phone).toBeDefined();
    expect(phone!.value).toBe('+6281234567890');
    expect(phone!.metadata?.countryIso).toBe('ID');
    expect(phone!.metadata?.numberType).toBe('Mobile');

    const location = result.entities.find((e) => e.type === 'LOCATION');
    expect(location).toBeDefined();
    expect(location!.metadata?.countryIso).toBe('ID');
    expect(location!.metadata?.precision).toBe('COUNTRY');
    expect(typeof location!.metadata?.lat).toBe('number');
    expect(typeof location!.metadata?.lng).toBe('number');

    const rel = result.relationships[0];
    expect(rel.source_value).toBe('+6281234567890');
    expect(rel.target_type).toBe('LOCATION');
    expect(rel.confidence).toBe(40);
    expect(rel.reason).toContain('+62');

    expect(result.evidence.length).toBeGreaterThanOrEqual(2);
    expect(result.evidence.every((ev) => ev.source_type === 'PHONE_METADATA')).toBe(true);
  });

  it('normalizes 00-prefix and separators to E.164', async () => {
    const result = await phoneGeoCollector.run('0062 812-3456-7890', ctx);
    const phone = result.entities.find((e) => e.type === 'PHONE');
    expect(phone!.value).toBe('+6281234567890');
  });

  it('attributes a UK landline to GB coordinates', async () => {
    const result = await phoneGeoCollector.run('+442071838750', ctx);
    const location = result.entities.find((e) => e.type === 'LOCATION');
    expect(location!.metadata?.countryIso).toBe('GB');
    expect(COUNTRY_GEO['GB'].name).toBe('United Kingdom');
  });

  it('resolves local 0-prefix format (08...) to Indonesia deterministically', async () => {
    const result = await phoneGeoCollector.run('085219545503', ctx);
    const phone = result.entities.find((e) => e.type === 'PHONE');
    expect(phone!.value).toBe('+6285219545503');
    expect(phone!.metadata?.countryIso).toBe('ID');
    expect(phone!.metadata?.carrier).toBe('Telkomsel');
  });

  it('rejects bare digits without + or trunk 0 with explicit guidance', async () => {
    await expect(phoneGeoCollector.run('85219545503', ctx)).rejects.toThrow(/country code context/i);
  });

  it('throws on numbers without any country code context that cannot parse', async () => {
    await expect(phoneGeoCollector.run('abc-not-a-phone', ctx)).rejects.toThrow(/Invalid phone seed/i);
  });
});

describe('phone.geo-metadata transform', () => {
  it('wraps the phone-geo collector and filters the seed echo', async () => {
    const result = await executeTransform(
      'phone.geo-metadata',
      '+6281234567890',
      'PHONE',
      '+6281234567890',
      ctx,
    );

    expect(result.status).toBe('COMPLETED');
    // The PHONE entity echoing the seed is filtered; LOCATION survives
    expect(result.entities.some((e) => e.type === 'LOCATION')).toBe(true);
    expect(result.entities.every((e) => e.type !== 'PHONE')).toBe(true);
  });

  it('skips non-PHONE seeds', async () => {
    const result = await executeTransform(
      'phone.geo-metadata',
      'acme.com',
      'DOMAIN',
      'acme.com',
      ctx,
    );
    expect(result.status).toBe('NOT_FOUND');
    expect(result.entities).toHaveLength(0);
  });
});

describe('Indonesia carrier & area-code lookups', () => {
  it('attributes 0852 prefix to Telkomsel', () => {
    expect(lookupIdCarrier('85219545503')).toBe('Telkomsel');
    expect(lookupIdCarrier('8121234567')).toBe('Telkomsel');
    expect(lookupIdCarrier('8787654321')).toBe('XL Axiata');
    expect(lookupIdCarrier('8951234567')).toContain('Tri');
  });

  it('maps Jakarta area code 021 to city coordinates', () => {
    const match = lookupIdCity('213456789');
    expect(match).not.toBeNull();
    expect(match!.city.name).toBe('Jakarta');
    expect(match!.areaCode).toBe('021');
    expect(typeof match!.city.lat).toBe('number');
  });

  it('emits carrier metadata and city-level location for a Jakarta landline', async () => {
    const result = await phoneGeoCollector.run('+62213500555', ctx);
    const phone = result.entities.find((e) => e.type === 'PHONE');
    expect(phone!.metadata?.countryIso).toBe('ID');

    const location = result.entities.find((e) => e.type === 'LOCATION');
    expect(location).toBeDefined();
    expect(location!.metadata?.precision).toBe('CITY');
    expect(location!.metadata?.cityName).toBe('Jakarta');
    expect(location!.confidence).toBe(65);
  });
});

describe('normalizePhone (shared)', () => {
  it('strips separators and keeps E.164 form', () => {
    expect(normalizePhone('+62 812-3456-7890')).toBe('+6281234567890');
    expect(normalizePhone('00628123456789')).toBe('+628123456789');
    expect(normalizePhone('(+1) 212 555 0123')).toBe('+12125550123');
  });
});
