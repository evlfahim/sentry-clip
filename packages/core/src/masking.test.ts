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
});
