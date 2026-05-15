import type { Action } from 'svelte/action';

export type BookflipParams = {
  startPage?: number;
  width?: number;
  height?: number;
  onReady?: (instance: BookflipInstance) => void;
};

export type BookflipInstance = {
  flipPrev: () => void;
  flipNext: () => void;
  destroy: () => void;
};

export const bookflip: Action<HTMLElement, BookflipParams> = (
  node: HTMLElement,
  params: BookflipParams = {}
) => {
  let destroyed = false;
  // biome-ignore lint/suspicious/noExplicitAny: page-flip has no published type for its runtime instance
  let pf: any;

  /* v8 ignore next 34 — async browser-only block; page-flip requires DOM and window */
  void (async () => {
    if (destroyed) return;
    try {
      const { PageFlip } = await import('page-flip');
      if (destroyed) return;

      const pages = node.querySelectorAll('[data-page]');
      if (pages.length === 0) return;

      pf = new PageFlip(node, {
        width: params.width ?? 400,
        height: params.height ?? 550,
        size: 'stretch',
        minWidth: 260,
        maxWidth: 560,
        minHeight: 360,
        maxHeight: 780,
        showCover: false,
        mobileScrollSupport: false,
        useMouseEvents: false,
        startPage: params.startPage ?? 0,
        autoSize: true,
      });

      pf.loadFromHTML(Array.from(pages));

      params.onReady?.({
        flipPrev: () => pf.flipPrev(),
        flipNext: () => pf.flipNext(),
        destroy: () => pf.destroy(),
      });
    } catch {
      // StPageFlip init failed — navigation works without animation via fallback
    }
  })();

  return {
    destroy() {
      destroyed = true;
      /* v8 ignore next 6 — pf is only set after browser-only async init */
      if (pf) {
        try {
          pf.destroy();
        } catch {
          // ignore
        }
      }
    },
  };
};
