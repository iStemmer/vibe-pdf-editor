import * as pdfjsLib from 'pdfjs-dist'

// Bundle the pdf.js worker locally via Vite instead of relying on a CDN.
// Vite sees `new URL(..., import.meta.url)` and emits the file as a static asset,
// producing a hashed URL that works offline and in CSP-restricted environments.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

export default pdfjsLib

