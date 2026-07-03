/**
 * 浏览器指纹采集工具
 * 收集 Canvas 指纹、字体、屏幕、时区等信息
 */
import { api } from '../api'

// 生成或读取持久化 browser_id
function getBrowserId(): string {
  let bid = localStorage.getItem('browser_id')
  if (bid) return bid
  bid = 'bid_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
  localStorage.setItem('browser_id', bid)
  return bid
}

// Canvas 指纹哈希
function getCanvasHash(): string {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 50
    const ctx = canvas.getContext('2d')!
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#f60'
    ctx.fillRect(0, 0, 200, 50)
    ctx.fillStyle = '#069'
    ctx.font = '14px Arial'
    ctx.fillText('DNS Portal Fingerprint', 5, 30)
    ctx.fillStyle = '#fff'
    ctx.font = '12px monospace'
    ctx.fillText('Cwm fjordbank glyphs vext quiz, 😃', 5, 45)
    const data = canvas.toDataURL()
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16)
  } catch {
    return ''
  }
}

// 检测字体（简化版 — 只检测常见系统字体差异）
function getFonts(): string[] {
  const baseFonts = ['monospace', 'sans-serif', 'serif']
  const testFonts = [
    'Arial', 'Arial Black', 'Arial Narrow', 'Calibri', 'Cambria',
    'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Helvetica',
    'Impact', 'Lucida Console', 'Lucida Sans Unicode', 'Microsoft Sans Serif',
    'Palatino', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS',
    'Verdana', 'SimSun', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC',
    'Apple Color Emoji', 'Noto Color Emoji',
  ]
  const detected: string[] = []
  const testString = 'mmmmmmmmmmlli'
  const testSize = '72px'
  const baseWidths: Record<string, number> = {}
  const container = document.createElement('div')
  container.style.cssText = 'position:absolute;left:-9999px;visibility:hidden;overflow:hidden'
  document.body.appendChild(container)

  baseFonts.forEach(base => {
    const span = document.createElement('span')
    span.style.cssText = `font-family:${base};font-size:${testSize}`
    span.textContent = testString
    container.appendChild(span)
    baseWidths[base] = span.offsetWidth
  })

  testFonts.forEach(font => {
    const span = document.createElement('span')
    span.style.cssText = `font-family:${font},monospace;font-size:${testSize}`
    span.textContent = testString
    container.appendChild(span)
    baseFonts.forEach(base => {
      if (span.offsetWidth !== baseWidths[base]) {
        if (!detected.includes(font)) detected.push(font)
      }
    })
  })

  document.body.removeChild(container)
  return detected
}

// 主采集函数
function collectFingerprint() {
  return {
    browser_id: getBrowserId(),
    screen_resolution: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: navigator.platform || '',
    canvas_hash: getCanvasHash(),
    fonts: getFonts(),
  }
}

// 主动提交指纹（延迟执行，避免干扰用户操作）
let submitted = false
export function submitFingerprint() {
  if (submitted) return
  submitted = true
  // 等待页面加载完成后提交，避免阻塞
  if (document.readyState === 'complete') {
    doSubmit()
  } else {
    window.addEventListener('load', () => doSubmit())
  }
}

async function doSubmit() {
  try {
    const data = collectFingerprint()
    await api.submitFingerprint(data)
  } catch {
    // 静默失败，不影响用户体验
  }
}
