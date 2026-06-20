<svelte:head>
  <title>Edelmore — a book of your own</title>
  <meta name="description" content="A private diary for children who write by speaking. Book-shaped, voice-first, kept on your own machine.">
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
        <a href="#udl">why it matters</a>
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
      <p class="label">For children who write by speaking</p>
      <h1>A book of your own.</h1>
      <p class="lead">Edelmore is a private diary shaped like a book. Voice transcription handles the writing; the diary reads entries back aloud. Pages turn. No cloud. Nobody reads it but the person who wrote it.</p>
      <div class="demo-box">
        <p class="demo-heading">Try the demo</p>
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
        <span class="cta-chip">resets nightly · no account required</span>
      </div>
    </div>
  </section>

  <!-- ── What ── -->
  <section id="what" class="what-section">
    <div class="wrap">
      <h2>A real diary for hands that don't cooperate.</h2>
      <div class="cards">
        <div class="card">
          <span class="card-ornament">❧</span>
          <h3>Speak to write</h3>
          <p>Press the mic button, talk, press it again. Your words appear at the cursor. No keyboard required.</p>
        </div>
        <div class="card">
          <span class="card-ornament">❧</span>
          <h3>Read it back</h3>
          <p>A small bird in the corner reads the entry aloud while each word highlights as it's spoken.</p>
        </div>
        <div class="card">
          <span class="card-ornament">❧</span>
          <h3>Book-shaped</h3>
          <p>Real page turns. Warm covers. A table of contents. It looks like a book because that's what it is.</p>
        </div>
        <div class="card">
          <span class="card-ornament">❧</span>
          <h3>Yours alone</h3>
          <p>No cloud. No sharing. A 4-digit PIN keeps siblings out. Runs on a home server, travels everywhere via Tailscale.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ── UDL / Accessibility ── -->
  <section id="udl" class="udl-section">
    <div class="wrap udl-inner">
      <p class="udl-quote">"Designed to work for every learner — not just the typical one."</p>
      <p class="udl-body">Edelmore is built on the principles of <a href="https://www.cast.org/impact/universal-design-for-learning-udl" target="_blank" rel="noopener">Universal Design for Learning</a>. Voice transcription removes the keyboard barrier. Read-aloud with word-by-word highlighting supports processing differences. No prompts, no time pressure, no right way to write. A tool that works for a child with dyslexia, ADHD, or ataxia works better for everyone.</p>
    </div>
  </section>

  <!-- ── Story (warm dark) ── -->
  <section class="dark">
    <div class="wrap">
      <h2>Built for a child who wanted her own Anne Frank.</h2>
      <p>Existing diary tools fail differently. Day One stores entries on someone else's server. Paper journals are beautiful but ungenerous to anyone whose hands don't cooperate with a pen. Prompted apps impose structure on what should be unstructured.</p>
      <p>Edelmore was built for a 13-year-old who wanted to keep a diary on her own terms, in the shape of a thing that already meant something to her.</p>
      <p class="not-title">What it is not</p>
      <ul class="not-list">
        <li>A journal with prompts or AI interlocution</li>
        <li>A sharing platform — no concept of sharing an entry</li>
        <li>A cloud service — runs on your homelab, full stop</li>
        <li>A subscription — MIT licensed, self-hosted, free</li>
      </ul>
    </div>
  </section>

  <!-- ── Final CTA ── -->
  <section class="final">
    <div class="wrap">
      <h2>Write the thing that happened today.</h2>
      <p class="final-sub">Taylor's diary is waiting. It resets nightly so it's always fresh.</p>
      <div class="demo-box">
        <p class="demo-heading">Try the demo</p>
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
        <span class="cta-chip">resets nightly · no account required</span>
      </div>
    </div>
  </section>

  <!-- ── Reader teaser ── -->
  <section id="reader" class="reader-teaser">
    <div class="wrap reader-teaser-inner">
      <p class="reader-eyebrow">Coming soon</p>
      <p class="reader-title">Edelmore Reader</p>
      <p class="reader-desc">A read-along ebook reader. A songbird reads while each word glows. For the kids who hear stories better than they read them — <em>Alice in Wonderland</em>, <em>The Wind in the Willows</em>, <em>The Secret Garden</em>, and more.</p>
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
    --dark-bg: #1e1a15;
    --dark-text: #c8c2b8;
    --dark-prose: #b0a99e;
    --dark-muted: #7a7068;
    --dark-rule: #38322a;

    --display: 'DM Serif Display', Georgia, serif;
    --body: 'IBM Plex Sans', -apple-system, sans-serif;
    --mono: 'IBM Plex Mono', 'Courier New', monospace;
    --max: 1080px;
    --gutter: clamp(1.5rem, 5vw, 4rem);
    --radius: 10px;

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
  h1 { font-family: var(--display); font-weight: 400; font-size: clamp(2.6rem, 6vw, 4rem); line-height: 1.12; letter-spacing: -.01em; margin: 0 0 .2rem; }
  h2 { font-family: var(--display); font-weight: 400; font-size: clamp(1.7rem, 3.2vw, 2.3rem); line-height: 1.22; text-wrap: balance; }
  h3 { font-family: var(--display); font-weight: 400; font-size: 1.25rem; line-height: 1.3; margin: 0 0 .6rem; }
  p { color: var(--ink-light); font-size: 1.05rem; max-width: 640px; }
  .lead { font-size: 1.18rem; max-width: 560px; }

  /* ── Hero ── */
  .hero { padding-top: clamp(3rem, 8vh, 5rem); text-align: center; position: relative; }
  .hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url('/background.png');
    background-repeat: repeat;
    background-size: 380px 380px;
    opacity: 0.18;
    pointer-events: none;
  }
  .hero > * { position: relative; }
  .medallion-wrap { margin-bottom: 1.75rem; }
  .medallion { width: clamp(160px, 24vw, 260px); height: auto; display: inline-block; }
  .hero .label { margin-bottom: .75rem; }
  .hero h1 { margin: 0 auto .2rem; }
  .hero p { margin: 1.4rem auto 0; }

  /* ── Demo box ── */
  .demo-box {
    display: inline-block;
    margin: 1.75rem auto 0;
    background: var(--white);
    border: 1.5px solid var(--rule);
    border-radius: var(--radius);
    padding: 1.25rem 2rem;
    text-align: left;
    min-width: 260px;
  }
  .demo-heading {
    font-family: var(--display);
    font-style: italic;
    font-size: 1rem;
    color: var(--ink-muted);
    margin: 0 0 .85rem;
    max-width: none;
  }
  .demo-row {
    display: grid;
    grid-template-columns: 6.5rem 1fr;
    align-items: baseline;
    margin-bottom: .4rem;
  }
  .demo-row:last-child { margin-bottom: 0; }
  .demo-key { font-family: var(--mono); font-size: .85rem; letter-spacing: .04em; color: var(--ink-muted); }
  .demo-val { font-family: var(--mono); font-size: 1.6rem; font-weight: 500; color: var(--ink); letter-spacing: .08em; }

  /* ── CTA row ── */
  .cta-row { margin-top: 1.75rem; display: flex; align-items: center; justify-content: center; gap: 1rem; flex-wrap: wrap; }
  .cta-chip {
    font-family: var(--mono);
    font-size: .85rem;
    letter-spacing: .02em;
    color: var(--ink-muted);
    background: var(--white);
    border: 1.5px solid var(--rule);
    border-radius: 6px;
    padding: .7rem 1.2rem;
    white-space: nowrap;
    line-height: 1;
  }

  /* ── Button ── */
  .btn { display: inline-flex; align-items: center; gap: .5rem; font-family: var(--mono); font-size: .85rem; font-weight: 500; letter-spacing: .02em; line-height: 1; padding: .7rem 1.4rem; border-radius: 6px; background: var(--accent); color: var(--white); transition: background .2s ease; }
  .btn:hover { color: var(--white); background: #a84a22; }
  .arrow { display: inline-block; transition: transform .2s ease; }
  .btn:hover .arrow { transform: translateX(4px); }

  /* ── What ── */
  .what-section { border-top: 1px solid var(--rule); }
  .what-section h2 { margin-bottom: 2rem; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; }
  .card { background: var(--white); border: 1.5px solid var(--rule); border-radius: var(--radius); padding: 1.6rem; transition: border-color .2s ease; }
  .card:hover { border-color: var(--accent); }
  .card-ornament { font-family: var(--display); font-size: 1.1rem; color: var(--accent); display: block; margin-bottom: .5rem; line-height: 1; }
  .card p { font-size: .95rem; color: var(--ink-muted); max-width: none; }

  /* ── UDL ── */
  .udl-section { background: var(--ground-warm); border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); padding: clamp(2.5rem, 6vh, 4.5rem) 0; }
  .udl-inner { max-width: 680px; }
  .udl-quote { font-family: var(--display); font-style: italic; font-size: clamp(1.25rem, 2.5vw, 1.65rem); line-height: 1.45; color: var(--ink); margin-bottom: 1.25rem; max-width: none; }
  .udl-body { font-size: 1.05rem; color: var(--ink-light); max-width: none; }
  .udl-body a { font-weight: 500; }

  /* ── Dark ── */
  .dark { background: var(--dark-bg); }
  .dark h2 { color: var(--dark-text); margin-bottom: 1.4rem; }
  .dark p { color: var(--dark-prose); }
  .dark p + p { margin-top: 1rem; }
  .not-title { font-family: var(--body); font-size: .78rem; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--dark-muted); margin: 2rem 0 .9rem; max-width: none; }
  .not-list { list-style: none; padding: 0 0 0 1.2rem; margin: 0; border-left: 1px solid var(--dark-rule); max-width: 480px; }
  .not-list li { font-size: .95rem; color: var(--dark-text); margin-bottom: .8rem; }

  /* ── Final CTA ── */
  .final { text-align: center; border-top: 1px solid var(--rule); }
  .final h2 { margin-bottom: .6rem; }
  .final-sub { font-family: var(--display); font-style: italic; font-size: 1.15rem; color: var(--ink-muted); margin: 0 auto; }

  /* ── Reader teaser ── */
  .reader-teaser { background: var(--ground-warm); border-top: 1px solid var(--rule); padding: clamp(2rem, 5vh, 3rem) 0; text-align: center; }
  .reader-teaser-inner { max-width: 600px; margin: 0 auto; padding-left: var(--gutter); padding-right: var(--gutter); }
  .reader-eyebrow { font-family: var(--mono); font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-muted); margin-bottom: .5rem; }
  .reader-title { font-family: var(--display); font-size: clamp(1.3rem, 2.8vw, 1.75rem); font-weight: 400; color: var(--ink); margin-bottom: .75rem; }
  .reader-desc { font-size: 1rem; color: var(--ink-muted); max-width: none; }
  .reader-desc em { color: var(--ink-light); font-style: italic; }

  /* ── Footer ── */
  footer { border-top: 1px solid var(--rule); padding: 2.5rem 0; }
  .ftr-inner { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .fnote { font-family: var(--mono); font-size: .72rem; color: var(--ink-muted); }
  .fnote a { font-size: inherit; }
  .demo-pill { font-family: var(--mono); font-size: .68rem; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-muted); border: 1px solid var(--rule); border-radius: 4px; padding: .25rem .6rem; }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    a, .btn, .arrow, .card { transition: none; }
    .btn:hover .arrow { transform: none; }
  }
</style>
