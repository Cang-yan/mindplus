<template>
  <component :is="currentView" />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const TranslationWorkspace = defineAsyncComponent(() => import('@/views/literature-translation-workspace.vue'))
const AssistantWorkspace = defineAsyncComponent(() => import('@/views/literature-assistant-workspace.vue'))

const currentView = computed(() => {
  const entry = String(route.query?.entry || '').trim().toLowerCase()
  if (entry === 'assistant') return AssistantWorkspace
  return TranslationWorkspace
})
</script>
