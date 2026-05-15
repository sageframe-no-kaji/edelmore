declare module 'page-flip' {
  interface FlipSetting {
    width: number;
    height: number;
    size?: 'fixed' | 'stretch';
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    drawShadow?: boolean;
    flippingTime?: number;
    usePortrait?: boolean;
    startZIndex?: number;
    autoSize?: boolean;
    maxShadowOpacity?: number;
    showCover?: boolean;
    mobileScrollSupport?: boolean;
    swipeDistance?: number;
    clickEventForward?: boolean;
    useMouseEvents?: boolean;
    renderOnlyPageLengthChange?: boolean;
    startPage?: number;
  }

  class PageFlip {
    constructor(element: HTMLElement, settings: Partial<FlipSetting>);
    loadFromHTML(items: Element[] | NodeListOf<Element>): void;
    flipNext(corner?: string): void;
    flipPrev(corner?: string): void;
    flip(pageNum: number, corner?: string): void;
    getCurrentPageIndex(): number;
    destroy(): void;
  }
}
