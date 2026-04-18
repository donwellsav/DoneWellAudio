'use client'

import { memo } from 'react'
import { ChevronDown, Download, FileJson, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { ChannelSection } from '@/components/ui/channel-section'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ExportMetadata } from '@/types/export'

interface SessionExportSectionProps {
  metadata: ExportMetadata
  isExporting: boolean
  updateMetadata: (patch: Partial<ExportMetadata>) => void
  handleExportTxt: () => void
  handleExportCSV: () => void
  handleExportJSON: () => void
  handleExportPdf: () => Promise<void>
}

export const SessionExportSection = memo(function SessionExportSection({
  metadata,
  isExporting,
  updateMetadata,
  handleExportTxt,
  handleExportCSV,
  handleExportJSON,
  handleExportPdf,
}: SessionExportSectionProps) {
  return (
    <ChannelSection title="Session Export">
      <p className="text-[10px] text-muted-foreground/50 mb-1.5">Export detection history and EQ recommendations for documentation or post-show review.</p>
      <div className="space-y-2">
        <input
          type="text"
          name="venueName"
          aria-label="Venue name"
          autoComplete="organization"
          value={metadata.venueName ?? ''}
          onChange={(e) => updateMetadata({ venueName: e.target.value })}
          placeholder="Venue name (optional)"
          maxLength={60}
          className="w-full px-2 py-1.5 rounded text-sm bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          type="text"
          name="engineerName"
          aria-label="Engineer name"
          autoComplete="name"
          value={metadata.engineerName ?? ''}
          onChange={(e) => updateMetadata({ engineerName: e.target.value })}
          placeholder="Engineer (optional)"
          maxLength={40}
          className="w-full px-2 py-1.5 rounded text-sm bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={isExporting}
              className="min-h-11 w-full cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 inline-flex items-center justify-center gap-1.5 px-3 rounded text-sm font-medium bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 disabled:opacity-65 transition-colors"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export Session
              <ChevronDown className="w-3 h-3 ml-auto" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={handleExportTxt}>
              <FileText className="w-4 h-4 mr-2" /> Plain Text (.txt)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportCSV}>
              <FileSpreadsheet className="w-4 h-4 mr-2" /> CSV (.csv)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportJSON}>
              <FileJson className="w-4 h-4 mr-2" /> JSON (.json)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportPdf} disabled={isExporting}>
              {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              PDF Report (.pdf)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </ChannelSection>
  )
})
