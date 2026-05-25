const PRINT_CLONE_ID = 'resume-print-clone';
const PRINTING_CLASS = 'is-printing-resume';
const PRINT_IFRAME_ID = 'resume-print-iframe';
const PRINT_PAGE_PADDING_MM = 12;

const PRINT_DOCUMENT_STYLE = `
  @page {
    size: A4;
    margin: 0;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .resume-print-root,
  #resume-print-clone,
  .resume-print-clone {
    width: 100% !important;
    max-width: none !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: ${PRINT_PAGE_PADDING_MM}mm !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: #ffffff !important;
    overflow: visible !important;
  }

  .no-print,
  .rich-text-toolbar,
  .resume-action-buttons,
  .resume-action-button {
    display: none !important;
  }

  .resume-section-wrapper {
    break-inside: avoid;
    page-break-inside: avoid;
    padding-top: 0 !important;
    box-shadow: none !important;
    outline: none !important;
  }

  .resume-section-content {
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }

  [class*='ring-'] {
    box-shadow: none !important;
    outline: none !important;
  }

  .rich-text-field p.is-editor-empty:first-child::before,
  [data-placeholder]:empty::before {
    content: none !important;
  }
`;

export function prepareResumeExportClone(source: Element): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.id = PRINT_CLONE_ID;
  clone.classList.add('resume-print-clone');

  clone.querySelectorAll('.no-print, .rich-text-toolbar').forEach((node) => {
    node.remove();
  });

  clone.querySelectorAll('[contenteditable]').forEach((node) => {
    node.removeAttribute('contenteditable');
  });

  clone
    .querySelectorAll('[class*="ring-"]')
    .forEach((node) =>
      node.classList.remove('ring-2', 'ring-offset-2', 'ring-offset-4')
    );

  return clone;
}

function collectDocumentStyles(): string {
  const links = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
  )
    .map((link) => link.outerHTML)
    .join('\n');

  const styles = Array.from(document.querySelectorAll('style'))
    .map((style) => style.outerHTML)
    .join('\n');

  return `${links}\n${styles}`;
}

function buildPrintDocumentHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title></title>
    ${collectDocumentStyles()}
    <style>${PRINT_DOCUMENT_STYLE}</style>
  </head>
  <body>${bodyHtml}</body>
</html>`;
}

async function waitForIframeReady(iframe: HTMLIFrameElement): Promise<void> {
  const doc = iframe.contentDocument;
  if (!doc) return;

  await new Promise<void>((resolve) => {
    const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
    if (links.length === 0) {
      resolve();
      return;
    }

    let pending = links.length;
    const finish = () => {
      pending -= 1;
      if (pending <= 0) resolve();
    };

    links.forEach((link) => {
      link.addEventListener('load', finish, { once: true });
      link.addEventListener('error', finish, { once: true });
    });

    window.setTimeout(() => resolve(), 2500);
  });

  if (iframe.contentDocument?.fonts?.ready) {
    await iframe.contentDocument.fonts.ready;
  }
}

function removePrintIframe(): void {
  document.getElementById(PRINT_IFRAME_ID)?.remove();
}

async function printViaHiddenIframe(source: Element): Promise<void> {
  const clone = prepareResumeExportClone(source);
  removePrintIframe();

  const iframe = document.createElement('iframe');
  iframe.id = PRINT_IFRAME_ID;
  iframe.setAttribute(
    'style',
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  );
  iframe.setAttribute('title', 'resume-print');
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    removePrintIframe();
    throw new Error('인쇄 프레임을 만들지 못했습니다.');
  }

  doc.open();
  doc.write(buildPrintDocumentHtml(clone.outerHTML));
  doc.close();

  await waitForIframeReady(iframe);

  await new Promise<void>((resolve) => {
    const cleanup = () => {
      win.removeEventListener('afterprint', cleanup);
      removePrintIframe();
      resolve();
    };

    win.addEventListener('afterprint', cleanup);
    win.focus();
    win.print();
  });
}

export function mountResumePrintClone(): void {
  const source = document.querySelector('.resume-print-root');
  if (!source || document.getElementById(PRINT_CLONE_ID)) return;

  document.body.appendChild(prepareResumeExportClone(source));
  document.body.classList.add(PRINTING_CLASS);
}

export function unmountResumePrintClone(): void {
  document.getElementById(PRINT_CLONE_ID)?.remove();
  document.body.classList.remove(PRINTING_CLASS);
}

let savedDocumentTitle = '';

export function openBrowserPrintExport(): void {
  const source = document.querySelector('.resume-print-root');
  if (!source) {
    throw new Error(
      '이력서 영역을 찾을 수 없습니다. 이력서 편집 화면에서 다시 시도해주세요.'
    );
  }

  void printViaHiddenIframe(source).catch(() => {
    savedDocumentTitle = document.title;
    document.title = ' ';
    mountResumePrintClone();
    window.print();
  });
}

export function registerResumePrintHandlers(): () => void {
  const onBeforePrint = () => {
    savedDocumentTitle = document.title;
    document.title = ' ';
    mountResumePrintClone();
  };
  const onAfterPrint = () => {
    if (savedDocumentTitle) {
      document.title = savedDocumentTitle;
      savedDocumentTitle = '';
    }
    unmountResumePrintClone();
  };

  window.addEventListener('beforeprint', onBeforePrint);
  window.addEventListener('afterprint', onAfterPrint);

  const printMedia = window.matchMedia('print');
  const onPrintMediaChange = (event: MediaQueryListEvent) => {
    if (event.matches) {
      onBeforePrint();
      return;
    }
    onAfterPrint();
  };

  printMedia.addEventListener('change', onPrintMediaChange);

  return () => {
    window.removeEventListener('beforeprint', onBeforePrint);
    window.removeEventListener('afterprint', onAfterPrint);
    printMedia.removeEventListener('change', onPrintMediaChange);
    if (savedDocumentTitle) {
      document.title = savedDocumentTitle;
      savedDocumentTitle = '';
    }
    unmountResumePrintClone();
    removePrintIframe();
  };
}
