<script setup>
import { ref, computed } from 'vue'
import { PDFDocument } from 'pdf-lib'
import pdfjsLib from '../pdfWorker.js'

// List of loaded PDF files
const pdfFiles = ref([])
// Flat list of all pages (references back to their source file)
const allPages = ref([])
// Currently dragged page index
const dragIndex = ref(null)
// Drop target index
const dropIndex = ref(null)
// Loading state
const isLoading = ref(false)
// Thumbnail scale
const thumbScale = 0.3
// Selected pages (for split/delete operations)
const selectedPages = ref(new Set())
// Whether we're in selection mode
const selectionMode = ref(false)
// Index for O(1) page entry lookup by 'fileId-pageIndex'
const pageIndex = new Map()

// Total page count
const totalPageCount = computed(() => allPages.value.length)

// Load one or more PDF files
async function handleFileUpload(event) {
  const files = Array.from(event.target.files)
  if (!files.length) return

  isLoading.value = true

  try {
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)

      // Load with pdf-lib for manipulation
      const pdfDoc = await PDFDocument.load(bytes)
      const pageCount = pdfDoc.getPageCount()

      const fileEntry = {
        id: Date.now() + Math.random(),
        name: file.name,
        bytes,
        pageCount,
      }

      pdfFiles.value.push(fileEntry)

      // Generate page entries and index them for O(1) lookup
      const createdEntries = []
      for (let i = 0; i < pageCount; i++) {
        const pageEntry = {
          id: `${fileEntry.id}-page-${i}`,
          fileId: fileEntry.id,
          fileName: file.name,
          pageIndex: i, // 0-based index within the source file
          pageLabel: `${file.name} — Page ${i + 1}`,
          thumbnail: null,
        }
        allPages.value.push(pageEntry)
        createdEntries.push(pageEntry)
        pageIndex.set(`${fileEntry.id}-${i}`, pageEntry)
      }

      // Generate thumbnails for this file (O(1) per page via index)
      await generateThumbnails(bytes, fileEntry.id, pageCount)
    }
  } catch (error) {
    console.error('Error loading PDF files:', error)
    alert('Error loading one or more PDF files.')
  } finally {
    isLoading.value = false
    // Reset the input so the same file can be loaded again
    event.target.value = ''
  }
}

// Generate thumbnails for all pages in a PDF
async function generateThumbnails(bytes, fileId, pageCount) {
  const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() })
  const pdf = await loadingTask.promise

  for (let i = 0; i < pageCount; i++) {
    const page = await pdf.getPage(i + 1)
    const viewport = page.getViewport({ scale: thumbScale })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height

    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
    }).promise

    const dataUrl = canvas.toDataURL('image/png')

    // O(1) lookup via index instead of linear scan
    const entry = pageIndex.get(`${fileId}-${i}`)
    if (entry) {
      entry.thumbnail = dataUrl
    }
  }
}

// ---- Drag & Drop reordering ----

function onDragStart(event, index) {
  dragIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', index)
}

function onDragEnd() {
  dragIndex.value = null
  dropIndex.value = null
}

function onDragOver(event, index) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dropIndex.value = index
}

function onDragLeave() {
  dropIndex.value = null
}

function onDrop(event, toIndex) {
  event.preventDefault()
  const fromIndex = dragIndex.value
  if (fromIndex === null || fromIndex === toIndex) {
    dropIndex.value = null
    return
  }

  const pages = [...allPages.value]
  const [moved] = pages.splice(fromIndex, 1)
  pages.splice(toIndex, 0, moved)
  allPages.value = pages

  dragIndex.value = null
  dropIndex.value = null
}

// ---- Selection ----

function toggleSelect(index) {
  const id = allPages.value[index].id
  const newSet = new Set(selectedPages.value)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
  }
  selectedPages.value = newSet
}

function selectAll() {
  selectedPages.value = new Set(allPages.value.map((p) => p.id))
}

function deselectAll() {
  selectedPages.value = new Set()
}

function isSelected(page) {
  return selectedPages.value.has(page.id)
}

// ---- Move pages ----

function movePageUp(index) {
  if (index <= 0) return
  const pages = [...allPages.value]
  ;[pages[index - 1], pages[index]] = [pages[index], pages[index - 1]]
  allPages.value = pages
}

function movePageDown(index) {
  if (index >= allPages.value.length - 1) return
  const pages = [...allPages.value]
  ;[pages[index], pages[index + 1]] = [pages[index + 1], pages[index]]
  allPages.value = pages
}

