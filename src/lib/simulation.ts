// Simulation engine for IsoCity
import {
  GameState,
  Tile,
  Building,
  BuildingType,
  ZoneType,
  Stats,
  Budget,
  ServiceCoverage,
  AdvisorMessage,
  HistoryPoint,
  Notification,
  AdjacentCity,
  WaterBody,
  BridgeType,
  BridgeOrientation,
  BUILDING_STATS,
  RESIDENTIAL_BUILDINGS,
  COMMERCIAL_BUILDINGS,
  INDUSTRIAL_BUILDINGS,
  TOOL_INFO,
} from '@/types/game';
import { generateCityName, generateWaterName } from './names';
import { isMobile } from 'react-device-detect';

// ============================================================================
// 1. CONSTANTS (Must be at the top to avoid initialization errors)
// ============================================================================

export const DEFAULT_GRID_SIZE = isMobile ? 50 : 70;

const NO_CONSTRUCTION_TYPES: BuildingType[] = ['grass', 'empty', 'water', 'road', 'bridge', 'tree'];

// Bridges
const MAX_BRIDGE_SPAN = 10;
const BRIDGE_TYPE_THRESHOLDS = { large: 5, suspension: 10 } as const;
const BRIDGE_VARIANTS: Record<BridgeType, number> = { small: 3, medium: 3, large: 2, suspension: 2 };
const WATERFRONT_BUILDINGS: BuildingType[] = ['marina_docks_small', 'pier_large'];

const MERGEABLE_TILE_TYPES = new Set<BuildingType>(['grass', 'tree']);

const CONSOLIDATABLE_BUILDINGS: Record<ZoneType, Set<BuildingType>> = {
  residential: new Set(['house_small', 'house_medium']),
  commercial: new Set(['shop_small', 'shop_medium']),
  industrial: new Set(['factory_small']),
  none: new Set(),
};

// Building sizes
const BUILDING_SIZES: Partial<Record<BuildingType, { width: number; height: number }>> = {
  power_plant: { width: 2, height: 2 },
  hospital: { width: 2, height: 2 },
  school: { width: 2, height: 2 },
  stadium: { width: 3, height: 3 },
  museum: { width: 3, height: 3 },
  university: { width: 3, height: 3 },
  airport: { width: 4, height: 4 },
  space_program: { width: 3, height: 3 },
  park_large: { width: 3, height: 3 },
  mansion: { width: 2, height: 2 },
  apartment_low: { width: 2, height: 2 },
  apartment_high: { width: 2, height: 2 },
  office_low: { width: 2, height: 2 },
  office_high: { width: 2, height: 2 },
  mall: { width: 3, height: 3 },
  factory_medium: { width: 2, height: 2 },
  factory_large: { width: 3, height: 3 },
  warehouse: { width: 2, height: 2 },
  city_hall: { width: 2, height: 2 },
  amusement_park: { width: 4, height: 4 },
  playground_large: { width: 2, height: 2 },
  baseball_field_small: { width: 2, height: 2 },
  football_field: { width: 2, height: 2 },
  baseball_stadium: { width: 3, height: 3 },
  mini_golf_course: { width: 2, height: 2 },
  go_kart_track: { width: 2, height: 2 },
  amphitheater: { width: 2, height: 2 },
  greenhouse_garden: { width: 2, height: 2 },
  marina_docks_small: { width: 2, height: 2 },
  roller_coaster_small: { width: 2, height: 2 },
  mountain_lodge: { width: 2, height: 2 },
  mountain_trailhead: { width: 3, height: 3 },
  rail_station: { width: 2, height: 2 },
};

// Service Config
const withRange = <R extends number, T extends Record<string, unknown>>(range: R, extra: T) => ({ range, rangeSquared: range * range, ...extra });

export const SERVICE_CONFIG = {
  police_station: withRange(13, { type: 'police' as const }),
  fire_station: withRange(18, { type: 'fire' as const }),
  hospital: withRange(24, { type: 'health' as const }),
  school: withRange(11, { type: 'education' as const }),
  university: withRange(19, { type: 'education' as const }),
  power_plant: withRange(15, {}),
  water_tower: withRange(12, {}),
} as const;

export const SERVICE_BUILDING_TYPES = new Set(['police_station', 'fire_station', 'hospital', 'school', 'university', 'power_plant', 'water_tower']);
export const SERVICE_MAX_LEVEL = 5;
export const SERVICE_RANGE_INCREASE_PER_LEVEL = 0.2;
export const SERVICE_UPGRADE_COST_BASE = 2;

// ============================================================================
// 2. BASIC HELPER FUNCTIONS
// ============================================================================

export function getBuildingSize(buildingType: BuildingType): { width: number; height: number } {
  return BUILDING_SIZES[buildingType] || { width: 1, height: 1 };
}

function getConstructionSpeed(buildingType: BuildingType): number {
  const size = getBuildingSize(buildingType);
  const area = size.width * size.height;
  const baseSpeed = 24 + Math.random() * 12;
  return (baseSpeed / Math.sqrt(area)) / 1.3;
}

function createBuilding(type: BuildingType): Building {
  const constructionProgress = NO_CONSTRUCTION_TYPES.includes(type) ? 100 : 0;
  return {
    type,
    level: type === 'grass' || type === 'empty' || type === 'water' ? 0 : 1,
    population: 0, jobs: 0, powered: false, watered: false, onFire: false, fireProgress: 0, age: 0,
    constructionProgress, abandoned: false,
  };
}

function createTile(x: number, y: number, buildingType: BuildingType = 'grass'): Tile {
  return {
    x, y, zone: 'none',
    building: createBuilding(buildingType),
    landValue: 50, pollution: 0, crime: 0, traffic: 0, hasSubway: false,
  };
}

// ECO-HACK: Updated to include Farms
function isStarterBuilding(x: number, y: number, buildingType: string): boolean {
  if (buildingType === 'house_small' || buildingType === 'shop_small') return true;
  if (buildingType === 'animal_pens_farm' || buildingType === 'greenhouse_garden') return true;
  if (buildingType === 'factory_small') return true;
  return false;
}

export function requiresWaterAdjacency(buildingType: BuildingType): boolean {
  return WATERFRONT_BUILDINGS.includes(buildingType);
}

function calculateAverageCoverage(coverage: number[][]): number {
  let total = 0; let count = 0;
  for (const row of coverage) {
    for (const value of row) { total += value; count++; }
  }
  return count > 0 ? total / count : 0;
}

// ============================================================================
// 3. COMPLEX HELPERS (Footprints, Origins, Services)
// ============================================================================

function findBuildingOrigin(grid: Tile[][], x: number, y: number, gridSize: number): { originX: number; originY: number; buildingType: BuildingType } | null {
  const tile = grid[y]?.[x];
  if (!tile) return null;
  
  // If it's a real building (not empty/grass/water), it might be the origin
  if (tile.building.type !== 'empty' && tile.building.type !== 'grass' && 
      tile.building.type !== 'water' && tile.building.type !== 'road' && 
      tile.building.type !== 'bridge' && tile.building.type !== 'rail' && tile.building.type !== 'tree') {
    const size = getBuildingSize(tile.building.type);
    if (size.width > 1 || size.height > 1) {
      return { originX: x, originY: y, buildingType: tile.building.type };
    }
    return null; 
  }
  
  // If it's empty, look for the parent
  if (tile.building.type === 'empty') {
    const maxSize = 4;
    for (let dy = 0; dy < maxSize; dy++) {
      for (let dx = 0; dx < maxSize; dx++) {
        const checkX = x - dx;
        const checkY = y - dy;
        if (checkX >= 0 && checkY >= 0 && checkX < gridSize && checkY < gridSize) {
          const checkTile = grid[checkY][checkX];
          if (checkTile.building.type !== 'empty' && 
              checkTile.building.type !== 'grass' &&
              checkTile.building.type !== 'water' &&
              checkTile.building.type !== 'road' &&
              checkTile.building.type !== 'bridge' &&
              checkTile.building.type !== 'rail' &&
              checkTile.building.type !== 'tree') {
            const size = getBuildingSize(checkTile.building.type);
            if (x >= checkX && x < checkX + size.width &&
                y >= checkY && y < checkY + size.height) {
              return { originX: checkX, originY: checkY, buildingType: checkTile.building.type };
            }
          }
        }
      }
    }
  }
  return null;
}

function calculateServiceCoverage(grid: Tile[][], size: number): ServiceCoverage {
  const services = createServiceCoverage(size);
  const serviceBuildings: Array<{ x: number; y: number; type: BuildingType; level: number }> = [];
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tile = grid[y][x];
      if (!SERVICE_BUILDING_TYPES.has(tile.building.type)) continue;
      if (tile.building.constructionProgress !== undefined && tile.building.constructionProgress < 100) continue;
      if (tile.building.abandoned) continue;
      serviceBuildings.push({ x, y, type: tile.building.type, level: tile.building.level });
    }
  }
  
  for (const building of serviceBuildings) {
    const { x, y, type, level } = building;
    const config = SERVICE_CONFIG[type as keyof typeof SERVICE_CONFIG];
    if (!config) continue;
    
    const baseRange = config.range;
    const effectiveRange = baseRange * (1 + (level - 1) * SERVICE_RANGE_INCREASE_PER_LEVEL);
    const range = Math.floor(effectiveRange);
    const rangeSquared = range * range;
    
    const minY = Math.max(0, y - range);
    const maxY = Math.min(size - 1, y + range);
    const minX = Math.max(0, x - range);
    const maxX = Math.min(size - 1, x + range);
    
    if (type === 'power_plant') {
      for (let ny = minY; ny <= maxY; ny++) {
        for (let nx = minX; nx <= maxX; nx++) {
          const dx = nx - x; const dy = ny - y;
          if (dx * dx + dy * dy <= rangeSquared) services.power[ny][nx] = true;
        }
      }
    } else if (type === 'water_tower') {
      for (let ny = minY; ny <= maxY; ny++) {
        for (let nx = minX; nx <= maxX; nx++) {
          const dx = nx - x; const dy = ny - y;
          if (dx * dx + dy * dy <= rangeSquared) services.water[ny][nx] = true;
        }
      }
    } else {
      const serviceType = (config as { type: 'police' | 'fire' | 'health' | 'education' }).type;
      const currentCoverage = services[serviceType] as number[][];
      for (let ny = minY; ny <= maxY; ny++) {
        for (let nx = minX; nx <= maxX; nx++) {
          const dx = nx - x; const dy = ny - y;
          const distSquared = dx * dx + dy * dy;
          if (distSquared <= rangeSquared) {
            const distance = Math.sqrt(distSquared);
            const coverage = Math.max(0, (1 - distance / range) * 100);
            currentCoverage[ny][nx] = Math.min(100, currentCoverage[ny][nx] + coverage);
          }
        }
      }
    }
  }
  return services;
}

