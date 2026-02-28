<script setup>
import { ref } from 'vue'
import PdfEditor from './components/PdfEditor.vue'
import PdfMerger from './components/PdfMerger.vue'

const activeTab = ref('editor')
</script>

<template>
  <div class="app-shell">
    <nav class="app-tabs">
      <button
        :class="{ active: activeTab === 'editor' }"
        @click="activeTab = 'editor'"
      >
        ✏️ PDF Editor
      </button>
      <button
        :class="{ active: activeTab === 'merger' }"
        @click="activeTab = 'merger'"
      >
        📑 Split / Merge
      </button>
    </nav>
    <div class="tab-content">
      <KeepAlive>
        <component :is="activeTab === 'editor' ? PdfEditor : PdfMerger" :key="activeTab" />
      </KeepAlive>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1a1a2e;
}

.app-tabs {
  display: flex;
  gap: 0;
  background: #0d1b2a;
  border-bottom: 2px solid #0f3460;
  padding: 0 16px;
  flex-shrink: 0;
}

.app-tabs button {
  padding: 10px 24px;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  color: #888;
  font-size: 15px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.app-tabs button:hover {
  color: #ccc;
  background: rgba(255, 255, 255, 0.03);
}

.app-tabs button.active {
  color: #eee;
  border-bottom-color: #e94560;
  background: rgba(233, 69, 96, 0.08);
}

.tab-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