// ---- Delete selected pages ----

function deleteSelected() {
  if (selectedPages.value.size === 0) return
  if (!confirm(`Delete ${selectedPages.value.size} selected page(s)?`)) return

  const removed = allPages.value.filter((p) => selectedPages.value.has(p.id))
  for (const p of removed) pageIndex.delete(`${p.fileId}-${p.pageIndex}`)
  allPages.value = allPages.value.filter((p) => !selectedPages.value.has(p.id))
  selectedPages.value = new Set()
}

// ---- Delete single page ----

function deletePage(index) {
  const p = allPages.value[index]
  if (p) {
    pageIndex.delete(`${p.fileId}-${p.pageIndex}`)
    if (selectedPages.value.has(p.id)) {
      const newSet = new Set(selectedPages.value)
      newSet.delete(p.id)
      selectedPages.value = newSet
    }
  }
  allPages.value.splice(index, 1)
}

// ---- Remove all pages from a source file ----

function removeFile(fileId) {
  const removed = allPages.value.filter((p) => p.fileId === fileId)
  for (const p of removed) pageIndex.delete(`${p.fileId}-${p.pageIndex}`)
  allPages.value = allPages.value.filter((p) => p.fileId !== fileId)
  pdfFiles.value = pdfFiles.value.filter((f) => f.id !== fileId)
  // Clear selections that no longer exist
  const validIds = new Set(allPages.value.map((p) => p.id))
  selectedPages.value = new Set([...selectedPages.value].filter((id) => validIds.has(id)))
}

// ---- Duplicate a page ----

function duplicatePage(index) {
  const original = allPages.value[index]
  const clone = {
    ...original,
    id: `${original.id}-dup-${Date.now()}`,
  }
  allPages.value.splice(index + 1, 0, clone)
}

// ---- Split: Export selected pages as a separate PDF ----

async function splitSelected() {
  if (selectedPages.value.size === 0) {
    alert('Select pages to split first.')
    return
  }

  isLoading.value = true
  try {
    const newPdf = await PDFDocument.create()
    const srcDocCache = new Map()

    for (const page of allPages.value) {
      if (!selectedPages.value.has(page.id)) continue

      const sourceFile = pdfFiles.value.find((f) => f.id === page.fileId)
      if (!sourceFile) continue

      if (!srcDocCache.has(page.fileId)) {
        srcDocCache.set(page.fileId, await PDFDocument.load(sourceFile.bytes))
      }
      const srcDoc = srcDocCache.get(page.fileId)

      const [copiedPage] = await newPdf.copyPages(srcDoc, [page.pageIndex])
      newPdf.addPage(copiedPage)
    }

    const pdfBytes = await newPdf.save()
    downloadPdf(pdfBytes, 'split_pages.pdf')
  } catch (error) {
    console.error('Error splitting PDF:', error)
    alert('Error splitting PDF.')
  } finally {
    isLoading.value = false
  }
}

// ---- Merge: Export all pages in current order as one PDF ----

async function mergeAll() {
  if (allPages.value.length === 0) {
    alert('No pages to merge.')
    return
  }

  isLoading.value = true
  try {
    const newPdf = await PDFDocument.create()
    const srcDocCache = new Map()

    for (const page of allPages.value) {
      const sourceFile = pdfFiles.value.find((f) => f.id === page.fileId)
      if (!sourceFile) continue

      if (!srcDocCache.has(page.fileId)) {
        srcDocCache.set(page.fileId, await PDFDocument.load(sourceFile.bytes))
      }
      const srcDoc = srcDocCache.get(page.fileId)

      const [copiedPage] = await newPdf.copyPages(srcDoc, [page.pageIndex])
      newPdf.addPage(copiedPage)
    }

    const pdfBytes = await newPdf.save()
    downloadPdf(pdfBytes, 'merged.pdf')
  } catch (error) {
    console.error('Error merging PDF:', error)
    alert('Error merging PDF.')
  } finally {
    isLoading.value = false
  }
}

// ---- Helper: download PDF bytes ----

