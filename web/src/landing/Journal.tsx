import { articleAt, articles, type JournalArticle } from "./articles.tsx";
import { JournalArt } from "./JournalArt.tsx";
import { Arrow } from "./ui.tsx";

export const articleHref = (article: JournalArticle) => `/journal/${article.slug}/`;
function ArticleMeta({ article }: { article: JournalArticle }) {
  return (
    <div className="journal-meta">
      <span>{article.topic}</span>
      <span>{article.minutes} min read</span>
    </div>
  );
}
function StoryLink({ article }: { article: JournalArticle }) {
  return (
    <article className="journal-story">
      <a
        className="journal-cover-link"
        href={articleHref(article)}
        aria-label={`Read: ${article.title}`}
      >
        <JournalArt kind={article.art} />
      </a>
      <div className="journal-story-copy">
        <h2>
          <a href={articleHref(article)}>
            {article.title}
            <Arrow diagonal />
          </a>
        </h2>
        <ArticleMeta article={article} />
        <p>{article.description}</p>
        <a className="journal-read-link" href={articleHref(article)}>
          Read the story <Arrow />
        </a>
      </div>
    </article>
  );
}
export function JournalTeaser() {
  return (
    <section className="journal-teaser" aria-labelledby="journal-teaser-title">
      <div>
        <h2 id="journal-teaser-title">
          The work behind
          <br />
          <em>the work.</em>
        </h2>
        <p>Research and field notes on coding agents, review and the evidence between them.</p>
        <a className="primary-link" href="/journal/">
          Explore the journal <Arrow />
        </a>
      </div>
      <a href={articleHref(articles[0])} className="journal-teaser-story">
        <JournalArt kind="context" />
        <span>
          {articles[0].title}
          <Arrow diagonal />
        </span>
      </a>
    </section>
  );
}
function JournalIndex() {
  return (
    <>
      <header className="journal-masthead">
        <h1>
          Field notes from
          <br />
          <em>the agent age.</em>
        </h1>
        <div>
          <p>
            On the work we delegate.
            <br /> And the work we still need to understand.
          </p>
          <span>Research, perspectives & practical review</span>
        </div>
      </header>
      <StoryLink article={articles[0]} />
      <div className="journal-stories">
        {articles.slice(1).map((article) => (
          <StoryLink key={article.slug} article={article} />
        ))}
      </div>
      <section className="journal-editor-note" aria-labelledby="editor-note-title">
        <div className="journal-pixel-seal" aria-hidden="true">
          <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <path
              d="M8 2h24v4h4v28h-4v4H8v-4H4V6h4zm2 6v24h20V8zM14 13h12v3H14zm0 6h12v3H14zm0 6h8v3h-8z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div>
          <h2 id="editor-note-title">Keep the evidence attached.</h2>
          <p>
            Every article links to its original sources, names the research dates and keeps the
            limitations in view. Practitioner stories are perspectives. Surveys describe reported
            experience. Quoli’s impact is something to measure.
          </p>
        </div>
        <a href="/landing/#product">
          Meet Quoli <Arrow />
        </a>
      </section>
    </>
  );
}
function ArticlePage({ article }: { article: JournalArticle }) {
  const related = articles.filter((a) => a.slug !== article.slug);
  return (
    <>
      <header className="article-heading">
        <div className="article-heading-copy">
          <h1>{article.title}</h1>
          <p>{article.description}</p>
          <ArticleMeta article={article} />
          <div className="article-byline">
            <span>By Quoli</span>
            <time dateTime="2026-11-13">13 November 2026</time>
          </div>
        </div>
        <div className="article-cover">
          <JournalArt kind={article.art} />
        </div>
      </header>
      <div className="article-layout">
        <aside className="article-sidebar">
          <details open>
            <summary>In this article</summary>
            <nav aria-label="Article sections">
              <ol>
                {article.sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>{section.title}</a>
                  </li>
                ))}
                <li>
                  <a href="#research-notes">Sources & research notes</a>
                </li>
              </ol>
            </nav>
          </details>
          <a href="/journal/" className="journal-back">
            <Arrow />
            All field notes
          </a>
        </aside>
        <div className="article-reading">
          {article.sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="article-section"
              aria-labelledby={`${section.id}-title`}
            >
              <h2 id={`${section.id}-title`}>{section.title}</h2>
              {section.body}
            </section>
          ))}
          <section
            className="article-sources"
            id="research-notes"
            aria-labelledby="research-notes-title"
          >
            <h2 id="research-notes-title">Sources & research notes</h2>
            <p className="article-source-intro">
              Primary sources checked 13 November 2026. Publication dates and the underlying
              research period are distinguished where available.
            </p>
            <ol>
              {article.sources.map((source, i) => (
                <li key={source.url} id={`source-${i + 1}`}>
                  <h3>
                    <a href={source.url}>
                      {source.name}
                      <Arrow diagonal />
                    </a>
                  </h3>
                  <p className="source-date">{source.date}</p>
                  <p>{source.method}</p>
                  <p>
                    <strong>Read with this in mind:</strong> {source.limit}
                  </p>
                </li>
              ))}
            </ol>
            <p className="article-disclosure">
              Written by Quoli about a problem its product addresses. The cited researchers and
              speakers have not endorsed Quoli. These articles are research-backed perspectives, not
              customer case studies or evidence of measured Quoli outcomes.
            </p>
          </section>
          <div className="article-product-link">
            <h2>Follow the evidence.</h2>
            <p>
              Explore the connected view of agent activity, code, Git and repository infrastructure.
            </p>
            <a className="button" href="/landing/#product">
              See Quoli in action <Arrow />
            </a>
          </div>
        </div>
      </div>
      <nav className="journal-related" aria-label="More articles">
        <h2>Keep following the thread.</h2>
        <div>
          {related.map((a) => (
            <a href={articleHref(a)} key={a.slug}>
              <strong>{a.title}</strong>
              <Arrow />
              <span>{a.topic}</span>
            </a>
          ))}
        </div>
      </nav>
    </>
  );
}
export function Journal({ pathname }: { pathname: string }) {
  const article = articleAt(pathname);
  const index = pathname === "/journal/";
  return (
    <main id="main" className={`journal${index ? " journal-index" : " journal-article"}`}>
      {/* THESIS: Read the work behind agent output. OWN-WORLD: Quoli blue pixel landscapes, physical signal instruments and evidence attached to readable prose. STORY: Illustrated chronicle → complete article → original source → product. FIRST VIEWPORT: Large editorial title, sparse introduction, a crafted landscape plate; article title plus its own cover. FORM: Illustrated chronicle inside the established identity. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and surface documentation. */}
      <nav className="journal-breadcrumb" aria-label="Breadcrumb">
        <a href="/landing/">Quoli</a>
        <span aria-hidden="true">/</span>
        {article ? (
          <>
            <a href="/journal/">Journal</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{article.topic}</span>
          </>
        ) : (
          <span aria-current="page">Journal</span>
        )}
      </nav>
      {index ? (
        <JournalIndex />
      ) : article ? (
        <ArticlePage article={article} />
      ) : (
        <div className="journal-not-found">
          <h1>This field note isn’t here.</h1>
          <p>The address may have changed. Find the latest articles in the journal.</p>
          <a className="button" href="/journal/">
            Back to the journal <Arrow />
          </a>
        </div>
      )}
    </main>
  );
}
