import { describe, it, expect } from 'vitest';
import {
  normalizeDomain,
  normalizeEmail,
  normalizeUrl,
  normalizeUsername,
  normalize,
} from '@nexusgraph/shared';

describe('Entity Normalizers Tests', () => {
  describe('Domain Normalizer', () => {
    it('should lowercase domains and strip trailing dot', () => {
      expect(normalizeDomain('EXAMPLE.COM.')).toBe('example.com');
      expect(normalizeDomain('Sub.Domain.Org.')).toBe('sub.domain.org');
    });

    it('should strip www. prefix for canonical correlation', () => {
      expect(normalizeDomain('www.example.com')).toBe('example.com');
      expect(normalizeDomain('WWW.TARGET.NET')).toBe('target.net');
    });

    it('should extract hostname if full URL is supplied', () => {
      expect(normalizeDomain('https://example.com/path?query=1')).toBe('example.com');
    });
  });

  describe('Email Normalizer', () => {
    it('should trim and lowercase domain and localpart', () => {
      expect(normalizeEmail('  Target.User@Example.COM  ')).toBe('target.user@example.com');
    });
  });

  describe('URL Normalizer', () => {
    it('should prepend https if missing and lowercase scheme/host', () => {
      expect(normalizeUrl('example.com/test/')).toBe('https://example.com/test');
    });

    it('should strip default ports 80 and 443', () => {
      expect(normalizeUrl('http://example.com:80/path')).toBe('http://example.com/path');
      expect(normalizeUrl('https://example.com:443/path')).toBe('https://example.com/path');
    });

    it('should preserve non-default ports', () => {
      expect(normalizeUrl('https://example.com:8443/path')).toBe('https://example.com:8443/path');
    });
  });

  describe('Username Normalizer', () => {
    it('should trim whitespace and lowercase', () => {
      expect(normalizeUsername('  HackerOne_Analyst  ')).toBe('hackerone_analyst');
    });
  });

  describe('Generic Normalizer Router', () => {
    it('should route according to entity type', () => {
      expect(normalize('DOMAIN', 'WWW.TARGET.COM')).toBe('target.com');
      expect(normalize('EMAIL', 'Admin@Target.COM')).toBe('admin@target.com');
      expect(normalize('USERNAME', 'AdminUser')).toBe('adminuser');
      expect(normalize('IP_ADDRESS', '  192.168.1.1  ')).toBe('192.168.1.1');
    });
  });
});
