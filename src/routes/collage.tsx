import { createFileRoute } from '@tanstack/react-router'
import { CollageMaker } from '../components/collage-maker'

export const Route = createFileRoute('/collage')({
  component: CollageMaker,
})
