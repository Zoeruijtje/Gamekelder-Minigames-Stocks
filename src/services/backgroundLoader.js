const PART_COUNT = 9;
const ROOT = document.documentElement;
let activeObjectUrl = null;

function chunkUrl(index) {
  const suffix = String(index).padStart(2, '0');
  return new URL(`../../assets/background/desktop.${suffix}.b64`, import.meta.url);
}

async function fetchChunk(index) {
  const response = await fetch(chunkUrl(index), { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Background chunk ${index} returned ${response.status}.`);
  return (await response.text()).replace(/\s+/g, '');
}

function decodeBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function prepareHighQualityBackground() {
  ROOT.dataset.backgroundState = 'loading';
  try {
    const chunks = await Promise.all(
      Array.from({ length: PART_COUNT }, (_, index) => fetchChunk(index)),
    );
    const bytes = decodeBase64(chunks.join(''));
    if (bytes.length < 70_000) throw new Error('Reconstructed background is unexpectedly small.');
    const signature = String.fromCharCode(...bytes.slice(0, 4));
    const format = String.fromCharCode(...bytes.slice(8, 12));
    if (signature !== 'RIFF' || format !== 'WEBP') throw new Error('Reconstructed background is not a WebP image.');

    activeObjectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
    ROOT.style.setProperty('--gamekelder-background', `url("${activeObjectUrl}")`);
    ROOT.dataset.backgroundState = 'ready';
    window.dispatchEvent(new CustomEvent('friend-exchange-background-ready'));
    return activeObjectUrl;
  } catch (error) {
    console.warn('High-quality background could not be reconstructed; using bundled fallback.', error);
    ROOT.dataset.backgroundState = 'fallback';
    return null;
  }
}

prepareHighQualityBackground();

window.addEventListener('pagehide', () => {
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
}, { once: true });
