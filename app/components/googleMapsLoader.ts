// app/components/googleMapsLoader.ts
// Loads the Google Maps JavaScript API once.
// Allows keyless loading by omitting the key parameter if none is provided.

let pending: Promise<any> | null = null;
let authFailed = false;

const CALLBACK = '__gmapsReady';
const LOAD_TIMEOUT_MS = 15000;

export function loadGoogleMaps(apiKey?: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google Maps needs a browser.'));

  const w = window as any;
  if (w.google?.maps?.Map) return Promise.resolve(w.google.maps);
  if (pending) return pending;

  pending = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    // When API key is missing or invalid, Google calls this.
    // We purposefully DO NOT reject the promise here so the map can still load in keyless development mode.
    w.gm_authFailure = () => {
      authFailed = true;
      window.dispatchEvent(new Event('gmaps-auth-failure'));
    };

    w[CALLBACK] = () => finish(() => resolve(w.google.maps));

    const timer = setTimeout(() => {
      pending = null;
      finish(() => reject(new Error('Google Maps took too long to load.')));
    }, LOAD_TIMEOUT_MS);

    const script = document.createElement('script');
    const keyParam = apiKey ? `key=${encodeURIComponent(apiKey)}&` : '';
    script.src = `https://maps.googleapis.com/maps/api/js?${keyParam}v=weekly&callback=${CALLBACK}`;
    script.async = true;
    script.onerror = () => {
      pending = null;
      finish(() => reject(new Error('Could not reach Google Maps (network blocked or offline).')));
    };
    document.head.appendChild(script);
  });

  return pending;
}