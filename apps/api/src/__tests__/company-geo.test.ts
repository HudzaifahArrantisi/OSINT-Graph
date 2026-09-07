import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  companyGeoCollector,
  extractGoogleMapsLinks,
  extractSchemaOrgLocations,
  extractContactAddressText,
} from '../collectors/company-geo.js';
import * as ssrfModule from '../security/ssrf.js';

describe('company-geo collector & parser', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('supports DOMAIN, URL, WEBSITE, and ORGANIZATION input types', () => {
    expect(companyGeoCollector.supports('DOMAIN')).toBe(true);
    expect(companyGeoCollector.supports('URL')).toBe(true);
    expect(companyGeoCollector.supports('WEBSITE')).toBe(true);
    expect(companyGeoCollector.supports('ORGANIZATION')).toBe(true);
    expect(companyGeoCollector.supports('PHONE')).toBe(false);
  });

  describe('extractGoogleMapsLinks', () => {
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
      expect(locationEntity?.metadata.isCompanyGeo).toBe(true);
      expect(locationEntity?.metadata.companyDomain).toBe('acme-target.com');
      expect(locationEntity?.metadata.googleMapsUrl).toContain('maps');
      expect(locationEntity?.metadata.latitude).toBeCloseTo(-6.215);
      expect(locationEntity?.metadata.longitude).toBeCloseTo(106.83);

      // Verify relationship is linked to domain with GEOLOCATED_IN
      const rel = result.relationships.find((r) => r.relationship_type === 'GEOLOCATED_IN');
      expect(rel).toBeDefined();
      expect(rel?.source_value).toBe('acme-target.com');

      // Verify evidence
      const ev = result.evidence.find((e) => e.source_type === 'COMPANY_GEO_RECON');
      expect(ev).toBeDefined();
      expect(ev?.metadata.lat).toBeCloseTo(-6.215);
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
  });
});
