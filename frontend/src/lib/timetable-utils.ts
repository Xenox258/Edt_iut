import type { CourseColor, CoursAPI, CoursAPIRaw } from '@/types/timetable';

// Constantes
export const MOBILE_DAY_OPTIONS = [1, 3] as const;
export const DESKTOP_DAY_OPTIONS = [1, 3, 5] as const;

export const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 19;
export const HOUR_HEIGHT = 80;

// ISO week helpers. December 28 is always in the last ISO week of its year.
export const getISOWeekInfo = (date: Date): { week: number; year: number } => {
  const temp = new Date(date.getTime());
  temp.setHours(0, 0, 0, 0);
  const dayNum = temp.getDay() || 7;
  temp.setDate(temp.getDate() + 4 - dayNum);
  const yearStart = new Date(temp.getFullYear(), 0, 1);
  const week = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: temp.getFullYear() };
};

export const getISOWeeksInYear = (year: number): number =>
  getISOWeekInfo(new Date(year, 11, 28)).week;

export const getISOWeekStartDate = (week: number, year: number): Date => {
  const jan4 = new Date(year, 0, 4);
  jan4.setHours(0, 0, 0, 0);
  const dayNum = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayNum + 1 + (week - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

// Helpers de temps
export const formatTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
};

// Conversion jour → index
export const dayNameToIndex = (day: string): number => {
  const full = (day ?? "").trim().toLowerCase();
  
  // Mapping complet : format flopedt et autres formats
  const dayMapping: Record<string, number> = {
    // Format flopedt (1 ou 2 lettres)
    m: 1,    // Monday
    tu: 2,   // Tuesday
    w: 3,    // Wednesday
    th: 4,   // Thursday
    f: 5,    // Friday
    // Format français
    lu: 1,   // Lundi
    ma: 2,   // Mardi
    me: 3,   // Mercredi
    je: 4,   // Jeudi
    ve: 5,   // Vendredi
    // Format anglais complet 2 lettres
    mo: 1,   // Monday
    we: 3,   // Wednesday
    fr: 5,   // Friday
  };
  
  return dayMapping[full] ?? 0;
};

// Train prog helpers
export const denormalizeTrainProg = (dept: string, displayYear: string): string => {
  if (dept === 'CS') return displayYear.replace('BUT', 'CS');
  if (dept === 'GIM') return displayYear.replace('BUT', 'GIM');
  return displayYear;
};

// Configuration des groupes par département
export const getGroupsForPromo = (dept: string, promo: string): Record<string, string[]> => {
  const mapping: Record<string, Record<string, Record<string, string[]>>> = {
    'INFO': {
      'BUT1': {
        'Groupes TD': ['1', '2', '3', '4'],
        'Groupes TP': ['1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B']
      },
      'BUT2': {
        'Groupes TD': ['1', '2', '3', '3A'],
        'Groupes TP': ['1A', '1B', '2A', '2B'],
        'Groupe Alternants': ['3A']
      },
      'BUT3': {
        'Groupes TD': ['1', '2'],
        'Groupes TP': ['1A', '1B', '2A'],
        'Groupe Alternants': ['3A', '3B']
      }
    },
    'RT': {
      'BUT1': {
        'Groupes TD': ['1G1', '1G2', '1G3'],
        'Groupes TP': ['1A', '1B', '1C', '1D', '1E', '1F']
      },
      'BUT2': {
        'Groupes TD': ['2G1', '2G2', '2G1a'],
        'Groupes TP': ['2A', '2B', '2C']
      },
      'BUT3': {
        'Groupes TD': ['3G1', '3G1a'],
        'Groupes TP': ['3A', '3B', '3Aa', '3Ba']
      }
    },
    'CS': {
      'BUT1': { 'Groupes': ['1G1', '1G2', '1G3', '1GA', '1GB', '1GC'] },
      'BUT2': { 'Groupes': ['2FA', '2FI', '2GA', '2GB'] },
      'BUT3': { 'Groupes': ['3FA', '3FI', '3FA1', '3FA2'] }
    },
    'GIM': {
      'BUT1': {
        'Groupes TD': ['1TD1', '1TD2'],
        'Groupes TP': ['1A', '1B', '1C', '1D']
      },
      'BUT2': {
        'Groupes TD': ['2TD1', '2TD2'],
        'Groupes TP': ['2A', '2B', '2C', '2D']
      },
      'BUT3': {
        'Groupes TD': ['3TD1', '3TD2'],
        'Groupes TP': ['3A', '3B', '3C']
      }
    }
  };

  return mapping[dept]?.[promo] || {};
};

// Gestion des couleurs
export const getColorFromBackend = (bgColor: string, txtColor: string): CourseColor | null => {
  if (bgColor && bgColor !== '' && bgColor !== 'undefined') {
    return { bg: bgColor, txt: txtColor || '#FFFFFF' };
  }
  return null;
};

export const generateColorFromString = (str: string): CourseColor => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  
  const colorPalette: CourseColor[] = [
    { bg: '#8B5CF6', txt: '#FFFFFF' },
    { bg: '#EC4899', txt: '#FFFFFF' },
    { bg: '#EF4444', txt: '#FFFFFF' },
    { bg: '#F59E0B', txt: '#FFFFFF' },
    { bg: '#10B981', txt: '#FFFFFF' },
    { bg: '#3B82F6', txt: '#FFFFFF' },
    { bg: '#6366F1', txt: '#FFFFFF' },
    { bg: '#14B8A6', txt: '#FFFFFF' },
    { bg: '#F97316', txt: '#FFFFFF' },
    { bg: '#06B6D4', txt: '#FFFFFF' },
  ];
  
  const index = Math.abs(hash) % colorPalette.length;
  return colorPalette[index];
};

