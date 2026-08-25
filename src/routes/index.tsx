import { createFileRoute } from '@tanstack/react-router'
import { StitcherEditor } from '../components/stitcher-editor'

export const Route = createFileRoute('/')({
  component: StitcherEditor,
})
