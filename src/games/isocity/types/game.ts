/**
 * IsoCity Game State Types (MODIFIED FOR ECO-HACKATHON)
 */

import { msg } from 'gt-next';
import { Building, PollutionType } from './buildings'; // Import new type
import { ZoneType } from './zones';
import { Stats, Budget, CityEconomy, HistoryPoint } from './economy';
import { ServiceCoverage } from './services';

export type Tool =
  | 'select' | 'bulldoze' | 'road' | 'rail' | 'subway'
  | 'expand_city' | 'shrink_city' | 'tree'
  | 'zone_residential' | 'zone_commercial' | 'zone_industrial' | 'zone_dezone'
  | 'zone_water' | 'zone_land'
  | 'police_station' | 'fire_station' | 'hospital' | 'school' | 'university'
  | 'park' | 'park_large' | 'tennis' | 'power_plant' | 'water_tower'
  | 'subway_station' | 'rail_station' | 'stadium' | 'museum' | 'airport'
  | 'space_program' | 'city_hall' | 'amusement_park'
  | 'basketball_courts' | 'playground_small' | 'playground_large'
  | 'baseball_field_small' | 'soccer_field_small' | 'football_field' | 'baseball_stadium'
  | 'community_center' | 'office_building_small' | 'swimming_pool' | 'skate_park'
  | 'mini_golf_course' | 'bleachers_field' | 'go_kart_track' | 'amphitheater'
  | 'greenhouse_garden' | 'animal_pens_farm' | 'cabin_house' | 'campground'
  | 'marina_docks_small' | 'pier_large' | 'roller_coaster_small'
  | 'community_garden' | 'pond_park' | 'park_gate' | 'mountain_lodge' | 'mountain_trailhead';

export interface ToolInfo {
  name: string;
  cost: number;
  description: string;
  size?: number;
}

// THE HACK: UI Renaming to match "Eco-City" theme
export const TOOL_INFO: Record<Tool, ToolInfo> = {
  select: { name: msg('Inspector'), cost: 0, description: msg('View Pollution Levels') },
  bulldoze: { name: msg('Clear Land'), cost: 10, description: msg('Demolish buildings') },
  road: { name: msg('Road'), cost: 25, description: msg('Connect infrastructure') },
  rail: { name: msg('Freight Rail'), cost: 40, description: msg('Industrial transport') },
  subway: { name: msg('Metro'), cost: 50, description: msg('Public transit') },
  expand_city: { name: msg('Expand Map'), cost: 0, description: msg('Add territory') },
  shrink_city: { name: msg('Shrink Map'), cost: 0, description: msg('Remove territory') },
  tree: { name: msg('Reforest'), cost: 15, description: msg('Plant trees to absorb carbon') },
  
  // Zoning
  zone_residential: { name: msg('Housing Zone'), cost: 50, description: msg('Citizens live here') },
  zone_commercial: { name: msg('Tech/Commercial'), cost: 50, description: msg('Offices & Shops') },
  zone_industrial: { name: msg('Industrial Zone'), cost: 50, description: msg('Factories & Production') },
  zone_dezone: { name: msg('De-zone'), cost: 0, description: msg('Reset zoning') },
  zone_water: { name: msg('Dig Canal'), cost: 50000, description: msg('Create water channels') },
  zone_land: { name: msg('Landfill'), cost: 50000, description: msg('Fill water with dirt') },
  
  // Specific Buildings
  police_station: { name: msg('Police'), cost: 500, description: msg('Increase safety'), size: 1 },
  fire_station: { name: msg('Fire Station'), cost: 500, description: msg('Safety response'), size: 1 },
  hospital: { name: msg('Hospital'), cost: 1000, description: msg('Treats pollution sickness'), size: 2 },
  school: { name: msg('School'), cost: 400, description: msg('Basic education'), size: 2 },
  university: { name: msg('Research Lab'), cost: 2000, description: msg('Unlocks green tech'), size: 3 },
  
  // Eco-Strategy Tools
  park: { name: msg('Green Buffer'), cost: 150, description: msg('Absorbs local pollution'), size: 1 },
  park_large: { name: msg('Wetland Reserve'), cost: 600, description: msg('Filters water naturally'), size: 3 },
  water_tower: { name: msg('Water Treatment Plant'), cost: 1000, description: msg('Actively cleans water pollution'), size: 1 }, // REPURPOSED
  power_plant: { name: msg('Coal Power Plant'), cost: 3000, description: msg('High energy, High Toxic Waste'), size: 2 },
  
  // New Industries
  animal_pens_farm: { name: msg('Industrial Farm'), cost: 400, description: msg('High Food, High Algae Risk'), size: 1 },
  greenhouse_garden: { name: msg('Organic Farm'), cost: 800, description: msg('Low pollution farming'), size: 2 },
  office_building_small: { name: msg('Data Center (Small)'), cost: 600, description: msg('Needs cooling water'), size: 1 },
  
  // Others
  tennis: { name: msg('Tennis'), cost: 200, description: msg('Recreation'), size: 1 },
  subway_station: { name: msg('Metro Station'), cost: 750, description: msg('Access to subway'), size: 1 },
  rail_station: { name: msg('Freight Depot'), cost: 1000, description: msg('Logistics hub'), size: 2 },
  stadium: { name: msg('Stadium'), cost: 5000, description: msg('Boosts demand'), size: 3 },
  museum: { name: msg('Eco-Museum'), cost: 4000, description: msg('Educates citizens'), size: 3 },
  airport: { name: msg('Intl Airport'), cost: 10000, description: msg('Massive noise & air pollution'), size: 4 },
  space_program: { name: msg('Space Center'), cost: 15000, description: msg('High tech industry'), size: 3 },
  city_hall: { name: msg('Municipality'), cost: 6000, description: msg('City Management'), size: 2 },
  amusement_park: { name: msg('Theme Park'), cost: 12000, description: msg('Tourism hub'), size: 4 },
  basketball_courts: { name: msg('Courts'), cost: 250, description: msg('Sports'), size: 1 },
  playground_small: { name: msg('Playground'), cost: 200, description: msg('Kids area'), size: 1 },
  playground_large: { name: msg('Adventure Park'), cost: 350, description: msg('Large play area'), size: 2 },
  baseball_field_small: { name: msg('Baseball'), cost: 800, description: msg('Sports'), size: 2 },
  soccer_field_small: { name: msg('Soccer'), cost: 400, description: msg('Sports'), size: 1 },
  football_field: { name: msg('Football'), cost: 1200, description: msg('Sports'), size: 2 },
  baseball_stadium: { name: msg('Pro Stadium'), cost: 6000, description: msg('Major venue'), size: 3 },
  community_center: { name: msg('Town Hall'), cost: 500, description: msg('Community meeting place'), size: 1 },
  swimming_pool: { name: msg('Public Pool'), cost: 450, description: msg('Recreation'), size: 1 },
  skate_park: { name: msg('Skate Park'), cost: 300, description: msg('Youth area'), size: 1 },
  mini_golf_course: { name: msg('Mini Golf'), cost: 700, description: msg('Family fun'), size: 2 },
  bleachers_field: { name: msg('Sports Field'), cost: 350, description: msg('Local sports'), size: 1 },
  go_kart_track: { name: msg('Kart Track'), cost: 1000, description: msg('Noise pollution source'), size: 2 },
  amphitheater: { name: msg('Amphitheater'), cost: 1500, description: msg('Concerts'), size: 2 },
  cabin_house: { name: msg('Eco-Cabin'), cost: 300, description: msg('Sustainable housing'), size: 1 },
  campground: { name: msg('Campground'), cost: 250, description: msg('Nature tourism'), size: 1 },
  marina_docks_small: { name: msg('Marina'), cost: 1200, description: msg('Boat parking'), size: 2 },
  pier_large: { name: msg('Fishing Pier'), cost: 600, description: msg('Food source'), size: 1 },
  roller_coaster_small: { name: msg('Coaster'), cost: 3000, description: msg('Thrill ride'), size: 2 },
  community_garden: { name: msg('Urban Garden'), cost: 200, description: msg('Local food'), size: 1 },
  pond_park: { name: msg('Retention Pond'), cost: 350, description: msg('Manages runoff'), size: 1 },
  park_gate: { name: msg('Park Gate'), cost: 150, description: msg('Entrance'), size: 1 },
  mountain_lodge: { name: msg('Hill Station'), cost: 1500, description: msg('Resort'), size: 2 },
  mountain_trailhead: { name: msg('Hiking Trail'), cost: 400, description: msg('Access to nature'), size: 3 },
};

