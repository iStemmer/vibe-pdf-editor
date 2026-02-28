# Vibe PDF Editor

A fully client-side PDF editor and page manager built with Vue 3 + Vite.
Edit text, merge files, split pages, and rearrange — all inside your browser.

> **🔒 Privacy First — All data stays on your computer.**
> Your PDF files are never uploaded to any server. Every operation — rendering,
> editing, merging, splitting — runs entirely in the browser using JavaScript.
> No backend, no cloud, no tracking. Close the tab and the data is gone.

---

## ✨ Features

### ✏️ PDF Editor
- **Open any PDF** — load a file from your computer and view it page-by-page.
- **Zoom in / out** — mouse-wheel zoom or toolbar buttons (25 %–500 %).
- **Edit existing text** — click on any text label in the PDF, fix it in place, and save.
- **Add new text** — place custom text overlays anywhere on the page with configurable font size, colour, and background.
- **Drag & resize** — move and resize text overlays freely on the canvas.
- **Navigate pages** — page controls with current / total page indicator.
- **Download edited PDF** — save the modified document as `*_edited.pdf`.

### 📑 Split / Merge & Page Manager
- **Load multiple PDFs** — add several files at once; all pages appear as draggable thumbnail cards.
- **Rearrange pages** — drag-and-drop or use arrow buttons to reorder pages across files.
- **Merge into one PDF** — combine all pages (in the current order) into a single PDF and download it.
- **Split pages** — select specific pages and export them as a separate PDF.
- **Duplicate / delete pages** — clone any page or remove individual pages and entire source files.
- **Selection mode** — bulk-select pages for split or delete operations.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** `^20.19.0` or `>=22.12.0`
- **npm** (comes with Node.js)

### Install dependencies

```sh
npm install
```

### Run in development mode (hot-reload)

```sh
npm run dev
```

Open the URL printed in the terminal (usually `http://localhost:5173`).

### Build for production

```sh
npm run build
```

The optimised output is written to the `dist/` folder.

### Preview the production build

```sh
npm run preview
```

---

## 🛠 Tech Stack

| Layer | Library |
|-------|---------|
| UI framework | [Vue 3](https://vuejs.org/) (Composition API, `<script setup>`) |
| Build tool | [Vite](https://vite.dev/) |
| PDF rendering | [pdf.js (`pdfjs-dist`)](https://mozilla.github.io/pdf.js/) |
| PDF manipulation | [pdf-lib](https://pdf-lib.js.org/) |

---

## 📁 Project Structure

```
src/
├── App.vue              # Tab navigation (Editor ↔ Split/Merge)
├── main.js              # App entry point
├── pdfWorker.js         # Centralised pdf.js worker config (bundled locally)
├── components/
│   ├── PdfEditor.vue    # Text editing, zoom, overlay management
│   └── PdfMerger.vue    # Multi-file merge, split, page rearrangement
└── assets/              # Global styles
```

---

## 📝 License

Private project.

