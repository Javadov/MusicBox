<script setup lang="ts">
import { computed } from 'vue'
import { rank } from '../lib/game'

const props = defineProps<{
  players: { id: string; name: string }[]
  totals: Record<string, number>
  meId?: string
  final?: boolean
}>()
const rows = computed(() => rank(props.players, props.totals))
const worst = computed(() => Math.min(...rows.value.map((r) => r.total)))
const best = computed(() => Math.max(...rows.value.map((r) => r.total)))
</script>

<template>
  <ol class="list">
    <li v-for="r in rows" :key="r.id">
      <span class="place">{{ r.place }}</span>
      <strong>{{ r.name }}</strong>
      <span v-if="r.id === meId" class="tag mint">du</span>
      <template v-if="final && rows.length > 1">
        <span v-if="r.total === best" class="tag gold">Vinnare</span>
        <span v-else-if="r.total === worst" class="tag">Förlorare</span>
      </template>
      <span class="pts">{{ r.total }}<small class="muted"> p</small></span>
    </li>
  </ol>
</template>
