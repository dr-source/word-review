import { defineStore } from 'pinia'
import { ref } from 'vue'

const ADMIN_KEY = 'word_review_admin'

export const useAuthStore = defineStore('auth', () => {
  const isAdmin = ref(localStorage.getItem(ADMIN_KEY) === 'true')

  function enableAdmin() {
    isAdmin.value = true
    localStorage.setItem(ADMIN_KEY, 'true')
  }

  function disableAdmin() {
    isAdmin.value = false
    localStorage.removeItem(ADMIN_KEY)
  }

  return { isAdmin, enableAdmin, disableAdmin }
})
