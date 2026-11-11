import { Snippet } from './models';

export class SnippetEngine {
  private snippets: Snippet[];

  constructor(snippets: Snippet[] = []) {
    this.snippets = snippets;
  }

  addSnippet(snippet: Snippet): void {
    this.snippets.push(snippet);
  }

  removeSnippet(id: string): void {
    this.snippets = this.snippets.filter((s) => s.id !== id);
  }

  setSnippets(snippets: Snippet[]): void {
    this.snippets = snippets;
  }

  getSnippets(): Snippet[] {
    return this.snippets;
  }

  getSnippet(id: string): Snippet | undefined {
    return this.snippets.find((s) => s.id === id);
  }

  resolvePlaceholders(snippet: Snippet, context: Record<string, string>): string {
    let result = snippet.content;
    for (const placeholder of snippet.placeholders) {
      const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
      const value = context[placeholder] || `{{${placeholder}}}`;
      result = result.replace(regex, value);
    }
    return result;
  }

  extractPlaceholders(content: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const placeholders: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (!placeholders.includes(match[1])) {
        placeholders.push(match[1]);
      }
    }
    return placeholders;
  }

  searchSnippets(query: string): Snippet[] {
    const lowerQuery = query.toLowerCase();
    return this.snippets.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) ||
        s.content.toLowerCase().includes(lowerQuery)
    );
  }
}