function isMergeableZoneTile(tile: Tile, zone: ZoneType, excludeTile?: { x: number; y: number }, allowBuildingConsolidation?: boolean): boolean {
  if (excludeTile && tile.x === excludeTile.x && tile.y === excludeTile.y) {
    return tile.zone === zone && !tile.building.onFire && tile.building.type !== 'water' && tile.building.type !== 'road';
  }
  if (tile.zone !== zone) return false;
  if (tile.building.onFire) return false;
  if (tile.building.type === 'water' || tile.building.type === 'road' || tile.building.type === 'bridge') return false;
  if (MERGEABLE_TILE_TYPES.has(tile.building.type)) return true;
  if (allowBuildingConsolidation && CONSOLIDATABLE_BUILDINGS[zone]?.has(tile.building.type)) return true;
  return false;
}

function footprintAvailable(grid: Tile[][], originX: number, originY: number, width: number, height: number, zone: ZoneType, gridSize: number, excludeTile?: { x: number; y: number }, allowBuildingConsolidation?: boolean): boolean {
  if (originX < 0 || originY < 0 || originX + width > gridSize || originY + height > gridSize) return false;
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tile = grid[originY + dy][originX + dx];
      if (!isMergeableZoneTile(tile, zone, excludeTile, allowBuildingConsolidation)) return false;
    }
  }
  return true;
}

function scoreFootprint(grid: Tile[][], originX: number, originY: number, width: number, height: number, gridSize: number): number {
  let roadScore = 0;
  const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const gx = originX + dx;
      const gy = originY + dy;
      for (const [ox, oy] of offsets) {
        const nx = gx + ox;
        const ny = gy + oy;
        if (nx >= 0 && ny >= 0 && nx < gridSize && ny < gridSize) {
          const adjacentType = grid[ny][nx].building.type;
          if (adjacentType === 'road' || adjacentType === 'bridge') roadScore++;
        }
      }
    }
  }
  return roadScore - width * height * 0.25;
}

function findFootprintIncludingTile(grid: Tile[][], x: number, y: number, width: number, height: number, zone: ZoneType, gridSize: number, allowBuildingConsolidation?: boolean): { originX: number; originY: number } | null {
  const candidates: { originX: number; originY: number; score: number }[] = [];
  const excludeTile = { x, y };
  for (let oy = y - (height - 1); oy <= y; oy++) {
    for (let ox = x - (width - 1); ox <= x; ox++) {
      if (!footprintAvailable(grid, ox, oy, width, height, zone, gridSize, excludeTile, allowBuildingConsolidation)) continue;
      if (x < ox || x >= ox + width || y < oy || y >= oy + height) continue;
      const score = scoreFootprint(grid, ox, oy, width, height, gridSize);
      candidates.push({ originX: ox, originY: oy, score });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return { originX: candidates[0].originX, originY: candidates[0].originY };
}

function applyBuildingFootprint(grid: Tile[][], originX: number, originY: number, buildingType: BuildingType, zone: ZoneType, level: number, services?: ServiceCoverage): Building {
  const size = getBuildingSize(buildingType);
  const stats = BUILDING_STATS[buildingType] || { maxPop: 0, maxJobs: 0, pollution: 0, landValue: 0 };
  for (let dy = 0; dy < size.height; dy++) {
    for (let dx = 0; dx < size.width; dx++) {
      const cell = grid[originY + dy][originX + dx];
      if (dx === 0 && dy === 0) {
        cell.building = createBuilding(buildingType);
        cell.building.level = level;
        cell.building.age = 0;
        if (services) {
          cell.building.powered = services.power[originY + dy][originX + dx];
          cell.building.watered = services.water[originY + dy][originX + dx];
        }
      } else {
        cell.building = createBuilding('empty');
        cell.building.level = 0;
      }
      cell.zone = zone;
      cell.pollution = dx === 0 && dy === 0 ? stats.pollution : 0;
    }
  }
  return grid[originY][originX].building;
}

function canPlaceMultiTileBuilding(grid: Tile[][], x: number, y: number, width: number, height: number, gridSize: number): boolean {
  if (x + width > gridSize || y + height > gridSize) return false;
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tile = grid[y + dy]?.[x + dx];
      if (!tile) return false;
      if (tile.building.type !== 'grass' && tile.building.type !== 'tree') return false;
    }
  }
  return true;
}

const roadAccessQueue = new Int16Array(3 * 256);
const roadAccessVisited = new Uint8Array(128 * 128);

function hasRoadAccess(grid: Tile[][], x: number, y: number, size: number, maxDistance: number = 8): boolean {
  const startZone = grid[y][x].zone;
  if (startZone === 'none') return false;

  const minClearX = Math.max(0, x - maxDistance);
  const maxClearX = Math.min(size - 1, x + maxDistance);
  const minClearY = Math.max(0, y - maxDistance);
  const maxClearY = Math.min(size - 1, y + maxDistance);
  for (let cy = minClearY; cy <= maxClearY; cy++) {
    for (let cx = minClearX; cx <= maxClearX; cx++) {
      roadAccessVisited[cy * size + cx] = 0;
    }
  }

  let queueHead = 0;
  let queueTail = 3;
  roadAccessQueue[0] = x;
  roadAccessQueue[1] = y;
  roadAccessQueue[2] = 0;
  roadAccessVisited[y * size + x] = 1;

  while (queueHead < queueTail) {
    const cx = roadAccessQueue[queueHead];
    const cy = roadAccessQueue[queueHead + 1];
    const dist = roadAccessQueue[queueHead + 2];
    queueHead += 3;
    
    if (dist >= maxDistance) continue;

    const neighbors = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      const idx = ny * size + nx;
      if (roadAccessVisited[idx]) continue;
      roadAccessVisited[idx] = 1;

      const neighbor = grid[ny][nx];
      if (neighbor.building.type === 'road' || neighbor.building.type === 'bridge') return true;

      const isPassableZone = neighbor.zone === startZone && neighbor.building.type !== 'water';
      if (isPassableZone && queueTail < roadAccessQueue.length - 3) {
        roadAccessQueue[queueTail] = nx;
        roadAccessQueue[queueTail + 1] = ny;
        roadAccessQueue[queueTail + 2] = dist + 1;
        queueTail += 3;
      }
    }
  }
  return false;
}

// ============================================================================
// 4. MAIN SIMULATION FUNCTIONS
// ============================================================================

function evolveBuilding(grid: Tile[][], x: number, y: number, services: ServiceCoverage, demand?: { residential: number; commercial: number; industrial: number }): Building {
  const tile = grid[y][x];
  const building = tile.building;
  const zone = tile.zone;

  if (zone === 'none' || building.type === 'grass' || building.type === 'water' || building.type === 'road' || building.type === 'bridge') return building;

  if (building.type === 'empty') {
    building.powered = services.power[y][x];
    building.watered = services.water[y][x];
    building.population = 0; building.jobs = 0;
    return building;
  }

  building.powered = services.power[y][x];
  building.watered = services.water[y][x];
  const hasPower = building.powered;
  const hasWater = building.watered;
  const landValue = tile.landValue;
  const isStarter = isStarterBuilding(x, y, building.type);

  if (!isStarter && (!hasPower || !hasWater)) return building;

  if (building.constructionProgress !== undefined && building.constructionProgress < 100) {
    // FIX: Renamed variable to avoid name clash
    const speed = getConstructionSpeed(building.type);
    building.constructionProgress = Math.min(100, building.constructionProgress + speed);
    building.population = 0; building.jobs = 0;
    return building;
  }

  const zoneDemandValue = demand ? (
    zone === 'residential' ? demand.residential :
    zone === 'commercial' ? demand.commercial :
    zone === 'industrial' ? demand.industrial : 0
  ) : 0;

  if (building.abandoned) {
    if (zoneDemandValue > 10) {
      const clearingChance = Math.min(0.12, (zoneDemandValue - 10) / 600);
      if (Math.random() < clearingChance) {
        const size = getBuildingSize(building.type);
        if (size.width > 1 || size.height > 1) {
          for (let dy = 0; dy < size.height; dy++) {
            for (let dx = 0; dx < size.width; dx++) {
              const clearTile = grid[y + dy]?.[x + dx];
              if (clearTile) {
                const clearedBuilding = createBuilding('grass');
                clearedBuilding.powered = services.power[y + dy]?.[x + dx] ?? false;
                clearedBuilding.watered = services.water[y + dy]?.[x + dx] ?? false;
                clearTile.building = clearedBuilding;
              }
            }
          }
        }
        const clearedBuilding = createBuilding('grass');
        clearedBuilding.powered = building.powered;
        clearedBuilding.watered = building.watered;
        return clearedBuilding;
      }
    }
    building.population = 0; building.jobs = 0;
    building.age = (building.age || 0) + 0.1;
    return building;
  }
  
  if (zoneDemandValue < -20 && building.age > 30) {
    const abandonmentChance = Math.min(0.02, Math.abs(zoneDemandValue + 20) / 4000);
    const utilityPenalty = isStarter ? 0 : ((!hasPower ? 0.005 : 0) + (!hasWater ? 0.005 : 0));
    const levelPenalty = building.level <= 2 ? 0.003 : 0;
    if (Math.random() < abandonmentChance + utilityPenalty + levelPenalty) {
      building.abandoned = true; building.population = 0; building.jobs = 0;
      return building;
    }
  }

  building.age = (building.age || 0) + 1;

  const buildingList = zone === 'residential' ? RESIDENTIAL_BUILDINGS :
    zone === 'commercial' ? COMMERCIAL_BUILDINGS : zone === 'industrial' ? INDUSTRIAL_BUILDINGS : [];

  const serviceCoverage = (services.police[y][x] + services.fire[y][x] + services.health[y][x] + services.education[y][x]) / 4;
  const demandLevelBoost = Math.max(0, (zoneDemandValue - 30) / 70) * 0.7;
  const targetLevel = Math.min(5, Math.max(1, Math.floor((landValue / 24) + (serviceCoverage / 28) + (building.age / 60) + demandLevelBoost)));
  const targetIndex = Math.min(buildingList.length - 1, targetLevel - 1);
  const targetType = buildingList[targetIndex];
  let anchorX = x;
  let anchorY = y;

  let consolidationChance = 0.08;
  let allowBuildingConsolidation = false;
  const isSmall = (zone === 'residential' && (building.type === 'house_small' || building.type === 'house_medium')) ||
                  (zone === 'commercial' && (building.type === 'shop_small' || building.type === 'shop_medium')) ||
                  (zone === 'industrial' && building.type === 'factory_small');
  
  if (zoneDemandValue > 30 && isSmall) {
    consolidationChance += Math.min(0.25, (zoneDemandValue - 30) / 300);
    if (zoneDemandValue > 70) {
      consolidationChance += 0.05;
      allowBuildingConsolidation = true;
    }
  }

  const ageRequirement = 12;
  const hasUtilitiesForConsolidation = hasPower && hasWater;
  if (hasUtilitiesForConsolidation && building.age > ageRequirement && (targetLevel > building.level || targetType !== building.type) && Math.random() < consolidationChance) {
    const size = getBuildingSize(targetType);
    const footprint = findFootprintIncludingTile(grid, x, y, size.width, size.height, zone, grid.length, allowBuildingConsolidation);
    if (footprint) {
      const anchor = applyBuildingFootprint(grid, footprint.originX, footprint.originY, targetType, zone, targetLevel, services);
      anchor.level = targetLevel;
      anchorX = footprint.originX;
      anchorY = footprint.originY;
    } else if (targetLevel > building.level) {
      building.level = Math.min(targetLevel, building.level + 1);
    }
  }

  const anchorTile = grid[anchorY][anchorX];
  const anchorBuilding = anchorTile.building;
  anchorBuilding.powered = services.power[anchorY][anchorX];
  anchorBuilding.watered = services.water[anchorY][anchorX];
  anchorBuilding.level = Math.max(anchorBuilding.level, Math.min(targetLevel, anchorBuilding.level + 1));

  const buildingStats = BUILDING_STATS[anchorBuilding.type];
  const efficiency = (anchorBuilding.powered ? 0.5 : 0) + (anchorBuilding.watered ? 0.5 : 0);
  anchorBuilding.population = buildingStats?.maxPop > 0 ? Math.floor(buildingStats.maxPop * Math.max(1, anchorBuilding.level) * efficiency * 0.8) : 0;
  anchorBuilding.jobs = buildingStats?.maxJobs > 0 ? Math.floor(buildingStats.maxJobs * Math.max(1, anchorBuilding.level) * efficiency * 0.8) : 0;

  return grid[y][x].building;
}

