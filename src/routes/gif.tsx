import { createFileRoute } from '@tanstack/react-router'
import { GifMaker } from '../components/gif-maker'

export const Route = createFileRoute('/gif')({
  component: GifMaker,
})