export interface Tile {
  x: number;
  y: number;
  zone: ZoneType;
  building: Building;
  landValue: number;
  pollution: number;
  crime: number;
  traffic: number;
  hasSubway: boolean;
  hasRailOverlay?: boolean;
  
  // NEW FIELDS FOR PHYSICS
  pollutionType?: PollutionType; // 'toxic', 'thermal', etc.
  waterDepth?: number; // 0 to 1
}

export interface City {
  id: string;
  name: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  economy: CityEconomy;
  color: string;
}

export interface AdjacentCity {
  id: string;
  name: string;
  direction: 'north' | 'south' | 'east' | 'west';
  connected: boolean;
  discovered: boolean;
}

export interface WaterBody {
  id: string;
  name: string;
  type: 'lake' | 'ocean';
  tiles: { x: number; y: number }[];
  centerX: number;
  centerY: number;
}

export interface Notification {
  id: string;
  title: string;
  description: string;
  icon: string;
  timestamp: number;
}

export interface AdvisorMessage {
  name: string;
  icon: string;
  messages: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface GameState {
  id: string;
  grid: Tile[][];
  gridSize: number;
  cityName: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  tick: number;
  speed: 0 | 1 | 2 | 3;
  selectedTool: Tool;
  taxRate: number;
  effectiveTaxRate: number;
  stats: Stats;
  budget: Budget;
  services: ServiceCoverage;
  notifications: Notification[];
  advisorMessages: AdvisorMessage[];
  history: HistoryPoint[];
  activePanel: 'none' | 'budget' | 'statistics' | 'advisors' | 'settings';
  disastersEnabled: boolean;
  adjacentCities: AdjacentCity[];
  waterBodies: WaterBody[];
  gameVersion: number;
  cities: City[];
}

export interface SavedCityMeta {
  id: string;
  cityName: string;
  population: number;
  money: number;
  year: number;
  month: number;
  gridSize: number;
  savedAt: number;
  roomCode?: string;
}