<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated>
      <q-toolbar>
        <q-toolbar-title>Citizens of New Eden</q-toolbar-title>
        <LoginButton size="small" />
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import LoginButton from "@/components/LoginButton.vue";
import { useLocation } from "@/composables/useLocation";

useLocation();
</script>
