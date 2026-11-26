<script setup lang="ts">
import { ref } from 'vue'
import Home from './views/Home.vue'
import LocalGame from './views/LocalGame.vue'
import OnlineGame from './views/OnlineGame.vue'

type View = 'home' | 'local' | 'host' | 'join'
const view = ref<View>('home')
</script>

<template>
  <Home v-if="view === 'home'" @go="view = $event" />
  <LocalGame v-else-if="view === 'local'" @exit="view = 'home'" />
  <OnlineGame v-else :key="view" :mode="view" @exit="view = 'home'" />
</template>
