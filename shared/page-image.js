// Use an ordinary image so the HTML preload and WebGL share the same cached
// response. Clearing src lets a distant jump cancel obsolete image requests.
export function loadPageImage(url, { signal, priority = "high" } = {}) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = priority;
    function cleanup() {
      image.onload = image.onerror = null;
      signal?.removeEventListener("abort", abort);
    }
    function abort() {
      cleanup();
      image.removeAttribute("src");
      reject(new DOMException("Page request canceled", "AbortError"));
    }
    image.onload = async () => {
      try {
        await image.decode();
        if (signal?.aborted) return;
        cleanup();
        resolve(image);
      } catch (error) { cleanup(); reject(error); }
    };
    image.onerror = () => { cleanup(); reject(new Error(`Could not load page: ${url}`)); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    image.src = url;
  });
}
