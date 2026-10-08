import { APIError, type CollectionBeforeOperationHook } from 'payload'

/** Public multipart login must not switch a browser into an account chosen by another site. */
export const rejectForeignLoginOrigin: CollectionBeforeOperationHook = ({ operation, req }) => {
  if (operation !== 'login') return
  const origin = req.headers.get('origin')
  if (origin && origin !== req.payload.config.serverURL) {
    throw new APIError('Вход доступен только со страницы платформы', 403)
  }
}
