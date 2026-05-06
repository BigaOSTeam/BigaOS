/**
 * Loads bundled user-facing Markdown docs and their per-language manifests.
 *
 * Source of truth lives at `docs/user/<lang>/` at the repo root so the same
 * tree can drive a future website. Vite's eager glob import inlines every
 * file at build time — no fetch, no race, works fully offline.
 */
import type { LanguageCode } from '../i18n/languages';

export interface ArticleRef {
  slug: string;
  title: string;
}

export interface ManifestSection {
  id: string;
  title: string;
  articles: ArticleRef[];
}

export interface Manifest {
  languageName: string;
  sections: ManifestSection[];
  /**
   * Optional id of a built-in section. Plugin-supplied sections are rendered
   * immediately *before* this section in the sidebar. Falsy / missing /
   * unmatched: plugins render after all built-in sections.
   */
  pluginsBefore?: string;
}

const FALLBACK_LANG = 'en';

// import.meta.glob resolves relative to this file. From client/src/help/ the
// path to repo-root docs is ../../../docs/user/...
const manifestModules = import.meta.glob<Manifest>(
  '../../../docs/user/*/manifest.json',
  { eager: true, import: 'default' },
);

const articleModules = import.meta.glob<string>(
  '../../../docs/user/*/*.md',
  { eager: true, query: '?raw', import: 'default' },
);

/** lang -> Manifest */
const manifests: Record<string, Manifest> = {};
for (const [path, manifest] of Object.entries(manifestModules)) {
  const m = path.match(/\/docs\/user\/([^/]+)\/manifest\.json$/);
  if (m) manifests[m[1]] = manifest;
}

/** "lang/slug" -> markdown source */
const articles: Record<string, string> = {};
for (const [path, source] of Object.entries(articleModules)) {
  const m = path.match(/\/docs\/user\/([^/]+)\/([^/]+)\.md$/);
  if (m) articles[`${m[1]}/${m[2]}`] = source;
}

export function getManifest(lang: LanguageCode): Manifest {
  return manifests[lang] || manifests[FALLBACK_LANG] || { languageName: lang, sections: [] };
}

export interface ArticleResult {
  source: string;
  /** True when the requested language wasn't available and we fell back. */
  fallback: boolean;
  /** Language actually returned. */
  lang: LanguageCode;
}

export function getArticle(lang: LanguageCode, slug: string): ArticleResult | null {
  const direct = articles[`${lang}/${slug}`];
  if (direct !== undefined) {
    return { source: direct, fallback: false, lang };
  }
  const fallback = articles[`${FALLBACK_LANG}/${slug}`];
  if (fallback !== undefined) {
    return { source: fallback, fallback: true, lang: FALLBACK_LANG };
  }
  return null;
}

/** Flat list of every article in the current language for search. */
export interface SearchableArticle {
  slug: string;
  title: string;
  sectionId: string;
  sectionTitle: string;
  source: string;
}

export function getSearchableArticles(lang: LanguageCode): SearchableArticle[] {
  const manifest = getManifest(lang);
  const out: SearchableArticle[] = [];
  for (const section of manifest.sections) {
    for (const article of section.articles) {
      const result = getArticle(lang, article.slug);
      if (!result) continue;
      out.push({
        slug: article.slug,
        title: article.title,
        sectionId: section.id,
        sectionTitle: section.title,
        source: result.source,
      });
    }
  }
  return out;
}
