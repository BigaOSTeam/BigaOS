import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { marked } from 'marked';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { ViewLayout } from '../views/shared/ViewLayout';
import { usePlugins } from '../../context/PluginContext';
import { useTutorial } from '../../context/TutorialContext';
import {
  getManifest,
  getArticle,
  getSearchableArticles,
  type Manifest,
} from '../../help/loader';

interface HelpViewProps {
  onClose: () => void;
  initialSlug?: string;
}

const MOBILE_BREAKPOINT = 720;

/**
 * An article identifier. Either a bare slug for built-in BigaOS articles,
 * or `plugin:<pluginId>:<slug>` for plugin-supplied articles. Namespacing
 * keeps plugin slugs from colliding with built-in ones.
 */
type ArticleKey = string;

const PLUGIN_KEY_PREFIX = 'plugin:';

function makePluginKey(pluginId: string, slug: string): ArticleKey {
  return `${PLUGIN_KEY_PREFIX}${pluginId}:${slug}`;
}

function parsePluginKey(key: ArticleKey): { pluginId: string; slug: string } | null {
  if (!key.startsWith(PLUGIN_KEY_PREFIX)) return null;
  const rest = key.slice(PLUGIN_KEY_PREFIX.length);
  const colon = rest.indexOf(':');
  if (colon < 0) return null;
  return { pluginId: rest.slice(0, colon), slug: rest.slice(colon + 1) };
}

interface ResolvedArticle {
  source: string;
  fallback: boolean;
  lang: string;
  title: string;
}

