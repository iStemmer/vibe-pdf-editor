<script setup>
import { ref, nextTick } from 'vue'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'

// Set worker source - use CDN for reliable loading
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`

const pdfDoc = ref(null)
const pdfBytes = ref(null)
const currentPage = ref(1)
const totalPages = ref(0)
const scale = ref(1.5)
const canvas = ref(null)
const textOverlays = ref([])
const isLoading = ref(false)
const fileName = ref('')
const selectedOverlay = ref(null)
const isAddingText = ref(false)

// Load PDF file
async function handleFileUpload(event) {
  const file = event.target.files[0]
  if (!file) return

  isLoading.value = true
  fileName.value = file.name

  try {
    const arrayBuffer = await file.arrayBuffer()
    pdfBytes.value = new Uint8Array(arrayBuffer)

    // Load with pdf-lib for editing
    pdfDoc.value = await PDFDocument.load(pdfBytes.value)
    totalPages.value = pdfDoc.value.getPageCount()

    // Reset overlays when loading new PDF
    textOverlays.value = []

    await renderPage()
  } catch (error) {
    console.error('Error loading PDF:', error)
    alert('Error loading PDF file')
  } finally {
    isLoading.value = false
  }
}

// Render current page
async function renderPage() {
  if (!pdfBytes.value) return

  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.value.slice() })
  const pdf = await loadingTask.promise
  const page = await pdf.getPage(currentPage.value)

  const viewport = page.getViewport({ scale: scale.value })
  const ctx = canvas.value.getContext('2d')

  canvas.value.width = viewport.width
  canvas.value.height = viewport.height

  await page.render({
    canvasContext: ctx,
    viewport: viewport
  }).promise
}

// Go to previous page
function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--
    renderPage()
  }
}

// Go to next page
function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    renderPage()
  }
}

// Handle canvas click to add text
function handleCanvasClick(event) {
  if (!isAddingText.value) return

  const rect = canvas.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  const newOverlay = {
    id: Date.now(),
    x,
    y,
    text: 'New text',
    fontSize: 16,
    color: '#000000',
    backgroundColor: '#ffffff',
    bgEnabled: true,
    bgWidth: 120,
    bgHeight: 22,
    page: currentPage.value,
    isEditing: true
  }

  textOverlays.value.push(newOverlay)
  selectedOverlay.value = newOverlay.id
  isAddingText.value = false

  nextTick(() => {
    const input = document.querySelector(`[data-overlay-id="${newOverlay.id}"] input`)
    if (input) {
      input.focus()
      input.select()
    }
  })
}

// Update text overlay position
function startDrag(event, overlay) {
  if (overlay.isEditing) return

  const startX = event.clientX
  const startY = event.clientY
  const origX = overlay.x
  const origY = overlay.y

  function onMouseMove(e) {
    overlay.x = origX + (e.clientX - startX)
    overlay.y = origY + (e.clientY - startY)
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// Delete selected overlay
function deleteOverlay(id) {
  textOverlays.value = textOverlays.value.filter(o => o.id !== id)
  selectedOverlay.value = null
}

// Resize background rectangle by dragging corner handle
function startResize(event, overlay) {
  event.preventDefault()
  const startX = event.clientX
  const startY = event.clientY
  const origW = overlay.bgWidth
  const origH = overlay.bgHeight

  function onMouseMove(e) {
    overlay.bgWidth = Math.max(10, origW + (e.clientX - startX))
    overlay.bgHeight = Math.max(10, origH + (e.clientY - startY))
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// Save PDF with modifications
async function savePdf() {
  if (!pdfDoc.value) return

  isLoading.value = true

  try {
    // Reload the original PDF to apply changes
    const newPdfDoc = await PDFDocument.load(pdfBytes.value)
    const helveticaFont = await newPdfDoc.embedFont(StandardFonts.Helvetica)

    // Apply text overlays to the PDF
    for (const overlay of textOverlays.value) {
      const page = newPdfDoc.getPage(overlay.page - 1)
      const { height } = page.getSize()

      // Convert screen coordinates to PDF coordinates
      const pdfX = overlay.x / scale.value
      const pdfFontSize = overlay.fontSize / scale.value
      const pdfY = height - (overlay.y / scale.value) - pdfFontSize

      // Parse color
      const hex = overlay.color.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16) / 255
      const g = parseInt(hex.substring(2, 4), 16) / 255
      const b = parseInt(hex.substring(4, 6), 16) / 255

      // Draw background rectangle if enabled
      if (overlay.bgEnabled) {
        const bgHex = overlay.backgroundColor.replace('#', '')
        const bgR = parseInt(bgHex.substring(0, 2), 16) / 255
        const bgG = parseInt(bgHex.substring(2, 4), 16) / 255
        const bgB = parseInt(bgHex.substring(4, 6), 16) / 255

        const rectWidth = overlay.bgWidth / scale.value
        const rectHeight = overlay.bgHeight / scale.value

        page.drawRectangle({
          x: pdfX,
          y: pdfY - (rectHeight - pdfFontSize),
          width: rectWidth,
          height: rectHeight,
          color: rgb(bgR, bgG, bgB),
        })
      }

      page.drawText(overlay.text, {
        x: pdfX,
        y: pdfY,
        size: pdfFontSize,
        font: helveticaFont,
        color: rgb(r, g, b)
      })
    }

    // Save the modified PDF
    const modifiedPdfBytes = await newPdfDoc.save()

    // Download the file
    const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName.value.replace('.pdf', '_edited.pdf')
    link.click()
    URL.revokeObjectURL(url)

  } catch (error) {
    console.error('Error saving PDF:', error)
    alert('Error saving PDF file')
  } finally {
    isLoading.value = false
  }
}

// Toggle add text mode
function toggleAddText() {
  isAddingText.value = !isAddingText.value
}

// Get overlays for current page
function getCurrentPageOverlays() {
  return textOverlays.value.filter(o => o.page === currentPage.value)
}
</script>

<template>
  <div class="pdf-editor">
    <div class="toolbar">
      <div class="toolbar-section">
        <label class="file-input-label">
          <input type="file" accept=".pdf" @change="handleFileUpload" />
          <span>📂 Open PDF</span>
        </label>
      </div>

      <div class="toolbar-section" v-if="pdfDoc">
        <button
          @click="toggleAddText"
          :class="{ active: isAddingText }"
          title="Click to add text, then click on the PDF"
        >
          ✏️ Add Text
        </button>
        <button @click="savePdf" :disabled="isLoading">
          💾 Save PDF
        </button>
      </div>

      <div class="toolbar-section" v-if="pdfDoc">
        <button @click="prevPage" :disabled="currentPage <= 1">◀</button>
        <span class="page-info">Page {{ currentPage }} of {{ totalPages }}</span>
        <button @click="nextPage" :disabled="currentPage >= totalPages">▶</button>
      </div>

      <div class="toolbar-section" v-if="pdfDoc">
        <label>
          Zoom:
          <select v-model.number="scale" @change="renderPage">
            <option :value="0.5">50%</option>
            <option :value="0.75">75%</option>
            <option :value="1">100%</option>
            <option :value="1.5">150%</option>
            <option :value="2">200%</option>
          </select>
        </label>
      </div>
    </div>

    <div v-if="isLoading" class="loading">
      Loading...
    </div>

    <div v-if="!pdfDoc && !isLoading" class="drop-zone">
      <p>📄 Open a PDF file to start editing</p>
      <p class="hint">Click "Open PDF" button above</p>
    </div>

    <div
      v-if="pdfDoc"
      class="canvas-container"
      :class="{ 'adding-text': isAddingText }"
    >
      <div class="canvas-wrapper">
        <canvas
          ref="canvas"
          @click="handleCanvasClick"
        ></canvas>

        <!-- Text overlays -->
        <div
          v-for="overlay in getCurrentPageOverlays()"
          :key="overlay.id"
          :data-overlay-id="overlay.id"
          class="text-overlay"
          :style="{
            left: overlay.x + 'px',
            top: overlay.y + 'px',
            fontSize: overlay.fontSize + 'px',
            color: overlay.color,
          }"
          :class="{ selected: selectedOverlay === overlay.id }"
          @mousedown="startDrag($event, overlay)"
          @click.stop="selectedOverlay = overlay.id"
        >
          <!-- Background rectangle -->
          <div
            v-if="overlay.bgEnabled"
            class="bg-rect"
            :style="{
              width: overlay.bgWidth + 'px',
              height: overlay.bgHeight + 'px',
              backgroundColor: overlay.backgroundColor,
            }"
          >
            <div
              v-if="selectedOverlay === overlay.id"
              class="resize-handle"
              @mousedown.stop="startResize($event, overlay)"
            ></div>
          </div>

          <!-- Text content -->
          <div class="text-content">
            <input
              v-if="overlay.isEditing"
              v-model="overlay.text"
              :style="{ fontSize: overlay.fontSize + 'px', color: overlay.color }"
              @blur="overlay.isEditing = false"
              @keydown.enter="overlay.isEditing = false"
              @click.stop
            />
            <span
              v-else
              @dblclick="overlay.isEditing = true"
            >
              {{ overlay.text }}
            </span>
          </div>

          <div v-if="selectedOverlay === overlay.id" class="overlay-controls">
            <div class="control-row">
              <label title="Text color">🖊️
                <input
                  type="color"
                  v-model="overlay.color"
                  @click.stop
                />
              </label>
              <label title="Font size">
                <input
                  type="number"
                  v-model.number="overlay.fontSize"
                  min="8"
                  max="72"
                  @click.stop
                />
              </label>
              <button @click.stop="deleteOverlay(overlay.id)" title="Delete">🗑️</button>
            </div>
            <div class="control-row">
              <label class="bg-toggle" title="Toggle background">
                <input
                  type="checkbox"
                  v-model="overlay.bgEnabled"
                  @click.stop
                />
                BG
              </label>
              <label v-if="overlay.bgEnabled" title="Background color">🎨
                <input
                  type="color"
                  v-model="overlay.backgroundColor"
                  @click.stop
                />
              </label>
              <label v-if="overlay.bgEnabled" title="Rectangle width" class="dim-label">
                W
                <input
                  type="number"
                  v-model.number="overlay.bgWidth"
                  min="10"
                  max="1000"
                  class="dim-input"
                  @click.stop
                />
              </label>
              <label v-if="overlay.bgEnabled" title="Rectangle height" class="dim-label">
                H
                <input
                  type="number"
                  v-model.number="overlay.bgHeight"
                  min="10"
                  max="1000"
                  class="dim-input"
                  @click.stop
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isAddingText" class="add-text-hint">
      Click anywhere on the PDF to add text
    </div>
  </div>
</template>

<style scoped>
.pdf-editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
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

.page-info {
  padding: 0 10px;
  font-size: 14px;
}

.toolbar select {
  padding: 6px 10px;
  background: #0f3460;
  border: 1px solid #0f3460;
  border-radius: 4px;
  color: #eee;
  cursor: pointer;
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

.canvas-container {
  flex: 1;
  overflow: auto;
  display: flex;
  justify-content: center;
  padding: 20px;
  background: #2a2a4a;
}

.canvas-container.adding-text {
  cursor: crosshair;
}

.canvas-wrapper {
  position: relative;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

canvas {
  display: block;
  background: white;
}

.text-overlay {
  position: absolute;
  cursor: move;
  min-width: 50px;
  user-select: none;
}

.text-overlay.selected {
  outline: 2px dashed #e94560;
  outline-offset: 2px;
}

.bg-rect {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  border: 1px dashed rgba(0, 0, 0, 0.15);
}

.text-overlay.selected .bg-rect {
  border: 1px dashed #e94560;
}

.resize-handle {
  position: absolute;
  bottom: -5px;
  right: -5px;
  width: 10px;
  height: 10px;
  background: #e94560;
  border-radius: 2px;
  cursor: nwse-resize;
  pointer-events: all;
}

.text-content {
  position: relative;
  z-index: 1;
  padding: 2px 4px;
}

.text-overlay input {
  border: none;
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 4px;
  min-width: 100px;
  outline: none;
}

.text-overlay span {
  display: block;
  white-space: nowrap;
}

.overlay-controls {
  position: absolute;
  top: -70px;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #16213e;
  padding: 6px 8px;
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  z-index: 100;
  min-width: max-content;
}

.control-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.control-row label {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: #ccc;
  white-space: nowrap;
}

.overlay-controls input[type="color"] {
  width: 22px;
  height: 22px;
  border: none;
  cursor: pointer;
  padding: 0;
  border-radius: 3px;
}

.overlay-controls input[type="number"] {
  width: 48px;
  padding: 2px 4px;
  border: 1px solid #0f3460;
  border-radius: 3px;
  background: #0f3460;
  color: #eee;
  font-size: 12px;
}

.overlay-controls button {
  padding: 2px 6px;
  background: #e94560;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
}

.bg-toggle {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: bold;
  color: #aaa;
}

.bg-toggle input[type="checkbox"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: #e94560;
}

.dim-label {
  font-size: 11px;
  font-weight: bold;
}

.dim-input {
  width: 50px !important;
  font-size: 11px !important;
}

.add-text-hint {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #e94560;
  color: white;
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 14px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
</style>



