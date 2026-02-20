<script setup>
import { ref, nextTick, computed } from 'vue'
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

// Existing text items extracted from the PDF
const existingTextItems = ref([])
// Track which existing text items have been edited (by page)
const editedTextItems = ref({})
// Currently selected existing text item
const selectedTextItem = ref(null)
// Edit mode: 'add' for adding new overlays, 'edit' for editing existing text
const editMode = ref('edit')
// Text layer container ref
const textLayerContainer = ref(null)

// Zoom percentage display
const zoomPercent = computed(() => Math.round(scale.value * 100))

// Available zoom levels
const zoomLevels = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5]

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

    // Reset overlays and edits when loading new PDF
    textOverlays.value = []
    editedTextItems.value = {}
    existingTextItems.value = []
    selectedTextItem.value = null

    await renderPage()
  } catch (error) {
    console.error('Error loading PDF:', error)
    alert('Error loading PDF file')
  } finally {
    isLoading.value = false
  }
}

// Render current page and extract text
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

  // Extract text content for editing
  await extractTextItems(page, viewport)
}

// Extract text items from the current page
async function extractTextItems(page, viewport) {
  const textContent = await page.getTextContent()
  const items = []

  for (let i = 0; i < textContent.items.length; i++) {
    const item = textContent.items[i]
    if (!item.str || item.str.trim() === '') continue

    // Transform the text item position using the viewport
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)

    // tx[4] = x, tx[5] = y (bottom-left origin in PDF, but transformed to canvas coords)
    const x = tx[4]
    const y = tx[5]
    const fontSize = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3])
    const width = item.width * viewport.scale
    const height = item.height * viewport.scale

    const pageKey = currentPage.value
    const itemKey = `${pageKey}-${i}`

    // Check if this item has been edited before
    const edited = editedTextItems.value[itemKey]

    items.push({
      id: itemKey,
      index: i,
      originalText: item.str,
      text: edited ? edited.text : item.str,
      x,
      y: y - height, // adjust to top-left
      width,
      height: Math.max(height, fontSize),
      fontSize,
      page: currentPage.value,
      isEdited: !!edited,
      fontName: item.fontName || 'Helvetica',
      // Store original PDF coordinates for saving
      pdfX: item.transform[4],
      pdfY: item.transform[5],
      pdfFontSize: Math.sqrt(item.transform[2] * item.transform[2] + item.transform[3] * item.transform[3]),
      pdfWidth: item.width,
      pdfHeight: item.height,
    })
  }

  existingTextItems.value = items
}

// Click on an existing text item to edit it
function selectTextItem(event, item) {
  event.stopPropagation()
  selectedTextItem.value = item.id
  selectedOverlay.value = null
}

// Start editing text item inline
function startEditingTextItem(event, item) {
  event.stopPropagation()
  item.isEditing = true

  nextTick(() => {
    const input = document.querySelector(`[data-text-item-id="${item.id}"] input`)
    if (input) {
      input.focus()
      input.select()
    }
  })
}

// Finish editing a text item
function finishEditingTextItem(item) {
  item.isEditing = false

  const itemKey = item.id

  if (item.text !== item.originalText) {
    item.isEdited = true
    editedTextItems.value[itemKey] = {
      text: item.text,
      originalText: item.originalText,
      pdfX: item.pdfX,
      pdfY: item.pdfY,
      pdfFontSize: item.pdfFontSize,
      pdfWidth: item.pdfWidth,
      pdfHeight: item.pdfHeight,
      fontName: item.fontName,
      page: item.page,
    }
  } else {
    // Reverted to original, remove from edits
    item.isEdited = false
    delete editedTextItems.value[itemKey]
  }
}

// Revert a text item to its original text
function revertTextItem(item) {
  item.text = item.originalText
  item.isEdited = false
  delete editedTextItems.value[item.id]
  selectedTextItem.value = null
}

// Count of edited items
const editedCount = computed(() => Object.keys(editedTextItems.value).length)

// Go to previous page
function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--
    selectedTextItem.value = null
    renderPage()
  }
}

// Go to next page
function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    selectedTextItem.value = null
    renderPage()
  }
}

// Zoom in
function zoomIn() {
  const idx = zoomLevels.findIndex(z => z >= scale.value)
  if (idx < zoomLevels.length - 1) {
    scale.value = zoomLevels[idx + 1]
    renderPage()
  }
}

// Zoom out
function zoomOut() {
  const idx = zoomLevels.findIndex(z => z >= scale.value)
  if (idx > 0) {
    scale.value = zoomLevels[idx - 1]
    renderPage()
  }
}

// Handle mouse wheel zoom
function handleWheel(event) {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    if (event.deltaY < 0) {
      zoomIn()
    } else {
      zoomOut()
    }
  }
}

