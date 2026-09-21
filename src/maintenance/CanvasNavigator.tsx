import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { Viewport } from '@xyflow/react'
import { useEdges, useNodes, useReactFlow, useStore, useViewport } from '@xyflow/react'

/** Navigation only: never edits graph objects or reference relationships. */
export function CanvasNavigator({ onNavigate }: { onNavigate: (viewport: Viewport) => void }) {
  const nodes = useNodes(), edges = useEdges(), flow = useReactFlow(), viewport = useViewport()
  const width = useStore(state => state.width), height = useStore(state => state.height)
  const dragging = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const [, render] = useState(0)
  const visible = { x: -viewport.x / viewport.zoom, y: -viewport.y / viewport.zoom, width: width / viewport.zoom, height: height / viewport.zoom }
  const boxes = nodes.filter(node => !node.hidden).map(node => {
    const internal = flow.getInternalNode(node.id)
    return { id: node.id, selected: node.selected, ...(internal?.internals.positionAbsolute ?? node.position), width: node.measured?.width ?? node.width ?? 260, height: node.measured?.height ?? node.height ?? 140 }
  })
  const left = Math.min(visible.x, ...boxes.map(node => node.x)), top = Math.min(visible.y, ...boxes.map(node => node.y))
  const right = Math.max(visible.x + visible.width, ...boxes.map(node => node.x + node.width))
  const bottom = Math.max(visible.y + visible.height, ...boxes.map(node => node.y + node.height))
  const scale = Math.max((right - left + 80) / 176, (bottom - top + 80) / 112, 1)
  const bounds = dragging.current ?? { x: (left + right - 176 * scale) / 2, y: (top + bottom - 112 * scale) / 2, width: 176 * scale, height: 112 * scale }
  const byId = new Map(boxes.map(node => [node.id, node]))
  const navigate = (x: number, y: number) => {
    const zoom = flow.getZoom()
    void flow.setCenter(x, y, { zoom, duration: 0 })
    onNavigate({ x: width / 2 - x * zoom, y: height / 2 - y * zoom, zoom })
  }
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(), box = dragging.current ?? bounds
    navigate(box.x + (event.clientX - rect.left) / rect.width * box.width, box.y + (event.clientY - rect.top) / rect.height * box.height)
  }
  const finish = () => { dragging.current = null; render(value => value + 1) }
  return <div className="mg-navigator nodrag nopan nowheel" role="group" aria-label="画布导航小地图" tabIndex={0}
    title="点击或拖动定位，方向键移动视野" onKeyDown={event => {
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
      if (!delta) return
      event.preventDefault(); event.stopPropagation()
      navigate(visible.x + visible.width * (0.5 + delta[0] * 0.25), visible.y + visible.height * (0.5 + delta[1] * 0.25))
    }}>
    <svg viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} preserveAspectRatio="none" role="img" aria-label="节点连线及当前可见区域"
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); dragging.current = bounds; event.currentTarget.setPointerCapture(event.pointerId); move(event) }}
      onPointerMove={event => { if (dragging.current) move(event) }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
      {edges.filter(edge => !edge.hidden).map(edge => { const source = byId.get(edge.source), target = byId.get(edge.target); return source && target ? <line key={edge.id} className="mg-navigator-edge" x1={source.x + source.width / 2} y1={source.y + source.height} x2={target.x + target.width / 2} y2={target.y} vectorEffect="non-scaling-stroke" /> : null })}
      {boxes.map(node => <rect key={node.id} className="mg-navigator-node" data-selected={node.selected || undefined} x={node.x} y={node.y} width={node.width} height={node.height} rx={4 * scale} />)}
      <rect className="mg-navigator-viewport" x={visible.x} y={visible.y} width={visible.width} height={visible.height} vectorEffect="non-scaling-stroke" />
    </svg>
  </div>
}