function calculateStats(grid: Tile[][], size: number, budget: Budget, taxRate: number, effectiveTaxRate: number, services: ServiceCoverage): Stats {
  let population = 0; let jobs = 0; let totalPollution = 0;
  let toxicTiles = 0; let nutrientTiles = 0; let thermalTiles = 0;
  let residentialZones = 0; let commercialZones = 0; let industrialZones = 0;
  let developedResidential = 0; let developedCommercial = 0; let developedIndustrial = 0;
  let totalLandValue = 0; let treeCount = 0; let waterCount = 0; let parkCount = 0;
  let subwayTiles = 0; let subwayStations = 0; let railTiles = 0; let railStations = 0;
  let hasAirport = false; let hasCityHall = false; let hasSpaceProgram = false;
  let stadiumCount = 0; let museumCount = 0; let hasAmusementPark = false;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tile = grid[y][x];
      const building = tile.building;
      let jobsFromTile = building.jobs;
      if (tile.hasSubway && tile.zone === 'commercial') jobsFromTile = Math.floor(jobsFromTile * 1.15);
      
      population += building.population;
      jobs += jobsFromTile;
      totalPollution += tile.pollution;
      totalLandValue += tile.landValue;

      if (tile.pollution > 40) {
          if (tile.pollutionType === 'toxic') toxicTiles++;
          else if (tile.pollutionType === 'nutrient') nutrientTiles++;
          else if (tile.pollutionType === 'thermal') thermalTiles++;
      }

      if (tile.zone === 'residential') { residentialZones++; if (building.type !== 'grass' && building.type !== 'empty') developedResidential++; }
      else if (tile.zone === 'commercial') { commercialZones++; if (building.type !== 'grass' && building.type !== 'empty') developedCommercial++; }
      else if (tile.zone === 'industrial') { industrialZones++; if (building.type !== 'grass' && building.type !== 'empty') developedIndustrial++; }

      if (building.type === 'tree') treeCount++;
      if (building.type === 'water') waterCount++;
      if (building.type === 'park' || building.type === 'park_large') parkCount++;
      if (building.type === 'tennis') parkCount++;
      if (tile.hasSubway) subwayTiles++;
      if (building.type === 'subway_station') subwayStations++;
      if (building.type === 'rail' || tile.hasRailOverlay) railTiles++;
      if (building.type === 'rail_station') railStations++;
      
      if (building.constructionProgress === undefined || building.constructionProgress >= 100) {
        if (building.type === 'airport') hasAirport = true;
        if (building.type === 'city_hall') hasCityHall = true;
        if (building.type === 'space_program') hasSpaceProgram = true;
        if (building.type === 'stadium') stadiumCount++;
        if (building.type === 'museum') museumCount++;
        if (building.type === 'amusement_park') hasAmusementPark = true;
      }
    }
  }

  const taxMultiplier = Math.max(0, 1 - (effectiveTaxRate - 9) / 91);
  const taxAdditiveModifier = (9 - effectiveTaxRate) * 2;
  const subwayBonus = Math.min(20, subwayTiles * 0.5 + subwayStations * 3);
  const railCommercialBonus = Math.min(12, railTiles * 0.15 + railStations * 4);
  const railIndustrialBonus = Math.min(18, railTiles * 0.25 + railStations * 6);
  const airportCommercialBonus = hasAirport ? 15 : 0;
  const airportIndustrialBonus = hasAirport ? 10 : 0;
  const cityHallResidentialBonus = hasCityHall ? 8 : 0;
  const cityHallCommercialBonus = hasCityHall ? 10 : 0;
  const cityHallIndustrialBonus = hasCityHall ? 5 : 0;
  const spaceProgramResidentialBonus = hasSpaceProgram ? 10 : 0;
  const spaceProgramIndustrialBonus = hasSpaceProgram ? 20 : 0;
  const stadiumCommercialBonus = Math.min(20, stadiumCount * 12);
  const museumCommercialBonus = Math.min(15, museumCount * 8);
  const museumResidentialBonus = Math.min(10, museumCount * 5);
  const amusementParkCommercialBonus = hasAmusementPark ? 18 : 0;
  
  const baseResidentialDemand = (jobs - population * 0.7) / 18;
  const baseCommercialDemand = (population * 0.3 - jobs * 0.3) / 4 + subwayBonus;
  const baseIndustrialDemand = (population * 0.35 - jobs * 0.3) / 2.0;
  
  const residentialWithBonuses = baseResidentialDemand + cityHallResidentialBonus + spaceProgramResidentialBonus + museumResidentialBonus;
  const commercialWithBonuses = baseCommercialDemand + airportCommercialBonus + cityHallCommercialBonus + stadiumCommercialBonus + museumCommercialBonus + amusementParkCommercialBonus + railCommercialBonus;
  const industrialWithBonuses = baseIndustrialDemand + airportIndustrialBonus + cityHallIndustrialBonus + spaceProgramIndustrialBonus + railIndustrialBonus;
  
  const residentialDemand = Math.min(100, Math.max(-100, residentialWithBonuses * taxMultiplier + taxAdditiveModifier));
  const commercialDemand = Math.min(100, Math.max(-100, commercialWithBonuses * taxMultiplier + taxAdditiveModifier * 0.8));
  const industrialDemand = Math.min(100, Math.max(-100, industrialWithBonuses * taxMultiplier + taxAdditiveModifier * 0.5));

  const income = Math.floor(population * taxRate * 0.1 + jobs * taxRate * 0.05);
  let expenses = 0;
  expenses += Math.floor(budget.police.cost * budget.police.funding / 100);
  expenses += Math.floor(budget.fire.cost * budget.fire.funding / 100);
  expenses += Math.floor(budget.health.cost * budget.health.funding / 100);
  expenses += Math.floor(budget.education.cost * budget.education.funding / 100);
  expenses += Math.floor(budget.transportation.cost * budget.transportation.funding / 100);
  expenses += Math.floor(budget.parks.cost * budget.parks.funding / 100);
  expenses += Math.floor(budget.power.cost * budget.power.funding / 100);
  expenses += Math.floor(budget.water.cost * budget.water.funding / 100);

  const avgPoliceCoverage = calculateAverageCoverage(services.police);
  const avgFireCoverage = calculateAverageCoverage(services.fire);
  const avgHealthCoverage = calculateAverageCoverage(services.health);
  const avgEducationCoverage = calculateAverageCoverage(services.education);

  const safety = Math.min(100, avgPoliceCoverage * 0.7 + avgFireCoverage * 0.3);
  const health = Math.min(100, avgHealthCoverage * 0.8 + (100 - totalPollution / (size * size)) * 0.2);
  const education = Math.min(100, avgEducationCoverage);
  
  const greenRatio = (treeCount + waterCount + parkCount) / (size * size);
  const totalTiles = size * size;
  const pollutionRatio = totalPollution / (totalTiles * 100);

  const toxicPenalty = (toxicTiles / totalTiles) * 500; 
  const greenBonus = (treeCount + parkCount + waterCount) / totalTiles * 50;
  
  const environment = Math.max(0, Math.min(100, 
      100 - (pollutionRatio * 100) - toxicPenalty + greenBonus
  ));

  const jobSatisfaction = jobs >= population ? 100 : (jobs / (population || 1)) * 100;
  const happiness = Math.min(100, (
    safety * 0.15 + health * 0.2 + education * 0.15 + environment * 0.15 + jobSatisfaction * 0.2 + (100 - taxRate * 3) * 0.15
  ));

  return { population, jobs, money: 0, income, expenses, happiness, health, education, safety, environment, demand: { residential: residentialDemand, commercial: commercialDemand, industrial: industrialDemand } };
}

function updateBudgetCosts(grid: Tile[][], budget: Budget): Budget {
  const newBudget = { ...budget };
  let policeCount = 0; let fireCount = 0; let hospitalCount = 0; let schoolCount = 0; let universityCount = 0;
  let parkCount = 0; let powerCount = 0; let waterCount = 0; let roadCount = 0; let subwayTileCount = 0; let subwayStationCount = 0;

  for (const row of grid) {
    for (const tile of row) {
      if (tile.hasSubway) subwayTileCount++;
      switch (tile.building.type) {
        case 'police_station': policeCount++; break;
        case 'fire_station': fireCount++; break;
        case 'hospital': hospitalCount++; break;
        case 'school': schoolCount++; break;
        case 'university': universityCount++; break;
        case 'park': parkCount++; break;
        case 'park_large': parkCount++; break;
        case 'tennis': parkCount++; break;
        case 'power_plant': powerCount++; break;
        case 'water_tower': waterCount++; break;
        case 'road': roadCount++; break;
        case 'subway_station': subwayStationCount++; break;
      }
    }
  }

  newBudget.police.cost = policeCount * 50;
  newBudget.fire.cost = fireCount * 50;
  newBudget.health.cost = hospitalCount * 100;
  newBudget.education.cost = schoolCount * 30 + universityCount * 100;
  newBudget.transportation.cost = roadCount * 2 + subwayTileCount * 3 + subwayStationCount * 25;
  newBudget.parks.cost = parkCount * 10;
  newBudget.power.cost = powerCount * 150;
  newBudget.water.cost = waterCount * 75;
  return newBudget;
}

