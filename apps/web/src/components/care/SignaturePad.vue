<script setup lang="ts">
/**
 * 手写签名板：手机用手指、电脑用鼠标。导出时自动裁掉空白边、缩到合适大小，输出 PNG（data URL）。
 * 笔迹太少（可能只是点了一下）时 toPng() 返回 null，调用方提示“请签上完整的名字”。
 */
import { onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{ height?: number; placeholder?: string }>(), { height: 180, placeholder: '请在这里手写签名' })
const emit = defineEmits<{ change: [hasInk: boolean] }>()

const canvas = ref<HTMLCanvasElement | null>(null)
const wrap = ref<HTMLDivElement | null>(null)
const hasInk = ref(false)
let ctx: CanvasRenderingContext2D | null = null
let drawing = false
let last: { x: number; y: number } | null = null
let inkLength = 0
let box = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }
let dpr = 1

function setup() {
  const c = canvas.value
  const w = wrap.value
  if (!c || !w) return
  dpr = window.devicePixelRatio || 1
  const width = w.clientWidth
  c.width = Math.round(width * dpr)
  c.height = Math.round(props.height * dpr)
  c.style.width = `${width}px`
  c.style.height = `${props.height}px`
  ctx = c.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#111'
  ctx.lineWidth = 2.6
}
onMounted(setup)

const pos = (e: PointerEvent) => {
  const r = canvas.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}
function down(e: PointerEvent) {
  if (!ctx) return
  e.preventDefault()
  canvas.value!.setPointerCapture(e.pointerId)
  drawing = true
  last = pos(e)
  // 点一下也画个点
  ctx.beginPath()
  ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2)
  ctx.fillStyle = '#111'
  ctx.fill()
}
function move(e: PointerEvent) {
  if (!drawing || !ctx || !last) return
  e.preventDefault()
  const p = pos(e)
  ctx.beginPath()
  ctx.moveTo(last.x, last.y)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  inkLength += Math.hypot(p.x - last.x, p.y - last.y)
  box = { x1: Math.min(box.x1, p.x, last.x), y1: Math.min(box.y1, p.y, last.y), x2: Math.max(box.x2, p.x, last.x), y2: Math.max(box.y2, p.y, last.y) }
  last = p
  if (!hasInk.value && inkLength > 8) {
    hasInk.value = true
    emit('change', true)
  }
}
function up() {
  drawing = false
  last = null
}

function clear() {
  const c = canvas.value
  if (!c || !ctx) return
  ctx.clearRect(0, 0, c.width / dpr, c.height / dpr)
  hasInk.value = false
  inkLength = 0
  box = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }
  emit('change', false)
}

/** 裁掉空白边后导出 PNG；笔迹太少返回 null */
function toPng(): string | null {
  const c = canvas.value
  if (!c || !hasInk.value || inkLength < 60) return null
  const pad = 8
  const sx = Math.max(0, Math.floor((box.x1 - pad) * dpr))
  const sy = Math.max(0, Math.floor((box.y1 - pad) * dpr))
  const sw = Math.min(c.width - sx, Math.ceil((box.x2 - box.x1 + pad * 2) * dpr))
  const sh = Math.min(c.height - sy, Math.ceil((box.y2 - box.y1 + pad * 2) * dpr))
  if (sw < 10 || sh < 10) return null
  const maxW = 500
  const scale = Math.min(1, maxW / sw)
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(sw * scale))
  out.height = Math.max(1, Math.round(sh * scale))
  const o = out.getContext('2d')!
  o.drawImage(c, sx, sy, sw, sh, 0, 0, out.width, out.height)
  return out.toDataURL('image/png')
}

defineExpose({ clear, toPng, hasInk })
</script>

<template>
  <div ref="wrap" class="sp-wrap">
    <canvas ref="canvas" class="sp-canvas" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @pointerleave="up" />
    <div v-if="!hasInk" class="sp-hint">{{ placeholder }}</div>
  </div>
</template>

<style scoped>
.sp-wrap {
  position: relative;
  width: 100%;
  border: 1px dashed #aab;
  border-radius: 8px;
  background: #fff;
}
.sp-canvas {
  display: block;
  touch-action: none; /* 手指在上面画时不要滚动页面 */
  cursor: crosshair;
}
.sp-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #bbb;
  font-size: 18px;
  pointer-events: none;
}
</style>
