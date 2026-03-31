import type { Access } from 'payload'

export const isAuthenticated: Access = ({ req: { user } }) => {
  return Boolean(user)
}
