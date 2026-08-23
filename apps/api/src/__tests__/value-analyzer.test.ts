import { describe, it, expect } from 'vitest';
import { analyzeValue, inferEffectiveInputType } from '../discovery/value-analyzer.js';

describe('Value Analyzer — Pattern Detection Matrix', () => {
  it('should correctly analyze username string without symbol', () => {
    const res = analyzeValue('candalenaa');
    expect(res.isUsername).toBe(true);
    expect(res.extractedUsername).toBe('candalenaa');
    expect(res.isUrl).toBe(false);
    expect(res.isDomain).toBe(false);
    expect(res.isEmail).toBe(false);
    expect(res.isIpAddress).toBe(false);
  });

  it('should correctly analyze @username handle', () => {
    const res = analyzeValue('@octocat');
    expect(res.isUsername).toBe(true);
    expect(res.extractedUsername).toBe('octocat');
  });

  it('should correctly analyze email address', () => {
    const res = analyzeValue('investigator@targetdomain.com');
    expect(res.isEmail).toBe(true);
    expect(res.extractedUsername).toBe('investigator');
    expect(res.extractedDomain).toBe('targetdomain.com');
    expect(res.isUrl).toBe(false);
    expect(res.isIpAddress).toBe(false);
  });

  it('should correctly analyze domain name', () => {
    const res = analyzeValue('evilcorp.com');
    expect(res.isDomain).toBe(true);
    expect(res.extractedDomain).toBe('evilcorp.com');
    expect(res.isUrl).toBe(false);
    expect(res.isEmail).toBe(false);
  });

  it('should correctly analyze IPv4 address', () => {
    const res = analyzeValue('192.168.1.100');
    expect(res.isIpAddress).toBe(true);
    expect(res.isDomain).toBe(false);
    expect(res.isUrl).toBe(false);
  });

  it('should correctly analyze social profile URLs and extract username', () => {
    const igRes = analyzeValue('https://instagram.com/candalenaa');
    expect(igRes.isUrl).toBe(true);
    expect(igRes.isUsername).toBe(true);
    expect(igRes.extractedUsername).toBe('candalenaa');
    expect(igRes.extractedDomain).toBe('instagram.com');

    const ghRes = analyzeValue('https://github.com/octocat');
    expect(ghRes.isUrl).toBe(true);
    expect(ghRes.isUsername).toBe(true);
    expect(ghRes.extractedUsername).toBe('octocat');

    const medRes = analyzeValue('https://medium.com/@johndoe');
    expect(medRes.isUrl).toBe(true);
    expect(medRes.isUsername).toBe(true);
    expect(medRes.extractedUsername).toBe('johndoe');

    const ytRes = analyzeValue('https://youtube.com/@techradar');
    expect(ytRes.isUrl).toBe(true);
    expect(ytRes.isUsername).toBe(true);
    expect(ytRes.extractedUsername).toBe('techradar');
  });

  it('should infer effective input type accurately for SOCIAL_PROFILE', () => {
    const usernameAnalysis = analyzeValue('candalenaa');
    expect(inferEffectiveInputType('SOCIAL_PROFILE', usernameAnalysis)).toBe('USERNAME');

    const urlAnalysis = analyzeValue('https://instagram.com/candalenaa');
    expect(inferEffectiveInputType('SOCIAL_PROFILE', urlAnalysis)).toBe('URL');

    const domainAnalysis = analyzeValue('twitter.com');
    expect(inferEffectiveInputType('SOCIAL_PROFILE', domainAnalysis)).toBe('DOMAIN');
  });
});
