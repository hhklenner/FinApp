export const storage = {
  get: (key) => {
    try {
      const value = localStorage.getItem(key)
      if (value === null) throw new Error(`Key not found: ${key}`)
      return Promise.resolve({ key, value })
    } catch (e) { return Promise.reject(e) }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value)
      return Promise.resolve({ key, value })
    } catch (e) { return Promise.reject(e) }
  },
  delete: (key) => {
    try {
      localStorage.removeItem(key)
      return Promise.resolve({ key, deleted: true })
    } catch (e) { return Promise.reject(e) }
  },
}
