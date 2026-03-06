'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface VBTUnlockButtonProps {
  hasAccess: boolean
  status: string | null
  daysRemaining: number
  isTrial: boolean
}

export default function VBTUnlockButton({ hasAccess, status, daysRemaining, isTrial }: VBTUnlockButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleStartTrial = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vbt/start-trial', {
        method: 'POST',
      })
      
      if (res.ok) {
        router.refresh()
      } else {
        alert('Failed to start trial. Please try again.')
      }
    } catch (error) {
      alert('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubscribe = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vbt/create-checkout', {
        method: 'POST',
      })
      
      const { url } = await res.json()
      if (url) {
        window.location.href = url
      }
    } catch (error) {
      alert('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // User has active access
  if (hasAccess) {
    return (
      <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-green-900">
              ✓ VBT Tracking Enabled
            </h3>
            <p className="text-sm text-green-700 mt-1">
              {isTrial 
                ? `${daysRemaining} days left in your free trial`
                : 'Active subscription - $4.99/week'
              }
            </p>
          </div>
          {!isTrial && (
            <button
              className="text-sm text-green-700 hover:text-green-900 underline"
              onClick={() => router.push('/client/vbt/manage')}
            >
              Manage
            </button>
          )}
        </div>
      </div>
    )
  }

  // User's trial expired or cancelled
  if (status === 'EXPIRED' || status === 'CANCELLED') {
    return (
      <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg p-8 text-white">
        <div className="text-center">
          <div className="text-4xl mb-4">🚀</div>
          <h3 className="text-2xl font-bold mb-2">
            Unlock VBT Tracking
          </h3>
          <p className="text-primary-100 mb-6">
            Get real-time velocity tracking, bar speed analysis, and data-driven training recommendations.
          </p>
          <div className="bg-white/20 rounded-lg p-4 mb-6">
            <div className="text-3xl font-bold">$4.99</div>
            <div className="text-sm text-primary-100">per week</div>
          </div>
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="w-full bg-white text-primary-600 font-semibold py-3 px-6 rounded-lg hover:bg-primary-50 transition disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Subscribe Now'}
          </button>
          <p className="text-xs text-primary-100 mt-3">Cancel anytime</p>
        </div>
      </div>
    )
  }

  // New user - offer free trial
  return (
    <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg p-8 text-white">
      <div className="text-center">
        <div className="text-4xl mb-4">📊</div>
        <h3 className="text-2xl font-bold mb-2">
          Try VBT Tracking Free for 7 Days
        </h3>
        <p className="text-primary-100 mb-6">
          Experience velocity-based training with real-time bar speed tracking, power analysis, and optimized load recommendations.
        </p>
        
        <div className="bg-white/10 rounded-lg p-6 mb-6 text-left">
          <h4 className="font-semibold mb-3">What you get:</h4>
          <ul className="space-y-2 text-sm">
            <li>✓ Real-time velocity tracking</li>
            <li>✓ Bar speed analysis</li>
            <li>✓ Power output calculations</li>
            <li>✓ Force-velocity profiling</li>
            <li>✓ Fatigue monitoring</li>
            <li>✓ Data-driven load recommendations</li>
          </ul>
        </div>

        <button
          onClick={handleStartTrial}
          disabled={loading}
          className="w-full bg-white text-primary-600 font-semibold py-3 px-6 rounded-lg hover:bg-primary-50 transition disabled:opacity-50 mb-3"
        >
          {loading ? 'Starting Trial...' : 'Start 7-Day Free Trial'}
        </button>
        
        <p className="text-xs text-primary-100">
          Then $4.99/week. Cancel anytime.
        </p>
      </div>
    </div>
  )
}
