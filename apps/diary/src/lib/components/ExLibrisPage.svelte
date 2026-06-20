<script lang="ts">
type Props = { username: string; transparent?: boolean };
const { username, transparent = false }: Props = $props();
</script>

<div class="page" class:transparent>
  <!-- Parchment grain -->
  <svg class="abs-fill" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="parch-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.65 0.55" numOctaves="4" seed="7" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
    </defs>
    <rect width="100%" height="100%" filter="url(#parch-grain)" opacity="0.06"/>
  </svg>

  <!-- Sepia border -->
  <svg
    class="abs-fill"
    viewBox="0 0 300 400"
    preserveAspectRatio="none"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="18" y="18" width="264" height="364" fill="none" stroke="#5c3d1e" stroke-width="1.1"/>
    <rect x="24" y="24" width="252" height="352" fill="none" stroke="#5c3d1e" stroke-width="0.5"/>

    <!-- Corner L-brackets -->
    <path d="M18,38 L18,18 L38,18"   fill="none" stroke="#5c3d1e" stroke-width="0.8" stroke-linecap="round"/>
    <path d="M282,38 L282,18 L262,18" fill="none" stroke="#5c3d1e" stroke-width="0.8" stroke-linecap="round"/>
    <path d="M18,362 L18,382 L38,382" fill="none" stroke="#5c3d1e" stroke-width="0.8" stroke-linecap="round"/>
    <path d="M282,362 L282,382 L262,382" fill="none" stroke="#5c3d1e" stroke-width="0.8" stroke-linecap="round"/>

    <!-- Mid-edge dots -->
    <circle cx="150" cy="18" r="2"   fill="#5c3d1e"/>
    <circle cx="150" cy="382" r="2"  fill="#5c3d1e"/>
    <circle cx="18"  cy="200" r="2"  fill="#5c3d1e"/>
    <circle cx="282" cy="200" r="2"  fill="#5c3d1e"/>
  </svg>

  <!-- Bookplate content -->
  <div class="plate">
    <img src="/ex-libris.png" class="bookplate" alt="Ex libris" />
    <p class="owner">{username}</p>
  </div>
</div>

<style>
  .page {
    position: relative;
    width: 100%;
    height: 100%;
    background: #f0e5cc;
  }

  .page.transparent {
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    pointer-events: none;
  }

  .abs-fill {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .plate {
    position: relative;
    z-index: 1;
    text-align: center;
    width: min(96%, 20rem);
    padding: 0;
  }

  .bookplate {
    width: 100%;
    height: auto;
    display: block;
  }

  .owner {
    position: absolute;
    left: calc(50% - 30px);
    top: calc(71.5% + 37px);
    transform: translate(-50%, -50%);
    font-family: 'Cedarville Cursive', cursive;
    font-size: clamp(0.95rem, 2.6vw, 1rem);
    font-weight: 800;
    color: #00237c;
    margin: 0;
    text-align: center;
    white-space: nowrap;
    line-height: 1;
  }
</style>