function generateAdvisorMessages(stats: Stats, services: ServiceCoverage, grid: Tile[][]): AdvisorMessage[] {
  const messages: AdvisorMessage[] = [];
  let unpoweredBuildings = 0; let unwateredBuildings = 0; let abandonedBuildings = 0;
  let abandonedResidential = 0; let abandonedCommercial = 0; let abandonedIndustrial = 0;
  
  for (const row of grid) {
    for (const tile of row) {
      if (tile.zone !== 'none' && tile.building.type !== 'grass') {
        if (!tile.building.powered) unpoweredBuildings++;
        if (!tile.building.watered) unwateredBuildings++;
      }
      if (tile.building.abandoned) {
        abandonedBuildings++;
        if (tile.zone === 'residential') abandonedResidential++;
        else if (tile.zone === 'commercial') abandonedCommercial++;
        else if (tile.zone === 'industrial') abandonedIndustrial++;
      }
    }
  }

  if (unpoweredBuildings > 0) messages.push({ name: 'Power Advisor', icon: 'power', messages: [`${unpoweredBuildings} buildings lack power.`], priority: unpoweredBuildings > 10 ? 'high' : 'medium' });
  if (unwateredBuildings > 0) messages.push({ name: 'Water Advisor', icon: 'water', messages: [`${unwateredBuildings} buildings lack water.`], priority: unwateredBuildings > 10 ? 'high' : 'medium' });
  
  return messages;
}

// Main simulation tick
export function simulateTick(state: GameState): GameState {
  const size = state.gridSize;
  const services = calculateServiceCoverage(state.grid, size);
  const modifiedRows = new Set<number>();
  const newGrid: Tile[][] = new Array(size);
  
  for (let y = 0; y < size; y++) newGrid[y] = state.grid[y];
  
  const getModifiableTile = (x: number, y: number): Tile => {
    if (!modifiedRows.has(y)) {
      newGrid[y] = state.grid[y].map(t => ({ ...t, building: { ...t.building } }));
      modifiedRows.add(y);
    }
    return newGrid[y][x];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const originalTile = state.grid[y][x];
      const originalBuilding = originalTile.building;
      
      const newPowered = services.power[y][x];
      const newWatered = services.water[y][x];
      const needsPowerWaterUpdate = originalBuilding.powered !== newPowered || originalBuilding.watered !== newWatered;
      
      if ((originalBuilding.type === 'road' || originalBuilding.type === 'bridge') && !needsPowerWaterUpdate) continue;
      
      if (originalTile.zone === 'none' && (originalBuilding.type === 'grass' || originalBuilding.type === 'tree') && !needsPowerWaterUpdate && originalTile.pollution < 0.01 && (BUILDING_STATS[originalBuilding.type]?.pollution || 0) === 0) continue;
      
      const isCompletedServiceBuilding = originalTile.zone === 'none' && originalBuilding.constructionProgress === 100 && !originalBuilding.onFire && originalBuilding.type !== 'grass' && originalBuilding.type !== 'tree' && originalBuilding.type !== 'empty';
      if (isCompletedServiceBuilding && !needsPowerWaterUpdate && originalTile.pollution < 0.01) continue;
      
      const tile = getModifiableTile(x, y);
      tile.building.powered = newPowered;
      tile.building.watered = newWatered;

      if (tile.zone === 'none' && tile.building.constructionProgress !== undefined && tile.building.constructionProgress < 100 && !NO_CONSTRUCTION_TYPES.includes(tile.building.type)) {
        const isUtilityBuilding = tile.building.type === 'power_plant' || tile.building.type === 'water_tower';
        const canConstruct = isUtilityBuilding || (tile.building.powered && tile.building.watered);
        if (canConstruct) {
          const speed = getConstructionSpeed(tile.building.type);
          tile.building.constructionProgress = Math.min(100, tile.building.constructionProgress + speed);
        }
      }

      if (tile.building.type === 'empty') {
        const origin = findBuildingOrigin(newGrid, x, y, size);
        if (!origin) {
          tile.building = createBuilding('grass');
          tile.building.powered = newPowered; tile.building.watered = newWatered;
        }
      }

      if (tile.zone !== 'none' && tile.building.type === 'grass') {
        const roadAccess = hasRoadAccess(newGrid, x, y, size);
        const hasUtilities = newPowered && newWatered;
        const zoneDemandForSpawn = state.stats.demand ? (tile.zone === 'residential' ? state.stats.demand.residential : tile.zone === 'commercial' ? state.stats.demand.commercial : tile.zone === 'industrial' ? state.stats.demand.industrial : 0) : 0;
        const baseSpawnChance = 0.05;
        const demandFactor = Math.max(0, Math.min(1, (zoneDemandForSpawn + 30) / 80));
        const spawnChance = baseSpawnChance * demandFactor;
        
        const buildingList = tile.zone === 'residential' ? RESIDENTIAL_BUILDINGS : tile.zone === 'commercial' ? COMMERCIAL_BUILDINGS : INDUSTRIAL_BUILDINGS;
        const candidate = buildingList[0];
        const wouldBeStarter = isStarterBuilding(x, y, candidate);
        
        if (roadAccess && (hasUtilities || wouldBeStarter) && Math.random() < spawnChance) {
          const candidateSize = getBuildingSize(candidate);
          if (canPlaceMultiTileBuilding(newGrid, x, y, candidateSize.width, candidateSize.height, size)) {
            for (let dy = 0; dy < candidateSize.height && y + dy < size; dy++) {
              if (!modifiedRows.has(y + dy)) {
                newGrid[y + dy] = state.grid[y + dy].map(t => ({ ...t, building: { ...t.building } }));
                modifiedRows.add(y + dy);
              }
            }
            applyBuildingFootprint(newGrid, x, y, candidate, tile.zone, 1, services);
          }
        }
      } else if (tile.zone !== 'none' && tile.building.type !== 'grass') {
        newGrid[y][x].building = evolveBuilding(newGrid, x, y, services, state.stats.demand);
      }

      // ECO-HACK: Pollution Logic
      const stats = BUILDING_STATS[tile.building.type];
      if (stats && stats.pollution !== 0) {
        if (stats.pollution < 0) {
             tile.pollution = Math.max(0, tile.pollution + (stats.pollution * 0.1));
        } else {
             tile.pollution = Math.min(100, tile.pollution + (stats.pollution * 0.05));
             if (stats.pollutionType && stats.pollutionType !== 'none') {
                 tile.pollutionType = stats.pollutionType; 
             }
        }
      }

      if (tile.building.type === 'water_tower') {
          tile.pollution = 0;
          const cleanRadius = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,-1],[1,-1],[-1,1]];
          for (const [cdx, cdy] of cleanRadius) {
              if (newGrid[y+cdy]?.[x+cdx]) {
                  const n = newGrid[y+cdy][x+cdx];
                  n.pollution = Math.max(0, n.pollution - 5);
              }
          }
      }

      if (tile.pollution > 30) {
         const spreadAmount = tile.building.type === 'water' ? 4 : 1;
         const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
         for (const [dx, dy] of neighbors) {
             const nx = x + dx; const ny = y + dy;
             if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
                 let neighbor = newGrid[ny][nx]; 
                 if (!modifiedRows.has(ny)) {
                    newGrid[ny] = state.grid[ny].map(t => ({ ...t, building: { ...t.building } }));
                    modifiedRows.add(ny);
                    neighbor = newGrid[ny][nx];
                 }
                 if (neighbor.building.type === 'water') {
                     neighbor.pollution = Math.min(100, neighbor.pollution + spreadAmount);
                     neighbor.pollutionType = tile.pollutionType; 
                 } else if (neighbor.pollution < tile.pollution) {
                     neighbor.pollution = Math.min(100, neighbor.pollution + (spreadAmount * 0.1));
                     if (Math.random() > 0.5) neighbor.pollutionType = tile.pollutionType;
                 }
             }
         }
      }
      tile.pollution *= 0.99;

      // Fire simulation
      if (state.disastersEnabled && tile.building.onFire) {
        const fireCoverage = services.fire[y][x];
        const fightingChance = fireCoverage / 300;
        if (Math.random() < fightingChance) { tile.building.onFire = false; tile.building.fireProgress = 0; }
        else { tile.building.fireProgress += 2/3; if (tile.building.fireProgress >= 100) { tile.building = createBuilding('grass'); tile.zone = 'none'; } }
      }

      if (state.disastersEnabled && !tile.building.onFire && tile.building.type !== 'grass' && tile.building.type !== 'water' && tile.building.type !== 'road' && tile.building.type !== 'tree' && tile.building.type !== 'empty' && tile.building.type !== 'bridge' && tile.building.type !== 'rail') {
        const adjacentOffsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        let adjacentFireCount = 0;
        for (const [dx, dy] of adjacentOffsets) {
          const nx = x + dx; const ny = y + dy;
          if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
            const neighbor = newGrid[ny][nx];
            if (neighbor.building.onFire) adjacentFireCount++;
          }
        }
        if (adjacentFireCount > 0) {
          const fireCoverage = services.fire[y][x];
          const coverageReduction = fireCoverage / 100;
          const baseSpreadChance = 0.005 * adjacentFireCount;
          const spreadChance = baseSpreadChance * (1 - coverageReduction * 0.95);
          if (Math.random() < spreadChance) { tile.building.onFire = true; tile.building.fireProgress = 0; }
        }
      }

      if (state.disastersEnabled && !tile.building.onFire && tile.building.type !== 'grass' && tile.building.type !== 'water' && tile.building.type !== 'road' && tile.building.type !== 'tree' && tile.building.type !== 'empty' && Math.random() < 0.00003) {
        tile.building.onFire = true; tile.building.fireProgress = 0;
      }
    }
  }

  const newBudget = updateBudgetCosts(newGrid, state.budget);
  const taxRateDiff = state.taxRate - state.effectiveTaxRate;
  const newEffectiveTaxRate = state.effectiveTaxRate + taxRateDiff * 0.03;
  const newStats = calculateStats(newGrid, size, newBudget, state.taxRate, newEffectiveTaxRate, services);
  newStats.money = state.stats.money;

  const prevDemand = state.stats.demand;
  if (prevDemand) {
    const smoothingFactor = 0.12;
    newStats.demand.residential = prevDemand.residential + (newStats.demand.residential - prevDemand.residential) * smoothingFactor;
    newStats.demand.commercial = prevDemand.commercial + (newStats.demand.commercial - prevDemand.commercial) * smoothingFactor;
    newStats.demand.industrial = prevDemand.industrial + (newStats.demand.industrial - prevDemand.industrial) * smoothingFactor;
  }

  let newYear = state.year; let newMonth = state.month; let newDay = state.day; let newTick = state.tick + 1;
  const totalTicks = ((state.year - 2024) * 12 * 30 * 30) + ((state.month - 1) * 30 * 30) + ((state.day - 1) * 30) + newTick;
  const cycleLength = 450;
  const newHour = Math.floor((totalTicks % cycleLength) / cycleLength * 24);

  if (newTick >= 30) {
    newTick = 0; newDay++;
    if (newDay % 7 === 0) newStats.money += Math.floor((newStats.income - newStats.expenses) / 4);
  }
  if (newDay > 30) { newDay = 1; newMonth++; }
  if (newMonth > 12) { newMonth = 1; newYear++; }

  const advisorMessages = generateAdvisorMessages(newStats, services, newGrid);
  const newNotifications = [...state.notifications];
  while (newNotifications.length > 10) newNotifications.pop();

  const history = [...state.history];
  if (newMonth % 3 === 0 && newDay === 1 && newTick === 0) {
    history.push({ year: newYear, month: newMonth, population: newStats.population, money: newStats.money, happiness: newStats.happiness });
    while (history.length > 100) history.shift();
  }

  return {
    ...state, grid: newGrid, year: newYear, month: newMonth, day: newDay, hour: newHour, tick: newTick,
    effectiveTaxRate: newEffectiveTaxRate, stats: newStats, budget: newBudget, services,
    advisorMessages, notifications: newNotifications, history,
  };
}

