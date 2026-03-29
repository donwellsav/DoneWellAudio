'use client'

// Help menu orchestrator — delegates tab content to help/*.tsx
// Mirrors settings/ pattern: thin shell + focused tab files
import { useState, memo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HelpCircle, BookOpen, SlidersHorizontal, Cpu, List, Info, RotateCcw, Radio } from 'lucide-react'
import { onboardingStorage } from '@/lib/storage/dwaStorage'
import { GuideTab } from './help/GuideTab'
import { ModesTab } from './help/ModesTab'
import { AlgorithmsTab } from './help/AlgorithmsTab'
import { ReferenceTab } from './help/ReferenceTab'
import { AboutTab } from './help/AboutTab'
import { CompanionTab } from './help/CompanionTab'

export const HelpMenu = memo(function HelpMenu() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground" aria-label="Help">
          <HelpCircle className="size-5 sm:size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="sm:max-w-7xl overflow-y-auto channel-strip amber-sidecar">
        <SheetHeader className="pb-3 panel-groove bg-card/60 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 max-sm:pt-2 shadow-[0_1px_8px_rgba(0,0,0,0.3),0_1px_0_rgba(245,158,11,0.09)]">
          <SheetTitle className="text-lg flex items-center gap-2">
            <HelpCircle className="w-5 h-5" style={{ color: 'var(--console-amber)' }} />
            <span style={{ color: 'var(--console-amber)' }}>Help</span>
          </SheetTitle>
          <SheetDescription className="text-sm flex items-center justify-between">
            <span>Guides, modes, algorithms & changelog.</span>
            <button
              onClick={() => { onboardingStorage.clear(); setOpen(false) }}
              className="inline-flex items-center gap-1 text-xs transition-colors cursor-pointer"
              style={{ color: 'var(--console-amber)' }}
            >
              <RotateCcw className="w-3 h-3" />
              Replay Tutorial
            </button>
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="guide" className="mt-4 max-sm:mt-1">
          <TabsList className="flex w-full bg-transparent rounded-none border-0 border-b border-[rgba(245,158,11,0.18)] h-auto p-0">
            <TabsTrigger value="guide" className="flex-1 flex-col gap-0.5 py-2 text-xs rounded-none border-0 border-b-2 border-transparent uppercase tracking-[0.15em] data-[state=active]:bg-[rgba(245,158,11,0.06)] data-[state=active]:border-[var(--console-amber)] data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground hover:text-foreground transition-all duration-200">
              <BookOpen className="w-4 h-4" style={{ color: 'var(--console-amber)' }} />
              Guide
            </TabsTrigger>
            <TabsTrigger value="modes" className="flex-1 flex-col gap-0.5 py-2 text-xs rounded-none border-0 border-b-2 border-transparent uppercase tracking-[0.15em] data-[state=active]:bg-[rgba(245,158,11,0.06)] data-[state=active]:border-[var(--console-amber)] data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground hover:text-foreground transition-all duration-200">
              <SlidersHorizontal className="w-4 h-4" style={{ color: 'var(--console-amber)' }} />
              Modes
            </TabsTrigger>
            <TabsTrigger value="algorithms" className="flex-1 flex-col gap-0.5 py-2 text-xs rounded-none border-0 border-b-2 border-transparent uppercase tracking-[0.15em] data-[state=active]:bg-[rgba(245,158,11,0.06)] data-[state=active]:border-[var(--console-amber)] data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground hover:text-foreground transition-all duration-200">
              <Cpu className="w-4 h-4" style={{ color: 'var(--console-amber)' }} />
              Algorithms
            </TabsTrigger>
            <TabsTrigger value="reference" className="flex-1 flex-col gap-0.5 py-2 text-xs rounded-none border-0 border-b-2 border-transparent uppercase tracking-[0.15em] data-[state=active]:bg-[rgba(245,158,11,0.06)] data-[state=active]:border-[var(--console-amber)] data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground hover:text-foreground transition-all duration-200">
              <List className="w-4 h-4" style={{ color: 'var(--console-amber)' }} />
              Reference
            </TabsTrigger>
            <TabsTrigger value="companion" className="flex-1 flex-col gap-0.5 py-2 text-xs rounded-none border-0 border-b-2 border-transparent uppercase tracking-[0.15em] data-[state=active]:bg-[rgba(245,158,11,0.06)] data-[state=active]:border-[var(--console-amber)] data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground hover:text-foreground transition-all duration-200">
              <Radio className="w-4 h-4" style={{ color: 'var(--console-amber)' }} />
              Companion
            </TabsTrigger>
            <TabsTrigger value="about" className="flex-1 flex-col gap-0.5 py-2 text-xs rounded-none border-0 border-b-2 border-transparent uppercase tracking-[0.15em] data-[state=active]:bg-[rgba(245,158,11,0.06)] data-[state=active]:border-[var(--console-amber)] data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground hover:text-foreground transition-all duration-200">
              <Info className="w-4 h-4" style={{ color: 'var(--console-amber)' }} />
              About
            </TabsTrigger>
          </TabsList>

          <TabsContent value="guide" className="mt-4 space-y-4">
            <GuideTab />
          </TabsContent>

          <TabsContent value="modes" className="mt-4 space-y-4">
            <ModesTab />
          </TabsContent>

          <TabsContent value="algorithms" className="mt-4 space-y-4">
            <AlgorithmsTab />
          </TabsContent>

          <TabsContent value="reference" className="mt-4 space-y-4">
            <ReferenceTab />
          </TabsContent>

          <TabsContent value="companion" className="mt-4 space-y-4">
            <CompanionTab />
          </TabsContent>

          <TabsContent value="about" className="mt-4 space-y-4">
            <AboutTab />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
})