// Handle canvas click to add text
function handleCanvasClick(event) {
  // Deselect existing text item
  selectedTextItem.value = null

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

    // Apply edited existing text items
    for (const [, edit] of Object.entries(editedTextItems.value)) {
      const page = newPdfDoc.getPage(edit.page - 1)
      page.getSize() // ensure page is valid

      // Draw a tight white rectangle over the original text to "erase" it
      // Use minimal padding to cover antialiasing without obscuring neighboring text
      const rectPadding = 1
      // Use actual ascent from extracted PDF metrics (item.height = font ascent in PDF units)
      const ascent = edit.pdfHeight
      // Derive accurate descent from pdf-lib font metrics
      const fontTotalHeight = helveticaFont.heightAtSize(edit.pdfFontSize)
      const fontAscentHeight = helveticaFont.heightAtSize(edit.pdfFontSize, { descender: false })
      const descent = fontTotalHeight - fontAscentHeight
      page.drawRectangle({
        x: edit.pdfX - rectPadding,
        y: edit.pdfY - descent - rectPadding,
        width: edit.pdfWidth + rectPadding * 2,
        height: ascent + descent + rectPadding * 2,
        color: rgb(1, 1, 1), // white
        borderWidth: 0,
      })

      // Draw the new text
      page.drawText(edit.text, {
        x: edit.pdfX,
        y: edit.pdfY,
        size: edit.pdfFontSize,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      })
    }

    // Apply new text overlays to the PDF
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
  if (isAddingText.value) {
    editMode.value = 'add'
    selectedTextItem.value = null
  }
}

// Toggle edit existing text mode
function toggleEditMode() {
  editMode.value = editMode.value === 'edit' ? 'view' : 'edit'
  isAddingText.value = false
  selectedTextItem.value = null
  selectedOverlay.value = null
}

// Get overlays for current page
function getCurrentPageOverlays() {
  return textOverlays.value.filter(o => o.page === currentPage.value)
}

// Get existing text items for current page
function getCurrentPageTextItems() {
  return existingTextItems.value.filter(o => o.page === currentPage.value)
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
          @click="toggleEditMode"
          :class="{ active: editMode === 'edit' }"
          title="Click on existing text in the PDF to edit it"
        >
          🔤 Edit Text
        </button>
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
        <span v-if="editedCount > 0" class="edit-badge" title="Number of edited text items">
          {{ editedCount }} edit{{ editedCount > 1 ? 's' : '' }}
        </span>
      </div>

      <div class="toolbar-section" v-if="pdfDoc">
        <button @click="prevPage" :disabled="currentPage <= 1">◀</button>
        <span class="page-info">Page {{ currentPage }} of {{ totalPages }}</span>
        <button @click="nextPage" :disabled="currentPage >= totalPages">▶</button>
      </div>

      <div class="toolbar-section zoom-section" v-if="pdfDoc">
        <button @click="zoomOut" title="Zoom Out" :disabled="scale <= zoomLevels[0]">➖</button>
        <span class="zoom-display">{{ zoomPercent }}%</span>
        <button @click="zoomIn" title="Zoom In" :disabled="scale >= zoomLevels[zoomLevels.length - 1]">➕</button>
        <select v-model.number="scale" @change="renderPage" class="zoom-select">
          <option :value="0.25">25%</option>
          <option :value="0.5">50%</option>
          <option :value="0.75">75%</option>
          <option :value="1">100%</option>
          <option :value="1.25">125%</option>
          <option :value="1.5">150%</option>
          <option :value="2">200%</option>
          <option :value="2.5">250%</option>
          <option :value="3">300%</option>
          <option :value="4">400%</option>
          <option :value="5">500%</option>
        </select>
      </div>
    </div>

    <div v-if="isLoading" class="loading">
      Loading...
    </div>

    <div v-if="!pdfDoc && !isLoading" class="drop-zone">
      <p>📄 Open a PDF file to start editing</p>
      <p class="hint">Click "Open PDF" button above</p>
      <p class="hint">Then use 🔤 Edit Text to click on existing labels and fix them</p>
    </div>

    <div
      v-if="pdfDoc"
      class="canvas-container"
      :class="{ 'adding-text': isAddingText, 'edit-mode': editMode === 'edit' }"
      @wheel="handleWheel"
    >
      <div class="canvas-wrapper">
        <canvas
          ref="canvas"
          @click="handleCanvasClick"
        ></canvas>

        <!-- Existing text items layer (for editing) -->
        <div
          v-if="editMode === 'edit'"
          class="text-layer"
          ref="textLayerContainer"
        >
          <div
            v-for="item in getCurrentPageTextItems()"
            :key="item.id"
            :data-text-item-id="item.id"
            class="existing-text-item"
            :class="{
              selected: selectedTextItem === item.id,
              edited: item.isEdited,
            }"
            :style="{
              left: item.x + 'px',
              top: item.y + 'px',
              width: item.width + 'px',
              height: item.height + 'px',
              fontSize: item.fontSize + 'px',
              lineHeight: item.height + 'px',
            }"
            @click="selectTextItem($event, item)"
            @dblclick="startEditingTextItem($event, item)"
          >
            <input
              v-if="item.isEditing"
              v-model="item.text"
              :style="{
                fontSize: item.fontSize + 'px',
                width: Math.max(item.width, 100) + 'px',
                height: item.height + 'px',
              }"
              class="text-item-input"
              @blur="finishEditingTextItem(item)"
              @keydown.enter="finishEditingTextItem(item)"
              @click.stop
            />
            <span v-else class="text-item-label">{{ item.text }}</span>

            <!-- Controls for selected text item -->
            <div v-if="selectedTextItem === item.id && !item.isEditing" class="text-item-controls">
              <button
                @click.stop="startEditingTextItem($event, item)"
                title="Edit text"
                class="ctrl-btn"
              >✏️ Edit</button>
              <button
                v-if="item.isEdited"
                @click.stop="revertTextItem(item)"
                title="Revert to original"
                class="ctrl-btn revert-btn"
              >↩️ Revert</button>
              <span class="original-text" v-if="item.isEdited" title="Original text">
                was: "{{ item.originalText }}"
              </span>
            </div>
          </div>
        </div>

        <!-- New text overlays -->
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

    <div v-if="editMode === 'edit' && pdfDoc" class="edit-mode-hint">
      🔤 Edit mode: Click on text to select, double-click to edit. Ctrl+Scroll to zoom.
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

