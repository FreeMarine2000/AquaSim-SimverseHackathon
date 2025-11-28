'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { GameProvider, useGame } from '@/context/GameContext';
import Game from '@/components/Game';
import Image from 'next/image';
import { useMobile } from '@/hooks/useMobile';
import { getStateFromUrl, decompressGameState } from '@/lib/shareState';

const STORAGE_KEY = 'isocity-game-state';

// Building assets to display
const BUILDINGS = [
  'residential.png',
  'commercial.png',
  'industrial.png',
  'park.png',
  'school.png',
  'hospital.png',
  'police_station.png',
  'fire_station.png',
  'powerplant.png',
  'watertower.png',
  'university.png',
  'stadium.png',
  'airport.png',
  'trees.png',
];

// Fewer buildings for mobile
const MOBILE_BUILDINGS = [
  'residential.png',
  'commercial.png',
  'industrial.png',
  'park.png',
  'hospital.png',
  'powerplant.png',
];

// Check if there's a saved game in localStorage
function hasSavedGame(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.grid && parsed.gridSize && parsed.stats;
    }
  } catch (e) {
    return false;
  }
  return false;
}

// Get current city name from localStorage
function getCurrentCityName(): string {
  if (typeof window === 'undefined') return 'your city';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.cityName || 'your city';
    }
  } catch (e) {
    return 'your city';
  }
  return 'your city';
}

// Component that loads shared state from URL
function SharedStateLoader({ onLoaded, shouldSaveFirst }: { onLoaded: () => void; shouldSaveFirst: boolean }) {
  const { loadState, saveCurrentCityForRestore } = useGame();
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    // Save current city first if requested
    if (shouldSaveFirst) {
      saveCurrentCityForRestore();
    }

    const compressed = getStateFromUrl();
    if (compressed) {
      const partialState = decompressGameState(compressed);
      if (partialState) {
        // Convert partial state to full JSON string for loadState
        // We need to create a minimal valid state
        const fullState = {
          ...partialState,
          tick: 0,
          speed: 1,
          selectedTool: 'select',
          budget: {
            police: { name: 'Police', funding: 100, cost: 0 },
            fire: { name: 'Fire', funding: 100, cost: 0 },
            health: { name: 'Health', funding: 100, cost: 0 },
            education: { name: 'Education', funding: 100, cost: 0 },
            transportation: { name: 'Transportation', funding: 100, cost: 0 },
            parks: { name: 'Parks', funding: 100, cost: 0 },
            power: { name: 'Power', funding: 100, cost: 0 },
            water: { name: 'Water', funding: 100, cost: 0 },
          },
          services: {
            police: [],
            fire: [],
            health: [],
            education: [],
            power: [],
            water: [],
          },
          notifications: [],
          advisorMessages: [],
          history: [],
          activePanel: 'none',
          disastersEnabled: true,
          waterBodies: [],
        };
        loadState(JSON.stringify(fullState));
        // Clear the URL hash after loading
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
    onLoaded();
  }, [loadState, saveCurrentCityForRestore, onLoaded, shouldSaveFirst]);

  return null;
}

