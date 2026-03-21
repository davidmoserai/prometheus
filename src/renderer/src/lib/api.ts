import type { PrometheusAPI } from '../../../preload/index'

declare global {
  interface Window {
    api: PrometheusAPI
  }
}

export const api = typeof window !== 'undefined' ? window.api : null
