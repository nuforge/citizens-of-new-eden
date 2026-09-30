<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useSso } from "@/composables/useSso";

const router = useRouter();
const { handleCallback } = useSso();

const processing = ref(true);
const callbackError = ref<string | null>(null);

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const errorDescription = params.get("error_description");

  if (error) {
    callbackError.value = errorDescription ?? error;
    processing.value = false;
    return;
  }

  if (!code || !state) {
    callbackError.value = "Missing authorization code or state parameter.";
    processing.value = false;
    return;
  }

  try {
    await handleCallback(code, state);
    await router.replace("/");
  } catch (err) {
    callbackError.value =
      err instanceof Error ? err.message : "Unknown error during login.";
    processing.value = false;
  }
});
</script>

<template>
  <div
    class="row items-center justify-center q-pa-lg"
    style="min-height: 100vh"
  >
    <div class="column items-center q-gutter-md">
      <q-spinner-orbit v-if="processing" color="primary" size="4em" />

      <div v-else-if="callbackError" class="text-center">
        <q-icon name="error" color="negative" size="3em" />
        <div class="text-h6 q-mt-sm text-negative">Login Failed</div>
        <div class="text-body2 q-mt-xs">{{ callbackError }}</div>
        <q-btn class="q-mt-md" label="Try Again" color="primary" to="/" />
      </div>
    </div>
  </div>
</template>
