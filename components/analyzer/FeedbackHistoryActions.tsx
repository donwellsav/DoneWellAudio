'use client'

import { memo } from 'react'
import { BarChart3, ChevronDown, Download, FileJson, FileSpreadsheet, FileText, Loader2, Trash2 } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface FeedbackHistoryActionsProps {
  hasData: boolean
  isExporting: boolean
  onExportTxt: () => void
  onExportCSV: () => void
  onExportJSON: () => void
  onExportPdf: () => void
  onClear: () => void
}

export const FeedbackHistoryActions = memo(function FeedbackHistoryActions({
  hasData,
  isExporting,
  onExportTxt,
  onExportCSV,
  onExportJSON,
  onExportPdf,
  onClear,
}: FeedbackHistoryActionsProps) {
  return (
    <div className="flex gap-2 pb-3 border-b border-border/40 panel-groove bg-card/60 -mx-4 sm:-mx-6 px-4 sm:px-6">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={!hasData || isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Download className="h-3 w-3 mr-1" />
            )}
            {isExporting ? 'Exporting...' : 'Export'}
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={onExportTxt}>
            <FileText className="h-4 w-4 mr-2" />
            Export as TXT
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExportCSV}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export as CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExportJSON}>
            <FileJson className="h-4 w-4 mr-2" />
            Export as JSON
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExportPdf}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Export as PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
            disabled={!hasData}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Clear feedback history?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove all recorded feedback events and hotspot data. This cannot be undone.
          </AlertDialogDescription>
          <div className="flex items-center gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onClear} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Clear
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
})