export function placeBuilding(state: GameState, x: number, y: number, buildingType: BuildingType | null, zone: ZoneType | null): GameState {
  const tile = state.grid[y]?.[x];
  if (!tile) return state;
  if (tile.building.type === 'water') return state;

  if (buildingType === 'road') {
    const allowedTypes: BuildingType[] = ['grass', 'tree', 'road', 'rail'];
    if (!allowedTypes.includes(tile.building.type)) return state;
  }
  if (buildingType === 'rail') {
    const allowedTypes: BuildingType[] = ['grass', 'tree', 'rail', 'road'];
    if (!allowedTypes.includes(tile.building.type)) return state;
  }
  if (buildingType && buildingType !== 'road' && buildingType !== 'rail' && (tile.building.type === 'road' || tile.building.type === 'bridge')) return state;
  if (buildingType && buildingType !== 'road' && buildingType !== 'rail' && tile.building.type === 'rail') return state;

  const newGrid = state.grid.map(row => row.map(t => ({ ...t, building: { ...t.building } })));

  if (zone !== null) {
    if (zone === 'none') {
      const origin = findBuildingOrigin(newGrid, x, y, state.gridSize);
      if (origin) {
        const size = getBuildingSize(origin.buildingType);
        for (let dy = 0; dy < size.height; dy++) {
          for (let dx = 0; dx < size.width; dx++) {
            const clearX = origin.originX + dx;
            const clearY = origin.originY + dy;
            if (clearX < state.gridSize && clearY < state.gridSize) {
              newGrid[clearY][clearX].building = createBuilding('grass');
              newGrid[clearY][clearX].zone = 'none';
            }
          }
        }
      } else {
        if (tile.zone === 'none') return state;
        newGrid[y][x].zone = 'none';
        newGrid[y][x].building = createBuilding('grass');
      }
    } else {
      const allowedTypesForZoning: BuildingType[] = ['grass', 'tree', 'road'];
      if (!allowedTypesForZoning.includes(tile.building.type)) return state;
      newGrid[y][x].zone = zone;
    }
  } else if (buildingType) {
    const size = getBuildingSize(buildingType);
    let shouldFlip = false;
    if (requiresWaterAdjacency(buildingType)) {
      const waterCheck = getWaterAdjacency(newGrid, x, y, size.width, size.height, state.gridSize);
      if (!waterCheck.hasWater) return state;
      shouldFlip = waterCheck.shouldFlip;
    }
    
    if (size.width > 1 || size.height > 1) {
      if (!canPlaceMultiTileBuilding(newGrid, x, y, size.width, size.height, state.gridSize)) return state;
      applyBuildingFootprint(newGrid, x, y, buildingType, 'none', 1);
      if (shouldFlip) newGrid[y][x].building.flipped = true;
    } else {
      const allowedTypes: BuildingType[] = ['grass', 'tree', 'road', 'rail'];
      if (!allowedTypes.includes(tile.building.type)) return state;
      
      if (buildingType === 'rail' && tile.building.type === 'road') {
        newGrid[y][x].hasRailOverlay = true;
      } else if (buildingType === 'road' && tile.building.type === 'rail') {
        newGrid[y][x].building = createBuilding('road');
        newGrid[y][x].hasRailOverlay = true;
        newGrid[y][x].zone = 'none';
      } else if (buildingType === 'rail' && tile.hasRailOverlay) {
      } else if (buildingType === 'road' && tile.hasRailOverlay) {
      } else {
        newGrid[y][x].building = createBuilding(buildingType);
        newGrid[y][x].zone = 'none';
        if (buildingType !== 'road') newGrid[y][x].hasRailOverlay = false;
      }
      if (shouldFlip) newGrid[y][x].building.flipped = true;
    }
  }
  return { ...state, grid: newGrid };
}

// 5. Additional Map Manipulation Functions 
// (Ensure these are exported correctly as they were in the original file)

// Perlin noise and Map Generation (Kept from original)
function noise2D(x: number, y: number, seed: number = 42): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453123;
  return n - Math.floor(n);
}
function smoothNoise(x: number, y: number, seed: number): number {
  const corners = (noise2D(x - 1, y - 1, seed) + noise2D(x + 1, y - 1, seed) + noise2D(x - 1, y + 1, seed) + noise2D(x + 1, y + 1, seed)) / 16;
  const sides = (noise2D(x - 1, y, seed) + noise2D(x + 1, y, seed) + noise2D(x, y - 1, seed) + noise2D(x, y + 1, seed)) / 8;
  const center = noise2D(x, y, seed) / 4;
  return corners + sides + center;
}
function interpolatedNoise(x: number, y: number, seed: number): number {
  const intX = Math.floor(x); const fracX = x - intX;
  const intY = Math.floor(y); const fracY = y - intY;
  const v1 = smoothNoise(intX, intY, seed);
  const v2 = smoothNoise(intX + 1, intY, seed);
  const v3 = smoothNoise(intX, intY + 1, seed);
  const v4 = smoothNoise(intX + 1, intY + 1, seed);
  const i1 = v1 * (1 - fracX) + v2 * fracX;
  const i2 = v3 * (1 - fracX) + v4 * fracX;
  return i1 * (1 - fracY) + i2 * fracY;
}
function perlinNoise(x: number, y: number, seed: number, octaves: number = 4): number {
  let total = 0; let frequency = 0.05; let amplitude = 1; let maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    total += interpolatedNoise(x * frequency, y * frequency, seed + i * 100) * amplitude;
    maxValue += amplitude; amplitude *= 0.5; frequency *= 2;
  }
  return total / maxValue;
}

function generateLakes(grid: Tile[][], size: number, seed: number): WaterBody[] {
  const lakeNoise = (x: number, y: number) => perlinNoise(x, y, seed + 1000, 3);
  const lakeCenters: { x: number; y: number; noise: number }[] = [];
  const minDistFromEdge = Math.max(8, Math.floor(size * 0.15));
  const minDistBetweenLakes = Math.max(size * 0.2, 10);
  
  let threshold = 0.5;
  let attempts = 0;
  const maxAttempts = 3;
  
  while (lakeCenters.length < 2 && attempts < maxAttempts) {
    lakeCenters.length = 0;
    for (let y = minDistFromEdge; y < size - minDistFromEdge; y++) {
      for (let x = minDistFromEdge; x < size - minDistFromEdge; x++) {
        const noiseVal = lakeNoise(x, y);
        if (noiseVal < threshold) {
          let tooClose = false;
          for (const center of lakeCenters) {
            const dist = Math.sqrt((x - center.x) ** 2 + (y - center.y) ** 2);
            if (dist < minDistBetweenLakes) { tooClose = true; break; }
          }
          if (!tooClose) lakeCenters.push({ x, y, noise: noiseVal });
        }
      }
    }
    if (lakeCenters.length >= 2) break;
    threshold += 0.1;
    attempts++;
  }
  
  if (lakeCenters.length === 0) {
    const safeZone = minDistFromEdge + 5;
    lakeCenters.push({ x: Math.max(safeZone, Math.floor(size / 4)), y: Math.max(safeZone, Math.floor(size / 4)), noise: 0 });
    lakeCenters.push({ x: Math.min(size - safeZone, Math.floor(size * 3 / 4)), y: Math.min(size - safeZone, Math.floor(size * 3 / 4)), noise: 0 });
  } else if (lakeCenters.length === 1) {
    const existing = lakeCenters[0];
    const safeZone = minDistFromEdge + 5;
    let newX = existing.x > size / 2 ? Math.max(safeZone, Math.floor(size / 4)) : Math.min(size - safeZone, Math.floor(size * 3 / 4));
    let newY = existing.y > size / 2 ? Math.max(safeZone, Math.floor(size / 4)) : Math.min(size - safeZone, Math.floor(size * 3 / 4));
    lakeCenters.push({ x: newX, y: newY, noise: 0 });
  }
  
  lakeCenters.sort((a, b) => a.noise - b.noise);
  const numLakes = 2 + Math.floor(Math.random() * 2);
  const selectedCenters = lakeCenters.slice(0, Math.min(numLakes, lakeCenters.length));
  
  const waterBodies: WaterBody[] = [];
  const usedLakeNames = new Set<string>();
  
  for (const center of selectedCenters) {
    const targetSize = 40 + Math.floor(Math.random() * 41);
    const lakeTiles: { x: number; y: number }[] = [{ x: center.x, y: center.y }];
    const candidates: { x: number; y: number; dist: number; noise: number }[] = [];
    
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dx, dy] of directions) {
      const nx = center.x + dx;
      const ny = center.y + dy;
      if (nx >= minDistFromEdge && nx < size - minDistFromEdge && ny >= minDistFromEdge && ny < size - minDistFromEdge) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        const noise = lakeNoise(nx, ny);
        candidates.push({ x: nx, y: ny, dist, noise });
      }
    }
    
    while (lakeTiles.length < targetSize && candidates.length > 0) {
      candidates.sort((a, b) => {
        if (Math.abs(a.dist - b.dist) < 0.5) return a.noise - b.noise;
        return a.dist - b.dist;
      });
      
      const picked = candidates.splice(Math.floor(Math.random() * Math.min(5, candidates.length)), 1)[0];
      if (lakeTiles.some(t => t.x === picked.x && t.y === picked.y)) continue;
      if (grid[picked.y][picked.x].building.type === 'water') continue;
      
      lakeTiles.push({ x: picked.x, y: picked.y });
      
      for (const [dx, dy] of directions) {
        const nx = picked.x + dx;
        const ny = picked.y + dy;
        if (nx >= minDistFromEdge && nx < size - minDistFromEdge && ny >= minDistFromEdge && ny < size - minDistFromEdge &&
            !lakeTiles.some(t => t.x === nx && t.y === ny) && !candidates.some(c => c.x === nx && c.y === ny)) {
          const dist = Math.sqrt((nx - center.x) ** 2 + (ny - center.y) ** 2);
          const noise = lakeNoise(nx, ny);
          candidates.push({ x: nx, y: ny, dist, noise });
        }
      }
    }
    
    for (const tile of lakeTiles) {
      grid[tile.y][tile.x].building = createBuilding('water');
      grid[tile.y][tile.x].landValue = 60;
    }
    
    const avgX = lakeTiles.reduce((sum, t) => sum + t.x, 0) / lakeTiles.length;
    const avgY = lakeTiles.reduce((sum, t) => sum + t.y, 0) / lakeTiles.length;
    
    let lakeName = generateWaterName('lake');
    while (usedLakeNames.has(lakeName)) lakeName = generateWaterName('lake');
    usedLakeNames.add(lakeName);
    
    waterBodies.push({
      id: `lake-${waterBodies.length}`,
      name: lakeName,
      type: 'lake',
      tiles: lakeTiles,
      centerX: Math.round(avgX),
      centerY: Math.round(avgY),
    });
  }
  
  return waterBodies;
}

