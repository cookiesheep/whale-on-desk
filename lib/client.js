/**
 * whale-on-desk browser half.
 *
 * Registered with the DSH shell module loader, injects one entry into the
 * `shell.overlay` slot: a draggable whale that polls /whale/state and
 * renders the matching sprite (or the built-in placeholder whale until
 * art lands in assets/).
 */
;(function () {
  'use strict'

  window.__ModuleLoader__.load({
    id: 'whale-on-desk',
    factory: function (require) {
      const React = require('react')
      const h = React.createElement

      /* Zero-asset synthesized sounds. AudioContext unlocks on first
         pointer interaction; before that, sounds stay silent. */
      let audioCtx = null
      const ensureAudio = () => {
        if (!audioCtx) {
          try { audioCtx = new (window.AudioContext || window.webkitAudioContext)() } catch (e) { audioCtx = null }
        }
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume()
        return audioCtx
      }
      const tone = (freq, start, dur, type, volume) => {
        const ctx = audioCtx
        if (!ctx || ctx.state !== 'running') return
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = type
        osc.frequency.value = freq
        const t0 = ctx.currentTime + start
        gain.gain.setValueAtTime(0.0001, t0)
        gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t0)
        osc.stop(t0 + dur + 0.05)
      }
      const playSound = (state) => {
        ensureAudio()
        if (state === 'poked-flail' || state === 'startled') {
          tone(620, 0, 0.09, 'square', 0.04)
          tone(880, 0.07, 0.1, 'square', 0.04)
        } else if (state === 'celebrate') {
          tone(660, 0, 0.12, 'triangle', 0.06)
          tone(880, 0.1, 0.12, 'triangle', 0.06)
          tone(1100, 0.2, 0.16, 'triangle', 0.06)
        } else if (state === 'glass-tap') {
          // Woody knock: fundamental plus a quick fifth partial.
          tone(190, 0, 0.06, 'sine', 0.1)
          tone(285, 0, 0.04, 'sine', 0.04)
          tone(160, 0.12, 0.06, 'sine', 0.1)
          tone(240, 0.12, 0.04, 'sine', 0.04)
        } else if (state === 'sink') {
          tone(330, 0, 0.15, 'sine', 0.04)
          tone(220, 0.12, 0.2, 'sine', 0.04)
        } else if (state === 'pet') {
          tone(520, 0, 0.16, 'sine', 0.035)
          tone(660, 0.12, 0.2, 'sine', 0.035)
        }
      }

      /* Placeholder pixel whale (16x11 logical pixels, palette per docs/ART_SPEC.md).
         Replaced by sprite GIFs once assets/manifest.json maps states. */
      const PIXEL_ROWS = [
        '................',
        '.....FF.........',
        '.....FF.........',
        '....OOOOOO......',
        '...OBBBBHHO.....',
        '..OBBBBBBHBO....',
        '.TDBBBBBBBBWO...',
        'TTDBBBBBBBBWPO..',
        '.TDBBWWWWBBO....',
        '..TTOWWWWOO.....',
        '...TTOOOO.......',
      ]
      const PIXEL_COLORS = {
        O: '#1A1030', B: '#23324D', D: '#17233A', H: '#3C5A86',
        W: '#F2F5F9', P: '#101623', F: '#BFE3FF', T: '#17233A',
      }

      function PlaceholderWhale() {
        const rects = []
        PIXEL_ROWS.forEach((row, y) => {
          for (let x = 0; x < row.length; x++) {
            const color = PIXEL_COLORS[row[x]]
            if (color) rects.push(h('rect', { key: x + '-' + y, x, y, width: 1, height: 1, fill: color }))
          }
        })
        return h('svg', {
          viewBox: '0 0 16 11', width: '100%', height: '100%',
          shapeRendering: 'crispEdges', style: { display: 'block' },
        }, rects)
      }

      const ZH = (typeof navigator !== 'undefined' && String(navigator.language || '').toLowerCase().startsWith('zh'))

      /* Friendly bubble labels for common DSH tool names. */
      const TOOL_LABELS = ZH ? {
        bash: '敲命令', sh: '敲命令', pwsh: '敲命令', terminal: '开终端',
        read: '读文件', write: '写文件', edit: '改文件', 'str_replace_editor': '改文件',
        glob: '找文件', grep: '搜代码', search: '搜代码',
        web_search: '搜网页', fetch: '开网页', webfetch: '开网页',
        todo_write: '记清单', subagent: '派帮手', workflow: '编排任务',
        skills: '翻技能册', plan: '定计划', goal: '盯目标',
      } : {
        bash: 'running bash', sh: 'running bash', pwsh: 'running bash', terminal: 'terminal',
        read: 'reading', write: 'writing', edit: 'editing', 'str_replace_editor': 'editing',
        glob: 'finding files', grep: 'searching', search: 'searching',
        web_search: 'web search', fetch: 'fetching', webfetch: 'fetching',
        todo_write: 'todo list', subagent: 'delegating', workflow: 'workflow',
        skills: 'browsing skills', plan: 'planning', goal: 'tracking goal',
      }

      const BUBBLE_LABELS = ZH ? {
        'glass-tap': '! 谁批准一下',
        sleep: 'Zzz',
        nightcap: '夜深了…',
      } : {
        'glass-tap': '! Need your approval',
        sleep: 'Zzz',
        nightcap: 'Late night…',
      }

      const STATE_LABELS = ZH ? {
        idle: '待机', 'swim-fast': '写代码', think: '思考', 'tool-run': '跑工具',
        'glass-tap': '等批准', celebrate: '庆祝', eat: '加餐', sink: '受挫',
        sleep: '睡觉', nightcap: '守夜', startled: '吓一跳', 'poked-flail': '生气',
        greet: '打招呼', compact: '消化中',
      } : {
        idle: 'idle', 'swim-fast': 'writing', think: 'thinking', 'tool-run': 'tools',
        'glass-tap': 'awaiting approval', celebrate: 'done 🎉', eat: 'snacking', sink: 'oops',
        sleep: 'asleep', nightcap: 'night watch', startled: '!', 'poked-flail': 'grr!',
        greet: 'hi!', compact: 'compacting',
      }

      const fmtDur = ZH
        ? (s) => (s >= 60 ? Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒' : s + ' 秒')
        : (s) => (s >= 60 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : s + 's')

      /** One speech line for the current snapshot, shared by both modes. */
      const bubbleText = (snap, state, quip) => quip
        || (snap.hint && snap.hint.kind === 'done'
          ? (ZH ? '搞定! ' : 'Done! ') + fmtDur(snap.hint.secs) + (ZH ? ',跑了 ' : ', ') + snap.hint.tools + (ZH ? ' 个工具' : ' tools') + (snap.hint.edits ? (ZH ? ',改了 ' : ', ') + snap.hint.edits + (ZH ? ' 个文件' : ' files edited') : '')
          : null)
        || (snap.hint && snap.hint.kind === 'bored' ? (ZH ? '我闲着呢,有活吗?' : 'Anyone got work for me?') : null)
        || BUBBLE_LABELS[state]
        || (snap.hint && snap.hint.kind === 'tool' ? (TOOL_LABELS[snap.hint.name] ?? snap.hint.name) : null)
        || (snap.hint && snap.hint.kind === 'context' ? (ZH ? '吃饱了' : 'Full: ') + snap.hint.pct + '%' : null)

      function stateClass(state) {
        return 'whale-on-desk-state-' + state
      }

      /* Sprites whose native art faces RIGHT (pixel-audited); everything else
         faces LEFT. We normalize to left-facing at the img so both modes and
         every state share one body orientation. */
      const FACES_RIGHT = new Set(['glass-tap.gif', 'swim-fast.gif', 'tool-run.gif'])
      const spriteTransform = (file) => (FACES_RIGHT.has(file) ? 'scaleX(-1)' : undefined)

      /* Background aquarium: a tank-glass skin over the working UI. The agent
         whale mirrors the pet-machine state, token fish count the turn's
         tool calls, and the edge gauge reads the context window. */
      const WATER_THEMES = {
        dark: {
          tint: 'linear-gradient(180deg, rgba(16,32,52,0.38) 0%, rgba(12,22,38,0.5) 55%, rgba(8,15,28,0.66) 100%)',
          ray: 'rgba(191,227,255,0.07)', caustic: 'rgba(191,227,255,0.10)',
          bubBorder: 'rgba(191,227,255,0.34)', bubFill: 'rgba(191,227,255,0.08)',
          vignette: 'radial-gradient(ellipse at 50% 40%, transparent 55%, rgba(3,7,14,0.52) 100%)',
          floor: 'linear-gradient(180deg, transparent, rgba(16,22,35,0.66) 45%, rgba(11,15,24,0.88))',
          dunes: ['rgba(28,42,66,0.6)', 'rgba(22,34,54,0.55)'],
          plankton: 'rgba(191,227,255,0.4)', edge: 'rgba(191,227,255,0.22)',
          hudBg: 'rgba(14,24,40,0.66)', hudColor: '#BFE3FF', hudBorder: 'rgba(191,227,255,0.25)',
          whaleShadow: 'rgba(0,0,0,0.4)',
        },
        light: {
          tint: 'linear-gradient(180deg, rgba(208,236,248,0.4) 0%, rgba(170,212,234,0.52) 55%, rgba(126,178,211,0.64) 100%)',
          ray: 'rgba(255,255,255,0.16)', caustic: 'rgba(255,250,235,0.17)',
          bubBorder: 'rgba(255,255,255,0.8)', bubFill: 'rgba(255,255,255,0.24)',
          vignette: 'radial-gradient(ellipse at 50% 40%, transparent 58%, rgba(84,128,160,0.32) 100%)',
          floor: 'linear-gradient(180deg, transparent, rgba(203,188,156,0.6) 45%, rgba(181,163,128,0.82))',
          dunes: ['rgba(214,199,166,0.65)', 'rgba(199,181,145,0.6)'],
          plankton: 'rgba(255,255,255,0.65)', edge: 'rgba(255,255,255,0.5)',
          hudBg: 'rgba(255,255,255,0.6)', hudColor: '#265069', hudBorder: 'rgba(38,80,105,0.2)',
          whaleShadow: 'rgba(30,60,90,0.3)',
        },
      }

      function AquariumView({ manifest, snap, onExit }) {
        const pick = (...names) => {
          for (const n of names) if (manifest && manifest[n]) return manifest[n]
          return 'idle.gif'
        }
        const sprite = pick(snap.state)
        const tools = snap.stats ? Math.min(12, snap.stats.tools) : 0
        const state = snap.state
        const aqBubble = bubbleText(snap, state, null)
        // Follow the host UI theme so a light app gets sunlit shallow water,
        // not a murky dark film.
        const [light, setLight] = React.useState(false)
        React.useEffect(() => {
          const check = () => {
            for (const el of [document.body, document.documentElement]) {
              const c = getComputedStyle(el).backgroundColor
              const m = c && c.match(/(\d+)\D+(\d+)\D+(\d+)/)
              if (m && !c.includes('0, 0, 0, 0')) {
                setLight((Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 > 128)
                return
              }
            }
          }
          check()
          const t = setInterval(check, 5000)
          return () => clearInterval(t)
        }, [])
        const T = light ? WATER_THEMES.light : WATER_THEMES.dark
        const refs = React.useRef([])
        const swim = React.useRef(null)
        if (swim.current === null) {
          swim.current = {
            whale: { x: 0.2, y: 0.72, tx: 0.4, ty: 0.72, speed: 60, angle: 0, dir: 1, hx: 1, hy: 0, held: false },
            fish: Array.from({ length: 12 }, (_, i) => ({
              ox: -40 - (i % 4) * 34, oy: ((i % 3) - 1) * 0.05, speed: 40 + (i % 3) * 6, phase: i * 1.7,
            })),
          }
        }
        // Live values via ref: the rAF loop is created once and can never
        // hold a stale pet state hostage over a fresher wander target.
        const live = React.useRef({ state, tools })
        live.current = { state, tools }
        React.useEffect(() => {
          let raf = 0
          let last = performance.now()
          const tick = (now) => {
            const dt = Math.min(0.05, (now - last) / 1000)
            last = now
            const W = window.innerWidth
            const H = window.innerHeight
            const w = swim.current.whale
            const { state: st, tools: tl } = live.current
            if (!w.held) {
              if (st === 'glass-tap') { w.tx = Math.min(0.9, 1 - 170 / W); w.ty = 0.62 }
              else if (st === 'sleep' || st === 'nightcap') { w.ty = 0.9; w.tx = w.x }
              else if (Math.hypot((w.tx - w.x) * W, (w.ty - w.y) * H) < 60) {
                // Cross the middle: guarantees a real horizontal swim with a
                // proper turn, plus a per-lap speed personality.
                w.tx = w.x < 0.45 ? 0.5 + Math.random() * 0.35 : 0.05 + Math.random() * 0.35
                w.ty = 0.5 + Math.random() * 0.4
                w.pace = 0.8 + Math.random() * 0.45
              }
              const dx = w.tx * W - w.x * W, dy = w.ty * H - w.y * H
              const d = Math.hypot(dx, dy) || 1
              // Steering: the heading eases toward the target direction, so
              // the whale arcs through turns like a body in water.
              const ease = Math.min(1, dt * 2.2)
              let hx = w.hx + ((dx / d) - w.hx) * ease
              let hy = w.hy + ((dy / d) - w.hy) * ease
              const hl = Math.hypot(hx, hy) || 1
              w.hx = hx / hl
              w.hy = hy / hl
              if (w.hx > 0.08) w.dir = 1
              else if (w.hx < -0.08) w.dir = -1
              const targetPitch = Math.max(-0.6, Math.min(0.6, Math.atan2(w.hy, Math.abs(w.hx))))
              w.angle += (targetPitch - w.angle) * Math.min(1, dt * 3)
              // Cruise in open water, slow into the far end.
              const cruise = w.speed * (w.pace || 1) * (0.45 + 0.75 * Math.min(1, d / 320))
              w.x += (w.hx * cruise * dt) / W
              w.y += (w.hy * cruise * dt) / H
              w.x = Math.max(0.02, Math.min(0.92, w.x))
              w.y = Math.max(0.15, Math.min(0.92, w.y))
            }
            // Organic bobbing layered on travel.
            w.bob = (w.bob || 0) + dt * 1.8
            const bobY = Math.sin(w.bob) * 7
            const el = refs.current[0]
            if (el) {
              // Base art faces LEFT: mirror to face right, pitch sign inverted
              // because the mirror also flips the rotated frame.
              const mirror = w.dir === 1 ? -1 : 1
              el.style.transform = 'translate(' + (w.x * W) + 'px,' + (w.y * H + bobY) + 'px) scaleX(' + mirror + ') rotate(' + (-w.angle) + 'rad)'
              // Fade over the working area, brighten toward the open edges.
              const cx = (w.x - 0.5) * 2, cy = (w.y - 0.55) * 2
              el.style.opacity = String(0.4 + 0.6 * Math.min(1, Math.hypot(cx, cy)))
            }
            const bEl = refs.current[13]
            if (bEl) {
              bEl.style.transform = 'translate(' + (w.x * W) + 'px,' + (w.y * H - 118 + bobY) + 'px) translateX(-50%)'
            }
            // Token fish school trails the whale.
            swim.current.fish.forEach((f, i) => {
              const fel = refs.current[1 + i]
              if (!fel) return
              const show = i < tl ? '1' : '0'
              if (fel.style.opacity !== show) fel.style.opacity = show
              if (show === '0') return
              f.phase += dt * 2
              const mirror = w.dir === 1 ? -1 : 1
              const fx = w.x * W + f.ox + Math.sin(f.phase) * 10
              const fy = w.y * H + bobY + Math.sin(f.phase * 0.7 + i) * 14
              fel.style.transform = 'translate(' + fx + 'px,' + fy + 'px) scaleX(' + mirror + ') rotate(' + (-w.angle) + 'rad)'
            })
            raf = requestAnimationFrame(tick)
          }
          raf = requestAnimationFrame(tick)
          return () => cancelAnimationFrame(raf)
        }, [])
        React.useEffect(() => {
          const onKey = (e) => { if (e.key === 'Escape') onExit() }
          window.addEventListener('keydown', onKey)
          return () => window.removeEventListener('keydown', onKey)
        }, [onExit])
        const bubbles = React.useMemo(() =>
          Array.from({ length: 16 }, (_, i) => ({
            left: i % 2 === 0 ? (i * 3.1) % 14 : 86 + ((i * 4.7) % 14),
            size: 5 + Math.round(Math.random() * 9),
            dur: 8 + Math.random() * 8,
            delay: -Math.random() * 14,
          })), [])
        const plankton = React.useMemo(() =>
          Array.from({ length: 10 }, (_, i) => ({
            left: 5 + ((i * 37) % 90), top: 15 + ((i * 53) % 65),
            dur: 14 + (i % 5) * 5, delay: -(i * 3.7), size: i % 3 === 0 ? 3 : 2,
          })), [])
        const pct = typeof snap.contextPct === 'number' ? snap.contextPct : null
        const mono = "12px/1.5 'Cascadia Code', 'JetBrains Mono', Consolas, monospace"
        return h('div', {
          style: {
            position: 'fixed', inset: 0, zIndex: 30, overflow: 'hidden',
            background: T.tint,
            boxShadow: 'inset 0 0 0 1px ' + T.edge + ', inset 0 0 90px rgba(120,160,190,0.10)',
            pointerEvents: 'none', fontFamily: 'system-ui', cursor: 'default', userSelect: 'none',
          },
        },
          // Tank-glass corner speculars: the "looking through glass" tell.
          h('div', { style: { position: 'absolute', left: '-60px', top: '-140px', width: '340px', height: '320px', transform: 'rotate(24deg)', background: 'linear-gradient(180deg, transparent, ' + T.ray + ', transparent)', filter: 'blur(6px)', pointerEvents: 'none' } }),
          h('div', { style: { position: 'absolute', right: '-80px', bottom: '-160px', width: '300px', height: '300px', transform: 'rotate(24deg)', background: 'linear-gradient(180deg, transparent, ' + T.ray + ', transparent)', filter: 'blur(8px)', pointerEvents: 'none' } }),
          // Painted background plate (theme-matched), kept translucent so
          // the working UI breathes through it.
          h('img', {
            src: '/whale/assets/aquarium-bg-' + (light ? 'light' : 'dark') + '.png',
            style: {
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', opacity: '0.55', pointerEvents: 'none',
            },
            draggable: false, alt: '',
          }),
          [0, 1, 2].map((i) => h('div', {
            key: 'ray' + i,
            className: 'whale-on-desk-ray',
            style: {
              left: (14 + i * 26) + '%', width: (120 + i * 70) + 'px', animationDelay: (-i * 3) + 's',
              background: 'linear-gradient(172deg, transparent 10%, ' + T.ray + ' 45%, transparent 85%)',
            },
          })),
          [0, 1].map((i) => h('div', {
            key: 'caustic' + i,
            className: 'whale-on-desk-caustic',
            style: {
              left: i === 0 ? '18%' : '58%', top: i === 0 ? '8%' : '2%', animationDelay: (-i * 6) + 's',
              background: 'radial-gradient(ellipse at 40% 40%,' + T.caustic + ', transparent 65%)',
            },
          })),
          plankton.map((p, i) => h('span', {
            key: 'p' + i,
            className: 'whale-on-desk-plankton',
            style: {
              left: p.left + '%', top: p.top + '%', width: p.size + 'px', height: p.size + 'px',
              background: T.plankton,
              animationDuration: p.dur + 's', animationDelay: p.delay + 's',
            },
          })),
          // Seaweed stands rooted to the floor line.
          [
            { src: 'seaweed-tall.gif', left: '6%', w: 150 },
            { src: 'seaweed-short.gif', left: '27%', w: 96 },
            { src: 'seaweed-tall.gif', left: '63%', w: 120 },
            { src: 'seaweed-short.gif', left: '86%', w: 84 },
          ].map((s, i) => h('img', {
            key: 'sw' + i,
            src: '/whale/assets/' + s.src,
            style: {
              position: 'absolute', left: s.left, bottom: '34px', width: s.w + 'px',
              imageRendering: 'pixelated', opacity: light ? '0.75' : '0.85', pointerEvents: 'none',
            },
            draggable: false, alt: '',
          })),
          // Progress coral grows with the turn's tool count.
          tools > 0 ? h('img', {
            key: 'coral' + Math.min(3, Math.floor(tools / 2)),
            src: '/whale/assets/coral-' + Math.min(3, Math.floor(tools / 2)) + '.png',
            style: {
              position: 'absolute', left: '13%', bottom: '30px', width: '120px',
              imageRendering: 'pixelated', opacity: '0.9', pointerEvents: 'none',
            },
            draggable: false, alt: '',
          }) : null,
          bubbles.map((b, i) => h('span', {
            key: 'b' + i,
            className: 'whale-on-desk-bub',
            style: {
              left: b.left + '%', width: b.size + 'px', height: b.size + 'px',
              border: '1px solid ' + T.bubBorder, background: T.bubFill,
              animationDuration: b.dur + 's', animationDelay: b.delay + 's',
            },
          })),
          swim.current.fish.map((f, i) => h('div', {
            key: 'f' + i,
            ref: (el) => { refs.current[1 + i] = el },
            style: { position: 'absolute', left: 0, top: 0, width: '34px', opacity: '0', transition: 'opacity 0.6s', willChange: 'transform' },
          },
            h('img', {
              src: '/whale/assets/token-fish.gif',
              style: { width: '100%', display: 'block', imageRendering: 'pixelated', filter: light ? 'saturate(0.9)' : 'brightness(0.9)' },
              draggable: false, alt: '',
            }))),
          h('div', {
            ref: (el) => { refs.current[0] = el },
            style: {
              position: 'absolute', left: 0, top: 0, width: '150px', willChange: 'transform',
              pointerEvents: 'auto', cursor: 'grab', touchAction: 'none',
              outline: 'none', userSelect: 'none', WebkitTapHighlightColor: 'transparent',
            },
            onPointerDown: (event) => {
              const w = swim.current.whale
              w.held = true
              w.hx = event.clientX / window.innerWidth - w.x
              w.hy = event.clientY / window.innerHeight - w.y
              event.currentTarget.setPointerCapture(event.pointerId)
            },
            onPointerMove: (event) => {
              const w = swim.current.whale
              if (!w.held) return
              w.x = Math.max(0.02, Math.min(0.92, event.clientX / window.innerWidth - w.hx))
              w.y = Math.max(0.15, Math.min(0.92, event.clientY / window.innerHeight - w.hy))
            },
            onPointerUp: () => {
              const w = swim.current.whale
              w.held = false
              w.tx = w.x
              w.ty = w.y
            },
          },
            h('img', {
              key: sprite,
              src: '/whale/assets/' + sprite,
              style: {
                width: '100%', display: 'block', imageRendering: 'pixelated', pointerEvents: 'none',
                filter: 'drop-shadow(0 6px 12px ' + T.whaleShadow + ')',
                transform: spriteTransform(sprite),
              },
              draggable: false, alt: '',
            })),
          aqBubble ? h('div', {
            ref: (el) => { refs.current[13] = el },
            key: aqBubble,
            style: {
              position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap', pointerEvents: 'none',
              background: light ? 'rgba(255,255,255,0.85)' : 'rgba(26,16,48,0.88)',
              color: light ? '#265069' : '#F2F5F9', font: '12px/1.4 system-ui',
              padding: '3px 9px', borderRadius: '9px', willChange: 'transform',
            },
          }, aqBubble) : null,
          pct !== null ? h('div', {
            style: {
              position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
              width: '10px', height: '150px', borderRadius: '6px',
              background: T.hudBg, border: '1px solid ' + T.hudBorder,
            },
            title: (ZH ? '上下文用量 ' : 'Context usage ') + pct + '%',
          },
            h('div', {
              style: {
                position: 'absolute', left: 0, right: 0, bottom: 0, height: pct + '%', borderRadius: '6px',
                background: pct >= 84 ? '#E58FA2' : pct >= 62 ? (light ? '#5D9BC9' : '#BFE3FF') : (light ? '#8FB8D4' : '#3C5A86'),
                animation: pct >= 84 ? 'whale-on-desk-pulse 0.9s ease-in-out infinite' : undefined,
              },
            })) : null,
          snap.stats ? h('div', {
            style: {
              position: 'absolute', right: '34px', top: '16px', color: T.hudColor,
              background: T.hudBg, border: '1px solid ' + T.hudBorder,
              borderRadius: '8px', padding: '4px 10px', letterSpacing: '0.4px',
              font: mono, pointerEvents: 'none',
            },
          }, (STATE_LABELS[state] ?? state) + ' · ⏱ ' + fmtDur(snap.stats.secs) + ' · 🔧 ' + snap.stats.tools) : null,
          state === 'glass-tap' ? h('img', {
            src: '/whale/assets/alert-buoy.gif',
            className: 'whale-on-desk-buoy',
            style: {
              position: 'absolute', right: '30px', top: '34%', width: '90px',
              imageRendering: 'pixelated', pointerEvents: 'none',
            },
            draggable: false, alt: '',
          }) : null,
          h('div', {
            onClick: onExit,
            style: {
              position: 'absolute', top: '16px', right: '14px', cursor: 'pointer',
              color: T.hudColor, font: '13px/1 system-ui', userSelect: 'none', pointerEvents: 'auto',
              background: T.hudBg, border: '1px solid ' + T.hudBorder,
              borderRadius: '999px', padding: '7px 12px',
            },
          }, '✕ ' + (ZH ? '水族馆' : 'Aquarium')),
          h('div', {
            style: {
              position: 'absolute', left: 0, right: 0, bottom: 0, height: '90px', pointerEvents: 'none',
              background: T.floor,
            },
          },
            h('div', { style: { position: 'absolute', left: '8%', bottom: '-70px', width: '420px', height: '120px', borderRadius: '50%', background: T.dunes[0], filter: 'blur(2px)' } }),
            h('div', { style: { position: 'absolute', left: '52%', bottom: '-80px', width: '540px', height: '140px', borderRadius: '50%', background: T.dunes[1], filter: 'blur(2px)' } })),
          h('div', {
            style: { position: 'absolute', inset: 0, pointerEvents: 'none', background: T.vignette },
          }),
          h('style', null,
            '.whale-on-desk-ray{position:absolute;top:-10%;bottom:-10%;transform:rotate(10deg);animation:whale-on-desk-sway 9s ease-in-out infinite alternate;pointer-events:none}' +
            '@keyframes whale-on-desk-sway{from{transform:rotate(8deg) translateX(-14px)}to{transform:rotate(13deg) translateX(18px)}}' +
            '.whale-on-desk-caustic{position:absolute;width:340px;height:220px;border-radius:50%;animation:whale-on-desk-drift 12s ease-in-out infinite alternate;pointer-events:none}' +
            '@keyframes whale-on-desk-drift{from{transform:translate(0,0) scale(1)}to{transform:translate(46px,20px) scale(1.15)}}' +
            '.whale-on-desk-plankton{position:absolute;border-radius:50%;animation-name:whale-on-desk-plank;animation-timing-function:ease-in-out;animation-iteration-count:infinite;pointer-events:none}' +
            '@keyframes whale-on-desk-plank{0%,100%{transform:translate(0,0);opacity:0.15}50%{transform:translate(10px,-26px);opacity:0.6}}' +
            '.whale-on-desk-bub{position:absolute;bottom:-24px;border-radius:50%;animation-name:whale-on-desk-rise;animation-timing-function:linear;animation-iteration-count:infinite;pointer-events:none}' +
            '@keyframes whale-on-desk-rise{0%{transform:translateY(0);opacity:0}12%{opacity:0.5}100%{transform:translateY(-108vh);opacity:0}}' +
            '.whale-on-desk-buoy{animation:whale-on-desk-bob 2.4s ease-in-out infinite}' +
            '@keyframes whale-on-desk-bob{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-10px) rotate(2deg)}}' +
            '@keyframes whale-on-desk-pulse{0%,100%{opacity:0.35}50%{opacity:1}}',
          ),
        )
      }

      const POS_KEY = 'whale-on-desk:pos'
      const MUTE_KEY = 'whale-on-desk:muted'
      const HIDE_KEY = 'whale-on-desk:hidden'
      const SIZE_KEY = 'whale-on-desk:size'
      const SIZES = [
        { label: ZH ? '大' : 'L', width: 160 },
        { label: ZH ? '中' : 'M', width: 120 },
        { label: ZH ? '小' : 'S', width: 96 },
      ]

      const QUIPS = ZH ? ['别戳啦', '在忙!', '干嘛~', '咕噜咕噜…', '轻一点!'] : ['Hey!', 'Busy!', 'What?', 'Blub…', 'Gently!']
      const MURMURS = ZH ? ['今天也要加油呀', '水好清呀~', '(转圈圈)', '记得喝水哦', '代码如水,顺其自然~'] : ['The water is nice today', '(spin spin)', 'Stay hydrated', 'Code like water~', 'Keep going!']
      const PETTED_LINE = ZH ? '好舒服~' : 'So comfy~'

      function WhaleOverlay() {
        const [snap, setSnap] = React.useState({ state: 'idle', hint: { kind: 'none' } })
        const [manifest, setManifest] = React.useState(null)
        const [pos, setPos] = React.useState(() => {
          try {
            const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null')
            if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
              // A saved spot from a larger screen must still be reachable.
              return {
                x: Math.max(0, Math.min(saved.x, window.innerWidth - 170)),
                y: Math.max(0, Math.min(saved.y, window.innerHeight - 130)),
              }
            }
          } catch (e) { /* corrupted position falls back to the corner */ }
          return null
        })
        const drag = React.useRef(null)
        const suppressClick = React.useRef(false)
        const petTimer = React.useRef(0)
        const petted = React.useRef(false)
        const prevState = React.useRef('idle')
        const [muted, setMuted] = React.useState(() => {
          try { return localStorage.getItem(MUTE_KEY) === '1' } catch (e) { return false }
        })
        const mutedRef = React.useRef(muted)
        React.useEffect(() => { mutedRef.current = muted }, [muted])
        const [menuOpen, setMenuOpen] = React.useState(false)
        const [pets, setPets] = React.useState(null)
        const [hidden, setHidden] = React.useState(() => {
          try { return localStorage.getItem(HIDE_KEY) === '1' } catch (e) { return false }
        })
        // The host half is gone (disabled/uninstalled): stop rendering entirely.
        const [gone, setGone] = React.useState(false)
        const [quip, setQuip] = React.useState(null)
        const [hover, setHover] = React.useState(false)
        const [palette, setPalette] = React.useState(null)
        const [aquarium, setAquarium] = React.useState(false)
        const [hearts, setHearts] = React.useState([])
        const [size, setSize] = React.useState(() => {
          try {
            const saved = Number(localStorage.getItem(SIZE_KEY))
            if (SIZES.some((s) => s.width === saved)) return saved
          } catch (e) { /* corrupted entry falls back to large */ }
          return 160
        })
        const quipTimer = React.useRef(0)
        const say = (line) => {
          setQuip(line)
          clearTimeout(quipTimer.current)
          quipTimer.current = setTimeout(() => setQuip(null), 3000)
        }
        const burstHearts = () => {
          const ids = [Date.now(), Date.now() + 1, Date.now() + 2]
          setHearts((h) => [...h, ...ids])
          setTimeout(() => setHearts((h) => h.filter((x) => !ids.includes(x))), 1500)
        }
        const setSizeAndSave = (width) => {
          setSize(width)
          try { localStorage.setItem(SIZE_KEY, String(width)) } catch (e) { /* storage unavailable: session-only */ }
          setMenuOpen(false)
        }
        const sizeHeight = Math.round(size * 0.6875)

        // Idle murmurs keep the corner alive between turns.
        React.useEffect(() => {
          const timer = setInterval(() => {
            if (document.hidden || menuOpen || snap.state !== 'idle') return
            if (Math.random() < 0.2) say(MURMURS[Math.floor(Math.random() * MURMURS.length)])
          }, 90_000)
          return () => clearInterval(timer)
        }, [snap.state, menuOpen])

        // An approval wait must be visible from a background tab.
        const baseTitle = React.useRef(null)
        React.useEffect(() => {
          if (snap.state === 'glass-tap') {
            if (baseTitle.current === null && !document.title.startsWith('🔔')) baseTitle.current = document.title
            document.title = (ZH ? '🔔 等待批准 | ' : '🔔 Approval needed | ') + baseTitle.current
          } else if (baseTitle.current !== null) {
            document.title = baseTitle.current
            baseTitle.current = null
          }
        }, [snap.state])
        React.useEffect(() => () => clearTimeout(quipTimer.current), [])

        React.useEffect(() => {
          if (snap.state !== prevState.current) {
            if (!mutedRef.current) playSound(snap.state)
            prevState.current = snap.state
          }
        }, [snap.state])

        React.useEffect(() => {
          let alive = true
          let inFlight = false
          let lastT = 0
          let failures = 0
          let handle = null
          let manifestV = null
          const tick = () => {
            if (inFlight) return
            inFlight = true
            fetch('/whale/state').then((r) => {
              if (r.status === 404) { setGone(true); return null }
              return r.ok ? r.json() : null
            }).then(
              (body) => {
                inFlight = false
                if (!alive || body === null) return
                failures = 0
                // A slow older response must never overwrite a newer snapshot.
                if (typeof body.t === 'number' && body.t > lastT) {
                  lastT = body.t
                  setSnap(body)
                  // A changed asset fingerprint means the sprite table moved
                  // (upgrade or swapped pet): refetch it past any HTTP cache.
                  if (body.v !== undefined && body.v !== manifestV) {
                    manifestV = body.v
                    fetch('/whale/assets/manifest.json', { cache: 'no-store' }).then(
                      (r) => (r.ok ? r.json() : null),
                      () => null,
                    ).then((m) => { if (alive) setManifest(m || null) })
                  }
                }
              },
              () => {
                inFlight = false
                if (alive) failures = Math.min(failures + 1, 3)
              },
            )
          }
          const loop = () => {
            // No point burning requests while the tab is invisible.
            if (!document.hidden) tick()
            handle = setTimeout(loop, [500, 1000, 2000, 4000][failures])
          }
          loop()
          return () => { alive = false; if (handle !== null) clearTimeout(handle) }
        }, [])

        const onPointerDown = (event) => {
          if (event.button !== 0) return
          ensureAudio()
          // Capture on the handler element itself: capturing on an ancestor
          // retargets the later click/dblclick away from these handlers.
          const host = event.currentTarget
          const rect = host.getBoundingClientRect()
          drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, moved: false, sx: event.clientX, sy: event.clientY }
          host.setPointerCapture(event.pointerId)
          // Holding still for 800ms pets the whale.
          petted.current = false
          clearTimeout(petTimer.current)
          petTimer.current = setTimeout(() => {
            if (drag.current && !drag.current.moved) {
              petted.current = true
              playSound('pet')
              say(PETTED_LINE)
              burstHearts()
            }
          }, 800)
        }
        const onPointerMove = (event) => {
          if (!drag.current) return
          // A stuck drag (missed pointerup/cancel) must not glue the whale to the cursor.
          if ((event.buttons & 1) === 0) {
            drag.current = null
            return
          }
          if (Math.abs(event.clientX - drag.current.sx) + Math.abs(event.clientY - drag.current.sy) > 8) drag.current.moved = true
          if (drag.current.moved) clearTimeout(petTimer.current)
          if (!drag.current.moved) return
          const next = {
            x: Math.max(0, Math.min(window.innerWidth - size, event.clientX - drag.current.dx)),
            y: Math.max(0, Math.min(window.innerHeight - sizeHeight - 20, event.clientY - drag.current.dy)),
          }
          setPos(next)
        }
        const onPointerUp = () => {
          clearTimeout(petTimer.current)
          const wasDrag = drag.current && drag.current.moved
          drag.current = null
          if (wasDrag || petted.current) {
            suppressClick.current = true
            petted.current = false
          }
          if (wasDrag && pos) {
            try { localStorage.setItem(POS_KEY, JSON.stringify(pos)) } catch (e) { /* storage full: keep position in memory */ }
          }
        }
        // Missed pointerup (cancel, capture loss, tab switch) must never strand a drag.
        const onPointerCancel = () => { drag.current = null; clearTimeout(petTimer.current) }
        const onLostPointerCapture = () => { drag.current = null; clearTimeout(petTimer.current) }
        const onClick = () => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          say(QUIPS[Math.floor(Math.random() * QUIPS.length)])
          fetch('/whale/poke', { method: 'POST', body: '{}' })
        }
        const onDoubleClick = () => {
          fetch('/whale/poke', { method: 'POST', body: '{"doubleClick":true}' })
        }
        const onContextMenu = (event) => {
          event.preventDefault()
          setMenuOpen((open) => !open)
          fetch('/whale/pets').then((r) => (r.ok ? r.json() : null)).then(
            (body) => { if (body) setPets(body) },
            () => {},
          )
        }
        const switchPet = (name) => {
          fetch('/whale/pet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
          setMenuOpen(false)
        }
        const openPalette = () => {
          setMenuOpen(false)
          setPalette({ commands: [], filter: '', busy: false, result: null, loaded: false })
          fetch('/whale/commands').then((r) => r.json()).then(
            (body) => setPalette({ commands: body.commands || [], filter: '', busy: false, result: null, loaded: true }),
            () => setPalette({ commands: [], filter: '', busy: false, result: null, loaded: true }),
          )
        }
        const runCommand = (name) => {
          setPalette((p) => ({ ...p, busy: true, result: null }))
          fetch('/whale/command', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ line: '/' + name }),
          }).then((r) => r.json()).then(
            (body) => setPalette((p) => ({ ...p, busy: false, result: body })),
            () => setPalette((p) => ({ ...p, busy: false, result: { ok: false, text: '网络错误' } })),
          )
        }
        const hideWhale = () => {
          try { localStorage.setItem(HIDE_KEY, '1') } catch (e) { /* storage unavailable: session-only hide */ }
          setHidden(true)
          setMenuOpen(false)
        }
        const toggleMute = () => {
          setMuted((value) => {
            const next = !value
            try { localStorage.setItem(MUTE_KEY, next ? '1' : '0') } catch (e) { /* storage unavailable: in-memory only */ }
            return next
          })
          setMenuOpen(false)
        }
        const resetPos = () => {
          setPos(null)
          try { localStorage.removeItem(POS_KEY) } catch (e) { /* nothing saved */ }
          setMenuOpen(false)
        }

        const state = snap.state
        const own = Boolean(manifest && manifest[state])
        const file = (manifest && manifest[state]) || (manifest && manifest.idle)
        // CSS motion stands in only for states without their own sprite;
        // a state falling back to idle.gif still gets its motion class.
        const style = {
          position: 'fixed',
          left: (pos ? pos.x : window.innerWidth - (size + 30)) + 'px',
          top: (pos ? pos.y : window.innerHeight - (sizeHeight + 40)) + 'px',
          width: size + 'px',
          zIndex: 40,
          userSelect: 'none',
          cursor: 'grab',
          touchAction: 'none',
        }
        const bubble = bubbleText(snap, state, quip)

        if (gone) return null
        if (aquarium) {
          return h(AquariumView, { manifest, snap, onExit: () => setAquarium(false) })
        }
        if (hidden) {          return h('div', {
            title: ZH ? '双击恢复桌宠' : 'Double-click to restore the pet',
            onDoubleClick: () => {
              try { localStorage.removeItem(HIDE_KEY) } catch (e) { /* nothing saved */ }
              setHidden(false)
            },
            style: {
              position: 'fixed', right: '10px', bottom: '8px', width: '28px', height: '28px', zIndex: 40,
              cursor: 'pointer', font: '20px/28px system-ui', textAlign: 'center', opacity: 0.45,
              userSelect: 'none', touchAction: 'none',
            },
          }, '🐳')
        }
        const paletteFiltered = palette
          ? palette.commands.filter((c) => {
              const f = palette.filter.trim().toLowerCase()
              if (!f) return true
              return c.name.toLowerCase().includes(f) || (c.description || '').toLowerCase().includes(f)
            })
          : []

        return h('div', {
          style, className: 'whale-on-desk' + (own ? '' : ' ' + stateClass(state)),
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
        },
          palette ? h('div', {
            style: {
              position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(13,20,32,0.55)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '18vh',
            },
            onClick: () => setPalette(null),
          },
            h('div', {
              onClick: (e) => e.stopPropagation(),
              style: {
                width: '420px', maxHeight: '50vh', overflowY: 'auto',
                background: 'rgba(26,16,48,0.97)', borderRadius: '14px', padding: '10px',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)', font: '13px/1.6 system-ui', color: '#F2F5F9',
              },
            },
              h('input', {
                autoFocus: true,
                placeholder: ZH ? '筛选命令… (Esc 关闭,回车执行)' : 'Filter commands… (Esc to close, Enter to run)',
                value: palette.filter,
                onChange: (e) => setPalette((p) => ({ ...p, filter: e.target.value })),
                onKeyDown: (e) => {
                  if (e.key === 'Escape') setPalette(null)
                  if (e.key === 'Enter' && paletteFiltered.length) runCommand(paletteFiltered[0].name)
                },
                style: {
                  width: '100%', boxSizing: 'border-box', background: 'rgba(191,227,255,0.08)',
                  border: '1px solid rgba(191,227,255,0.2)', borderRadius: '8px', color: '#F2F5F9',
                  padding: '6px 10px', font: '13px system-ui', outline: 'none',
                },
              }),
              palette.busy ? h('div', { style: { padding: '8px 6px', color: '#8FA3C4' } }, ZH ? '执行中…' : 'Running…') : null,
              palette.result ? h('div', {
                style: { padding: '8px 6px', color: palette.result.ok ? '#BFE3FF' : '#E58FA2' },
              }, (palette.result.ok ? '✓ ' : '✗ ') + (palette.result.text || (palette.result.ok ? (ZH ? '完成' : 'Done') : (ZH ? '失败' : 'Failed')))) : null,
              !palette.loaded
                ? h('div', { style: { padding: '10px 6px', color: '#8FA3C4' } }, '加载中…')
                : paletteFiltered.length === 0
                  ? h('div', { style: { padding: '10px 6px', color: '#8FA3C4' } },
                      palette.commands.length ? (ZH ? '没有匹配的命令' : 'No matching commands') : (ZH ? '暂无可用命令(先开始一个会话)' : 'No commands yet (start a session first)'))
                  : paletteFiltered.map((c) => h('div', {
                      key: c.name,
                      className: 'whale-on-desk-menu-item',
                      style: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '6px 10px' },
                      onClick: () => runCommand(c.name),
                    },
                      h('span', { style: { color: '#BFE3FF' } }, '/' + c.name),
                      h('span', { style: { color: '#8FA3C4', fontSize: '12px' } }, c.description || ''),
                    )),
            ),
          ) : null,
          hover && snap.stats ? h('div', {
            style: {
              position: 'absolute', top: '-56px', left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(26,16,48,0.92)', color: '#BFE3FF', font: '12px/1.6 system-ui',
              padding: '3px 10px', borderRadius: '8px', whiteSpace: 'nowrap', pointerEvents: 'none',
            },
          }, (STATE_LABELS[state] ?? state) + ' · ⏱ ' + fmtDur(snap.stats.secs) + ' · 🔧 ' + snap.stats.tools) : null,
          menuOpen ? h('div', {
            style: {
              position: 'absolute', top: '-70px', left: '50%', transform: 'translateX(-50%)',
              display: 'flex', flexDirection: 'column', gap: '2px',
              background: 'rgba(26,16,48,0.92)', color: '#F2F5F9', font: '12px/1.6 system-ui',
              padding: '4px', borderRadius: '10px', whiteSpace: 'nowrap',
            },
          },
            h('div', { onClick: toggleMute, className: 'whale-on-desk-menu-item' }, muted ? (ZH ? '🔊 打开声音' : '🔊 Unmute') : '🔇 ' + (ZH ? '静音' : 'Mute')),
            h('div', { onClick: resetPos, className: 'whale-on-desk-menu-item' }, ZH ? '↺ 回到默认位置' : '↺ Reset position'),
            SIZES.map((s) => h('div', {
              key: s.label,
              onClick: () => setSizeAndSave(s.width),
              className: 'whale-on-desk-menu-item',
              style: s.width === size ? { color: '#BFE3FF' } : undefined,
            }, (s.width === size ? '● ' : '○ ') + (ZH ? '尺寸 ' : 'Size ') + s.label)),
            h('div', { onClick: openPalette, className: 'whale-on-desk-menu-item' }, '⌘ ' + (ZH ? '命令面板' : 'Commands')),
            h('div', { onClick: () => { setMenuOpen(false); setAquarium(true) }, className: 'whale-on-desk-menu-item' }, '🐠 ' + (ZH ? '水族馆' : 'Aquarium')),
            pets && pets.pets.length > 1
              ? pets.pets.map((p) => h('div', {
                  key: p,
                  onClick: () => switchPet(p),
                  className: 'whale-on-desk-menu-item',
                  style: p === pets.active ? { color: '#BFE3FF' } : undefined,
                }, (p === pets.active ? '● ' : '○ ') + p))
              : null,
            h('div', { onClick: hideWhale, className: 'whale-on-desk-menu-item' }, ZH ? '隐藏桌宠' : 'Hide pet'),
          ) : null,
          bubble ? h('div', {
            key: bubble,
            style: {
              position: 'absolute', top: '-26px', left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(26,16,48,0.85)', color: '#F2F5F9', font: '12px/1.4 system-ui',
              padding: '2px 8px', borderRadius: '8px', whiteSpace: 'nowrap', pointerEvents: 'none',
            },
          }, bubble) : null,
          state === 'glass-tap' ? h('div', {
            style: {
              position: 'absolute', inset: '-6px', borderRadius: '14px',
              border: '3px solid #F2C14E', animation: 'whale-on-desk-pulse 0.8s ease-in-out infinite', pointerEvents: 'none',
            },
          }) : null,
          h('div', {
            onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture,
            onClick, onDoubleClick, onContextMenu,
            style: { width: size + 'px', height: sizeHeight + 'px', imageRendering: 'pixelated' },
          },
            file
              ? h('img', {
                  key: state + ':' + file,
                  src: '/whale/assets/' + file,
                  style: {
                    width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated', pointerEvents: 'none',
                    transform: spriteTransform(file),
                  },
                  draggable: false, alt: '',
                })
              : h(PlaceholderWhale, null),
          ),
          hearts.map((id) => h('span', {
            key: id,
            className: 'whale-on-desk-heart',
            style: { left: (20 + (id % 3) * 44) + 'px', animationDelay: ((id % 3) * 0.12) + 's' },
          }, '💗')),
          h('style', null,
            '@keyframes whale-on-desk-pulse{0%,100%{opacity:0.35}50%{opacity:1}}' +
            '.whale-on-desk-menu-item{padding:2px 10px;border-radius:6px;cursor:pointer}' +
            '.whale-on-desk-menu-item:hover{background:rgba(191,227,255,0.25)}' +
            '.whale-on-desk-heart{position:absolute;top:-6px;font-size:14px;pointer-events:none;animation:whale-on-desk-heart 1.5s ease-out forwards}' +
            '@keyframes whale-on-desk-heart{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-42px) scale(1.3);opacity:0}}' +
            '.whale-on-desk-state-celebrate{animation:whale-on-desk-hop 0.6s ease-in-out infinite}' +
            '@keyframes whale-on-desk-hop{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}' +
            '.whale-on-desk-state-sink{transform:translateY(6px);opacity:0.85}' +
            '.whale-on-desk-state-glass-tap{animation:whale-on-desk-shake 0.5s ease-in-out infinite}' +
            '@keyframes whale-on-desk-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(3px)}75%{transform:translateX(-3px)}}' +
            '.whale-on-desk-state-sleep{filter:brightness(0.8);animation:whale-on-desk-bob 4s ease-in-out infinite}' +
            '.whale-on-desk-state-nightcap{filter:brightness(0.85)}' +
            '.whale-on-desk-state-swim-fast{animation:whale-on-desk-bob 0.45s ease-in-out infinite}' +
            '.whale-on-desk-state-think{animation:whale-on-desk-bob 1.1s ease-in-out infinite}' +
            '.whale-on-desk-state-idle{animation:whale-on-desk-bob 2.2s ease-in-out infinite}' +
            '@keyframes whale-on-desk-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
          ),
        )
      }

      return {
        name: 'whale-on-desk',
        inject: ['slots'],
        apply: function (ctx) {
          ctx.slots.inject('shell.overlay', function* () {
            yield ctx.slots.register({ name: 'shell.overlay', id: 'whale', order: 60 }, WhaleOverlay)
          })
        },
      }
    },
  })
})()
