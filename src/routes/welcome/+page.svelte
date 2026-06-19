<svelte:head>
  <title>Edelmore — a book of your own</title>
  <meta name="description" content="A private diary for children who hear better than they type. Book-shaped, voice-first, kept on your own machine.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600&display=swap" rel="stylesheet">
</svelte:head>

<div class="landing">

  <!-- ── Header ── -->
  <header>
    <div class="wrap hdr-inner">
      <a class="wordmark" href="/welcome">Edelmore</a>
      <nav>
        <a href="#what">what it is</a>
        <a href="#reader">coming soon</a>
        <a class="nav-cta" href="/login">open the diary →</a>
      </nav>
    </div>
  </header>

  <!-- ── Hero ── -->
  <section class="hero">
    <div class="wrap">
      <div class="medallion-wrap">
        <img src="/edelmore.png" alt="Edelmore" class="medallion">
      </div>
      <p class="label">For children who hear better than they type</p>
      <h1>A book of your own.</h1>
      <p class="lead">Edelmore is a private diary shaped like a book. Voice transcription handles the writing; the diary reads entries back aloud. Pages turn. No cloud. Nobody reads it but the person who wrote it.</p>
      <div class="demo-box">
        <p class="demo-label">Demo access</p>
        <div class="demo-row">
          <span class="demo-key">username</span>
          <span class="demo-val">TAYLOR</span>
        </div>
        <div class="demo-row">
          <span class="demo-key">pin</span>
          <span class="demo-val">1313</span>
        </div>
      </div>
      <div class="cta-row">
        <a class="btn" href="/login">Open the diary <span class="arrow">→</span></a>
        <span class="cta-note">resets nightly · no account required</span>
      </div>
    </div>
  </section>

  <!-- ── What ── -->
  <section id="what" class="what-section">
    <div class="wrap">
      <p class="label">What Edelmore is</p>
      <h2>A real diary for hands that don't cooperate.</h2>
      <div class="cards">
        <div class="card">
          <span class="card-glyph">🎙</span>
          <h3>Speak to write</h3>
          <p>Press the mic button, talk, press it again. Your words appear at the cursor. No keyboard required.</p>
        </div>
        <div class="card">
          <span class="card-glyph">🐦</span>
          <h3>Read it back</h3>
          <p>A small bird in the corner reads the entry aloud while each word highlights as it's spoken.</p>
        </div>
        <div class="card">
          <span class="card-glyph">📖</span>
          <h3>Book-shaped</h3>
          <p>Real page turns. Warm covers. A table of contents. It looks like a book because that's what it is.</p>
        </div>
        <div class="card">
          <span class="card-glyph">🔒</span>
          <h3>Yours alone</h3>
          <p>No cloud. No sharing. A 4-digit PIN keeps siblings out. Runs on a home server — Tailscale takes it everywhere.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ── Story (dark) ── -->
  <section class="dark">
    <div class="wrap">
      <p class="label">The story behind it</p>
      <h2>Built for a child who wanted her own Anne Frank.</h2>
      <p>Existing diary tools fail differently. Day One stores entries on someone else's server. Paper journals are beautiful but ungenerous to anyone whose hands don't cooperate with a pen. Prompted apps impose structure on what should be unstructured.</p>
      <p>Edelmore was built for a 13-year-old who wanted to keep a diary on her own terms, in the shape of a thing that already meant something to her.</p>
      <div class="not-grid">
        <div>
          <p class="not-title">What it is not</p>
          <ul class="not-list">
            <li>A journal with prompts or AI interlocution</li>
            <li>A sharing platform — no concept of sharing an entry</li>
            <li>A cloud service — runs on your homelab, full stop</li>
            <li>A subscription — MIT licensed, self-hosted, free</li>
          </ul>
        </div>
        <div class="feature-row">
          <span class="chip">PIN auth</span>
          <span class="chip">page-turn animation</span>
          <span class="chip">voice transcription</span>
          <span class="chip">read-aloud narration</span>
          <span class="chip">calendar + TOC</span>
          <span class="chip">custom covers</span>
          <span class="chip">Tailscale-ready</span>
          <span class="chip">Docker</span>
        </div>
      </div>
    </div>
  </section>

  <!-- ── Coming soon: Reader ── -->
  <section id="reader" class="reader-section">
    <div class="wrap">
      <p class="label">Coming soon</p>
      <div class="reader-grid">
        <div>
          <h2>Edelmore Reader</h2>
          <p class="tagline">A read-along ebook reader. For the kids who hear stories better than they read them.</p>
          <p>Upload an EPUB or pick from a built-in library of public-domain classics. A small songbird reads it aloud while each word glows as it's spoken. Pages turn at the right moment. The book remembers where you left off.</p>
          <p style="margin-top:.8rem;">Sibling project to Edelmore Diary. Same book metaphor, same warmth, same local-first privacy. Follows the diary's v1.0 ship.</p>
          <span class="coming-badge">No release date · watching the diary</span>
        </div>
        <div class="reader-books">
          <p class="books-label">Built-in library (planned)</p>
          <ul class="book-list">
            <li>Alice in Wonderland</li>
            <li>The Wind in the Willows</li>
            <li>The Secret Garden</li>
            <li>The Wonderful Wizard of Oz</li>
            <li>A Little Princess</li>
            <li>Just So Stories</li>
          </ul>
          <p class="books-note">Standard Ebooks editions · public domain · illustrated</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ── Final CTA ── -->
  <section class="final">
    <div class="wrap">
      <h2>Write the thing that happened today.</h2>
      <span class="tagline">This demo resets nightly. Taylor's diary is waiting.</span>
      <div class="demo-box demo-box-final">
        <div class="demo-row">
          <span class="demo-key">username</span>
          <span class="demo-val">TAYLOR</span>
        </div>
        <div class="demo-row">
          <span class="demo-key">pin</span>
          <span class="demo-val">1313</span>
        </div>
      </div>
      <a class="btn" href="/login">Open the diary <span class="arrow">→</span></a>
    </div>
  </section>

  <!-- ── Footer ── -->
  <footer>
    <div class="wrap ftr-inner">
      <span class="fnote">Edelmore — part of <a href="https://sageframe.net" target="_blank" rel="noopener">Sageframe</a> · built by <a href="https://atmarcus.net" target="_blank" rel="noopener">Andrew Todd Marcus</a></span>
      <span class="demo-pill">Demo · resets nightly</span>
    </div>
  </footer>