function generateOceans(grid: Tile[][], size: number, seed: number): WaterBody[] {
  const waterBodies: WaterBody[] = [];
  const oceanChance = 0.4;
  const coastNoise = (x: number, y: number) => perlinNoise(x, y, seed + 2000, 3);
  const edges: Array<{ side: 'north' | 'east' | 'south' | 'west'; tiles: { x: number; y: number }[] }> = [];
  
  const baseDepth = Math.max(4, Math.floor(size * 0.12));
  const depthVariation = Math.max(4, Math.floor(size * 0.08));
  const maxDepth = Math.floor(size * 0.18);
  
  const generateOceanEdge = (isHorizontal: boolean, edgePosition: number, inwardDirection: 1 | -1): { x: number; y: number }[] => {
    const tiles: { x: number; y: number }[] = [];
    const spanStart = Math.floor(size * (0.05 + Math.random() * 0.25));
    const spanEnd = Math.floor(size * (0.7 + Math.random() * 0.25));
    
    for (let i = spanStart; i < spanEnd; i++) {
      const edgeFade = Math.min((i - spanStart) / 5, (spanEnd - i) / 5, 1);
      const coarseNoise = coastNoise(isHorizontal ? i * 0.08 : edgePosition * 0.08, isHorizontal ? edgePosition * 0.08 : i * 0.08);
      const fineNoise = coastNoise(isHorizontal ? i * 0.25 : edgePosition * 0.25 + 500, isHorizontal ? edgePosition * 0.25 + 500 : i * 0.25);
      const noiseVal = coarseNoise * 0.6 + fineNoise * 0.4;
      const rawDepth = baseDepth + (noiseVal - 0.5) * depthVariation * 2.5;
      const localDepth = Math.max(1, Math.min(Math.floor(rawDepth * edgeFade), maxDepth));
      
      for (let d = 0; d < localDepth; d++) {
        const x = isHorizontal ? i : (inwardDirection === 1 ? d : size - 1 - d);
        const y = isHorizontal ? (inwardDirection === 1 ? d : size - 1 - d) : i;
        if (x >= 0 && x < size && y >= 0 && y < size && grid[y][x].building.type !== 'water') {
          grid[y][x].building = createBuilding('water');
          grid[y][x].landValue = 60;
          tiles.push({ x, y });
        }
      }
    }
    return tiles;
  };
  
  if (Math.random() < oceanChance) { const tiles = generateOceanEdge(true, 0, 1); if (tiles.length > 0) edges.push({ side: 'north', tiles }); }
  if (Math.random() < oceanChance) { const tiles = generateOceanEdge(true, size - 1, -1); if (tiles.length > 0) edges.push({ side: 'south', tiles }); }
  if (Math.random() < oceanChance) { const tiles = generateOceanEdge(false, size - 1, -1); if (tiles.length > 0) edges.push({ side: 'east', tiles }); }
  if (Math.random() < oceanChance) { const tiles = generateOceanEdge(false, 0, 1); if (tiles.length > 0) edges.push({ side: 'west', tiles }); }
  
  const usedOceanNames = new Set<string>();
  for (const edge of edges) {
    if (edge.tiles.length > 0) {
      const avgX = edge.tiles.reduce((sum, t) => sum + t.x, 0) / edge.tiles.length;
      const avgY = edge.tiles.reduce((sum, t) => sum + t.y, 0) / edge.tiles.length;
      let oceanName = generateWaterName('ocean');
      while (usedOceanNames.has(oceanName)) oceanName = generateWaterName('ocean');
      usedOceanNames.add(oceanName);
      waterBodies.push({ id: `ocean-${edge.side}-${waterBodies.length}`, name: oceanName, type: 'ocean', tiles: edge.tiles, centerX: Math.round(avgX), centerY: Math.round(avgY) });
    }
  }
  return waterBodies;
}

function generateAdjacentCities(): AdjacentCity[] {
  const cities: AdjacentCity[] = [];
  const directions: Array<'north' | 'south' | 'east' | 'west'> = ['north', 'south', 'east', 'west'];
  const usedNames = new Set<string>();
  for (const direction of directions) {
    let name: string;
    do { name = generateCityName(); } while (usedNames.has(name));
    usedNames.add(name);
    cities.push({ id: `city-${direction}`, name, direction, connected: false, discovered: false });
  }
  return cities;
}

function generateTerrain(size: number): { grid: Tile[][]; waterBodies: WaterBody[] } {
  const grid: Tile[][] = [];
  const seed = Math.random() * 1000;
  for (let y = 0; y < size; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < size; x++) { row.push(createTile(x, y, 'grass')); }
    grid.push(row);
  }
  const lakeBodies = generateLakes(grid, size, seed);
  const oceanBodies = generateOceans(grid, size, seed);
  const waterBodies = [...lakeBodies, ...oceanBodies];
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y][x].building.type === 'water') continue;
      const treeNoise = perlinNoise(x * 2, y * 2, seed + 500, 2);
      const isTree = treeNoise > 0.72 && Math.random() > 0.65;
      const nearWater = isNearWater(grid, x, y, size);
      const isTreeNearWater = nearWater && Math.random() > 0.7;
      if (isTree || isTreeNearWater) { grid[y][x].building = createBuilding('tree'); }
    }
  }
  return { grid, waterBodies };
}

function isNearWater(grid: Tile[][], x: number, y: number, size: number): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx; const ny = y + dy;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
        if (grid[ny][nx].building.type === 'water') return true;
      }
    }
  }
  return false;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function createInitialBudget(): Budget {
  return {
    police: { name: 'Police', funding: 100, cost: 0 },
    fire: { name: 'Fire', funding: 100, cost: 0 },
    health: { name: 'Health', funding: 100, cost: 0 },
    education: { name: 'Education', funding: 100, cost: 0 },
    transportation: { name: 'Transportation', funding: 100, cost: 0 },
    parks: { name: 'Parks', funding: 100, cost: 0 },
    power: { name: 'Power', funding: 100, cost: 0 },
    water: { name: 'Water', funding: 100, cost: 0 },
  };
}

function createInitialStats(): Stats {
  return {
    population: 0, jobs: 0, money: 100000, income: 0, expenses: 0,
    happiness: 50, health: 50, education: 50, safety: 50, environment: 75,
    demand: { residential: 50, commercial: 30, industrial: 40 },
  };
}

function createServiceCoverage(size: number): ServiceCoverage {
  const createGrid = () => { const grid: number[][] = new Array(size); for (let y = 0; y < size; y++) grid[y] = new Array(size).fill(0); return grid; };
  const createBoolGrid = () => { const grid: boolean[][] = new Array(size); for (let y = 0; y < size; y++) grid[y] = new Array(size).fill(false); return grid; };
  return { police: createGrid(), fire: createGrid(), health: createGrid(), education: createGrid(), power: createBoolGrid(), water: createBoolGrid() };
}

export function createInitialGameState(size: number = DEFAULT_GRID_SIZE, cityName: string = 'New City'): GameState {
  const { grid, waterBodies } = generateTerrain(size);
  const adjacentCities = generateAdjacentCities();
  
  const defaultCity: import('@/types/game').City = {
    id: generateUUID(), name: cityName, bounds: { minX: 0, minY: 0, maxX: size - 1, maxY: size - 1 },
    economy: { population: 0, jobs: 0, income: 0, expenses: 0, happiness: 50, lastCalculated: 0 }, color: '#3b82f6',
  };

  return {
    id: generateUUID(), grid, gridSize: size, cityName, year: 2024, month: 1, day: 1, hour: 12, tick: 0, speed: 1,
    selectedTool: 'select', taxRate: 9, effectiveTaxRate: 9, stats: createInitialStats(), budget: createInitialBudget(),
    services: createServiceCoverage(size), notifications: [], advisorMessages: [], history: [], activePanel: 'none',
    disastersEnabled: true, adjacentCities, waterBodies, gameVersion: 0, cities: [defaultCity],
  };
}

export function hasRoadAtEdge(grid: Tile[][], gridSize: number, direction: 'north' | 'south' | 'east' | 'west'): boolean {
  switch (direction) {
    case 'north': for (let x = 0; x < gridSize; x++) { if (grid[0][x].building.type === 'road' || grid[0][x].building.type === 'bridge') return true; } return false;
    case 'south': for (let x = 0; x < gridSize; x++) { if (grid[gridSize - 1][x].building.type === 'road' || grid[gridSize - 1][x].building.type === 'bridge') return true; } return false;
    case 'east': for (let y = 0; y < gridSize; y++) { if (grid[y][gridSize - 1].building.type === 'road' || grid[y][gridSize - 1].building.type === 'bridge') return true; } return false;
    case 'west': for (let y = 0; y < gridSize; y++) { if (grid[y][0].building.type === 'road' || grid[y][0].building.type === 'bridge') return true; } return false;
  }
}