function downloadPdf(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// ---- Clear everything ----

function clearAll() {
  if (allPages.value.length && !confirm('Remove all loaded files and pages?')) return
  pdfFiles.value = []
  allPages.value = []
  selectedPages.value = new Set()
  pageIndex.clear()
}

// Source files summary
const fileSummary = computed(() => {
  const map = {}
  for (const p of allPages.value) {
    if (!map[p.fileId]) {
      map[p.fileId] = { name: p.fileName, fileId: p.fileId, count: 0 }
    }
    map[p.fileId].count++
  }
  return Object.values(map)
})
</script>

<template>
  <div class="pdf-merger">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-section">
        <label class="file-input-label">
          <input type="file" accept=".pdf" multiple @change="handleFileUpload" />
          <span>📂 Add PDF(s)</span>
        </label>
        <button @click="clearAll" :disabled="allPages.length === 0" title="Remove all">
          🗑️ Clear All
        </button>
      </div>

      <div class="toolbar-section" v-if="allPages.length > 0">
        <button
          @click="selectionMode = !selectionMode"
          :class="{ active: selectionMode }"
          title="Toggle selection mode to pick pages"
        >
          ☑️ Select
        </button>
        <template v-if="selectionMode">
          <button @click="selectAll" title="Select all pages">All</button>
          <button @click="deselectAll" title="Deselect all pages">None</button>
          <button
            @click="deleteSelected"
            :disabled="selectedPages.size === 0"
            class="danger-btn"
            title="Delete selected pages"
          >
            🗑️ Delete ({{ selectedPages.size }})
          </button>
          <button
            @click="splitSelected"
            :disabled="selectedPages.size === 0"
            title="Export selected pages as a new PDF"
          >
            ✂️ Split Selected
          </button>
        </template>
      </div>

      <div class="toolbar-section" v-if="allPages.length > 0">
        <button @click="mergeAll" :disabled="isLoading" title="Merge all pages into one PDF in the current order">
          📑 Merge & Download
        </button>
        <span class="page-count">{{ totalPageCount }} page{{ totalPageCount !== 1 ? 's' : '' }}</span>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="loading">Loading…</div>

    <!-- Empty state -->
    <div v-if="!allPages.length && !isLoading" class="drop-zone">
      <p>📑 Add PDF files to merge, split, or rearrange pages</p>
      <p class="hint">Click "Add PDF(s)" to load one or more files</p>
      <p class="hint">Drag & drop pages to reorder them, then merge into a single PDF</p>
    </div>

    <!-- Source files bar -->
    <div v-if="fileSummary.length" class="file-bar">
      <span class="file-bar-label">Loaded files:</span>
      <div
        v-for="f in fileSummary"
        :key="f.fileId"
        class="file-chip"
      >
        <span class="file-chip-name">{{ f.name }}</span>
        <span class="file-chip-count">({{ f.count }} pg)</span>
        <button class="file-chip-remove" @click="removeFile(f.fileId)" title="Remove this file">✕</button>
      </div>
    </div>

    <!-- Page grid -->
    <div v-if="allPages.length" class="page-grid">
      <div
        v-for="(page, index) in allPages"
        :key="page.id"
        class="page-card"
        :class="{
          selected: isSelected(page),
          'drop-target': dropIndex === index,
          'drag-source': dragIndex === index,
        }"
        draggable="true"
        @dragstart="onDragStart($event, index)"
        @dragend="onDragEnd"
        @dragover="onDragOver($event, index)"
        @dragleave="onDragLeave"
        @drop="onDrop($event, index)"
        @click="selectionMode ? toggleSelect(index) : null"
      >
        <!-- Selection checkbox -->
        <div v-if="selectionMode" class="select-check" @click.stop="toggleSelect(index)">
          <input type="checkbox" :checked="isSelected(page)" tabindex="-1" />
        </div>

        <!-- Page number badge -->
        <div class="page-number">{{ index + 1 }}</div>

        <!-- Thumbnail -->
        <div class="thumb-wrapper">
          <img v-if="page.thumbnail" :src="page.thumbnail" alt="Page thumbnail" class="thumb-img" />
          <div v-else class="thumb-placeholder">Loading…</div>
        </div>

        <!-- Page info -->
        <div class="page-info-bar">
          <span class="page-source" :title="page.pageLabel">
            {{ page.fileName.length > 18 ? page.fileName.slice(0, 15) + '…' : page.fileName }}
            <small>p{{ page.pageIndex + 1 }}</small>
          </span>
        </div>

        <!-- Actions -->
        <div class="page-actions">
          <button @click.stop="movePageUp(index)" :disabled="index === 0" title="Move up">⬆</button>
          <button @click.stop="movePageDown(index)" :disabled="index === allPages.length - 1" title="Move down">⬇</button>
          <button @click.stop="duplicatePage(index)" title="Duplicate page">📋</button>
          <button @click.stop="deletePage(index)" class="danger-btn" title="Remove page">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-merger {
  display: flex;
  flex-direction: column;
  height: 100%;
  flex: 1;
  background: #1a1a2e;
  color: #eee;
}

