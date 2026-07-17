'use client'
import { useState, useCallback } from 'react'

export function useApi(fn) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const call = useCallback(async (...args) => {
    setLoading(true); setError(null)
    try {
      const result = await fn(...args)
      return result
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [fn])

  return { call, loading, error }
}
