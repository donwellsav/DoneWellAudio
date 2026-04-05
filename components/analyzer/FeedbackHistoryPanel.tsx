'use client'

import { memo } from 'react'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useFeedbackHistoryPanelState } from '@/hooks/useFeedbackHistoryPanelState'
import { FeedbackHistoryActions } from './FeedbackHistoryActions'
import { FeedbackHistoryArchiveSection } from './FeedbackHistoryArchiveSection'
import { FeedbackHistoryHotspotsSection } from './FeedbackHistoryHotspotsSection'

interface FeedbackHistoryPanelProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export const FeedbackHistoryPanel = memo(function FeedbackHistoryPanel({
  open: controlledOpen,
  onOpenChange,
}: FeedbackHistoryPanelProps) {
  const {
    hotspots,
    repeatOffenders,
    archivedSessions,
    isOpen,
    isControlled,
    isExporting,
    hasData,
    layout,
    setIsOpen,
    handleExportTxt,
    handleExportCSV,
    handleExportJSON,
    handleExportPdf,
    handleClear,
    handleClearArchive,
  } = useFeedbackHistoryPanelState({
    open: controlledOpen,
    onOpenChange,
  })

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      {!isControlled && (
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground" aria-label="Feedback History">
                <History className="size-5 sm:size-6" />
              </Button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-sm">
            History
          </TooltipContent>
        </Tooltip>
      )}
      <SheetContent side="right" className={cn('overflow-y-auto channel-strip amber-sidecar', layout.maxWidthClassName)}>
        <SheetHeader className="pb-3 panel-groove bg-card/60 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 max-sm:pt-2 shadow-[0_1px_8px_rgba(0,0,0,0.3),0_1px_0_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.09)]">
          <SheetTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" style={{ color: 'var(--console-amber)' }} />
            <span style={{ color: 'var(--console-amber)' }}>Feedback History</span>
          </SheetTitle>
          <SheetDescription className="text-sm">
            Frequency hotspots & repeat offenders.
          </SheetDescription>
        </SheetHeader>

        <FeedbackHistoryActions
          hasData={hasData}
          isExporting={isExporting}
          onExportTxt={handleExportTxt}
          onExportCSV={handleExportCSV}
          onExportJSON={handleExportJSON}
          onExportPdf={handleExportPdf}
          onClear={handleClear}
        />

        <div className="space-y-4">
          <FeedbackHistoryHotspotsSection
            hotspots={hotspots}
            repeatOffenders={repeatOffenders}
            gridClassName={layout.gridClassName}
          />
          <FeedbackHistoryArchiveSection
            archivedSessions={archivedSessions}
            onClearArchive={handleClearArchive}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
})
