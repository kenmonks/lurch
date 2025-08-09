// CompactTracer 
//
// this class defines a custom peggy tracer for more useful debugging for the
// kinds of complex parsers that Lurch requires.  The default tracer built into
// peggy is too verbose for most traces.
export class CompactTracer {
  constructor({ log = console.log, interesting, preview = true, previewLength = 80, input = '', mode = 'compact', indent = 2, logFails = false, suppressRules, dedupe = 'rule-span', noIndent = false, breakOnSpanChange = true } = {}) {
    this.log = log
    this.stack = []
    // default set of rules to report (tweak as needed)
    this.interesting = new Set(
      interesting || [
        'Expression','Algebraic','Product','Summation','Integral',
        'IndexedProduct','IndexedUnion','IndexedIntersect','Relations','Set','Prefix'
      ]
    )
    // preview and input configuration
    this.previewEnabled = !!preview
    this.previewLen = previewLength
    this.input = input

    // tree/compact config
    this.mode = mode                  // 'compact' | 'tree'
    this.indent = Math.max(0, indent|0)
    this.logFails = !!logFails

    // pruning & dedupe
    const defaultSuppress = ['_','_s_','__','_n_','_x','alphanum','RelArg','PropArg']
    this.suppress = new Set(Array.isArray(suppressRules) ? suppressRules : defaultSuppress)
    this.dedupe = dedupe // 'none' | 'rule-span' | 'span'
    this._logged = new Set()
    // NOTE: vdepth no longer used for tree indent; we indent by already-logged ancestors.
    this.vdepth = 0
    // output tweaks
    this.noIndent = !!noIndent
    this.breakOnSpanChange = !!breakOnSpanChange
    this._lastSpanKey = null
  }
  _formatPreview(location) {
    try {
      const start = location && location.start && typeof location.start.offset === 'number' ? location.start.offset : null
      const end   = location && location.end && typeof location.end.offset === 'number' ? location.end.offset : null
      if (start == null || end == null || !this.input) return ''
      let s = this.input.slice(start, end)
      s = s.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
      if (!s) return ''
      return s.length > this.previewLen ? s.slice(0, this.previewLen - 1) + '…' : s
    } catch {
      return ''
    }
  }
  _indentPrefix(depth) {
    try {
      return ' '.repeat(this.indent * Math.max(0, depth|0))
    } catch {
      return ''
    }
  }
  _dedupeKey(ruleName, location) {
    if (!location || !location.start || !location.end) return null
    const start = typeof location.start.offset === 'number' ? location.start.offset : null
    const end   = typeof location.end.offset === 'number' ? location.end.offset : null
    if (start == null || end == null) return null
    if (this.dedupe === 'span') return `${start}-${end}`
    if (this.dedupe === 'rule-span') return `${ruleName}:${start}-${end}`
    return null
  }
  _spanKey(location) {
    if (!location || !location.start || !location.end) return null
    const s = typeof location.start.offset === 'number' ? location.start.offset : null
    const e = typeof location.end.offset === 'number' ? location.end.offset : null
    return (s == null || e == null) ? null : `${s}-${e}`
  }

  trace(event) {
    const { type, rule, location } = event
    const ruleName = (rule && typeof rule === 'object' && 'name' in rule)
      ? rule.name
      : String(rule)

    if (type === 'rule.enter') {
      const suppressed = this.suppress.has(ruleName)
      // Track whether this frame eventually produced a logged line
      this.stack.push({ rule: ruleName, start: location && location.start, suppressed, logged: false })
      return
    }

    if (type === 'rule.match' || type === 'rule.fail') {
      // Peek the current frame (do not pop yet)
      const idx = this.stack.length - 1
      if (idx < 0) return
      const frame = this.stack[idx]

      // Indent by number of already-logged, non-suppressed ancestors
      const ancestors = this.stack.slice(0, idx)
      const indentLevel = ancestors.reduce((n, f) => n + (!f.suppressed && f.logged ? 1 : 0), 0)

      // --- TREE MODE: only show successful matches (and optional fails) with indentation ---
      if (this.mode === 'tree') {
        if (type === 'rule.match') {
          // prune unwanted rules
          if (!this.suppress.has(ruleName)) {
            // dedupe repeated matches
            const key = this._dedupeKey(ruleName, location)
            if (!(key && this._logged.has(key))) {
              if (key) this._logged.add(key)

              const pv = this.previewEnabled ? this._formatPreview(location) : ''
              const suffix = pv ? ` ⇢ ${pv}` : ''

              // Optional: insert a blank line when the matched span changes
              if (this.breakOnSpanChange) {
                const spanKey = this._spanKey(location)
                if (spanKey && spanKey !== this._lastSpanKey) {
                  if (this._lastSpanKey !== null) this.log('')  // add spacer between groups
                  this._lastSpanKey = spanKey
                }
              }

              // Build the log line (noIndent => no prefix; otherwise keep indentation)
              const prefix = this.noIndent ? '' : this._indentPrefix(indentLevel)
              const line = `${prefix}↳ ${ruleName}${suffix}`
              this.log(line)
              frame.logged = true

            }
          }
        } else if (this.logFails) {
          const line = `${this._indentPrefix(indentLevel)}✗ ${ruleName}`
          this.log(line)
        }
        // Now pop the current frame
        this.stack.pop()
        return
      }

      // --- COMPACT MODE: keep existing behavior ---
      if (type === 'rule.match') {
        const pv = this.previewEnabled ? this._formatPreview(location) : ''
        const suffix = pv ? ` ⇢ ${pv}` : ''
        if (this.stack.length === 1) {
          // matching start rule
          this.log(`✓ matched top-level rule: ${ruleName}${suffix}`)
        } else if (this.interesting.has(ruleName)) {
          this.log(`• ${ruleName} matched${suffix}`)
        }
      }
      // Finally pop in compact mode
      this.stack.pop()
    }
  }
}