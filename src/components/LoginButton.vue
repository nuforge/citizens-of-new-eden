<script setup lang="ts">
import { ref, computed } from "vue";
import { useQuasar } from "quasar";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { useLocationStore } from "@/stores/location";
import { useSso } from "@/composables/useSso";
import ssoLoginBlack from "@/assets/eve-sso-login-black-large.png";
import ssoLoginWhite from "@/assets/eve-sso-login-white-large.png";
import ssoLoginBlackSmall from "@/assets/eve-sso-login-black-small.png";
import ssoLoginWhiteSmall from "@/assets/eve-sso-login-white-small.png";

type LoginButtonSize = "small" | "large";

const props = withDefaults(defineProps<{ size?: LoginButtonSize }>(), {
  size: "large"
});

const $q = useQuasar();
const authStore = useAuthStore();
const locationStore = useLocationStore();
const { isAuthenticated, character } = storeToRefs(authStore);
const { systemName } = storeToRefs(locationStore);
const { login, logout } = useSso();

const loading = ref(false);

const currentLocation = computed(() =>
  systemName.value === "—" ? null : systemName.value
);

const ssoLoginImage = computed(() => {
  if (props.size === "small") {
    return $q.dark.isActive ? ssoLoginWhiteSmall : ssoLoginBlackSmall;
  }

  return $q.dark.isActive ? ssoLoginWhite : ssoLoginBlack;
});

function handleLogin(): void {
  loading.value = true;
  login().catch((err: unknown) => {
    loading.value = false;
    console.error("SSO login error:", err);
  });
}

function handleLogout(): void {
  logout();
}
</script>

<style scoped>
.sso-login-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.sso-login-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.sso-login-btn img {
  display: block;
  height: auto;
  width: auto;
}
</style>

<template>
  <button
    v-if="!isAuthenticated"
    class="sso-login-btn"
    :disabled="loading"
    @click="handleLogin"
  >
    <q-spinner v-if="loading" color="primary" size="sm" />
    <img v-else :src="ssoLoginImage" alt="Login with EVE Online" />
  </button>
  <div v-else class="row items-center gap-sm">
    <q-avatar size="32px">
      <img
        :src="`https://images.evetech.net/characters/${character?.characterId}/portrait?size=64`"
        :alt="character?.characterName"
      />
    </q-avatar>
    <div class="column items-start q-mr-sm">
      <span class="text-body2">{{ character?.characterName }}</span>
      <span v-if="currentLocation" class="text-caption text-grey-6">{{
        currentLocation
      }}</span>
    </div>
    <q-btn
      flat
      dense
      icon="logout"
      label="Logout"
      size="sm"
      @click="handleLogout"
    />
  </div>
</template>