export const hexToRgba = (hex: string, alpha = 1): string => {
  if (!hex) return `rgba(0, 0, 0, ${alpha})`;
  let clean = hex.trim();
  if (clean.startsWith('#')) clean = clean.slice(1);
  if (clean.length === 3) {
    clean = clean.split('').map((ch) => ch + ch).join('');
  }
  if (clean.length !== 6) return `rgba(0, 0, 0, ${alpha})`;
  const num = Number.parseInt(clean, 16);
  if (Number.isNaN(num)) return `rgba(0, 0, 0, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Normalisation des cours
type RawGroupValue = string | { name?: string; train_prog?: string };
type RawModuleDisplay = { color_bg?: string; color_txt?: string };
type RawModuleData = { name?: string; abbrev?: string; display?: RawModuleDisplay };
type RawCourseData = {
  groups?: RawGroupValue[];
  module?: RawModuleData;
  is_graded?: boolean;
  type?: string;
  train_prog?: string;
};
type RawRoomData = { name?: string };

type RawWithExtras = CoursAPIRaw & {
  course?: RawCourseData;
  room?: RawRoomData;
  tutor?: string;
};

export const normalizeCourse = (raw: CoursAPIRaw): CoursAPI | null => {
  const start = Number(raw.start_time);
  let end = Number(raw.end_time);
  const dayRaw = String(raw.day ?? "").toLowerCase();

  if (!Number.isFinite(start) || dayNameToIndex(dayRaw) === 0) {
    return null;
  }

  if (!Number.isFinite(end) || end <= start) {
    end = start + 90;
  }

  // IMPORTANT: Ne PAS normaliser le jour, garder le format original
  // Le backend envoie déjà le format correct: 'm', 'tu', 'w', 'th', 'f'
  const dayNormalized = dayRaw;

  const backendColors = getColorFromBackend(raw.display_color_bg ?? '', raw.display_color_txt ?? '');
  const displayLabel = raw.module_abbrev || raw.module_name || String(raw.id ?? '') || 'Cours';
  const colors = backendColors ?? generateColorFromString(displayLabel);
  const id = typeof raw.id === 'number' ? raw.id : Number(raw.id);
  
  if (!Number.isFinite(id)) {
    return null;
  }
  
  // Extraire les groupes depuis la structure du backend
  // raw peut avoir course.groups qui est un tableau d'objets {name, train_prog}
  const enhancedRaw = raw as RawWithExtras;
  const courseData = enhancedRaw.course;

  const rawGroupsSource: RawGroupValue[] = Array.isArray(courseData?.groups)
    ? courseData.groups
    : Array.isArray(raw.groups)
      ? (raw.groups as RawGroupValue[])
      : [];

  const groups = rawGroupsSource
    .map((g) => (typeof g === 'string' ? g : g?.name))
    .filter((name): name is string => Boolean(name));

  const derivedTrainProg = (() => {
    for (const g of rawGroupsSource) {
      if (typeof g !== 'string') {
        const prog = g?.train_prog;
        if (typeof prog === 'string' && prog.trim() !== '') {
          return prog;
        }
      }
    }
    if (courseData?.train_prog && courseData.train_prog.trim() !== '') {
      return courseData.train_prog;
    }
    return raw.train_prog ?? '';
  })();

  const canonicalTrainProg = (() => {
    if (!derivedTrainProg) return '';
    const digits = derivedTrainProg.match(/\d+/)?.[0];
    if (!digits) return derivedTrainProg;
    return `BUT${digits}`;
  })();

  // Extraire les infos du module depuis course.module
  const courseModule = courseData?.module;
  const moduleName = courseModule?.name || raw.module_name || displayLabel;
  const moduleAbbrev = courseModule?.abbrev || raw.module_abbrev || '';
  
  // Extraire les couleurs depuis course.module.display
  const moduleDisplay = courseModule?.display;
  const bgColor = moduleDisplay?.color_bg || raw.display_color_bg;
  const txtColor = moduleDisplay?.color_txt || raw.display_color_txt;
  const backendColorsFromModule = bgColor ? getColorFromBackend(bgColor, txtColor || '') : null;
  const finalColors = backendColorsFromModule ?? backendColors ?? generateColorFromString(displayLabel);
  
  // Extraire room depuis raw.room.name
  const roomName = enhancedRaw.room?.name || raw.room_name || '';
  
  // Extraire tutor
  const tutorUsername = enhancedRaw.tutor || raw.tutor_username || '';
  
  // Extraire is_graded et type depuis course
  const isGraded = courseData?.is_graded ?? raw.is_graded ?? false;
  const courseType = courseData?.type || raw.course_type || '';

  return {
    id,
    day: dayNormalized,
    start_time: start,
    end_time: end,
    groups,
    module_name: moduleName,
    module_abbrev: moduleAbbrev,
    display_color_bg: finalColors.bg,
    display_color_txt: finalColors.txt,
    tutor_username: tutorUsername,
    room_name: roomName,
    train_prog: canonicalTrainProg,
    is_graded: isGraded,
    course_type: courseType,
  };
};

// Tri des groupes
export const sortGroups = (groups: string[]): string[] => {
  return groups.sort((a, b) => {
    const matchA = a.match(/(\d+)([A-Z]+)?/);
    const matchB = b.match(/(\d+)([A-Z]+)?/);
    if (!matchA || !matchB) return a.localeCompare(b);
    
    const numA = parseInt(matchA[1]);
    const numB = parseInt(matchB[1]);
    if (numA !== numB) return numA - numB;
    
    const letterA = matchA[2] || '';
    const letterB = matchB[2] || '';
    return letterA.localeCompare(letterB);
  });
};

// Détection de chevauchement
export const coursesOverlap = (c1: CoursAPI, c2: CoursAPI): boolean => {
  return c1.start_time < c2.end_time && c2.start_time < c1.end_time;
};

// Calcul des options de jours selon device
export const getDayOptionsForDevice = (mobile: boolean): number[] =>
  mobile ? [...MOBILE_DAY_OPTIONS] : [...DESKTOP_DAY_OPTIONS];
