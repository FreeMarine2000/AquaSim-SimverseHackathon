'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useGame } from '@/context/GameContext';
import { BuildingRenderer } from './buildings/IsometricBuildings';
import { Tool, TOOL_INFO, Tile, TUTORIAL_STEPS } from '@/types/game';
import {
  ToolIcons,
  SelectIcon,
  PlayIcon,
  PauseIcon,
  FastForwardIcon,
  CloseIcon,
  RoadIcon,
  TreeIcon,
  FireIcon,
  PowerIcon,
  WaterIcon,
  PopulationIcon,
  JobsIcon,
  MoneyIcon,
  HappyIcon,
  HealthIcon,
  EducationIcon,
  SafetyIcon,
  EnvironmentIcon,
  BudgetIcon,
  ChartIcon,
  TrophyIcon,
  AdvisorIcon,
  SettingsIcon,
  AlertIcon,
  InfoIcon,
} from './ui/Icons';

// Import shadcn components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Isometric tile dimensions
// HEIGHT_RATIO of 0.65 gives taller tiles (more top-down feel)
const TILE_WIDTH = 64;
const HEIGHT_RATIO = 0.65;
const TILE_HEIGHT = TILE_WIDTH * HEIGHT_RATIO;

const EVENT_ICON_MAP: Record<string, React.ReactNode> = {
  fire: <FireIcon size={16} />,
  chart_up: <ChartIcon size={16} />,
  chart_down: <ChartIcon size={16} />,
  population: <PopulationIcon size={16} />,
  tech: <AdvisorIcon size={16} />,
  education: <EducationIcon size={16} />,
  trophy: <TrophyIcon size={16} />,
  power: <PowerIcon size={16} />,
  water: <WaterIcon size={16} />,
  road: <RoadIcon size={16} />,
  balance: <ChartIcon size={16} />,
  cash: <MoneyIcon size={16} />,
  profit: <MoneyIcon size={16} />,
  tree: <TreeIcon size={16} />,
  shield: <SafetyIcon size={16} />,
  disaster: <AlertIcon size={16} />,
  town: <PopulationIcon size={16} />,
  city: <PopulationIcon size={16} />,
  metropolis: <PopulationIcon size={16} />,
  megacity: <PopulationIcon size={16} />,
  happy: <HappyIcon size={16} />,
  environment: <EnvironmentIcon size={16} />,
  jobs: <JobsIcon size={16} />,
  planning: <AdvisorIcon size={16} />,
};

const ADVISOR_ICON_MAP: Record<string, React.ReactNode> = {
  power: <PowerIcon size={18} />,
  water: <WaterIcon size={18} />,
  cash: <MoneyIcon size={18} />,
  shield: <SafetyIcon size={18} />,
  hospital: <HealthIcon size={18} />,
  education: <EducationIcon size={18} />,
  environment: <EnvironmentIcon size={18} />,
  planning: <AdvisorIcon size={18} />,
  jobs: <JobsIcon size={18} />,
};

// Convert grid coordinates to screen coordinates (isometric)
function gridToScreen(x: number, y: number, offsetX: number, offsetY: number): { screenX: number; screenY: number } {
  const screenX = (x - y) * (TILE_WIDTH / 2) + offsetX;
  const screenY = (x + y) * (TILE_HEIGHT / 2) + offsetY;
  return { screenX, screenY };
}

// Convert screen coordinates to grid coordinates
function screenToGrid(screenX: number, screenY: number, offsetX: number, offsetY: number): { gridX: number; gridY: number } {
  const adjustedX = screenX - offsetX;
  const adjustedY = screenY - offsetY;
  
  const gridX = (adjustedX / (TILE_WIDTH / 2) + adjustedY / (TILE_HEIGHT / 2)) / 2;
  const gridY = (adjustedY / (TILE_HEIGHT / 2) - adjustedX / (TILE_WIDTH / 2)) / 2;
  
  return { gridX: Math.floor(gridX), gridY: Math.floor(gridY) };
}

