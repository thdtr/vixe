// iOS ignores SVG icons (and the manifest's) and wants a PNG for the home
// screen. Rather than shipping one, draw the SVG on a canvas and hand iOS that.
export function touchIcon(src = 'assets/icon-maskable.svg', size = 180) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').drawImage(img, 0, 0, size, size);
    const link = document.createElement('link');
    link.rel = 'apple-touch-icon';
    link.href = c.toDataURL('image/png');
    document.head.append(link);
  };
  img.src = src;
}