export const HelpView: React.FC<HelpViewProps> = ({ onClose, initialSlug }) => {
  const { theme } = useTheme();
  const { t, language } = useLanguage();
  const { getPluginHelpSections } = usePlugins();
  const { open: openTutorial } = useTutorial();

  const manifest: Manifest = useMemo(() => getManifest(language), [language]);
  const builtInSearchable = useMemo(() => getSearchableArticles(language), [language]);
  const pluginSections = useMemo(() => getPluginHelpSections(language), [getPluginHelpSections, language]);

  // First built-in article is the fallback default.
  const firstBuiltIn =
    manifest.sections.find((s) => s.articles.length > 0)?.articles[0]?.slug ?? null;
  const [activeKey, setActiveKey] = useState<ArticleKey | null>(initialSlug ?? firstBuiltIn);
  const [search, setSearch] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= MOBILE_BREAKPOINT);
  const [showListOnMobile, setShowListOnMobile] = useState(!initialSlug);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0 });
  }, [activeKey]);

  // Resolve the active key to its article body, supporting both built-in
  // and plugin-namespaced keys. Returns null if the article doesn't exist.
  const article: ResolvedArticle | null = useMemo(() => {
    if (!activeKey) return null;
    const plugin = parsePluginKey(activeKey);
    if (plugin) {
      const section = pluginSections.find((s) => s.pluginId === plugin.pluginId);
      const a = section?.articles.find((a) => a.slug === plugin.slug);
      if (!a) return null;
      return { source: a.source, fallback: a.fallback, lang: a.lang, title: a.title };
    }
    const result = getArticle(language, activeKey);
    if (!result) return null;
    // Look up the title from the manifest so the header matches the sidebar.
    let title = activeKey;
    for (const section of manifest.sections) {
      const found = section.articles.find((a) => a.slug === activeKey);
      if (found) { title = found.title; break; }
    }
    return { source: result.source, fallback: result.fallback, lang: result.lang, title };
  }, [activeKey, language, manifest, pluginSections]);

  const renderedHtml = useMemo(() => {
    if (!article) return '';
    return marked.parse(article.source, { async: false }) as string;
  }, [article]);

  // Search across built-in + plugin articles. Returns null while idle.
  const searchedKeys: Set<ArticleKey> | null = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const hits = new Set<ArticleKey>();
    for (const a of builtInSearchable) {
      if (a.title.toLowerCase().includes(q) || a.source.toLowerCase().includes(q)) {
        hits.add(a.slug);
      }
    }
    for (const section of pluginSections) {
      for (const a of section.articles) {
        if (
          a.title.toLowerCase().includes(q) ||
          a.source.toLowerCase().includes(q) ||
          section.pluginName.toLowerCase().includes(q)
        ) {
          hits.add(makePluginKey(section.pluginId, a.slug));
        }
      }
    }
    return hits;
  }, [search, builtInSearchable, pluginSections]);

  // Internal markdown links. Recognised forms:
  //   bigaos:<action>   — in-app actions (e.g. `bigaos:tutorial` to replay the tour)
  //   <slug>            — jump to a built-in article in this view
  // Anything else (https:, mailto:, #fragment) is left to the browser.
  const handleContentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;
      const href = target.getAttribute('href') || '';

      if (href.startsWith('bigaos:')) {
        e.preventDefault();
        const action = href.slice('bigaos:'.length);
        if (action === 'tutorial') openTutorial();
        return;
      }

      if (/^(https?:|mailto:|#)/i.test(href)) return;

      const slug = href.replace(/\.md$/, '').replace(/^\.?\//, '');
      if (slug && builtInSearchable.some((a) => a.slug === slug)) {
        e.preventDefault();
        setActiveKey(slug);
        if (isMobile) setShowListOnMobile(false);
      }
    },
    [builtInSearchable, isMobile, openTutorial],
  );

  const pickKey = (key: ArticleKey) => {
    setActiveKey(key);
    if (isMobile) setShowListOnMobile(false);
  };

  const sectionDivider = (label: string) => (
    <div
      style={{
        padding: `${theme.space.sm} ${theme.space.md}`,
        fontSize: '0.7rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: theme.colors.textMuted,
      }}
    >
      {label}
    </div>
  );

  const renderArticleButton = (key: ArticleKey, title: string) => {
    const isActive = key === activeKey;
    return (
      <button
        key={key}
        onClick={() => pickKey(key)}
        className="touch-btn"
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: `${theme.space.sm} ${theme.space.md}`,
          marginBottom: '2px',
          background: isActive ? theme.colors.primaryLight : 'transparent',
          border: 'none',
          borderRadius: theme.radius.md,
          color: isActive ? theme.colors.textPrimary : theme.colors.textSecondary,
          fontSize: '0.95rem',
          fontWeight: isActive ? 600 : 400,
          cursor: 'pointer',
        }}
      >
        {title}
      </button>
    );
  };

  // Compose the sidebar list in order: built-in sections in manifest order,
  // with plugin sections inserted right before whichever built-in section's
  // id matches `pluginsBefore`. Sections (built-in or plugin) with zero
  // matching articles after the search filter are skipped silently.
  const renderBuiltInSection = (section: typeof manifest.sections[number]) => {
    const visibleArticles = searchedKeys
      ? section.articles.filter((a) => searchedKeys.has(a.slug))
      : section.articles;
    if (visibleArticles.length === 0) return null;
    return (
      <div key={section.id} style={{ marginBottom: theme.space.md }}>
        {sectionDivider(section.title)}
        {visibleArticles.map((a) => renderArticleButton(a.slug, a.title))}
      </div>
    );
  };

  const renderPluginSection = (section: typeof pluginSections[number]) => {
    const visibleArticles = searchedKeys
      ? section.articles.filter((a) =>
          searchedKeys.has(makePluginKey(section.pluginId, a.slug)),
        )
      : section.articles;
    if (visibleArticles.length === 0) return null;
    return (
      <div key={`plugin-${section.pluginId}`} style={{ marginBottom: theme.space.md }}>
        {sectionDivider(section.pluginName)}
        {visibleArticles.map((a) =>
          renderArticleButton(makePluginKey(section.pluginId, a.slug), a.title),
        )}
      </div>
    );
  };

  const pluginsBeforeId = manifest.pluginsBefore;
  const pluginsInserted = !pluginsBeforeId
    ? false
    : !manifest.sections.some((s) => s.id === pluginsBeforeId);
  const sidebarBlocks: React.ReactNode[] = [];
  let pluginsPlaced = pluginsInserted; // skip insertion if marker is missing
  for (const section of manifest.sections) {
    if (!pluginsPlaced && section.id === pluginsBeforeId) {
      sidebarBlocks.push(...pluginSections.map(renderPluginSection));
      pluginsPlaced = true;
    }
    sidebarBlocks.push(renderBuiltInSection(section));
  }
  // Fallback: marker unmatched or missing — append plugin sections at the end.
  if (!pluginsPlaced) {
    sidebarBlocks.push(...pluginSections.map(renderPluginSection));
  }

  const sidebar = (
    <div
      style={{
        width: isMobile ? '100%' : '260px',
        flexShrink: 0,
        borderRight: isMobile ? 'none' : `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        background: theme.colors.bgSecondary,
        minHeight: 0,
      }}
    >
      <div style={{ padding: theme.space.md, borderBottom: `1px solid ${theme.colors.border}` }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('help.search_placeholder')}
          style={{
            width: '100%',
            padding: `${theme.space.sm} ${theme.space.md}`,
            background: theme.colors.bgCard,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            color: theme.colors.textPrimary,
            fontSize: '0.9rem',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: theme.space.sm }}>
        {searchedKeys && searchedKeys.size === 0 && (
          <div
            style={{
              padding: theme.space.lg,
              color: theme.colors.textMuted,
              fontSize: '0.9rem',
              textAlign: 'center',
            }}
          >
            {t('help.no_results')}
          </div>
        )}

        {sidebarBlocks}
      </div>
    </div>
  );

  const content = (
    <div
      ref={contentScrollRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        minHeight: 0,
        minWidth: 0,
      }}
    >
      {isMobile && !showListOnMobile && (
        <button
          onClick={() => setShowListOnMobile(true)}
          className="touch-btn"
          style={{
            margin: theme.space.md,
            padding: `${theme.space.sm} ${theme.space.md}`,
            background: theme.colors.bgCard,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            color: theme.colors.textPrimary,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: theme.space.sm,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          {t('help.title')}
        </button>
      )}

      {article ? (
        <>
          {article.fallback && (
            <div
              style={{
                margin: `${theme.space.lg} ${theme.space.xl} 0 ${theme.space.xl}`,
                padding: theme.space.md,
                background: theme.colors.warningLight,
                border: `1px solid ${theme.colors.warning}`,
                borderRadius: theme.radius.md,
                color: theme.colors.textPrimary,
                fontSize: '0.85rem',
              }}
            >
              {t('help.fallback_notice')}
            </div>
          )}
          <div
            className="help-article-body"
            onClick={handleContentClick}
            style={{
              padding: `${theme.space.xl} clamp(${theme.space.lg}, 5vw, 48px)`,
              maxWidth: '780px',
              color: theme.colors.textPrimary,
              fontSize: '1rem',
              lineHeight: 1.65,
            }}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </>
      ) : (
        <div
          style={{
            padding: theme.space['3xl'],
            color: theme.colors.textMuted,
            fontSize: '1rem',
            textAlign: 'center',
          }}
        >
          {activeKey ? t('help.article_missing') : t('help.empty')}
        </div>
      )}
    </div>
  );

  return (
    <ViewLayout title={t('help.title')} onClose={onClose}>
      <HelpStyles />
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          flexDirection: isMobile ? 'column' : 'row',
        }}
      >
        {(!isMobile || showListOnMobile) && sidebar}
        {(!isMobile || !showListOnMobile) && content}
      </div>
    </ViewLayout>
  );
};

// Article body styles — kept local so they only target the help view.
const HelpStyles: React.FC = () => (
  <style>{`
    .help-article-body h1 {
      font-size: 1.6rem;
      font-weight: 700;
      margin: 0 0 1rem 0;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--color-border, rgba(255,255,255,0.1));
    }
    .help-article-body h2 {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 1.75rem 0 0.75rem 0;
    }
    .help-article-body h3 {
      font-size: 1.05rem;
      font-weight: 600;
      margin: 1.25rem 0 0.5rem 0;
    }
    .help-article-body p {
      margin: 0.75rem 0;
    }
    .help-article-body ul,
    .help-article-body ol {
      margin: 0.75rem 0;
      padding-left: 1.5rem;
    }
    .help-article-body li {
      margin: 0.25rem 0;
    }
    .help-article-body code {
      background: rgba(255,255,255,0.08);
      padding: 0.1em 0.35em;
      border-radius: 4px;
      font-size: 0.9em;
    }
    .help-article-body pre {
      background: rgba(0,0,0,0.35);
      padding: 0.75rem 1rem;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 0.85rem;
    }
    .help-article-body pre code {
      background: none;
      padding: 0;
    }
    .help-article-body blockquote {
      margin: 1rem 0;
      padding: 0.5rem 1rem;
      border-left: 3px solid rgba(25, 118, 210, 0.6);
      background: rgba(25, 118, 210, 0.08);
      border-radius: 0 6px 6px 0;
      color: rgba(255,255,255,0.85);
    }
    .help-article-body a {
      color: #4fc3f7;
      text-decoration: none;
      border-bottom: 1px dotted rgba(79,195,247,0.5);
      cursor: pointer;
    }
    .help-article-body a:hover {
      border-bottom-style: solid;
    }
    .help-article-body strong { font-weight: 600; }
    .help-article-body em { color: rgba(255,255,255,0.85); }
    .help-article-body hr {
      border: none;
      border-top: 1px solid rgba(255,255,255,0.1);
      margin: 1.5rem 0;
    }
    .help-article-body table {
      border-collapse: collapse;
      margin: 1rem 0;
    }
    .help-article-body th,
    .help-article-body td {
      border: 1px solid rgba(255,255,255,0.1);
      padding: 0.4rem 0.75rem;
      text-align: left;
    }
    .help-article-body th {
      background: rgba(255,255,255,0.04);
      font-weight: 600;
    }
  `}</style>
);
