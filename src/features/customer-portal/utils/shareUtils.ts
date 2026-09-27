export function shareText(text: string, url?: string): void {
  if (navigator.share) {
    navigator.share({ title: text, url: url ?? window.location.href }).catch(() => {});
  } else if (url) {
    navigator.clipboard?.writeText(url).catch(() => {});
  }
}

export function copyToClipboard(text: string): Promise<boolean> {
  return navigator.clipboard?.writeText(text).then(() => true).catch(() => false);
}

export function bookmarkUrl(title: string, url?: string): void {
  if (window.sidebar && window.sidebar.addPanel) {
    window.sidebar.addPanel(title, url ?? window.location.href, '');
  } else if (window.external && ('AddFavorite' in window.external)) {
    (window.external as { AddFavorite: (url: string, title: string) => void }).AddFavorite(
      url ?? window.location.href,
      title
    );
  } else {
    window.print();
  }
}