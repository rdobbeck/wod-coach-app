import { prisma } from "./prisma"

export async function checkVBTAccess(userId: string): Promise<boolean> {
  const subscription = await prisma.vBTSubscription.findUnique({
    where: { userId }
  })

  if (!subscription) return false

  const now = new Date()

  // Check if in trial period
  if (subscription.status === "TRIAL" && subscription.trialEndsAt) {
    return now < subscription.trialEndsAt
  }

  // Check if active paid subscription
  return subscription.status === "ACTIVE"
}

export async function getVBTSubscriptionStatus(userId: string) {
  const subscription = await prisma.vBTSubscription.findUnique({
    where: { userId }
  })

  if (!subscription) {
    return {
      hasAccess: false,
      status: null,
      daysRemaining: 0,
      isTrial: false
    }
  }

  const now = new Date()
  const hasAccess = await checkVBTAccess(userId)
  
  let daysRemaining = 0
  if (subscription.trialEndsAt) {
    daysRemaining = Math.ceil((subscription.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }

  return {
    hasAccess,
    status: subscription.status,
    daysRemaining: Math.max(0, daysRemaining),
    isTrial: subscription.status === "TRIAL",
    weeklyPrice: subscription.weeklyPrice,
    nextPaymentDate: subscription.nextPaymentDate
  }
}
