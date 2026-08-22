import { describe, it, expect } from 'vitest';
import { validateUrl } from '../security/ssrf.js';

describe('SSRF Defense-in-Depth Tests', () => {
  it('should allow legitimate public HTTP/HTTPS URLs', () => {
    expect(validateUrl('https://example.com').safe).toBe(true);
    expect(validateUrl('https://sub.domain.org/path?param=1').safe).toBe(true);
    expect(validateUrl('http://93.184.216.34').safe).toBe(true);
  });

  it('should block non-HTTP/HTTPS protocols', () => {
    expect(validateUrl('file:///etc/passwd').safe).toBe(false);
    expect(validateUrl('gopher://127.0.0.1:70/').safe).toBe(false);
    expect(validateUrl('ftp://example.com').safe).toBe(false);
    expect(validateUrl('dict://127.0.0.1:11211/').safe).toBe(false);
  });

  it('should block URLs with credentials', () => {
    expect(validateUrl('https://admin:password@example.com').safe).toBe(false);
  });

  it('should block localhost variants', () => {
    expect(validateUrl('http://localhost').safe).toBe(false);
    expect(validateUrl('http://localhost:8080').safe).toBe(false);
    expect(validateUrl('http://127.0.0.1').safe).toBe(false);
    expect(validateUrl('http://127.0.0.1:3000').safe).toBe(false);
    expect(validateUrl('http://0.0.0.0').safe).toBe(false);
    expect(validateUrl('http://[::1]').safe).toBe(false);
    expect(validateUrl('http://test.localhost').safe).toBe(false);
  });

  it('should block private RFC1918 IPv4 ranges', () => {
    // 10.0.0.0/8
    expect(validateUrl('http://10.0.0.1').safe).toBe(false);
    expect(validateUrl('http://10.255.255.254').safe).toBe(false);

    // 172.16.0.0/12
    expect(validateUrl('http://172.16.0.1').safe).toBe(false);
    expect(validateUrl('http://172.31.255.254').safe).toBe(false);

    // 192.168.0.0/16
    expect(validateUrl('http://192.168.1.1').safe).toBe(false);
    expect(validateUrl('http://192.168.0.254').safe).toBe(false);
  });

  it('should block Cloud Metadata Service destinations (IMDS)', () => {
    // AWS / GCP / Azure IMDS
    expect(validateUrl('http://169.254.169.254/latest/meta-data/').safe).toBe(false);
    // AWS ECS metadata
    expect(validateUrl('http://169.254.170.2').safe).toBe(false);
    // Alibaba Cloud metadata
    expect(validateUrl('http://100.100.100.200').safe).toBe(false);
  });

  it('should block link-local and CGNAT ranges', () => {
    expect(validateUrl('http://169.254.1.1').safe).toBe(false);
    expect(validateUrl('http://100.64.0.1').safe).toBe(false);
  });

  it('should reject malformed URLs gracefully', () => {
    expect(validateUrl('not-a-url').safe).toBe(false);
    expect(validateUrl('http://').safe).toBe(false);
    expect(validateUrl('://invalid').safe).toBe(false);
  });
});
