const PRINT_CLONE_ID = 'resume-print-clone';
const PRINTING_CLASS = 'is-printing-resume';

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
    .forEach((node) => node.classList.remove('ring-2', 'ring-offset-2', 'ring-offset-4'));

  return clone;
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

export function openBrowserPrintExport(): void {
  window.print();
}

export function registerResumePrintHandlers(): () => void {
  const onBeforePrint = () => mountResumePrintClone();
  const onAfterPrint = () => unmountResumePrintClone();

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
    unmountResumePrintClone();
  };
}
