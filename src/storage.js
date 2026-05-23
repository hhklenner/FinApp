// Drop-in replacement for window.storage using localStorage
// Matches the get/set/delete API used in the dashboards

export const storage = {
  get: (key) => {
    try {
      const value = localStorage.getItem(key)
      if (value === null) throw new Error(`Key not found: ${key}`)
      return Promise.resolve({ key, value })
    } catch (e) {
      return Promise.reject(e)
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value)
      return Promise.resolve({ key, value })
    } catch (e) {
      return Promise.reject(e)
    }
  },
  delete: (key) => {
    try {
      localStorage.removeItem(key)
      return Promise.resolve({ key, deleted: true })
    } catch (e) {
      return Promise.reject(e)
    }
  },
  list: (prefix = '') => {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix))
      return Promise.resolve({ keys })
    } catch (e) {
      return Promise.reject(e)
    }
  }
}
