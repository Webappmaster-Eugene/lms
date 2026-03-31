import configPromise from '@payload-config'
import { getPayload as getPayloadInstance } from 'payload'

export const getPayload = () => getPayloadInstance({ config: configPromise })