export function checkForDiscoverableCities(grid: Tile[][], gridSize: number, adjacentCities: AdjacentCity[]): AdjacentCity[] {
  const citiesToShow: AdjacentCity[] = [];
  for (const city of adjacentCities) {
    if (!city.connected && hasRoadAtEdge(grid, gridSize, city.direction)) {
      if (!city.discovered) citiesToShow.push(city);
    }
  }
  return citiesToShow;
}

export function getConnectableCities(grid: Tile[][], gridSize: number, adjacentCities: AdjacentCity[]): AdjacentCity[] {
  const connectable: AdjacentCity[] = [];
  for (const city of adjacentCities) {
    if (city.discovered && !city.connected && hasRoadAtEdge(grid, gridSize, city.direction)) {
      connectable.push(city);
    }
  }
  return connectable;
}

export function getWaterAdjacency(grid: Tile[][], x: number, y: number, width: number, height: number, gridSize: number): { hasWater: boolean; shouldFlip: boolean } {
  let waterOnSouthOrEast = false;
  let waterOnNorthOrWest = false;
  
  for (let dx = 0; dx < width; dx++) { const checkX = x + dx; const checkY = y + height; if (checkY < gridSize && grid[checkY]?.[checkX]?.building.type === 'water') { waterOnSouthOrEast = true; break; } }
  if (!waterOnSouthOrEast) { for (let dy = 0; dy < height; dy++) { const checkX = x + width; const checkY = y + dy; if (checkX < gridSize && grid[checkY]?.[checkX]?.building.type === 'water') { waterOnSouthOrEast = true; break; } } }
  for (let dx = 0; dx < width; dx++) { const checkX = x + dx; const checkY = y - 1; if (checkY >= 0 && grid[checkY]?.[checkX]?.building.type === 'water') { waterOnNorthOrWest = true; break; } }
  if (!waterOnNorthOrWest) { for (let dy = 0; dy < height; dy++) { const checkX = x - 1; const checkY = y + dy; if (checkX >= 0 && grid[checkY]?.[checkX]?.building.type === 'water') { waterOnNorthOrWest = true; break; } } }
  
  const hasWater = waterOnSouthOrEast || waterOnNorthOrWest;
  const shouldFlip = hasWater && waterOnNorthOrWest && !waterOnSouthOrEast;
  return { hasWater, shouldFlip };
}

export function getRoadAdjacency(grid: Tile[][], x: number, y: number, width: number, height: number, gridSize: number): { hasRoad: boolean; shouldFlip: boolean } {
  let roadOnSouthOrEast = false;
  let roadOnNorthOrWest = false;
  
  for (let dx = 0; dx < width; dx++) { const checkX = x + dx; const checkY = y + height; const checkType = grid[checkY]?.[checkX]?.building.type; if (checkY < gridSize && (checkType === 'road' || checkType === 'bridge')) { roadOnSouthOrEast = true; break; } }
  if (!roadOnSouthOrEast) { for (let dy = 0; dy < height; dy++) { const checkX = x + width; const checkY = y + dy; const checkType = grid[checkY]?.[checkX]?.building.type; if (checkX < gridSize && (checkType === 'road' || checkType === 'bridge')) { roadOnSouthOrEast = true; break; } } }
  for (let dx = 0; dx < width; dx++) { const checkX = x + dx; const checkY = y - 1; const checkType = grid[checkY]?.[checkX]?.building.type; if (checkY >= 0 && (checkType === 'road' || checkType === 'bridge')) { roadOnNorthOrWest = true; break; } }
  if (!roadOnNorthOrWest) { for (let dy = 0; dy < height; dy++) { const checkX = x - 1; const checkY = y + dy; const checkType = grid[checkY]?.[checkX]?.building.type; if (checkX >= 0 && (checkType === 'road' || checkType === 'bridge')) { roadOnNorthOrWest = true; break; } } }
  
  const hasRoad = roadOnSouthOrEast || roadOnNorthOrWest;
  const shouldFlip = hasRoad && roadOnNorthOrWest && !roadOnSouthOrEast;
  return { hasRoad, shouldFlip };
}

export function generateRandomAdvancedCity(size: number = DEFAULT_GRID_SIZE, cityName: string = 'Metropolis'): GameState {
  return createInitialGameState(size, cityName);
}

// Bridges Logic (Needs to be here for exports)
function getBridgeTypeForSpan(span: number): BridgeType {
  if (span === 1) return 'small';
  if (span <= BRIDGE_TYPE_THRESHOLDS.large) return 'large';
  return 'suspension';
}

function getBridgeVariant(x: number, y: number, bridgeType: BridgeType): number {
  const seed = (x * 31 + y * 17) % 100;
  return seed % BRIDGE_VARIANTS[bridgeType];
}

function createBridgeBuilding(bridgeType: BridgeType, orientation: BridgeOrientation, variant: number, position: 'start' | 'middle' | 'end', index: number, span: number, trackType: 'road' | 'rail' = 'road'): Building {
  return {
    type: 'bridge', level: 0, population: 0, jobs: 0, powered: true, watered: true, onFire: false, fireProgress: 0, age: 0, constructionProgress: 100, abandoned: false,
    bridgeType, bridgeOrientation: orientation, bridgeVariant: variant, bridgePosition: position, bridgeIndex: index, bridgeSpan: span, bridgeTrackType: trackType,
  };
}

interface BridgeOpportunity {
  startX: number; startY: number; endX: number; endY: number; orientation: BridgeOrientation; span: number; bridgeType: BridgeType; waterTiles: { x: number; y: number }[]; trackType: 'road' | 'rail';
}

function scanForBridgeInDirection(grid: Tile[][], gridSize: number, startX: number, startY: number, dx: number, dy: number, orientation: BridgeOrientation, trackType: 'road' | 'rail'): BridgeOpportunity | null {
  const waterTiles: { x: number; y: number }[] = [];
  let x = startX + dx;
  let y = startY + dy;
  
  while (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
    const tile = grid[y][x];
    if (tile.building.type === 'water') {
      waterTiles.push({ x, y });
      if (waterTiles.length > MAX_BRIDGE_SPAN) return null;
    } else if (tile.building.type === trackType) {
      if (waterTiles.length > 0) {
        const span = waterTiles.length;
        const bridgeType = getBridgeTypeForSpan(span);
        return { startX, startY, endX: x, endY: y, orientation, span, bridgeType, waterTiles, trackType };
      }
      return null;
    } else if (tile.building.type === 'bridge') {
      return null;
    } else {
      break;
    }
    x += dx;
    y += dy;
  }
  return null;
}

function detectBridgeOpportunity(grid: Tile[][], gridSize: number, x: number, y: number, trackType: 'road' | 'rail'): BridgeOpportunity | null {
  const tile = grid[y]?.[x];
  if (!tile || tile.building.type !== trackType) return null;
  const northOpp = scanForBridgeInDirection(grid, gridSize, x, y, -1, 0, 'ns', trackType);
  if (northOpp) return northOpp;
  const southOpp = scanForBridgeInDirection(grid, gridSize, x, y, 1, 0, 'ns', trackType);
  if (southOpp) return southOpp;
  const eastOpp = scanForBridgeInDirection(grid, gridSize, x, y, 0, -1, 'ew', trackType);
  if (eastOpp) return eastOpp;
  const westOpp = scanForBridgeInDirection(grid, gridSize, x, y, 0, 1, 'ew', trackType);
  if (westOpp) return westOpp;
  return null;
}

function buildBridges(grid: Tile[][], opportunity: BridgeOpportunity): void {
  const variant = getBridgeVariant(opportunity.waterTiles[0].x, opportunity.waterTiles[0].y, opportunity.bridgeType);
  const sortedTiles = [...opportunity.waterTiles].sort((a, b) => {
    if (opportunity.orientation === 'ns') return a.x !== b.x ? a.x - b.x : a.y - b.y;
    else return a.y !== b.y ? a.y - b.y : a.x - b.x;
  });
  
  const span = sortedTiles.length;
  sortedTiles.forEach((pos, index) => {
    let position: 'start' | 'middle' | 'end';
    if (index === 0) position = 'start';
    else if (index === sortedTiles.length - 1) position = 'end';
    else position = 'middle';
    
    grid[pos.y][pos.x].building = createBridgeBuilding(opportunity.bridgeType, opportunity.orientation, variant, position, index, span, opportunity.trackType);
    grid[pos.y][pos.x].zone = 'none';
  });
}

function checkAndCreateBridges(grid: Tile[][], gridSize: number, placedX: number, placedY: number, trackType: 'road' | 'rail'): void {
  const opportunity = detectBridgeOpportunity(grid, gridSize, placedX, placedY, trackType);
  if (opportunity) buildBridges(grid, opportunity);
}

export function createBridgesOnPath(state: GameState, pathTiles: { x: number; y: number }[], trackType: 'road' | 'rail' = 'road'): GameState {
  if (pathTiles.length === 0) return state;
  const hasWaterInPath = pathTiles.some(tile => {
    const t = state.grid[tile.y]?.[tile.x];
    return t && t.building.type === 'water';
  });
  if (!hasWaterInPath) return state;
  
  const newGrid = state.grid.map(row => row.map(t => ({ ...t, building: { ...t.building } })));
  for (const tile of pathTiles) {
    if (newGrid[tile.y]?.[tile.x]?.building.type === trackType) {
      checkAndCreateBridges(newGrid, state.gridSize, tile.x, tile.y, trackType);
    }
  }
  return { ...state, grid: newGrid };
}

export function upgradeServiceBuilding(state: GameState, x: number, y: number): GameState | null {
  const tile = state.grid[y]?.[x];
  if (!tile) return null;

  // Resolve origin for multi-tile buildings
  const origin = findBuildingOrigin(state.grid, x, y, state.gridSize);
  const originX = origin ? origin.originX : x;
  const originY = origin ? origin.originY : y;
  const originTile = state.grid[originY]?.[originX];
  if (!originTile) return null;

  const buildingType = originTile.building.type;
  if (!SERVICE_BUILDING_TYPES.has(buildingType)) return null;

  // Can't upgrade while under construction or abandoned
  if (originTile.building.constructionProgress !== undefined && originTile.building.constructionProgress < 100) return null;
  if (originTile.building.abandoned) return null;

  const currentLevel = originTile.building.level || 1;
  if (currentLevel >= SERVICE_MAX_LEVEL) return null;

  const baseCost = (TOOL_INFO as Record<string, { cost: number }>)[buildingType]?.cost ?? 0;
  const upgradeCost = Math.floor(baseCost * Math.pow(SERVICE_UPGRADE_COST_BASE, currentLevel));
  if (state.stats.money < upgradeCost) return null;

  // Apply changes immutably
  const newGrid = state.grid.map(row => row.map(t => ({ ...t, building: { ...t.building } })));
  newGrid[originY][originX].building.level = Math.min(SERVICE_MAX_LEVEL, currentLevel + 1);

  const newStats = { ...state.stats, money: state.stats.money - upgradeCost };
  // Recalculate service coverage so UI updates immediately after upgrade
  const services = calculateServiceCoverage(newGrid, state.gridSize);

  return { ...state, grid: newGrid, stats: newStats, services };
}