// Dialog for confirming shared city load
function SaveCityDialog({ 
  cityName, 
  onSaveAndContinue, 
  onDontSave, 
  onCancel 
}: { 
  cityName: string;
  onSaveAndContinue: () => void;
  onDontSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save current city?</DialogTitle>
          <DialogDescription className="pt-2">
            You&apos;re about to view a shared city. Would you like to save <strong className="text-foreground">{cityName}</strong> so you can restore it later?
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 pt-4">
          <Button onClick={onSaveAndContinue}>
            Save & Continue
          </Button>
          <Button onClick={onDontSave} variant="outline">
            Don&apos;t Save
          </Button>
          <Button onClick={onCancel} variant="ghost" className="text-muted-foreground">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function HomePage() {
  const [showGame, setShowGame] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [hasSharedState, setHasSharedState] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [shouldSaveBeforeLoad, setShouldSaveBeforeLoad] = useState(false);
  const [currentCityName, setCurrentCityName] = useState('your city');
  const { isMobileDevice, isSmallScreen, orientation } = useMobile();
  const isMobile = isMobileDevice || isSmallScreen;

  // Check for saved game or shared state after mount (client-side only)
  useEffect(() => {
    const checkSavedGame = () => {
      // Check for shared state in URL first
      const compressed = getStateFromUrl();
      if (compressed) {
        // If there's an existing game, ask if they want to save first
        if (hasSavedGame()) {
          setCurrentCityName(getCurrentCityName());
          setShowSaveDialog(true);
          setIsChecking(false);
          return;
        }
        // No existing game, just load the shared state
        setHasSharedState(true);
        setShowGame(true);
        setIsChecking(false);
        return;
      }
      
      setIsChecking(false);
      if (hasSavedGame()) {
        setShowGame(true);
      }
    };
    // Use requestAnimationFrame to avoid synchronous setState in effect
    requestAnimationFrame(checkSavedGame);
  }, []);

  const handleSaveAndContinue = useCallback(() => {
    setShouldSaveBeforeLoad(true);
    setHasSharedState(true);
    setShowSaveDialog(false);
    setShowGame(true);
  }, []);

  const handleDontSave = useCallback(() => {
    setShouldSaveBeforeLoad(false);
    setHasSharedState(true);
    setShowSaveDialog(false);
    setShowGame(true);
  }, []);

  const handleCancel = useCallback(() => {
    // Clear the URL hash and show the regular game
    window.history.replaceState(null, '', window.location.pathname);
    setShowSaveDialog(false);
    setShowGame(true);
  }, []);

  if (isChecking) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-white/60">Loading...</div>
      </main>
    );
  }

  // Show save dialog before loading shared state
  if (showSaveDialog) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <SaveCityDialog
          cityName={currentCityName}
          onSaveAndContinue={handleSaveAndContinue}
          onDontSave={handleDontSave}
          onCancel={handleCancel}
        />
      </main>
    );
  }

  if (showGame) {
    return (
      <GameProvider>
        {hasSharedState && <SharedStateLoader onLoaded={() => setHasSharedState(false)} shouldSaveFirst={shouldSaveBeforeLoad} />}
        <main className="h-screen w-screen overflow-hidden">
          <Game />
        </main>
      </GameProvider>
    );
  }

  // Mobile landing page
  if (isMobile) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-4 safe-area-top safe-area-bottom">
        {/* Title */}
        <h1 className="text-5xl sm:text-6xl font-light tracking-wider text-white/90 mb-4 animate-fadeIn">
          IsoCity
        </h1>
        
        {/* Tagline */}
        <p className="text-white/50 text-sm mb-8 text-center">
          Build your dream city on mobile
        </p>
        
        {/* Building preview - compact grid for mobile */}
        <div className="grid grid-cols-3 gap-2 mb-8 max-w-xs">
          {MOBILE_BUILDINGS.map((building, index) => (
            <div 
              key={building}
              className="aspect-square bg-white/5 border border-white/10 p-2 rounded-lg"
              style={{
                animation: 'fadeIn 0.4s ease-out forwards',
                animationDelay: `${index * 80}ms`,
                opacity: 0,
              }}
            >
              <div className="w-full h-full relative opacity-80">
                <Image
                  src={`/assets/buildings/${building}`}
                  alt={building.replace('.png', '').replace('_', ' ')}
                  fill
                  className="object-contain"
                />
              </div>
            </div>
          ))}
        </div>
        
        {/* Start Button */}
        <Button 
          onClick={() => setShowGame(true)}
          className="w-full max-w-xs px-8 py-6 text-xl font-medium tracking-wide bg-primary/90 hover:bg-primary text-white border-0 rounded-xl transition-all duration-300 shadow-lg shadow-primary/20"
        >
          Play Now
        </Button>
        
        {/* Orientation hint for landscape */}
        {orientation === 'portrait' && (
          <p className="text-white/30 text-xs mt-6 text-center">
            Tip: Rotate for a wider view
          </p>
        )}
        
        {/* Touch hint */}
        <div className="text-white/40 text-xs mt-4 text-center flex flex-col gap-1">
          <span>Tap to place • Pinch to zoom</span>
          <span>Drag to pan</span>
        </div>
      </main>
    );
  }

  // Desktop landing page
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-8">
      <div className="max-w-7xl w-full grid lg:grid-cols-2 gap-16 items-center">
        
        {/* Left - Title and Start Button */}
        <div className="flex flex-col items-center lg:items-start justify-center space-y-12">
          <h1 className="text-8xl font-light tracking-wider text-white/90">
            IsoCity
          </h1>
          <Button 
            onClick={() => setShowGame(true)}
            className="px-12 py-8 text-2xl font-light tracking-wide bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-none transition-all duration-300"
          >
            Start
          </Button>
        </div>

        {/* Right - Building Gallery */}
        <div className="grid grid-cols-4 gap-4">
          {BUILDINGS.map((building, index) => (
            <div 
              key={building}
              className="aspect-square bg-white/5 border border-white/10 p-3 hover:bg-white/10 transition-all duration-300 group"
              style={{
                animationDelay: `${index * 50}ms`,
              }}
            >
              <div className="w-full h-full relative opacity-70 group-hover:opacity-100 transition-opacity">
                <Image
                  src={`/assets/buildings/${building}`}
                  alt={building.replace('.png', '').replace('_', ' ')}
                  fill
                  className="object-contain"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
