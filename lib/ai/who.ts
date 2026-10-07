/** Who applied a batch of AI edits, as the viewing coach should read it. Rows from before `appliedById` existed were coach-applied. */
export function whoApplied({ appliedById, clientId, viewerId, clientFirst }: { appliedById: string | null; clientId: string; viewerId: string; clientFirst: string }) {
  if (appliedById === clientId) return clientFirst
  if (!appliedById || appliedById === viewerId) return "you"
  return "another coach"
}
