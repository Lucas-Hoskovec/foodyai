import { Check, ChevronDown, Copy, Minus, Plus, Trash2, X } from 'lucide-react'
import { analyzeFridgePhoto, ScanError, type ScanItem } from '@/lib/vision'
import { downscaleImageFile } from '@/lib/image'
import { FRIDGE_CATEGORIES } from '@/lib/nim'
import type { FridgeItem } from '@/lib/types'
import { useEffect, useRef, useState } from 'react'

interface FridgePhotoScannerProps {
  file: File
  onClose: () => void
  onSave: (items: FridgeItem[]) => void
}

let rowKey = 0
function nextKey() {
  rowKey += 1
  return rowKey
}

interface Row {
  key: number
  name: string
  quantity: number
  size: string
  category: string
}

function scanItemToRow(item: ScanItem): Row {
  return {
    key: nextKey(),
    name: item.name,
    quantity: item.quantity,
    size: item.size ?? '',
    category: item.category,
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof ScanError) return err.message
  console.error(err)
  return 'Something went wrong while scanning. Please try again.'
}

export function FridgePhotoScanner({ file, onClose, onSave }: FridgePhotoScannerProps) {
  const [stage, setStage] = useState<'scan' | 'review'>('scan')
  const [preview, setPreview] = useState<string>('')
  const [rows, setRows] = useState<Row[]>([])
  const [scanError, setScanError] = useState<ScanError | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const scanningRef = useRef(false)

  const runScan = async (chosen: File) => {
    if (scanningRef.current) return
    scanningRef.current = true
    setScanError(null)
    setStage('scan')
    setElapsed(0)
    const ticker = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    try {
      const dataUrl = await downscaleImageFile(chosen)
      setPreview(dataUrl)
      const items = await analyzeFridgePhoto(dataUrl)
      setRows(items.map(scanItemToRow))
      setStage('review')
    } catch (err) {
      setScanError(err instanceof ScanError ? err : new ScanError('other', errorMessage(err)))
      setStage('scan')
    } finally {
      window.clearInterval(ticker)
      scanningRef.current = false
    }
  }

  useEffect(() => {
    void runScan(file)
    // Scan once per file; intentionally no file dependency re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateRow = (key: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const removeRow = (key: number) => {
    setRows((prev) => prev.filter((row) => row.key !== key))
  }

  const addRow = () => {
    setRows((prev) => [...prev, { key: nextKey(), name: '', quantity: 1, size: '', category: 'Other' }])
  }

  const confirm = () => {
    const items = rows
      .filter((row) => row.name.trim())
      .map((row) => ({
        name: row.name.trim().toLowerCase(),
        amount: row.size.trim() || `${row.quantity}`,
        category: row.category,
      }))
    if (items.length) onSave(items)
    else onClose()
  }

  const error = scanError

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="Scan a receipt photo">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="glass-strong relative flex max-h-[86vh] w-full max-w-sm flex-col rounded-3xl p-6 shadow-[var(--shadow-glass)]">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="pressable absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft"
        >
          <X className="h-4 w-4" />
        </button>

        {stage === 'scan' && <ScanStage preview={preview} error={error} elapsed={elapsed} />}

        {stage === 'review' && (
          <ReviewStage
            rows={rows}
            onUpdate={updateRow}
            onRemove={removeRow}
            onAdd={addRow}
            onConfirm={confirm}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

function RawReplyBox({ reply }: { reply: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(reply).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <details className="mt-3 rounded-xl border border-red-200 bg-white/60">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[12px] font-semibold text-red-600">
        <span>Raw AI reply</span>
        <span className="flex items-center gap-1 text-red-500 no-underline">
          <ChevronDown className="h-3.5 w-3.5" />
        </span>
      </summary>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words px-3 pb-2 text-[11px] text-ink-soft">{reply}</pre>
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={copy}
          className="pressable flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-600"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy reply'}
        </button>
      </div>
    </details>
  )
}

function ScanStage({ preview, error, elapsed }: { preview: string; error: ScanError | null; elapsed: number }) {
  return (
    <div className="flex min-h-0 flex-col text-center">
      <h2 className="text-[19px] font-bold">Scanning your receipt…</h2>
      <p className="mt-1 text-[13px] leading-snug text-ink-soft">
        Reading every line. Hold the receipt flat and well-lit for the best result.
      </p>
      {preview && <img src={preview} alt="Photo being scanned" className="mt-4 max-h-56 w-full rounded-2xl object-cover" />}

      {error && (
        <div className="mt-4 rounded-2xl bg-red-50 p-4 text-left">
          <p className="text-[13px] leading-snug text-red-600">{error.message}</p>
          {error.kind === 'empty' && (
            <p className="mt-1 text-[12px] leading-snug text-red-500">
              Make sure the whole receipt is in frame and well-lit.
            </p>
          )}
          {error.kind === 'parse' && error.rawReply && <RawReplyBox reply={error.rawReply} />}
          {error.kind === 'http' && error.body && <RawReplyBox reply={error.body} />}
        </div>
      )}

      <div className="mt-5 flex items-center justify-center gap-2 px-6">
        <span className="h-5 w-5 shrink-0 rounded-full border-2 border-ink/20 border-t-ink/60 [animation:spin_0.8s_linear_infinite]" />
        <span className="text-[12px] font-medium text-ink-soft">
          {error ? 'Scan failed' : elapsed > 0 ? `Scanning for ${elapsed}s…` : 'Reading your receipt…'}
        </span>
      </div>
    </div>
  )
}

function ReviewStage({
  rows,
  onUpdate,
  onRemove,
  onAdd,
  onConfirm,
  onClose,
}: {
  rows: Row[]
  onUpdate: (key: number, patch: Partial<Row>) => void
  onRemove: (key: number) => void
  onAdd: () => void
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <h2 className="text-[19px] font-bold">Review groceries</h2>
      <p className="mt-1 text-[13px] leading-snug text-ink-soft">
        Edit the list before adding to your fridge — {rows.length} item{rows.length === 1 ? '' : 's'} detected.
      </p>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {rows.map((row) => (
          <RowEditor key={row.key} row={row} onUpdate={onUpdate} onRemove={onRemove} />
        ))}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="pressable mt-4 flex h-10 items-center justify-center gap-1.5 rounded-full bg-ink/[0.06] text-[13px] font-semibold text-ink"
      >
        <Plus className="h-4 w-4" /> Add item
      </button>

      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="pressable h-11 flex-1 rounded-full bg-ink/[0.06] text-[14px] font-semibold text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!rows.some((row) => row.name.trim())}
          onClick={onConfirm}
          className="pressable flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-ink text-[14px] font-semibold text-white disabled:opacity-40"
        >
          <Check className="h-4 w-4" /> Save to fridge
        </button>
      </div>
    </div>
  )
}

function RowEditor({ row, onUpdate, onRemove }: { row: Row; onUpdate: (key: number, patch: Partial<Row>) => void; onRemove: (key: number) => void }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-black/[0.03] p-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={row.name}
          onChange={(e) => onUpdate(row.key, { name: e.target.value })}
          placeholder="Item name"
          className="input h-10 min-w-0 flex-1"
          autoCapitalize="words"
        />
        <button
          type="button"
          aria-label="Remove item"
          onClick={() => onRemove(row.key)}
          className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => onUpdate(row.key, { quantity: Math.max(0, row.quantity - 1) })}
            className="pressable flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-6 text-center text-[14px] font-semibold tabular-nums text-ink">{row.quantity}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => onUpdate(row.key, { quantity: Math.min(99, row.quantity + 1) })}
            className="pressable flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-ink-soft"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <input
          type="text"
          value={row.size}
          onChange={(e) => onUpdate(row.key, { size: e.target.value })}
          placeholder="Size e.g. 500 g"
          className="input h-9 min-w-0 flex-1"
        />
      </div>

      <label className="mt-2 flex items-center gap-2">
        <span className="shrink-0 text-[12px] font-medium text-ink-soft">Category</span>
        <select
          value={row.category}
          onChange={(e) => onUpdate(row.key, { category: e.target.value })}
          className="input h-9 flex-1"
        >
          {FRIDGE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}