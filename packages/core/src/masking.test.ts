import { describe, it, expect, beforeEach } from 'vitest';
import { MaskRule } from '../src/models';
import { MaskEngine } from '../src/masking';

describe('MaskEngine', () => {
  let engine: MaskEngine;

  beforeEach(() => {
    engine = new MaskEngine();
  });

  it('should return content unchanged when no rules exist', () => {
    const result = engine.mask('Hello, world!');
    expect(result).toBe('Hello, world!');
  });

  it('should mask content with a single rule', () => {
    const rule: MaskRule = {
      id: 'rule-1',
      name: 'Email Mask',
      pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g,
      replacement: '[EMAIL]',
      enabled: true,
    };

    engine.addRule(rule);
    const result = engine.mask('Contact me at test@example.com');

    expect(result).toBe('Contact me at [EMAIL]');
  });

  it('should mask multiple occurrences', () => {
    const rule: MaskRule = {
      id: 'rule-1',
      name: 'Email Mask',
      pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g,
      replacement: '[EMAIL]',
      enabled: true,
    };

    engine.addRule(rule);
    const result = engine.mask('Email alice@test.com and bob@test.com');

    expect(result).toBe('Email [EMAIL] and [EMAIL]');
  });

  it('should skip disabled rules', () => {
    const rule: MaskRule = {
      id: 'rule-1',
      name: 'Disabled Rule',
      pattern: /secret/gi,
      replacement: '[HIDDEN]',
      enabled: false,
    };

    engine.addRule(rule);
    const result = engine.mask('This is a secret message');

    expect(result).toBe('This is a secret message');
  });

  it('should mask with multiple rules', () => {
    const emailRule: MaskRule = {
      id: 'email',
      name: 'Email Mask',
      pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g,
      replacement: '[EMAIL]',
      enabled: true,
    };

    const phoneRule: MaskRule = {
      id: 'phone',
      name: 'Phone Mask',
      pattern: /\d{3}-\d{3}-\d{4}/g,
      replacement: '[PHONE]',
      enabled: true,
    };

    engine.addRule(emailRule);
    engine.addRule(phoneRule);

    const result = engine.mask('Contact: user@test.com, 555-123-4567');

    expect(result).toBe('Contact: [EMAIL], [PHONE]');
  });

  it('should remove a rule', () => {
    const rule: MaskRule = {
      id: 'rule-1',
      name: 'Test Rule',
      pattern: /test/g,
      replacement: '[MASKED]',
      enabled: true,
    };

    engine.addRule(rule);
    engine.removeRule('rule-1');

    const result = engine.mask('This is a test string');
    expect(result).toBe('This is a test string');
  });

  it('should set all rules at once', () => {
    const rule: MaskRule = {
      id: 'rule-1',
      name: 'Test Rule',
      pattern: /hello/g,
      replacement: '[HI]',
      enabled: true,
    };

    engine.setRules([rule]);
    const result = engine.mask('hello world');

    expect(result).toBe('[HI] world');
  });

  it('should get all rules', () => {
    const rule1: MaskRule = {
      id: 'rule-1',
      name: 'Rule 1',
      pattern: /test1/g,
      replacement: '[1]',
      enabled: true,
    };
    const rule2: MaskRule = {
      id: 'rule-2',
      name: 'Rule 2',
      pattern: /test2/g,
      replacement: '[2]',
      enabled: true,
    };

    engine.addRule(rule1);
    engine.addRule(rule2);

    const rules = engine.getRules();
    expect(rules).toHaveLength(2);
    expect(rules[0].name).toBe('Rule 1');
    expect(rules[1].name).toBe('Rule 2');
  });

  it('should generate a masked hash', () => {
    const rule: MaskRule = {
      id: 'rule-1',
      name: 'Email Mask',
      pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g,
      replacement: '[EMAIL]',
      enabled: true,
    };

    engine.addRule(rule);
    const hash1 = engine.getMaskedHash('user@test.com');
    const hash2 = engine.getMaskedHash('user@test.com');
    const hash3 = engine.getMaskedHash('plain text no email');

    expect(hash1).toBe(hash2);
    expect(hash3).not.toBe(hash1);
  });

  it('should handle empty content', () => {
    expect(engine.mask('')).toBe('');
    expect(engine.maskPreview('')).toBe('');
  });

  it('should handle null content', () => {
    expect(engine.mask(null as any)).toBeNull();
  });

  // --- PII Token Tests ---

  it('should mask SSN tokens', () => {
    const rule: MaskRule = {
      id: 'ssn',
      name: 'SSN Mask',
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      replacement: '[SSN]',
      enabled: true,
    };

    engine.addRule(rule);
    const result = engine.mask('My SSN is 123-45-6789 and also 987-65-4321');
    expect(result).toBe('My SSN is [SSN] and also [SSN]');
  });

  it('should mask credit card numbers', () => {
    const rule: MaskRule = {
      id: 'cc',
      name: 'Credit Card Mask',
      pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
      replacement: '[CC]',
      enabled: true,
    };

    engine.addRule(rule);
    const result = engine.mask('Card: 4111-1111-1111-1111');
    expect(result).toBe('Card: [CC]');

    const result2 = engine.mask('Card: 4111 1111 1111 1111');
    expect(result2).toBe('Card: [CC]');

    const result3 = engine.mask('Card: 4111111111111111');
    expect(result3).toBe('Card: [CC]');
  });

  it('should mask phone numbers in various formats', () => {
    const rule: MaskRule = {
      id: 'phone',
      name: 'Phone Mask',
      pattern: /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
      replacement: '[PHONE]',
      enabled: true,
    };

    engine.addRule(rule);
    expect(engine.mask('Call 555-123-4567')).toBe('Call [PHONE]');
    expect(engine.mask('Call (555) 123-4567')).toBe('Call [PHONE]');
    expect(engine.mask('Call 555.123.4567')).toBe('Call [PHONE]');
    expect(engine.mask('Call 5551234567')).toBe('Call [PHONE]');
  });

  it('should mask IP addresses', () => {
    const rule: MaskRule = {
      id: 'ip',
      name: 'IP Mask',
      pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
      replacement: '[IP]',
      enabled: true,
    };

    engine.addRule(rule);
    const result = engine.mask('Server at 192.168.1.1 and 10.0.0.255');
    expect(result).toBe('Server at [IP] and [IP]');
  });

  it('should mask multiple PII types in one string', () => {
    const emailRule: MaskRule = {
      id: 'email',
      name: 'Email Mask',
      pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g,
      replacement: '[EMAIL]',
      enabled: true,
    };
    const phoneRule: MaskRule = {
      id: 'phone',
      name: 'Phone Mask',
      pattern: /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
      replacement: '[PHONE]',
      enabled: true,
    };
    const ssnRule: MaskRule = {
      id: 'ssn',
      name: 'SSN Mask',
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      replacement: '[SSN]',
      enabled: true,
    };

    engine.addRule(emailRule);
    engine.addRule(phoneRule);
    engine.addRule(ssnRule);

    const result = engine.mask(
      'Contact: user@test.com, 555-123-4567, SSN: 123-45-6789'
    );
    expect(result).toBe('Contact: [EMAIL], [PHONE], SSN: [SSN]');
  });

  it('should mask API keys and tokens', () => {
    const rule: MaskRule = {
      id: 'apikey',
      name: 'API Key Mask',
      pattern: /(?:api[_-]?key|token|secret)[\s]*[:=][\s]*["']?[\w-]{16,}["']?/gi,
      replacement: '[KEY]',
      enabled: true,
    };

    engine.addRule(rule);
    // The regex matches the entire key-value pair including the key name
    const result = engine.mask('api_key: abcdefghijklmnop1234');
    expect(result).toBe('[KEY]');

    const result2 = engine.mask('token = "sk_live_abcdefghijklmnop"');
    expect(result2).toBe('[KEY]');
  });

  it('should mask AWS access keys', () => {
    const rule: MaskRule = {
      id: 'aws',
      name: 'AWS Key Mask',
      pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
      replacement: '[AWS_KEY]',
      enabled: true,
    };

    engine.addRule(rule);
    const result = engine.mask('Key: AKIAIOSFODNN7EXAMPLE');
    expect(result).toBe('Key: [AWS_KEY]');
  });

  it('should mask GitHub tokens', () => {
    const rule: MaskRule = {
      id: 'github',
      name: 'GitHub Token Mask',
      pattern: /ghp_[A-Za-z0-9]{36}/g,
      replacement: '[GITHUB_TOKEN]',
      enabled: true,
    };

    engine.addRule(rule);
    const result = engine.mask('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
    expect(result).toBe('[GITHUB_TOKEN]');
  });

  it('should mask passwords in key-value pairs', () => {
    const rule: MaskRule = {
      id: 'password',
      name: 'Password Mask',
      pattern: /(?:password|passwd|pwd)[\s]*[:=][\s]*["']?[^"'\s}]+["']?/gi,
      replacement: '[PASSWORD]',
      enabled: true,
    };

    engine.addRule(rule);
    // The regex matches the entire key-value pair including the key name
    const result = engine.mask('password: mysecret123');
    expect(result).toBe('[PASSWORD]');

    const result2 = engine.mask('passwd="hunter2"');
    expect(result2).toBe('[PASSWORD]');
  });

  it('should handle overlapping patterns gracefully', () => {
    const emailRule: MaskRule = {
      id: 'email',
      name: 'Email Mask',
      pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g,
      replacement: '[EMAIL]',
      enabled: true,
    };
    const phoneRule: MaskRule = {
      id: 'phone',
      name: 'Phone Mask',
      pattern: /\d{3}-\d{3}-\d{4}/g,
      replacement: '[PHONE]',
      enabled: true,
    };

    engine.addRule(emailRule);
    engine.addRule(phoneRule);

    // No overlap here, both should work independently
    const result = engine.mask('user@test.com and 555-123-4567');
    expect(result).toBe('[EMAIL] and [PHONE]');
  });

  it('should handle content with no matching patterns', () => {
    const rule: MaskRule = {
      id: 'email',
      name: 'Email Mask',
      pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g,
      replacement: '[EMAIL]',
      enabled: true,
    };

    engine.addRule(rule);
    const result = engine.mask('This is plain text with no sensitive data');
    expect(result).toBe('This is plain text with no sensitive data');
  });

  it('should maskPreview return same as mask', () => {
    const rule: MaskRule = {
      id: 'email',
      name: 'Email Mask',
      pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g,
      replacement: '[EMAIL]',
      enabled: true,
    };

    engine.addRule(rule);
    const content = 'user@test.com';
    expect(engine.maskPreview(content)).toBe(engine.mask(content));
  });
});
