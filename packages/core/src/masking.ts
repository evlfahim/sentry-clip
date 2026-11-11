import { MaskRule } from './models';

export class MaskEngine {
  private rules: MaskRule[];

  constructor(rules: MaskRule[] = []) {
    this.rules = rules;
  }

  addRule(rule: MaskRule): void {
    this.rules.push(rule);
  }

  removeRule(id: string): void {
    this.rules = this.rules.filter((r) => r.id !== id);
  }

  setRules(rules: MaskRule[]): void {
    this.rules = rules;
  }

  getRules(): MaskRule[] {
    return this.rules;
  }

  mask(content: string): string {
    if (!content) return content;
    let result = content;
    const enabledRules = this.rules.filter((r) => r.enabled);
    for (const rule of enabledRules) {
      result = result.replace(rule.pattern, rule.replacement);
    }
    return result;
  }

  maskPreview(content: string): string {
    return this.mask(content);
  }

  getMaskedHash(content: string): string {
    const masked = this.mask(content);
    return this.simpleHash(masked);
  }

  private simpleHash(str: string): string {
    // Use a more robust hash (FNV-1a variant)
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
}