.edit-badge {
  background: #e94560;
  color: white;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
}

.zoom-section {
  gap: 4px;
}

.zoom-display {
  min-width: 50px;
  text-align: center;
  font-size: 14px;
  font-weight: bold;
  padding: 0 4px;
}

.zoom-select {
  padding: 6px 10px;
  background: #0f3460;
  border: 1px solid #0f3460;
  border-radius: 4px;
  color: #eee;
  cursor: pointer;
  font-size: 12px;
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

.canvas-container.edit-mode {
  cursor: default;
}

.canvas-wrapper {
  position: relative;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

canvas {
  display: block;
  background: white;
}

/* ---- Existing text items layer ---- */
.text-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.existing-text-item {
  position: absolute;
  pointer-events: all;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: 2px;
  transition: border-color 0.15s, background-color 0.15s;
  box-sizing: border-box;
  overflow: visible;
}

.existing-text-item:hover {
  border-color: rgba(66, 135, 245, 0.5);
  background-color: rgba(66, 135, 245, 0.08);
}

.existing-text-item.selected {
  border-color: #4287f5;
  background-color: rgba(66, 135, 245, 0.12);
  z-index: 10;
}

.existing-text-item.edited {
  border-color: #e94560;
  background-color: rgba(233, 69, 96, 0.08);
}

.existing-text-item.edited.selected {
  border-color: #e94560;
  background-color: rgba(233, 69, 96, 0.15);
}

.text-item-label {
  display: block;
  white-space: nowrap;
  color: transparent;
  user-select: none;
  pointer-events: none;
}

.existing-text-item.edited .text-item-label {
  color: rgba(233, 69, 96, 0.6);
  font-weight: bold;
}

.text-item-input {
  position: absolute;
  top: 0;
  left: 0;
  border: 2px solid #4287f5;
  background: rgba(255, 255, 255, 0.95);
  color: #000;
  padding: 0 2px;
  outline: none;
  z-index: 20;
  min-width: 120px;
  box-sizing: border-box;
  border-radius: 3px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.text-item-controls {
  position: absolute;
  top: -36px;
  left: 0;
  display: flex;
  gap: 6px;
  align-items: center;
  background: #16213e;
  padding: 5px 10px;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  z-index: 100;
  white-space: nowrap;
}

.ctrl-btn {
  padding: 3px 8px !important;
  font-size: 12px !important;
  background: #0f3460 !important;
  border: none;
  border-radius: 4px;
  color: #eee;
  cursor: pointer;
  transition: background 0.2s;
}

.ctrl-btn:hover {
  background: #4287f5 !important;
}

.revert-btn:hover {
  background: #e94560 !important;
}

.original-text {
  font-size: 11px;
  color: #888;
  font-style: italic;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---- New text overlays ---- */
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

.edit-mode-hint {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #0f3460;
  color: #ccc;
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 13px;
  border: 1px solid #4287f5;
  pointer-events: none;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
</style>


