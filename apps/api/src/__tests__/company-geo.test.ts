import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  companyGeoCollector,
  extractGoogleMapsLinks,
  extractSchemaOrgLocations,
  extractContactAddressText,
  extractDirectHtmlCoordinates,
  extractPageMetadata,
  isGeocodingResultRelevant,
  KNOWN_CORPORATE_HQS,
  resolveCoordinates,
} from '../collectors/company-geo.js';
import * as ssrfModule from '../security/ssrf.js';

describe('company-geo collector & parser', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('supports DOMAIN, URL, WEBSITE, and ORGANIZATION input types', () => {
    expect(companyGeoCollector.supports('DOMAIN')).toBe(true);
    expect(companyGeoCollector.supports('URL')).toBe(true);
    expect(companyGeoCollector.supports('WEBSITE' as any)).toBe(true);
    expect(companyGeoCollector.supports('ORGANIZATION')).toBe(true);
    expect(companyGeoCollector.supports('PHONE')).toBe(false);
  });

  describe('extractPageMetadata', () => {
    it('extracts site title and strips tagline suffix', () => {
      const html = `
        <html>
          <head>
            <title>SMK Daarut Tauhiid Boarding School Bandung &#8211; Sekolah Vokasi Berbasis Pesantren</title>
          </head>
        </html>
      `;
      const meta = extractPageMetadata(html);
      expect(meta.title).toBe('SMK Daarut Tauhiid Boarding School Bandung');
    });

    it('extracts og:site_name and og:title', () => {
      const html = `
        <html>
          <head>
            <meta property="og:site_name" content="Kopi Kenangan" />
            <meta property="og:title" content="Kopi Kenangan - Official Site" />
          </head>
        </html>
      `;
      const meta = extractPageMetadata(html);
      expect(meta.siteName).toBe('Kopi Kenangan');
      expect(meta.title).toBe('Kopi Kenangan');
    });
  });

  describe('isGeocodingResultRelevant', () => {
    it('rejects false-positive fuzzy match like SMK PTBA for smkdtbs domain', () => {
      const isRelevant = isGeocodingResultRelevant(
        'Smkdtbs, Indonesia',
        'SMK PTBA, Jalan Buluran, Tanjung Enim, Indonesia',
        'smkdtbs.sch.id'
      );
      expect(isRelevant).toBe(false);
    });

    it('accepts relevant result matching title keywords', () => {
      const isRelevant = isGeocodingResultRelevant(
        'SMK Daarut Tauhiid Boarding School Bandung',
        'SMP Daarut Tauhiid Boarding School Bandung, Sukasari, Jawa Barat',
        'smkdtbs.sch.id',
        'SMK Daarut Tauhiid Boarding School Bandung'
      );
      expect(isRelevant).toBe(true);
    });

    it('accepts relevant result matching address street name', () => {
      const isRelevant = isGeocodingResultRelevant(
        'Jl. Gegerkalong Girang, Bandung',
        'Jalan Gegerkalong Girang, Sukasari, Kota Bandung, Jawa Barat',
        'smkdtbs.sch.id'
      );
      expect(isRelevant).toBe(true);
    });
  });

  describe('extractContactAddressText', () => {
    it('extracts Indonesian physical address pattern from raw HTML', () => {
      const html = `
        <div class="footer">
          <p>Alamat Kantor Pusat: Jl. Jenderal Sudirman Kav 25, Menara Batavia Lt 12, Jakarta Selatan, 10220</p>
        </div>
      `;
      const addresses = extractContactAddressText(html);
      expect(addresses.length).toBeGreaterThan(0);
      expect(addresses[0]).toContain('Jl. Jenderal Sudirman Kav 25');
    });

    it('extracts campus addresses with prefix and no inner commas (like smkdtbs.sch.id)', () => {
      const html = `
        <div class="contact-info">
          <p>Kampus I : Jl. Gegerkalong Girang Komplek Setiabudi Indah Kav. 25-26 Bandung 40153</p>
          <p>Kampus II : Jl. Cigugur Girang no.33, Parongpong, Kabupaten Bandung Barat, Jawa barat 40559</p>
        </div>
      `;
      const addresses = extractContactAddressText(html);
      expect(addresses.length).toBeGreaterThanOrEqual(2);
      expect(addresses.some((a) => a.includes('Gegerkalong Girang'))).toBe(true);
      expect(addresses.some((a) => a.includes('Cigugur Girang'))).toBe(true);
    });
  });

  describe('extractGoogleMapsLinks', () => {
    it('extracts coordinates from protobuf embed iframe (!2d<lng>!3d<lat>)', () => {
      const html = `
        <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3966.2754675908077!2d106.8295!3d-6.2297!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNsKwMTMnNDYuOSJTIDEwNsKwNDknNDYuMiJF!5e0!3m2!1sen!2sid!4v1580000000000!5m2!1sen!2sid" width="600" height="450" frameborder="0" style="border:0;" allowfullscreen=""></iframe>
      `;
      const links = extractGoogleMapsLinks(html);
      expect(links.length).toBeGreaterThan(0);
      expect(links[0].lat).toBeCloseTo(-6.2297);
      expect(links[0].lng).toBeCloseTo(106.8295);
    });

    it('extracts coordinates from @lat,lng Google Maps URL', () => {
      const html = `
        <div>
          <a href="https://www.google.com/maps/@-6.225500,106.809500,17z">Lokasi Kantor Kami</a>
        </div>
      `;
      const links = extractGoogleMapsLinks(html);
      expect(links.length).toBe(1);
      expect(links[0].lat).toBeCloseTo(-6.2255);
      expect(links[0].lng).toBeCloseTo(106.8095);
      expect(links[0].url).toContain('google.com/maps');
    });

    it('extracts query coordinates from ?q=lat,lng iframe embed', () => {
      const html = `
        <iframe src="https://maps.google.com/maps?q=-6.175392,106.827153&t=&z=13&ie=UTF8&iwloc=&output=embed"></iframe>
      `;
      const links = extractGoogleMapsLinks(html);
      expect(links.length).toBe(1);
      expect(links[0].lat).toBeCloseTo(-6.175392);
      expect(links[0].lng).toBeCloseTo(106.827153);
    });

    it('extracts text address query parameter from Google Maps search link', () => {
      const html = `
        <a href="https://maps.google.com/?q=Menara+Standard+Chartered+Jakarta">Maps</a>
      `;
      const links = extractGoogleMapsLinks(html);
      expect(links.length).toBe(1);
      expect(links[0].query).toBe('Menara Standard Chartered Jakarta');
    });
  });

  describe('extractSchemaOrgLocations', () => {
    it('extracts PostalAddress and GeoCoordinates from JSON-LD', () => {
      const html = `
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "name": "Kopi Kenangan HQ",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "Jl. Prof. DR. Satrio No. 164",
            "addressLocality": "Jakarta Selatan",
            "addressRegion": "DKI Jakarta",
            "postalCode": "12930",
            "addressCountry": "ID"
          },
          "geo": {
            "@type": "GeoCoordinates",
            "latitude": -6.2201,
            "longitude": 106.8245
          }
        }
        </script>
      `;
      const findings = extractSchemaOrgLocations(html, 'https://kopikenangan.com/contact');
      expect(findings.length).toBeGreaterThan(0);
      const f = findings[0];
      expect(f.addressText).toContain('Jl. Prof. DR. Satrio');
      expect(f.cityName).toBe('Jakarta Selatan');
      expect(f.lat).toBeCloseTo(-6.2201);
      expect(f.lng).toBeCloseTo(106.8245);
      expect(f.method).toBe('schema_jsonld');
    });
  });

  describe('extractContactAddressText', () => {
    it('extracts Indonesian physical address pattern from raw HTML', () => {
      const html = `
        <div class="footer">
          <p>Alamat Kantor Pusat: Jl. Jenderal Sudirman Kav 25, Menara Batavia Lt 12, Jakarta Selatan, 10220</p>
        </div>
      `;
      const addresses = extractContactAddressText(html);
      expect(addresses.length).toBeGreaterThan(0);
      expect(addresses[0]).toContain('Jl. Jenderal Sudirman Kav 25');
    });
  });

  describe('extractDirectHtmlCoordinates', () => {
    it('extracts geo.position and ICBM meta tags', () => {
      const html = `
        <meta name="geo.position" content="-6.2297; 106.8295">
        <meta name="ICBM" content="-6.2297, 106.8295">
      `;
      const coords = extractDirectHtmlCoordinates(html);
      expect(coords).not.toBeNull();
      expect(coords?.lat).toBeCloseTo(-6.2297);
      expect(coords?.lng).toBeCloseTo(106.8295);
    });

    it('extracts data-lat and data-lng attributes', () => {
      const html = `
        <div class="office-map" data-lat="-6.1754" data-lng="106.8272"></div>
      `;
      const coords = extractDirectHtmlCoordinates(html);
      expect(coords).not.toBeNull();
      expect(coords?.lat).toBeCloseTo(-6.1754);
      expect(coords?.lng).toBeCloseTo(106.8272);
    });
  });

  describe('resolveCoordinates and KNOWN_CORPORATE_HQS', () => {
    it('contains known coordinates for kopikenangan.com at Menara BTPN', () => {
      const known = KNOWN_CORPORATE_HQS['kopikenangan.com'];
      expect(known).toBeDefined();
      expect(known.lat).toBeCloseTo(-6.2297);
      expect(known.lng).toBeCloseTo(106.8295);
      expect(known.address).toContain('Menara BTPN');
    });

    it('resolves known corporate headquarters instantly via Tier 1 dictionary', async () => {
      const resolved = await resolveCoordinates('', 'kopikenangan.com');
      expect(resolved).not.toBeNull();
      expect(resolved?.lat).toBeCloseTo(-6.2297);
      expect(resolved?.lng).toBeCloseTo(106.8295);
      expect(resolved?.precision).toBe('EXACT_COORDINATES');
    });
  });

  describe('companyGeoCollector.run execution', () => {
    it('discovers corporate HQ entity from page with Schema.org & Google Maps', async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Acme Corp",
            "address": {
              "@type": "PostalAddress",
              "streetAddress": "Jl. HR Rasuna Said No. 10",
              "addressLocality": "Jakarta Selatan",
              "addressCountry": "Indonesia"
            },
            "geo": {
              "@type": "GeoCoordinates",
              "latitude": -6.215,
              "longitude": 106.83
            }
          }
          </script>
        </head>
        <body>
          <a href="https://maps.google.com/?q=-6.215,106.83">Google Maps HQ</a>
        </body>
        </html>
      `;

      // Mock safeFetch to return simulated response
      vi.spyOn(ssrfModule, 'safeFetch').mockResolvedValue({
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
      } as any);

      vi.spyOn(ssrfModule, 'readResponseWithLimit').mockResolvedValue(mockHtml);

      const result = await companyGeoCollector.run('acme-target.com', {
        caseId: 'test-case-id',
        requestId: 'test-req-id',
        signal: new AbortController().signal,
      });

      expect(result.source).toBe('company-geo');
      expect(result.entities.length).toBeGreaterThan(0);

      const locationEntity = result.entities.find((e) => e.type === 'LOCATION');
      expect(locationEntity).toBeDefined();
      const meta = locationEntity?.metadata as any;
      expect(meta?.isCompanyGeo).toBe(true);
      expect(meta?.companyDomain).toBe('acme-target.com');
      expect(meta?.googleMapsUrl).toContain('maps');
      expect(meta?.latitude).toBeCloseTo(-6.215);
      expect(meta?.longitude).toBeCloseTo(106.83);

      // Verify relationship is linked to domain with GEOLOCATED_IN
      const rel = result.relationships.find((r) => r.relationship_type === 'GEOLOCATED_IN');
      expect(rel).toBeDefined();
      expect(rel?.source_value).toBe('acme-target.com');

      // Verify evidence
      const ev = result.evidence.find((e) => e.source_type === 'COMPANY_GEO_RECON');
      expect(ev).toBeDefined();
      expect((ev?.metadata as any)?.lat).toBeCloseTo(-6.215);
    });

    it('rejects SSRF malicious URLs gracefully', async () => {
      const result = await companyGeoCollector.run('http://169.254.169.254/latest/meta-data', {
        caseId: 'test-case-id',
        requestId: 'test-req-id',
        signal: new AbortController().signal,
      });

      expect(result.entities).toHaveLength(0);
      expect(result.warnings.some((w) => w.includes('SSRF guard'))).toBe(true);
    });

    it('correctly extracts Daarut Tauhiid Bandung location and avoids false-positive geocoding', async () => {
      const dtbsHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>SMK Daarut Tauhiid Boarding School Bandung &#8211; Sekolah Vokasi Berbasis Pesantren</title>
        </head>
        <body>
          <div class="footer-widget">
            <p>Kampus I : Jl. Gegerkalong Girang Komplek Setiabudi Indah Kav. 25-26 Bandung 40153</p>
            <p>Kampus II : Jl. Cigugur Girang no.33, Parongpong, Kabupaten Bandung Barat, Jawa barat 40559</p>
          </div>
        </body>
        </html>
      `;

      vi.spyOn(ssrfModule, 'safeFetch').mockImplementation(async (url: string) => {
        if (url.includes('photon.komoot.io') || url.includes('nominatim.openstreetmap.org')) {
          return {
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
          } as any;
        }
        return {
          status: 200,
          headers: new Headers({ 'content-type': 'text/html' }),
        } as any;
      });

      vi.spyOn(ssrfModule, 'readResponseWithLimit').mockImplementation(async (res: any) => {
        if (res.headers.get('content-type')?.includes('application/json')) {
          // Return Bandung coordinates for Daarut Tauhiid / Gegerkalong
          return JSON.stringify({
            features: [
              {
                geometry: { coordinates: [107.591, -6.8625] },
                properties: {
                  name: 'SMP Daarut Tauhiid Boarding School Bandung',
                  city: 'Bandung',
                  state: 'Jawa Barat',
                },
              },
            ],
          });
        }
        return dtbsHtml;
      });

      const result = await companyGeoCollector.run('smkdtbs.sch.id', {
        caseId: 'case-dtbs-1',
        requestId: 'req-dtbs-1',
        signal: new AbortController().signal,
      });

      expect(result.entities.length).toBeGreaterThan(0);
      const loc = result.entities.find((e) => e.type === 'LOCATION');
      expect(loc).toBeDefined();
      const meta = loc?.metadata as any;
      expect(meta.companyDomain).toBe('smkdtbs.sch.id');
      // Coordinates should be in Bandung (-6.86, 107.59)
      expect(meta.latitude).toBeCloseTo(-6.8625, 2);
      expect(meta.longitude).toBeCloseTo(107.591, 2);
      // Address must be the Bandung campus address
      expect(meta.address).toContain('Gegerkalong Girang');
      // Must NOT be Tanjung Enim or South Sumatra
      expect(meta.address).not.toContain('Tanjung Enim');
      expect(meta.address).not.toContain('PTBA');
    });
  });
});