</div>

<style>
  :global(body) { margin: 0; padding: 0; }

  .landing {
    --ink: #1a1a1a;
    --ink-light: #4a4a4a;
    --ink-muted: #7a7a7a;
    --ground: #f5f2ed;
    --ground-warm: #ebe6dd;
    --white: #faf8f4;
    --accent: #c45a2d;
    --rule: #d0c9be;
    --dark-bg: #1a1a1a;
    --dark-text: #c8c2b8;
    --dark-prose: #b0a99e;
    --dark-muted: #888;
    --dark-rule: #333;
    --display: 'DM Serif Display', Georgia, serif;
    --body: 'IBM Plex Sans', -apple-system, sans-serif;
    --mono: 'IBM Plex Mono', 'Courier New', monospace;
    --max: 1080px;
    --gutter: clamp(1.5rem, 5vw, 4rem);

    font-family: var(--body);
    background: var(--ground);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
    line-height: 1.6;
    min-height: 100vh;
  }

  a { color: var(--accent); text-decoration: none; transition: color .2s ease; }
  a:hover { color: var(--ink); }
  .wrap { max-width: var(--max); margin: 0 auto; padding-left: var(--gutter); padding-right: var(--gutter); }

  /* ── Header ── */
  header { position: sticky; top: 0; z-index: 50; background: rgba(245,242,237,.92); backdrop-filter: blur(8px); border-bottom: 1px solid var(--rule); }
  .hdr-inner { display: flex; align-items: center; justify-content: space-between; padding-top: 1rem; padding-bottom: 1rem; }
  .wordmark { font-family: var(--mono); font-size: .85rem; font-weight: 500; letter-spacing: .02em; color: var(--ink); }
  nav { display: flex; align-items: center; gap: 1.75rem; }
  nav a { font-family: var(--mono); font-size: .78rem; letter-spacing: .04em; color: var(--ink-muted); }
  nav a:hover { color: var(--ink); }
  .nav-cta { color: var(--accent) !important; font-weight: 500; }

  /* ── Type ── */
  section { padding: clamp(3.5rem, 9vh, 6.5rem) 0; }
  .label { font-family: var(--body); font-size: .8rem; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-muted); margin-bottom: 1.1rem; }
  h1 { font-family: var(--display); font-weight: 400; font-size: clamp(2.6rem, 6vw, 4rem); line-height: 1.12; letter-spacing: -.01em; margin: 0 auto .2rem; }
  h2 { font-family: var(--display); font-weight: 400; font-size: clamp(1.7rem, 3.2vw, 2.3rem); line-height: 1.22; }
  h3 { font-family: var(--display); font-weight: 400; font-size: 1.2rem; line-height: 1.3; }
  p { color: var(--ink-light); font-size: 1.05rem; max-width: 640px; }
  .lead { font-size: 1.18rem; max-width: 560px; }
  .tagline { font-family: var(--display); font-style: italic; color: var(--ink-muted); }

  /* ── Hero ── */
  .hero { padding-top: clamp(3rem, 8vh, 5rem); text-align: center; }
  .medallion-wrap { margin-bottom: 1.75rem; }
  .medallion { width: clamp(160px, 24vw, 260px); height: auto; display: inline-block; }
  .hero .label { margin-bottom: .75rem; }
  .hero p { margin: 1.4rem auto 0; }
  .cta-row { margin-top: 2rem; display: flex; align-items: center; justify-content: center; gap: 2rem; flex-wrap: wrap; }
  .cta-note { font-family: var(--mono); font-size: .72rem; letter-spacing: .04em; color: var(--ink-muted); }

  /* ── Demo box ── */
  .demo-box {
    display: inline-block;
    margin: 1.75rem auto 0;
    background: var(--white);
    border: 2px solid var(--rule);
    border-radius: 3px;
    padding: 1.1rem 1.8rem;
    text-align: left;
  }
  .demo-label { font-family: var(--mono); font-size: .65rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-muted); margin-bottom: .7rem; max-width: none; }
  .demo-row { display: flex; gap: 2rem; align-items: baseline; margin-bottom: .35rem; }
  .demo-row:last-child { margin-bottom: 0; }
  .demo-key { font-family: var(--mono); font-size: .8rem; letter-spacing: .04em; color: var(--ink-muted); min-width: 5rem; }
  .demo-val { font-family: var(--mono); font-size: 1.5rem; font-weight: 500; color: var(--ink); letter-spacing: .1em; }
  .demo-box-final { margin: 1.25rem auto 2rem; background: var(--ground-warm); border-color: var(--rule); border-width: 1px; }

  /* ── Button ── */
  .btn { display: inline-flex; align-items: center; gap: .5rem; font-family: var(--mono); font-size: .85rem; font-weight: 500; letter-spacing: .02em; padding: .85rem 1.4rem; border-radius: 2px; background: var(--accent); color: var(--white); transition: transform .2s ease, background .2s ease; }
  .btn:hover { color: var(--white); background: #a84a22; transform: translateY(-1px); }
  .arrow { transition: transform .2s ease; }
  .btn:hover .arrow { transform: translateX(4px); }

  /* ── What ── */
  .what-section { border-top: 1px solid var(--rule); }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; margin-top: 2.5rem; }
  .card { background: var(--white); border: 1px solid var(--rule); border-radius: 2px; padding: 1.6rem; transition: border-color .2s ease, transform .2s ease, box-shadow .2s ease; }
  .card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.06); }
  .card-glyph { font-size: 1.4rem; display: block; margin-bottom: .6rem; }
  .card h3 { margin: .25rem 0 .6rem; }
  .card p { font-size: .92rem; color: var(--ink-muted); max-width: none; }

  /* ── Dark ── */
  .dark { background: var(--dark-bg); color: var(--dark-prose); }
  .dark .label { color: var(--dark-muted); }
  .dark h2 { color: var(--ground); margin-bottom: 1.4rem; }
  .dark p { color: var(--dark-prose); }
  .dark p + p { margin-top: 1rem; }
  .not-grid { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(2rem, 5vw, 4rem); margin-top: 2rem; align-items: start; }
  @media (max-width: 680px) { .not-grid { grid-template-columns: 1fr; } }
  .not-title { font-family: var(--body); font-size: .78rem; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--dark-muted); margin-bottom: .9rem; max-width: none; }
  .not-list { list-style: none; padding: 0; margin: 0; border-left: 1px solid var(--dark-rule); padding-left: 1.2rem; }
  .not-list li { font-size: .95rem; color: var(--dark-text); margin-bottom: .8rem; }
  .feature-row { margin-top: 1.5rem; display: flex; flex-wrap: wrap; gap: .5rem; }
  .chip { font-family: var(--mono); font-size: .7rem; letter-spacing: .03em; color: var(--dark-text); border: 1px solid var(--dark-rule); border-radius: 2px; padding: .35rem .7rem; }

  /* ── Reader ── */
  .reader-section { background: var(--ground-warm); border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
  .reader-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: clamp(2rem, 5vw, 4rem); margin-top: 1.5rem; align-items: start; }
  @media (max-width: 700px) { .reader-grid { grid-template-columns: 1fr; } }
  .reader-section h2 { margin-bottom: .5rem; }
  .reader-section .tagline { display: block; font-size: 1.1rem; margin-bottom: 1.2rem; }
  .reader-section p { max-width: none; }
  .coming-badge { display: inline-block; margin-top: 1.4rem; font-family: var(--mono); font-size: .7rem; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-muted); border: 1px solid var(--rule); border-radius: 2px; padding: .3rem .7rem; }
  .reader-books { background: var(--white); border: 1px solid var(--rule); border-radius: 2px; padding: 1.4rem; }
  .books-label { font-family: var(--mono); font-size: .7rem; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-muted); margin-bottom: .9rem; max-width: none; }
  .book-list { list-style: none; padding: 0; margin: 0; }
  .book-list li { font-family: var(--display); font-style: italic; font-size: 1rem; color: var(--ink); padding: .45rem 0; border-bottom: 1px solid var(--rule); }
  .book-list li:last-child { border-bottom: none; }
  .books-note { font-family: var(--mono); font-size: .68rem; color: var(--ink-muted); margin-top: .8rem; max-width: none; }

  /* ── Final CTA ── */
  .final { text-align: center; }
  .final h2 { margin-bottom: .5rem; }
  .final .tagline { display: block; font-size: 1.15rem; margin-bottom: 0; }

  /* ── Footer ── */
  footer { border-top: 1px solid var(--rule); padding: 2.5rem 0; }
  .ftr-inner { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .fnote { font-family: var(--mono); font-size: .72rem; color: var(--ink-muted); }
  .fnote a { font-size: inherit; }
  .demo-pill { font-family: var(--mono); font-size: .68rem; letter-spacing: .06em; text-transform: uppercase; color: var(--accent); border: 1px solid var(--accent); border-radius: 2px; padding: .25rem .6rem; }
</style>
