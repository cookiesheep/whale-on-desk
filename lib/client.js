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
          tone(620, 0, 0.09, 'square', 0.05)
          tone(880, 0.07, 0.1, 'square', 0.05)
        } else if (state === 'celebrate') {
          tone(660, 0, 0.12, 'triangle', 0.07)
          tone(880, 0.1, 0.12, 'triangle', 0.07)
          tone(1100, 0.2, 0.16, 'triangle', 0.07)
        } else if (state === 'glass-tap') {
          tone(190, 0, 0.07, 'sine', 0.12)
          tone(160, 0.12, 0.07, 'sine', 0.12)
        } else if (state === 'sink') {
          tone(330, 0, 0.15, 'sine', 0.05)
          tone(220, 0.12, 0.2, 'sine', 0.05)
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

      /* Friendly bubble labels for common DSH tool names. */
      const TOOL_LABELS = {
        bash: '敲命令', sh: '敲命令', pwsh: '敲命令', terminal: '开终端',
        read: '读文件', write: '写文件', edit: '改文件', 'str_replace_editor': '改文件',
        glob: '找文件', grep: '搜代码', search: '搜代码',
        web_search: '搜网页', fetch: '开网页', webfetch: '开网页',
        todo_write: '记清单', subagent: '派帮手', workflow: '编排任务',
        skills: '翻技能册', plan: '定计划', goal: '盯目标',
      }

      const BUBBLE_LABELS = {
        'glass-tap': '! 谁批准一下',
        sleep: 'Zzz',
        nightcap: '夜深了…',
      }

      function stateClass(state) {
        return 'whale-on-desk-state-' + state
      }

      const POS_KEY = 'whale-on-desk:pos'
      const MUTE_KEY = 'whale-on-desk:muted'

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
        const prevState = React.useRef('idle')
        const [muted, setMuted] = React.useState(() => {
          try { return localStorage.getItem(MUTE_KEY) === '1' } catch (e) { return false }
        })
        const mutedRef = React.useRef(muted)
        React.useEffect(() => { mutedRef.current = muted }, [muted])
        const [menuOpen, setMenuOpen] = React.useState(false)

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
            fetch('/whale/state').then((r) => r.json()).then(
              (body) => {
                inFlight = false
                if (!alive) return
                failures = 0
                // A slow older response must never overwrite a newer snapshot.
                if (typeof body.t === 'number' && body.t > lastT) {
                  lastT = body.t
                  setSnap(body)
                  // A changed asset fingerprint means the sprite table moved
                  // (upgrade or swapped pet): refetch it past any HTTP cache.
                  if (typeof body.v === 'number' && body.v !== manifestV) {
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
        }
        const onPointerMove = (event) => {
          if (!drag.current) return
          // A stuck drag (missed pointerup/cancel) must not glue the whale to the cursor.
          if ((event.buttons & 1) === 0) {
            drag.current = null
            return
          }
          if (Math.abs(event.clientX - drag.current.sx) + Math.abs(event.clientY - drag.current.sy) > 8) drag.current.moved = true
          if (!drag.current.moved) return
          const next = {
            x: Math.max(0, Math.min(window.innerWidth - 160, event.clientX - drag.current.dx)),
            y: Math.max(0, Math.min(window.innerHeight - 130, event.clientY - drag.current.dy)),
          }
          setPos(next)
        }
        const onPointerUp = () => {
          const wasDrag = drag.current && drag.current.moved
          drag.current = null
          if (wasDrag) {
            suppressClick.current = true
            if (pos) {
              try { localStorage.setItem(POS_KEY, JSON.stringify(pos)) } catch (e) { /* storage full: keep position in memory */ }
            }
          }
        }
        // Missed pointerup (cancel, capture loss, tab switch) must never strand a drag.
        const onPointerCancel = () => { drag.current = null }
        const onLostPointerCapture = () => { drag.current = null }
        const onClick = () => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          fetch('/whale/poke', { method: 'POST', body: '{}' })
        }
        const onDoubleClick = () => {
          fetch('/whale/poke', { method: 'POST', body: '{"doubleClick":true}' })
        }
        const onContextMenu = (event) => {
          event.preventDefault()
          setMenuOpen((open) => !open)
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
          left: (pos ? pos.x : window.innerWidth - 190) + 'px',
          top: (pos ? pos.y : window.innerHeight - 150) + 'px',
          width: '160px',
          zIndex: 40,
          userSelect: 'none',
          cursor: 'grab',
          touchAction: 'none',
        }
        const bubble = BUBBLE_LABELS[state]
          || (snap.hint && snap.hint.kind === 'tool' ? (TOOL_LABELS[snap.hint.name] ?? snap.hint.name) : null)
          || (snap.hint && snap.hint.kind === 'context' ? '吃饱了' + snap.hint.pct + '%' : null)

        return h('div', { style, className: 'whale-on-desk' + (own ? '' : ' ' + stateClass(state)) },
          menuOpen ? h('div', {
            style: {
              position: 'absolute', top: '-70px', left: '50%', transform: 'translateX(-50%)',
              display: 'flex', flexDirection: 'column', gap: '2px',
              background: 'rgba(26,16,48,0.92)', color: '#F2F5F9', font: '12px/1.6 system-ui',
              padding: '4px', borderRadius: '10px', whiteSpace: 'nowrap',
            },
          },
            h('div', { onClick: toggleMute, className: 'whale-on-desk-menu-item' }, muted ? '🔊 打开声音' : '🔇 静音'),
            h('div', { onClick: resetPos, className: 'whale-on-desk-menu-item' }, '↺ 回到默认位置'),
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
            style: { width: '160px', height: '110px', imageRendering: 'pixelated' },
          },
            file
              ? h('img', {
                  key: state + ':' + file,
                  src: '/whale/assets/' + file,
                  style: { width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated', pointerEvents: 'none' },
                  draggable: false, alt: '',
                })
              : h(PlaceholderWhale, null),
          ),
          h('style', null,
            '@keyframes whale-on-desk-pulse{0%,100%{opacity:0.35}50%{opacity:1}}' +
            '.whale-on-desk-menu-item{padding:2px 10px;border-radius:6px;cursor:pointer}' +
            '.whale-on-desk-menu-item:hover{background:rgba(191,227,255,0.25)}' +
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