// Sidebar Component with full height
function Sidebar() {
  const { state, setTool, setActivePanel } = useGame();
  const { selectedTool, stats, activePanel } = state;
  
  const toolCategories = {
    'TOOLS': ['select', 'bulldoze', 'road', 'tree'] as Tool[],
    'ZONES': ['zone_residential', 'zone_commercial', 'zone_industrial', 'zone_dezone'] as Tool[],
    'SERVICES': ['police_station', 'fire_station', 'hospital', 'school', 'university', 'park'] as Tool[],
    'UTILITIES': ['power_plant', 'water_tower'] as Tool[],
    'SPECIAL': ['stadium', 'airport'] as Tool[],
  };
  
  return (
    <div className="w-56 bg-sidebar border-r border-sidebar-border flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/70 rounded-md flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <polygon points="12,2 22,8 12,14 2,8" />
              <polygon points="2,8 12,14 12,22 2,16" opacity="0.7" />
              <polygon points="22,8 12,14 12,22 22,16" opacity="0.4" />
            </svg>
          </div>
          <span className="text-sidebar-foreground font-bold tracking-tight">ISOCITY</span>
        </div>
      </div>
      
      {/* Tool Categories */}
      <ScrollArea className="flex-1 py-2">
        {Object.entries(toolCategories).map(([category, tools]) => (
          <div key={category} className="mb-1">
            <div className="px-4 py-2 text-[10px] font-bold tracking-widest text-muted-foreground">
              {category}
            </div>
            <div className="px-2">
              {tools.map(tool => {
                const info = TOOL_INFO[tool];
                const isSelected = selectedTool === tool;
                const canAfford = stats.money >= info.cost;
                const IconComponent = ToolIcons[tool] || SelectIcon;
                
                return (
                  <TooltipProvider key={tool}>
                    <Tooltip>
                      <TooltipTrigger>
                        <Button
                          onClick={() => setTool(tool)}
                          disabled={!canAfford && info.cost > 0}
                          variant={isSelected ? 'default' : 'ghost'}
                          className={`w-full justify-start gap-3 px-3 py-2 h-auto text-sm ${
                            isSelected ? 'bg-primary text-primary-foreground' : ''
                          }`}
                        >
                          <IconComponent size={16} className="flex-shrink-0" />
                          <span className="flex-1 text-left truncate">{info.name}</span>
                          {info.cost > 0 && (
                            <span className="text-xs opacity-60">${info.cost}</span>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{info.description}</p>
                        {info.cost > 0 && <p className="text-muted-foreground">Cost: ${info.cost}</p>}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          </div>
        ))}
      </ScrollArea>
      
      {/* Bottom Actions */}
      <div className="border-t border-sidebar-border p-2">
        <div className="grid grid-cols-5 gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  onClick={() => setActivePanel(activePanel === 'budget' ? 'none' : 'budget')}
                  variant={activePanel === 'budget' ? 'default' : 'ghost'}
                  size="icon-sm"
                >
                  <BudgetIcon size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Budget</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  onClick={() => setActivePanel(activePanel === 'statistics' ? 'none' : 'statistics')}
                  variant={activePanel === 'statistics' ? 'default' : 'ghost'}
                  size="icon-sm"
                >
                  <ChartIcon size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Statistics</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  onClick={() => setActivePanel(activePanel === 'advisors' ? 'none' : 'advisors')}
                  variant={activePanel === 'advisors' ? 'default' : 'ghost'}
                  size="icon-sm"
                >
                  <AdvisorIcon size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Advisors</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  onClick={() => setActivePanel(activePanel === 'achievements' ? 'none' : 'achievements')}
                  variant={activePanel === 'achievements' ? 'default' : 'ghost'}
                  size="icon-sm"
                >
                  <TrophyIcon size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Achievements</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  onClick={() => setActivePanel(activePanel === 'settings' ? 'none' : 'settings')}
                  variant={activePanel === 'settings' ? 'default' : 'ghost'}
                  size="icon-sm"
                >
                  <SettingsIcon size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

// Top Stats Bar
function TopBar() {
  const { state, setSpeed, setTaxRate } = useGame();
  const { stats, year, month, speed, taxRate, cityName, notifications } = state;
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [showNotifications, setShowNotifications] = useState(false);
  
  return (
    <div className="h-14 bg-card border-b border-border flex items-center justify-between px-4">
      {/* Left - City Name & Date */}
      <div className="flex items-center gap-6">
        <div>
          <h1 className="text-foreground font-semibold text-sm">{cityName}</h1>
          <div className="text-muted-foreground text-xs">{monthNames[month - 1]} {year}</div>
        </div>
        
        {/* Speed Controls */}
        <div className="flex items-center gap-1 bg-secondary rounded-md p-1">
          {[0, 1, 2, 3].map(s => (
            <TooltipProvider key={s}>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    onClick={() => setSpeed(s as 0 | 1 | 2 | 3)}
                    variant={speed === s ? 'default' : 'ghost'}
                    size="icon-sm"
                    className="h-7 w-7"
                  >
                    {s === 0 ? <PauseIcon size={14} /> : 
                     s === 1 ? <PlayIcon size={14} /> : 
                     <FastForwardIcon size={14} />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {s === 0 ? 'Pause' : s === 1 ? 'Normal Speed' : s === 2 ? 'Fast' : 'Very Fast'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      </div>
      
      {/* Center - Main Stats */}
      <div className="flex items-center gap-6">
        <StatBadge icon={<PopulationIcon size={14} />} value={stats.population.toLocaleString()} label="Pop" />
        <StatBadge icon={<JobsIcon size={14} />} value={stats.jobs.toLocaleString()} label="Jobs" />
        <StatBadge 
          icon={<MoneyIcon size={14} />} 
          value={`$${stats.money.toLocaleString()}`} 
          label="Funds"
          variant={stats.money < 0 ? 'destructive' : stats.money < 1000 ? 'warning' : 'success'}
        />
        <Separator orientation="vertical" className="h-8" />
        <StatBadge 
          icon={<span className="text-xs">+/-</span>} 
          value={`$${(stats.income - stats.expenses).toLocaleString()}`} 
          label="/mo"
          variant={stats.income - stats.expenses >= 0 ? 'success' : 'destructive'}
        />
      </div>
      
      {/* Right - Demand & Tax */}
      <div className="flex items-center gap-4">
        {/* RCI Demand */}
        <div className="flex items-center gap-2">
          <DemandIndicator label="R" demand={stats.demand.residential} color="text-green-500" />
          <DemandIndicator label="C" demand={stats.demand.commercial} color="text-blue-500" />
          <DemandIndicator label="I" demand={stats.demand.industrial} color="text-amber-500" />
        </div>
        
        <Separator orientation="vertical" className="h-8" />
        
        {/* Tax Rate */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Tax</span>
          <Slider
            value={[taxRate]}
            onValueChange={(value) => setTaxRate(value[0])}
            min={0}
            max={20}
            step={1}
            className="w-16"
          />
          <span className="text-foreground text-xs font-mono w-8">{taxRate}%</span>
        </div>
        
        {/* Notifications */}
        <div className="relative">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  onClick={() => setShowNotifications(!showNotifications)}
                  variant="ghost"
                  size="icon-sm"
                  className={notifications.length > 0 ? 'text-amber-400' : ''}
                >
                  <AlertIcon size={16} />
                  {notifications.length > 0 && (
                    <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center">
                      {notifications.length}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Notifications</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {showNotifications && notifications.length > 0 && (
            <Card className="absolute top-full right-0 mt-2 w-80 z-50">
              <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Notifications</CardTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => setShowNotifications(false)}>
                  <CloseIcon size={14} />
                </Button>
              </CardHeader>
              <ScrollArea className="max-h-64">
                <CardContent className="p-0">
                  {notifications.map((notif, i) => (
                        <div key={i} className="p-3 border-b border-border last:border-0 flex gap-3">
                          <span className="text-muted-foreground mt-0.5">
                            {EVENT_ICON_MAP[notif.icon] || <InfoIcon size={14} />}
                          </span>
                          <div>
                            <div className="text-foreground text-sm font-medium">{notif.title}</div>
                            <div className="text-muted-foreground text-xs mt-1">{notif.description}</div>
                          </div>
                        </div>
                      ))}
                </CardContent>
              </ScrollArea>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBadge({ icon, value, label, variant = 'default' }: { 
  icon: React.ReactNode; 
  value: string; 
  label: string; 
  variant?: 'default' | 'success' | 'warning' | 'destructive';
}) {
  const colorClass = variant === 'success' ? 'text-green-500' : 
                     variant === 'warning' ? 'text-amber-500' : 
                     variant === 'destructive' ? 'text-red-500' : 'text-foreground';
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <div>
        <div className={`text-xs font-mono ${colorClass}`}>{value}</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function DemandIndicator({ label, demand, color }: { label: string; demand: number; color: string }) {
  const height = Math.abs(demand) / 2;
  const isPositive = demand >= 0;
  
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`text-[10px] font-bold ${color}`}>{label}</span>
      <div className="w-3 h-8 bg-secondary relative rounded-sm overflow-hidden">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-border" />
        <div
          className={`absolute left-0 right-0 transition-all rounded-sm ${color.replace('text-', 'bg-')}`}
          style={{
            height: `${height}%`,
            top: isPositive ? `${50 - height}%` : '50%',
          }}
        />
      </div>
    </div>
  );
}

// Stats Panel (secondary bar)
function StatsPanel() {
  const { state } = useGame();
  const { stats } = state;
  
  return (
    <div className="h-8 bg-secondary/50 border-b border-border flex items-center justify-center gap-8 text-xs">
      <MiniStat icon={<HappyIcon size={12} />} label="Happiness" value={stats.happiness} />
      <MiniStat icon={<HealthIcon size={12} />} label="Health" value={stats.health} />
      <MiniStat icon={<EducationIcon size={12} />} label="Education" value={stats.education} />
      <MiniStat icon={<SafetyIcon size={12} />} label="Safety" value={stats.safety} />
      <MiniStat icon={<EnvironmentIcon size={12} />} label="Environment" value={stats.environment} />
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  const color = value >= 70 ? 'text-green-500' : value >= 40 ? 'text-amber-500' : 'text-red-500';
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${color}`}>{Math.round(value)}%</span>
    </div>
  );
}

// Minimap Component - Redesigned
function MiniMap() {
  const { state } = useGame();
  const { grid, gridSize } = state;
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const size = 140;
    const scale = size / gridSize;
    
    const bgGradient = ctx.createLinearGradient(0, 0, size, size);
    bgGradient.addColorStop(0, '#0b1723');
    bgGradient.addColorStop(1, '#0f2a2f');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, size, size);
    
    // subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    const step = Math.max(1, Math.floor(gridSize / 10));
    for (let i = 0; i <= gridSize; i += step) {
      ctx.beginPath();
      ctx.moveTo(i * scale, 0);
      ctx.lineTo(i * scale, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * scale);
      ctx.lineTo(size, i * scale);
      ctx.stroke();
    }
    
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const tile = grid[y][x];
        let color = '#2d5a3d';
        
        if (tile.building.type === 'water') color = '#0ea5e9';
        else if (tile.building.type === 'road') color = '#6b7280';
        else if (tile.building.type === 'tree') color = '#166534';
        else if (tile.zone === 'residential' && tile.building.type !== 'grass') color = '#22c55e';
        else if (tile.zone === 'residential') color = '#14532d';
        else if (tile.zone === 'commercial' && tile.building.type !== 'grass') color = '#38bdf8';
        else if (tile.zone === 'commercial') color = '#1d4ed8';
        else if (tile.zone === 'industrial' && tile.building.type !== 'grass') color = '#f59e0b';
        else if (tile.zone === 'industrial') color = '#b45309';
        else if (['police_station', 'fire_station', 'hospital', 'school', 'university'].includes(tile.building.type)) {
          color = '#c084fc';
        } else if (tile.building.type === 'power_plant') color = '#f97316';
        else if (tile.building.type === 'water_tower') color = '#06b6d4';
        else if (tile.building.type === 'park') color = '#84cc16';
        else if (tile.building.onFire) color = '#ef4444';
        
        ctx.fillStyle = color;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }, [grid, gridSize]);
  
  return (
    <Card className="absolute bottom-4 right-4 p-3 shadow-lg backdrop-blur-sm bg-card/90 border-border/70">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold mb-2">
        Minimap
      </div>
      <canvas
        ref={canvasRef}
        width={140}
        height={140}
        className="block rounded-md border border-border/60"
      />
      <div className="mt-2 grid grid-cols-4 gap-1 text-[8px]">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-green-500 rounded-sm" />
          <span className="text-muted-foreground">R</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-blue-500 rounded-sm" />
          <span className="text-muted-foreground">C</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-amber-500 rounded-sm" />
          <span className="text-muted-foreground">I</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-pink-500 rounded-sm" />
          <span className="text-muted-foreground">S</span>
        </div>
      </div>
    </Card>
  );
}

// Tile Info Panel
function TileInfoPanel({ 
  tile, 
  services, 
  onClose 
}: { 
  tile: Tile; 
  services: { police: number[][]; fire: number[][]; health: number[][]; education: number[][]; power: boolean[][]; water: boolean[][] };
  onClose: () => void;
}) {
  const { x, y } = tile;
  
  return (
    <Card className="absolute top-4 right-4 w-72">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Tile ({x}, {y})</CardTitle>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <CloseIcon size={14} />
        </Button>
      </CardHeader>
      
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Building</span>
          <span className="capitalize">{tile.building.type.replace(/_/g, ' ')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Zone</span>
          <Badge variant={
            tile.zone === 'residential' ? 'default' :
            tile.zone === 'commercial' ? 'secondary' :
            tile.zone === 'industrial' ? 'outline' : 'secondary'
          } className={
            tile.zone === 'residential' ? 'bg-green-500/20 text-green-400' :
            tile.zone === 'commercial' ? 'bg-blue-500/20 text-blue-400' :
            tile.zone === 'industrial' ? 'bg-amber-500/20 text-amber-400' : ''
          }>
            {tile.zone === 'none' ? 'Unzoned' : tile.zone}
          </Badge>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Level</span>
          <span>{tile.building.level}/5</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Population</span>
          <span>{tile.building.population}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Jobs</span>
          <span>{tile.building.jobs}</span>
        </div>
        
        <Separator />
        
        <div className="flex justify-between">
          <span className="text-muted-foreground">Power</span>
          <Badge variant={tile.building.powered ? 'default' : 'destructive'}>
            {tile.building.powered ? 'Connected' : 'No Power'}
          </Badge>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Water</span>
          <Badge variant={tile.building.watered ? 'default' : 'destructive'} className={tile.building.watered ? 'bg-cyan-500/20 text-cyan-400' : ''}>
            {tile.building.watered ? 'Connected' : 'No Water'}
          </Badge>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Land Value</span>
          <span>${tile.landValue}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Pollution</span>
          <span className={tile.pollution > 50 ? 'text-red-400' : tile.pollution > 25 ? 'text-amber-400' : 'text-green-400'}>
            {Math.round(tile.pollution)}%
          </span>
        </div>
        
        {tile.building.onFire && (
          <>
            <Separator />
            <div className="flex justify-between text-red-400">
              <span>ON FIRE!</span>
              <span>{Math.round(tile.building.fireProgress)}% damage</span>
            </div>
          </>
        )}
        
        <Separator />
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Service Coverage</div>
        
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Police</span>
            <span>{Math.round(services.police[y][x])}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fire</span>
            <span>{Math.round(services.fire[y][x])}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Health</span>
            <span>{Math.round(services.health[y][x])}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Education</span>
            <span>{Math.round(services.education[y][x])}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Budget Panel
function BudgetPanel() {
  const { state, setActivePanel, setBudgetFunding } = useGame();
  const { budget, stats } = state;
  
  const categories = [
    { key: 'police', ...budget.police },
    { key: 'fire', ...budget.fire },
    { key: 'health', ...budget.health },
    { key: 'education', ...budget.education },
    { key: 'transportation', ...budget.transportation },
    { key: 'parks', ...budget.parks },
    { key: 'power', ...budget.power },
    { key: 'water', ...budget.water },
  ];
  
  return (
    <Dialog open={true} onOpenChange={() => setActivePanel('none')}>
      <DialogContent className="max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Budget</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 pb-4 border-b border-border">
            <div>
              <div className="text-muted-foreground text-xs mb-1">Income</div>
              <div className="text-green-400 font-mono">${stats.income.toLocaleString()}/mo</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">Expenses</div>
              <div className="text-red-400 font-mono">${stats.expenses.toLocaleString()}/mo</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">Net</div>
              <div className={`font-mono ${stats.income - stats.expenses >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${(stats.income - stats.expenses).toLocaleString()}/mo
              </div>
            </div>
          </div>
          
          {/* Categories */}
          <div className="space-y-4">
            {categories.map(cat => (
              <div key={cat.key} className="flex items-center gap-4">
                <Label className="w-28 text-sm">{cat.name}</Label>
                <Slider
                  value={[cat.funding]}
                  onValueChange={(value) => setBudgetFunding(cat.key as keyof typeof budget, value[0])}
                  min={0}
                  max={100}
                  step={5}
                  className="flex-1"
                />
                <span className="w-12 text-right font-mono text-sm">{cat.funding}%</span>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Achievements Panel
function AchievementsPanel() {
  const { state, setActivePanel } = useGame();
  const { achievements } = state;
  
  const unlocked = achievements.filter(a => a.unlocked);
  const locked = achievements.filter(a => !a.unlocked);
  
  return (
    <Dialog open={true} onOpenChange={() => setActivePanel('none')}>
      <DialogContent className="max-w-[500px] max-h-[600px]">
        <DialogHeader>
          <DialogTitle>Achievements ({unlocked.length}/{achievements.length})</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[450px] pr-4">
          {unlocked.length > 0 && (
            <div className="mb-6">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Unlocked</div>
              <div className="grid grid-cols-2 gap-2">
                {unlocked.map(a => (
                  <Card key={a.id} className="p-3 border-l-2 border-l-primary">
                    <div className="text-foreground text-sm font-medium">{a.name}</div>
                    <div className="text-muted-foreground text-xs mt-1">{a.description}</div>
                  </Card>
                ))}
              </div>
            </div>
          )}
          
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Locked</div>
            <div className="grid grid-cols-2 gap-2">
              {locked.map(a => (
                <Card key={a.id} className="p-3 opacity-60">
                  <div className="text-foreground text-sm font-medium">{a.name}</div>
                  <div className="text-muted-foreground text-xs mt-1">{a.requirement}</div>
                  {a.progress !== undefined && a.target && (
                    <div className="mt-2">
                      <Progress value={(a.progress / a.target) * 100} className="h-1" />
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {a.progress.toLocaleString()} / {a.target.toLocaleString()}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// Statistics Panel with Historical Charts
function StatisticsPanel() {
  const { state, setActivePanel } = useGame();
  const { history, stats } = state;
  const [activeTab, setActiveTab] = useState<'population' | 'money' | 'happiness'>('population');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Draw chart on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length < 2) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;
    
    ctx.fillStyle = 'hsl(var(--secondary))';
    ctx.fillRect(0, 0, width, height);
    
    let data: number[] = [];
    let color = '#10b981';
    let formatValue = (v: number) => v.toLocaleString();
    
    switch (activeTab) {
      case 'population':
        data = history.map(h => h.population);
        color = '#10b981';
        break;
      case 'money':
        data = history.map(h => h.money);
        color = '#f59e0b';
        formatValue = (v) => `$${v.toLocaleString()}`;
        break;
      case 'happiness':
        data = history.map(h => h.happiness);
        color = '#ec4899';
        formatValue = (v) => `${Math.round(v)}%`;
        break;
    }
    
    if (data.length < 2) return;
    
    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);
    const range = maxVal - minVal || 1;
    
    ctx.strokeStyle = 'hsl(var(--border))';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (height - padding * 2) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
      
      const value = maxVal - (range * (i / 4));
      ctx.fillStyle = 'hsl(var(--muted-foreground))';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatValue(value), padding - 5, y + 3);
    }
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const stepX = (width - padding * 2) / (data.length - 1);
    
    data.forEach((val, i) => {
      const x = padding + i * stepX;
      const y = padding + (height - padding * 2) * (1 - (val - minVal) / range);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    ctx.lineTo(padding + (data.length - 1) * stepX, height - padding);
    ctx.lineTo(padding, height - padding);
    ctx.closePath();
    ctx.fillStyle = color + '20';
    ctx.fill();
    
    ctx.fillStyle = color;
    data.forEach((val, i) => {
      if (i % Math.max(1, Math.floor(data.length / 10)) !== 0 && i !== data.length - 1) return;
      const x = padding + i * stepX;
      const y = padding + (height - padding * 2) * (1 - (val - minVal) / range);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    
  }, [history, activeTab]);
  
  return (
    <Dialog open={true} onOpenChange={() => setActivePanel('none')}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>City Statistics</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Current Stats */}
          <div className="grid grid-cols-4 gap-3">
            <Card className="p-3">
              <div className="text-muted-foreground text-xs mb-1">Population</div>
              <div className="font-mono font-semibold text-green-400">{stats.population.toLocaleString()}</div>
            </Card>
            <Card className="p-3">
              <div className="text-muted-foreground text-xs mb-1">Jobs</div>
              <div className="font-mono font-semibold text-blue-400">{stats.jobs.toLocaleString()}</div>
            </Card>
            <Card className="p-3">
              <div className="text-muted-foreground text-xs mb-1">Treasury</div>
              <div className="font-mono font-semibold text-amber-400">${stats.money.toLocaleString()}</div>
            </Card>
            <Card className="p-3">
              <div className="text-muted-foreground text-xs mb-1">Monthly</div>
              <div className={`font-mono font-semibold ${stats.income - stats.expenses >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${(stats.income - stats.expenses).toLocaleString()}
              </div>
            </Card>
          </div>
          
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="population">Population</TabsTrigger>
              <TabsTrigger value="money">Money</TabsTrigger>
              <TabsTrigger value="happiness">Happiness</TabsTrigger>
            </TabsList>
          </Tabs>
          
          {/* Chart */}
          <Card className="p-4">
            {history.length < 2 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                Not enough data yet. Keep playing to see historical trends.
              </div>
            ) : (
              <canvas ref={canvasRef} width={536} height={200} className="w-full rounded-md" />
            )}
          </Card>
          
          {/* City Ratings */}
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">City Ratings</div>
            <div className="grid grid-cols-5 gap-3">
              <RatingBar label="Happiness" value={stats.happiness} color="bg-pink-500" />
              <RatingBar label="Health" value={stats.health} color="bg-green-500" />
              <RatingBar label="Education" value={stats.education} color="bg-blue-500" />
              <RatingBar label="Safety" value={stats.safety} color="bg-amber-500" />
              <RatingBar label="Environment" value={stats.environment} color="bg-emerald-500" />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RatingBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className="h-20 w-full bg-secondary relative rounded-md overflow-hidden">
        <div
          className={`absolute bottom-0 left-0 right-0 transition-all duration-500 ${color}`}
          style={{ height: `${value}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-foreground text-sm font-bold drop-shadow-lg">{Math.round(value)}%</span>
        </div>
      </div>
      <div className="text-muted-foreground text-[10px] mt-2">{label}</div>
    </div>
  );
}

// Tutorial Overlay
function TutorialOverlay() {
  const { state, completeTutorialStep, skipTutorial } = useGame();
  const { tutorialStep, tutorialCompleted } = state;
  
  if (tutorialCompleted) return null;
  
  const currentStep = TUTORIAL_STEPS[tutorialStep] || TUTORIAL_STEPS[0];
  const isLastStep = tutorialStep >= TUTORIAL_STEPS.length - 1;
  
  return (
    <div className="absolute inset-0 z-[100] pointer-events-none">
      <div className="absolute inset-0 bg-black/50 pointer-events-auto" onClick={skipTutorial} />
      
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto">
        <Card className="w-[450px]">
          <Progress value={((tutorialStep + 1) / TUTORIAL_STEPS.length) * 100} className="h-1 rounded-none rounded-t-lg" />
          
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="outline" className="text-primary">
                Step {tutorialStep + 1} of {TUTORIAL_STEPS.length}
              </Badge>
            </div>
            
            <h3 className="text-foreground text-xl font-bold mb-3">{currentStep.title}</h3>
            <p className="text-muted-foreground leading-relaxed mb-6">{currentStep.content}</p>
            
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={skipTutorial}>
                Skip Tutorial
              </Button>
              
              <Button onClick={completeTutorialStep}>
                {isLastStep ? 'Start Building!' : 'Next'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Settings Panel
function SettingsPanel() {
  const { state, setActivePanel, setDisastersEnabled, restartTutorial, newGame } = useGame();
  const { disastersEnabled, cityName, gridSize, tutorialCompleted } = state;
  const [newCityName, setNewCityName] = useState(cityName);
  const [showNewGameConfirm, setShowNewGameConfirm] = useState(false);
  
  return (
    <Dialog open={true} onOpenChange={() => setActivePanel('none')}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Game Settings */}
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Game Settings</div>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <Label>Disasters</Label>
                <p className="text-muted-foreground text-xs">Enable random fires and disasters</p>
              </div>
              <Switch
                checked={disastersEnabled}
                onCheckedChange={setDisastersEnabled}
              />
            </div>
          </div>
          
          {/* City Info */}
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">City Information</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>City Name</span>
                <span className="text-foreground">{cityName}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Grid Size</span>
                <span className="text-foreground">{gridSize} x {gridSize}</span>
              </div>
            </div>
          </div>
          
          {/* Controls */}
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Controls</div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>Pan</span><span className="text-foreground">Alt + Drag / Middle Click</span></div>
              <div className="flex justify-between"><span>Zoom</span><span className="text-foreground">Scroll Wheel</span></div>
              <div className="flex justify-between"><span>Place Multiple</span><span className="text-foreground">Click + Drag</span></div>
              <div className="flex justify-between"><span>View Tile Info</span><span className="text-foreground">Select Tool + Click</span></div>
            </div>
          </div>
          
          {/* Tutorial */}
          {tutorialCompleted && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                restartTutorial();
                setActivePanel('none');
              }}
            >
              Restart Tutorial
            </Button>
          )}
          
          <Separator />
          
          {/* New Game */}
          {!showNewGameConfirm ? (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setShowNewGameConfirm(true)}
            >
              Start New Game
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm text-center">Are you sure? This will reset all progress.</p>
              <Input
                value={newCityName}
                onChange={(e) => setNewCityName(e.target.value)}
                placeholder="New city name..."
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowNewGameConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    newGame(newCityName || 'New City', gridSize);
                    setActivePanel('none');
                  }}
                >
                  Reset
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Advisors Panel
function AdvisorsPanel() {
  const { state, setActivePanel } = useGame();
  const { advisorMessages, stats } = state;
  
  const avgRating = (stats.happiness + stats.health + stats.education + stats.safety + stats.environment) / 5;
  const grade = avgRating >= 90 ? 'A+' : avgRating >= 80 ? 'A' : avgRating >= 70 ? 'B' : avgRating >= 60 ? 'C' : avgRating >= 50 ? 'D' : 'F';
  const gradeColor = avgRating >= 70 ? 'text-green-400' : avgRating >= 50 ? 'text-amber-400' : 'text-red-400';
  
  return (
    <Dialog open={true} onOpenChange={() => setActivePanel('none')}>
      <DialogContent className="max-w-[500px] max-h-[600px]">
        <DialogHeader>
          <DialogTitle>City Advisors</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* City Grade */}
          <Card className="flex items-center gap-4 p-4">
            <div 
              className={`w-16 h-16 flex items-center justify-center text-3xl font-black rounded-md ${gradeColor} bg-secondary`}
            >
              {grade}
            </div>
            <div>
              <div className="text-foreground font-semibold">Overall City Rating</div>
              <div className="text-muted-foreground text-sm">Based on happiness, health, education, safety & environment</div>
            </div>
          </Card>
          
          {/* Advisor Messages */}
          <ScrollArea className="max-h-[350px]">
            <div className="space-y-3 pr-4">
              {advisorMessages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AdvisorIcon size={32} className="mx-auto mb-3 opacity-50" />
                  <div className="text-sm">No urgent issues to report!</div>
                  <div className="text-xs mt-1">Your city is running smoothly.</div>
                </div>
              ) : (
                advisorMessages.map((advisor, i) => (
                  <Card key={i} className={`p-3 ${
                    advisor.priority === 'critical' ? 'border-l-2 border-l-red-500' :
                    advisor.priority === 'high' ? 'border-l-2 border-l-amber-500' :
                    advisor.priority === 'medium' ? 'border-l-2 border-l-yellow-500' : ''
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg text-muted-foreground">
                        {ADVISOR_ICON_MAP[advisor.icon] || <InfoIcon size={18} />}
                      </span>
                      <span className="text-foreground font-medium text-sm">{advisor.name}</span>
                      <Badge 
                        variant={
                          advisor.priority === 'critical' ? 'destructive' :
                          advisor.priority === 'high' ? 'destructive' : 'secondary'
                        }
                        className="ml-auto text-[10px]"
                      >
                        {advisor.priority}
                      </Badge>
                    </div>
                    {advisor.messages.map((msg, j) => (
                      <div key={j} className="text-muted-foreground text-sm leading-relaxed">{msg}</div>
                    ))}
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Isometric Grid Component with drag support
function IsometricGrid() {
  const { state, placeAtTile } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 620, y: 160 });
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);
  const [selectedTile, setSelectedTile] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [lastPlacedTile, setLastPlacedTile] = useState<{ x: number; y: number } | null>(null);
  
  const { grid, gridSize, selectedTool } = state;
  
  const supportsDrag = ['road', 'bulldoze', 'zone_residential', 'zone_commercial', 'zone_industrial', 'zone_dezone', 'tree'].includes(selectedTool);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      e.preventDefault();
      return;
    }
    
    if (e.button === 0) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = (e.clientX - rect.left) / zoom;
        const mouseY = (e.clientY - rect.top) / zoom;
        const { gridX, gridY } = screenToGrid(mouseX, mouseY, offset.x / zoom, offset.y / zoom);
        
        if (gridX >= 0 && gridX < gridSize && gridY >= 0 && gridY < gridSize) {
          if (selectedTool === 'select') {
            setSelectedTile({ x: gridX, y: gridY });
          } else {
            placeAtTile(gridX, gridY);
            setLastPlacedTile({ x: gridX, y: gridY });
            if (supportsDrag) {
              setIsDragging(true);
            }
          }
        }
      }
    }
  }, [offset, gridSize, selectedTool, placeAtTile, zoom, supportsDrag]);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
      return;
    }
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = (e.clientX - rect.left) / zoom;
      const mouseY = (e.clientY - rect.top) / zoom;
      const { gridX, gridY } = screenToGrid(mouseX, mouseY, offset.x / zoom, offset.y / zoom);
      
      if (gridX >= 0 && gridX < gridSize && gridY >= 0 && gridY < gridSize) {
        setHoveredTile({ x: gridX, y: gridY });
        
        if (isDragging && supportsDrag && (lastPlacedTile?.x !== gridX || lastPlacedTile?.y !== gridY)) {
          placeAtTile(gridX, gridY);
          setLastPlacedTile({ x: gridX, y: gridY });
        }
      } else {
        setHoveredTile(null);
      }
    }
  }, [isPanning, isDragging, dragStart, offset, gridSize, zoom, supportsDrag, placeAtTile, lastPlacedTile]);
  
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setIsDragging(false);
    setLastPlacedTile(null);
  }, []);
  
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.max(0.5, Math.min(2, z + delta)));
  }, []);
  
  const gridWidth = gridSize * TILE_WIDTH;
  const gridHeight = gridSize * TILE_HEIGHT + 240;
  
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{ 
        background: 'linear-gradient(180deg, hsl(var(--background)) 0%, hsl(220 20% 12%) 50%, hsl(150 20% 15%) 100%)',
        cursor: isPanning ? 'grabbing' : isDragging ? 'crosshair' : 'default',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <div
        className="absolute"
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <div
          style={{
            transform: `translate(${offset.x / zoom}px, ${offset.y / zoom}px)`,
            width: gridWidth,
            height: gridHeight,
          }}
        >
          {Array.from({ length: gridSize }, (_, y) =>
            Array.from({ length: gridSize }, (_, x) => {
              const tile = grid[y][x];
              const { screenX, screenY } = gridToScreen(x, y, 0, 0);
              const isHovered = hoveredTile?.x === x && hoveredTile?.y === y;
              const isSelected = selectedTile?.x === x && selectedTile?.y === y;
              
              // Building heights for z-offset (buildings render from bottom)
              // Each building SVG includes its ground tile at the bottom
              const buildingType = tile.building.type;
              const buildingHeights: Record<string, number> = {
                'grass': 0,
                'empty': 0,
                'water': 0,
                'road': 0,
                'tree': TILE_HEIGHT * 0.8,
                'house_small': TILE_HEIGHT * 0.9,
                'house_medium': TILE_HEIGHT * 1.15,
                'mansion': TILE_HEIGHT * 1.15,
                'apartment_low': TILE_HEIGHT * 1.5,
                'apartment_high': TILE_HEIGHT * (1.8 + tile.building.level * 0.4),
                'shop_small': TILE_HEIGHT * 0.7,
                'shop_medium': TILE_HEIGHT * 1.2,
                'office_low': TILE_HEIGHT * 1.2,
                'office_high': TILE_HEIGHT * (1.5 + tile.building.level * 0.5),
                'mall': TILE_HEIGHT * 1.4,
                'factory_small': TILE_HEIGHT * 1.4,
                'factory_medium': TILE_HEIGHT * 1.9,
                'factory_large': TILE_HEIGHT * 1.9,
                'warehouse': TILE_HEIGHT * 0.6,
                'power_plant': TILE_HEIGHT * 1.7,
                'water_tower': TILE_HEIGHT * 1.4,
                'police_station': TILE_HEIGHT * 0.9,
                'fire_station': TILE_HEIGHT * 1.4,
                'hospital': TILE_HEIGHT * 1.4,
                'school': TILE_HEIGHT * 1.35,
                'university': TILE_HEIGHT * 1.8,
                'park': TILE_HEIGHT * 0.7,
                'stadium': TILE_HEIGHT * 1.4,
                'airport': TILE_HEIGHT * 1.9,
              };
              const heightOffset = buildingHeights[buildingType] || 0;
              
              return (
                <div
                  key={`${x}-${y}`}
                  className="absolute"
                  style={{
                    left: screenX,
                    top: screenY - heightOffset,
                    zIndex: x + y,
                    transform: isHovered ? 'translateY(-2px)' : undefined,
                    filter: tile.building.onFire ? 'brightness(1.3) saturate(1.5)' : isHovered ? 'brightness(1.05)' : undefined,
                  }}
                >
                  <BuildingRenderer
                    buildingType={tile.building.type}
                    level={tile.building.level}
                    powered={tile.building.powered}
                    zone={tile.zone}
                    highlight={isHovered || isSelected}
                    size={TILE_WIDTH}
                    onFire={tile.building.onFire}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
      
      {selectedTile && selectedTool === 'select' && (
        <TileInfoPanel
          tile={grid[selectedTile.y][selectedTile.x]}
          services={state.services}
          onClose={() => setSelectedTile(null)}
        />
      )}
      
      {hoveredTile && selectedTool !== 'select' && (
        <Card className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2">
          <span className="text-sm">
            {TOOL_INFO[selectedTool].name} at ({hoveredTile.x}, {hoveredTile.y})
            {TOOL_INFO[selectedTool].cost > 0 && ` - $${TOOL_INFO[selectedTool].cost}`}
            {supportsDrag && ' - Drag to place multiple'}
          </span>
        </Card>
      )}
      
      <Badge variant="secondary" className="absolute bottom-4 left-4 font-mono">
        {Math.round(zoom * 100)}%
      </Badge>
    </div>
  );
}

// Main Game Component
export default function Game() {
  const { state } = useGame();
  
  return (
    <TooltipProvider>
      <div className="w-full h-full min-h-[720px] overflow-hidden bg-background flex rounded-xl">
        {/* Left Sidebar */}
        <Sidebar />
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          <TopBar />
          <StatsPanel />
          <div className="flex-1 relative">
            <IsometricGrid />
            <MiniMap />
          </div>
        </div>
        
        {/* Panels */}
        {state.activePanel === 'budget' && <BudgetPanel />}
        {state.activePanel === 'achievements' && <AchievementsPanel />}
        {state.activePanel === 'statistics' && <StatisticsPanel />}
        {state.activePanel === 'advisors' && <AdvisorsPanel />}
        {state.activePanel === 'settings' && <SettingsPanel />}
        
        {/* Tutorial Overlay */}
        <TutorialOverlay />
        
        {/* Controls hint */}
        {state.tutorialCompleted && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-muted-foreground text-xs">
            Alt+Drag or Middle-click to pan - Scroll to zoom - Drag to place multiple
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