.toolbar {
  display: flex;
  gap: 20px;
  padding: 12px 20px;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
  flex-wrap: wrap;
  align-items: center;
}

.toolbar-section {
  display: flex;
  gap: 8px;
  align-items: center;
}

.file-input-label {
  cursor: pointer;
}

.file-input-label input {
  display: none;
}

.file-input-label span,
.toolbar button {
  padding: 8px 16px;
  background: #0f3460;
  border: none;
  border-radius: 6px;
  color: #eee;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.file-input-label span:hover,
.toolbar button:hover:not(:disabled) {
  background: #e94560;
}

.toolbar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar button.active {
  background: #e94560;
}

.danger-btn {
  background: #c0392b !important;
}

.danger-btn:hover:not(:disabled) {
  background: #e74c3c !important;
}

.page-count {
  font-size: 14px;
  padding: 0 8px;
  color: #aaa;
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  font-size: 18px;
}

.drop-zone {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex: 1;
  font-size: 24px;
  color: #666;
}

.drop-zone .hint {
  font-size: 14px;
  margin-top: 10px;
}

/* ---- File bar ---- */
.file-bar {
  display: flex;
  gap: 10px;
  padding: 8px 20px;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
  flex-wrap: wrap;
  align-items: center;
}

.file-bar-label {
  font-size: 13px;
  color: #888;
}

.file-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #0f3460;
  padding: 4px 10px;
  border-radius: 14px;
  font-size: 12px;
}

.file-chip-name {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-chip-count {
  color: #aaa;
}

.file-chip-remove {
  padding: 2px 5px !important;
  font-size: 11px !important;
  background: transparent !important;
  border: none;
  color: #e94560;
  cursor: pointer;
  border-radius: 50%;
  line-height: 1;
}

.file-chip-remove:hover {
  background: rgba(233, 69, 96, 0.2) !important;
}

/* ---- Page grid ---- */
.page-grid {
  flex: 1;
  overflow: auto;
  padding: 20px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  align-content: start;
}

.page-card {
  position: relative;
  background: #16213e;
  border: 2px solid #0f3460;
  border-radius: 8px;
  overflow: hidden;
  cursor: grab;
  transition: border-color 0.2s, transform 0.15s, box-shadow 0.15s;
  user-select: none;
}

.page-card:hover {
  border-color: #4287f5;
  box-shadow: 0 4px 16px rgba(66, 135, 245, 0.2);
}

.page-card.selected {
  border-color: #e94560;
  box-shadow: 0 0 0 2px rgba(233, 69, 96, 0.4);
}

.page-card.drop-target {
  border-color: #2ecc71;
  box-shadow: 0 0 0 3px rgba(46, 204, 113, 0.3);
  transform: scale(1.03);
}

.page-card.drag-source {
  opacity: 0.4;
}


.select-check {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 5;
}

.select-check input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #e94560;
}

.page-number {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  font-weight: bold;
  padding: 2px 7px;
  border-radius: 10px;
  z-index: 5;
}

.thumb-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 10px;
  min-height: 200px;
  background: #0d1b2a;
}

.thumb-img {
  max-width: 100%;
  max-height: 220px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  background: #fff;
}

.thumb-placeholder {
  color: #555;
  font-size: 13px;
}

.page-info-bar {
  padding: 6px 10px;
  background: #0f3460;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.page-source small {
  color: #aaa;
  margin-left: 4px;
}

.page-actions {
  display: flex;
  justify-content: center;
  gap: 4px;
  padding: 6px;
  background: #16213e;
}

.page-actions button {
  padding: 4px 8px !important;
  font-size: 12px !important;
  background: #0f3460 !important;
  border: none;
  border-radius: 4px;
  color: #eee;
  cursor: pointer;
  transition: background 0.2s;
}

.page-actions button:hover:not(:disabled) {
  background: #4287f5 !important;
}

.page-actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-actions .danger-btn:hover:not(:disabled) {
  background: #e74c3c !important;
}
</style>