export function bulldozeTile(state: GameState, x: number, y: number): GameState {
  const tile = state.grid[y]?.[x];
  if (!tile) return state;
  if (tile.building.type === 'water') return state;
  const newGrid = state.grid.map(row => row.map(t => ({ ...t, building: { ...t.building } })));
  
  if (tile.building.type === 'bridge') {
    const bridgeTiles = findConnectedBridgeTiles(newGrid, state.gridSize, x, y);
    for (const bt of bridgeTiles) {
      newGrid[bt.y][bt.x].building = createBuilding('water');
      newGrid[bt.y][bt.x].zone = 'none';
      newGrid[bt.y][bt.x].hasRailOverlay = false;
    }
    return { ...state, grid: newGrid };
  }
  
  if (tile.building.type === 'road') {
    const adjacentBridgeTiles = findAdjacentBridgeTiles(newGrid, state.gridSize, x, y);
    if (adjacentBridgeTiles.length > 0) {
      newGrid[y][x].building = createBuilding('grass');
      newGrid[y][x].zone = 'none';
      newGrid[y][x].hasRailOverlay = false;
      for (const bt of adjacentBridgeTiles) {
        newGrid[bt.y][bt.x].building = createBuilding('water');
        newGrid[bt.y][bt.x].zone = 'none';
        newGrid[bt.y][bt.x].hasRailOverlay = false;
      }
      return { ...state, grid: newGrid };
    }
  }
  
  const origin = findBuildingOrigin(newGrid, x, y, state.gridSize);
  if (origin) {
    const size = getBuildingSize(origin.buildingType);
    for (let dy = 0; dy < size.height; dy++) {
      for (let dx = 0; dx < size.width; dx++) {
        const clearX = origin.originX + dx;
        const clearY = origin.originY + dy;
        if (clearX < state.gridSize && clearY < state.gridSize) {
          newGrid[clearY][clearX].building = createBuilding('grass');
          newGrid[clearY][clearX].zone = 'none';
          newGrid[clearY][clearX].hasRailOverlay = false;
        }
      }
    }
  } else {
    newGrid[y][x].building = createBuilding('grass');
    newGrid[y][x].zone = 'none';
    newGrid[y][x].hasRailOverlay = false;
  }
  return { ...state, grid: newGrid };
}

function findConnectedBridgeTiles(grid: Tile[][], gridSize: number, x: number, y: number): { x: number; y: number }[] {
  const tile = grid[y]?.[x];
  if (!tile || tile.building.type !== 'bridge') return [];
  const orientation = tile.building.bridgeOrientation || 'ns';
  const bridgeTiles: { x: number; y: number }[] = [{ x, y }];
  const dx = orientation === 'ns' ? 1 : 0;
  const dy = orientation === 'ns' ? 0 : 1;
  let cx = x + dx; let cy = y + dy;
  while (cx >= 0 && cx < gridSize && cy >= 0 && cy < gridSize) {
    const t = grid[cy][cx];
    if (t.building.type === 'bridge' && t.building.bridgeOrientation === orientation) { bridgeTiles.push({ x: cx, y: cy }); cx += dx; cy += dy; } else break;
  }
  cx = x - dx; cy = y - dy;
  while (cx >= 0 && cx < gridSize && cy >= 0 && cy < gridSize) {
    const t = grid[cy][cx];
    if (t.building.type === 'bridge' && t.building.bridgeOrientation === orientation) { bridgeTiles.push({ x: cx, y: cy }); cx -= dx; cy -= dy; } else break;
  }
  return bridgeTiles;
}

function findAdjacentBridgeTiles(grid: Tile[][], gridSize: number, x: number, y: number): { x: number; y: number }[] {
  const directions = [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 }];
  for (const { dx, dy } of directions) {
    const nx = x + dx; const ny = y + dy;
    if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
      const neighbor = grid[ny][nx];
      if (neighbor.building.type === 'bridge') {
        const position = neighbor.building.bridgePosition;
        if (position === 'start' || position === 'end') return findConnectedBridgeTiles(grid, gridSize, nx, ny);
      }
    }
  }
  return [];
}

export function placeSubway(state: GameState, x: number, y: number): GameState {
  const tile = state.grid[y]?.[x];
  if (!tile || tile.building.type === 'water' || tile.hasSubway) return state;
  const newGrid = state.grid.map(row => row.map(t => ({ ...t, building: { ...t.building } })));
  newGrid[y][x].hasSubway = true;
  return { ...state, grid: newGrid };
}

export function removeSubway(state: GameState, x: number, y: number): GameState {
  const tile = state.grid[y]?.[x];
  if (!tile || !tile.hasSubway) return state;
  const newGrid = state.grid.map(row => row.map(t => ({ ...t, building: { ...t.building } })));
  newGrid[y][x].hasSubway = false;
  return { ...state, grid: newGrid };
}

export function placeWaterTerraform(state: GameState, x: number, y: number): GameState {
  const tile = state.grid[y]?.[x];
  if (!tile || tile.building.type === 'water' || tile.building.type === 'bridge') return state;
  const newGrid = state.grid.map(row => row.map(t => ({ ...t, building: { ...t.building } })));
  const origin = findBuildingOrigin(newGrid, x, y, state.gridSize);
  if (origin) {
    const size = getBuildingSize(origin.buildingType);
    for (let dy = 0; dy < size.height; dy++) {
      for (let dx = 0; dx < size.width; dx++) {
        const clearX = origin.originX + dx;
        const clearY = origin.originY + dy;
        if (clearX < state.gridSize && clearY < state.gridSize) {
          newGrid[clearY][clearX].building = createBuilding('grass');
          newGrid[clearY][clearX].zone = 'none';
        }
      }
    }
  }
  newGrid[y][x].building = createBuilding('water');
  newGrid[y][x].zone = 'none';
  newGrid[y][x].hasSubway = false;
  return { ...state, grid: newGrid };
}

export function placeLandTerraform(state: GameState, x: number, y: number): GameState {
  const tile = state.grid[y]?.[x];
  if (!tile || tile.building.type !== 'water') return state;
  const newGrid = state.grid.map(row => row.map(t => ({ ...t, building: { ...t.building } })));
  newGrid[y][x].building = createBuilding('grass');
  newGrid[y][x].zone = 'none';
  return { ...state, grid: newGrid };
}

export function expandGrid(currentGrid: Tile[][], currentSize: number, expansion: number = 15): { grid: Tile[][]; newSize: number } {
  const newSize = currentSize + expansion * 2;
  const grid: Tile[][] = [];
  for (let y = 0; y < newSize; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < newSize; x++) {
      const oldX = x - expansion;
      const oldY = y - expansion;
      const wasInOldGrid = oldX >= 0 && oldY >= 0 && oldX < currentSize && oldY < currentSize;
      if (wasInOldGrid) {
        const oldTile = currentGrid[oldY][oldX];
        row.push({ ...oldTile, x, y, building: { ...oldTile.building } });
      } else {
        row.push(createTile(x, y, 'grass'));
      }
    }
    grid.push(row);
  }
  return { grid, newSize };
}

export function shrinkGrid(currentGrid: Tile[][], currentSize: number, shrinkAmount: number = 15): { grid: Tile[][]; newSize: number } | null {
  const newSize = currentSize - shrinkAmount * 2;
  if (newSize < 20) return null;
  const grid: Tile[][] = [];
  for (let y = 0; y < newSize; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < newSize; x++) {
      const oldX = x + shrinkAmount;
      const oldY = y + shrinkAmount;
      const oldTile = currentGrid[oldY][oldX];
      row.push({ ...oldTile, x, y, building: { ...oldTile.building } });
    }
    grid.push(row);
  }
  return { grid, newSize };
}

// Development Blocker Helper
export interface DevelopmentBlocker {
  reason: string;
  details: string;
}

export function getDevelopmentBlockers(
  state: GameState,
  x: number,
  y: number
): DevelopmentBlocker[] {
  const blockers: DevelopmentBlocker[] = [];
  const tile = state.grid[y]?.[x];
  
  if (!tile) {
    blockers.push({ reason: 'Invalid tile', details: `Tile at (${x}, ${y}) does not exist` });
    return blockers;
  }
  
  if (tile.zone === 'none') {
    blockers.push({ reason: 'Not zoned', details: 'Tile has no zone assigned' });
    return blockers;
  }
  
  if (tile.building.type !== 'grass' && tile.building.type !== 'tree') {
    return blockers;
  }
  
  const roadAccess = hasRoadAccess(state.grid, x, y, state.gridSize);
  if (!roadAccess) {
    blockers.push({
      reason: 'No road access',
      details: 'Tile must be within 8 tiles of a road (through same-zone tiles)'
    });
  }
  
  const buildingList = tile.zone === 'residential' ? RESIDENTIAL_BUILDINGS :
    tile.zone === 'commercial' ? COMMERCIAL_BUILDINGS : INDUSTRIAL_BUILDINGS;
  const candidate = buildingList[0];
  const wouldBeStarter = isStarterBuilding(x, y, candidate);
  const hasPower = state.services.power[y][x];
  if (!hasPower && !wouldBeStarter) {
    blockers.push({
      reason: 'No power',
      details: 'Build a power plant nearby to provide electricity'
    });
  }
  const hasWater = state.services.water[y][x];
  if (!hasWater && !wouldBeStarter) {
    blockers.push({
      reason: 'No water',
      details: 'Build a water tower nearby to provide water'
    });
  }
  const candidateSize = getBuildingSize(candidate);
  
    if (candidateSize.width > 1 || candidateSize.height > 1) {
    if (!canPlaceMultiTileBuilding(state.grid, x, y, candidateSize.width, candidateSize.height, state.gridSize)) {
      blockers.push({
        reason: 'Footprint blocked',
        details: `${candidate} needs ${candidateSize.width}x${candidateSize.height} tiles.`
      });
    }
  }
  
  const hasUtilities = hasPower && hasWater;
  if (blockers.length === 0 && roadAccess && (hasUtilities || wouldBeStarter)) {
    blockers.push({
      reason: 'Waiting for development',
      details: wouldBeStarter && !hasUtilities 
        ? 'Starter building can develop here without utilities! (5% chance per tick)' 
        : 'All conditions met! Building will spawn soon (5% chance per tick)'
    });
  }
  
  return blockers;
}