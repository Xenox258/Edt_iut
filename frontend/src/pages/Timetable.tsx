import React, { useEffect, useState, useMemo, useContext } from "react";
import { Moon, Sun, ChevronLeft, ChevronRight, ChevronDown, Calendar as CalendarIcon, Menu, Home, Users, BookOpen, Settings, PanelLeftClose, PanelLeftOpen, DoorOpen, Mail, GraduationCap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ProfilesContext } from "@/contexts/ProfilesContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProfileManager } from "@/components/ProfileManager";
import { FreeRoomsDialog } from "@/components/FreeRoomsDialog";
import { TutorScheduleDialog } from "@/components/TutorScheduleDialog";
import { CourseCard } from "@/components/CourseCard";
import { DaySelector } from "@/components/DaySelector";
import { useScheduleData } from "@/hooks/useScheduleData";
import { useTutors } from "@/hooks/useTutors";
import { useDisplayTimes } from "@/hooks/useDisplayTimes";
import { DayHeaders } from "@/components/DayHeaders";
import { TimeColumn } from "@/components/TimeColumn";
import { MobileDayTimeline } from "@/components/MobileDayTimeline";

// Imports depuis les nouveaux modules
import type { CoursAPI, CoursAPIRaw, CourseWithPosition } from "@/types/timetable";
import {
  formatTime,
  dayNameToIndex,
  denormalizeTrainProg,
  getGroupsForPromo,
  normalizeCourse,
  sortGroups,
  coursesOverlap,
  getDayOptionsForDevice,
  getISOWeeksInYear,
  getISOWeekStartDate as getSharedISOWeekStartDate,
  hexToRgba,
  DAYS,
  DAY_START_HOUR,
  DAY_END_HOUR,
  HOUR_HEIGHT,
} from "@/lib/timetable-utils";

const API_BASE = import.meta.env.VITE_API_URL || '';
const COMMON_GROUP_CODES = new Set(["CE"]);

const normalizeGroupCode = (value: string) => value.trim().toUpperCase();
const extractNumericBase = (value: string) => value.replace(/[A-Z]+$/, "");

const groupsMatchFilter = (courseGroup: string, activeFilter: string): boolean => {
  const group = normalizeGroupCode(courseGroup);
  const filter = normalizeGroupCode(activeFilter);

  if (!group || !filter) return false;

  if (group === filter) return true;

  if (COMMON_GROUP_CODES.has(group)) return true;

  const groupBase = extractNumericBase(group);
  const filterBase = extractNumericBase(filter);

  if (filter.startsWith(group) && /\d/.test(group)) {
    return true;
  }

  if (group.startsWith(filter) && /\d/.test(filter)) {
    return true;
  }

  if (filterBase && group === filterBase) {
    return true;
  }

  if (groupBase && groupBase === filter) {
    return true;
  }

  if (/^\d+$/.test(group) && filterBase && group.includes(filterBase)) {
    return true;
  }

  if (/^\d+$/.test(filter) && groupBase && filter.includes(groupBase)) {
    return true;
  }

  if (groupBase && filterBase && groupBase === filterBase) {
    const groupHasSuffix = group.length > groupBase.length;
    const filterHasSuffix = filter.length > filterBase.length;
    return !(groupHasSuffix && filterHasSuffix);
  }

  return false;
};

const getISOWeekInfo = (date: Date) => {
  const temp = new Date(date.getTime());
  temp.setHours(0, 0, 0, 0);
  const dayNum = temp.getDay() || 7;
  temp.setDate(temp.getDate() + 4 - dayNum);
  const yearStart = new Date(temp.getFullYear(), 0, 1);
  const week = Math.ceil((((temp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return {
    week,
    year: temp.getFullYear(),
  };
};

const getCurrentIsoWeekInfo = () => getISOWeekInfo(new Date());

const getInitialWeekInfo = () => {
  const now = new Date();
  const reference = new Date(now);
  const day = reference.getDay();

  if (day === 6) {
    reference.setDate(reference.getDate() + 2);
  } else if (day === 0) {
    reference.setDate(reference.getDate() + 1);
  }

  reference.setHours(0, 0, 0, 0);
  const info = getISOWeekInfo(reference);
  return { ...info, referenceDate: reference };
};

const isCoursAPIRaw = (value: unknown): value is CoursAPIRaw => typeof value === 'object' && value !== null;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getSafeEmailDisplay = (email?: string | null): string | null => {
  if (!email) {
    return null;
  }

  const normalizedEmail = email.trim();
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return null;
  }

  return normalizedEmail;
};

export default function Timetable() {
  const isMobile = useIsMobile();
  const dayOptions = React.useMemo(() => (isMobile ? [1] : getDayOptionsForDevice(isMobile)), [isMobile]);
  const initialWeekInfo = React.useMemo(() => getInitialWeekInfo(), []);
  const [courses, setCourses] = useState<CoursAPI[]>([]); // kept only for types; will be set from hook
  const [daysToShow, setDaysToShow] = useState<number>(() => {
    // Sur mobile, toujours 1 jour
    if (isMobile) {
      return 1;
    }
    // Sur desktop, vérifier les préférences sauvegardées
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('edt-last-days');
        if (raw) {
          const parsed = Number.parseInt(raw, 10);
          if (!Number.isNaN(parsed) && dayOptions.includes(parsed)) {
            return parsed;
          }
        }
      } catch (error) {
        console.warn('Impossible de lire la préférence d\'affichage:', error);
      }
    }
    // Par défaut : 5 jours sur desktop
    return 5;
  });
  const [startDayIndex, setStartDayIndex] = useState(() => {
    if (isMobile) {
      const today = new Date().getDay(); // 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
      if (today >= 1 && today <= 5) {
        return today - 1; // 0 = Lundi, ..., 4 = Vendredi
      }
    }
    return 0; // Par défaut Lundi
  });
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => initialWeekInfo.referenceDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [configEdtOpen, setConfigEdtOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CoursAPI | null>(null);
  const [courseDialogOpen, setCourseDialogOpen] = useState(false);
  const [tutorScheduleOpen, setTutorScheduleOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [timeColumnExpanded, setTimeColumnExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = window.localStorage.getItem('edt-time-column');
    if (saved) return saved === 'expanded';
    return !isMobile;
  });
  
  // États initialisés avec localStorage ou valeurs par défaut
  const [groupFilter, setGroupFilter] = useState<string>(() => {
    return localStorage.getItem('edt-last-group') || "ALL";
  });
  const [year, setYear] = useState<string>(() => {
    return localStorage.getItem('edt-last-year') || "BUT1";
  });
  const [dept, setDept] = useState<string>(() => {
    return localStorage.getItem('edt-last-dept') || "INFO";
  });
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('edt-theme');
    return saved ? saved === 'dark' : true;
  });
  const [allGroups, setAllGroups] = useState<string[]>([]);
  
  useEffect(() => {
    if (!dayOptions.includes(daysToShow)) {
      setDaysToShow(dayOptions[0]);
      setStartDayIndex(0);
    }
  }, [dayOptions, daysToShow]);

  // Hook de gestion des profils - utiliser le contexte partagé
  const profilesContext = useContext(ProfilesContext);
  if (!profilesContext) {
    throw new Error("Timetable must be used within a ProfilesProvider");
  }
  const profilesManager = profilesContext;
  const [week, setWeek] = useState<number>(() => initialWeekInfo.week);
  const [yearNumber, setYearNumber] = useState<number>(() => initialWeekInfo.year);

  const isDateInSelectedWeek = React.useCallback((date: Date) => {
    const info = getISOWeekInfo(date);
    return info.week === week && info.year === yearNumber;
  }, [week, yearNumber]);

  // Charger le profil actif au démarrage
  useEffect(() => {
    if (profilesManager.activeProfile) {
      const profile = profilesManager.activeProfile;
      setDept(profile.dept);
      setYear(profile.year);
      setGroupFilter(profile.groupFilter);
      setDark(profile.theme === 'dark');
    }
  }, [profilesManager.activeProfile]);

  // Sauvegarder les préférences localement pour la prochaine session
  useEffect(() => {
    localStorage.setItem('edt-last-dept', dept);
  }, [dept]);

  useEffect(() => {
    localStorage.setItem('edt-last-year', year);
  }, [year]);

  useEffect(() => {
    localStorage.setItem('edt-last-group', groupFilter);
  }, [groupFilter]);

  useEffect(() => {
    localStorage.setItem('edt-last-days', String(daysToShow));
  }, [daysToShow]);

  useEffect(() => {
    localStorage.setItem('edt-time-column', timeColumnExpanded ? 'expanded' : 'collapsed');
  }, [timeColumnExpanded]);

  useEffect(() => {
    localStorage.setItem('edt-theme', dark ? 'dark' : 'light');
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [dark]);

  useEffect(() => {
    const updateNow = () => setNow(new Date());
    const interval = window.setInterval(updateNow, 60000);
    updateNow();
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setTimeColumnExpanded(true);
    }
  }, [isMobile]);

  useEffect(() => {
    if (daysToShow === 1) {
      setTimeColumnExpanded(true);
    }
  }, [daysToShow]);

  // Fetch + filters moved to hook
  // year contient l'année de formation ("1", "2", "3" ou "ALL")
  const { courses: rawCourses, coursesByDay: rawCoursesByDay, allGroups: hookAllGroups, loading, error } = useScheduleData(dept, year, yearNumber, week);
  
  // Hook pour récupérer les informations des tuteurs
  const { getTutorInfo, getTutorFullName } = useTutors(dept);
  
  // Filtrer les cours par groupe si nécessaire
  const hookCourses = useMemo(() => {
    if (groupFilter === "ALL") {
      return rawCourses;
    }

    const trimmedFilter = groupFilter.trim();
    if (!trimmedFilter) {
      return rawCourses;
    }

    return rawCourses.filter((course) => {
      if (course.groups.length === 0) {
        return true;
      }

      return course.groups.some((courseGroup) => groupsMatchFilter(courseGroup, trimmedFilter));
    });
  }, [rawCourses, groupFilter]);
  
  useEffect(() => {
    setCourses(hookCourses);
    setAllGroups(hookAllGroups);
  }, [hookCourses, hookAllGroups]);

  // Handlers pour la gestion des profils
  const handleSelectProfile = (profileId: string | null) => {
    profilesManager.setActiveProfile(profileId);
    if (profileId) {
      const profile = profilesManager.profiles.find(p => p.id === profileId);
      if (profile) {
        setDept(profile.dept);
        setYear(profile.year);
        setGroupFilter(profile.groupFilter);
        setDark(profile.theme === 'dark');
      }
    }
  };

  // Utiliser les groupes extraits dynamiquement des données au lieu d'une liste hardcodée
  const availableGroupsByCategory = React.useMemo(() => {
    if (allGroups.length === 0) return {};
    
    // Organiser les groupes par catégories
    const map: Record<string, string[]> = {};
    const tdGroups: string[] = [];
    const tpGroups: string[] = [];
    const otherGroups: string[] = [];
    
    allGroups.forEach(g => {
      if (g === 'CE') {
        otherGroups.push(g);
      } else if (g.match(/^[0-9]+$/)) {
        // Groupes TD : nombres simples (1, 2, 3, 4)
        tdGroups.push(g);
      } else if (g.match(/^[0-9]+[A-Z]$/)) {
        // Groupes TP : nombres avec lettre (1A, 1B, 2A, 2B)
        tpGroups.push(g);
      } else {
        otherGroups.push(g);
      }
    });
    
    if (tdGroups.length > 0) map['Groupes TD'] = tdGroups;
    if (tpGroups.length > 0) map['Groupes TP'] = tpGroups;
    if (otherGroups.length > 0) map['Autres'] = otherGroups;
    
    return map;
  }, [allGroups]);

  const fixedGroupColumns = React.useMemo(() => {
    const trimmedFilter = groupFilter.trim();
    if (!trimmedFilter || trimmedFilter === "ALL") {
      return [] as string[];
    }

    const normalizedFilter = normalizeGroupCode(trimmedFilter);
    if (!/^\d+$/.test(normalizedFilter)) {
      return [] as string[];
    }

    const directSubgroupPattern = new RegExp(`^${normalizedFilter}[A-Z]+$`);

    const configuredGroups = Object.values(getGroupsForPromo(dept, year))
      .flat()
      .map((group) => normalizeGroupCode(group));

    const matchedConfiguredSubgroups = Array.from(
      new Set(
        configuredGroups
          .filter((group) => group !== "CE" && directSubgroupPattern.test(group)),
      ),
    );

    const matchedDataSubgroups = Array.from(
      new Set(
        allGroups
          .map((group) => normalizeGroupCode(group))
          .filter((group) => group !== "CE" && directSubgroupPattern.test(group)),
      ),
    );

    const matchedSubgroups = matchedConfiguredSubgroups.length > 0
      ? matchedConfiguredSubgroups
      : matchedDataSubgroups;

    if (matchedSubgroups.length <= 1) {
      return [] as string[];
    }

    return sortGroups(matchedSubgroups);
  }, [allGroups, dept, groupFilter, year]);

  const shouldSpanAllFixedColumns = React.useCallback((course: CoursAPI): boolean => {
    const normalizedType = (course.course_type || "").trim().toUpperCase();
    if (course.is_graded || normalizedType === "DS") {
      return true;
    }
    return normalizedType === "TD" || normalizedType === "CM";
  }, []);

  const buildCoursesWithColumns = React.useCallback((dayCourses: CoursAPI[]): CourseWithPosition[] => {
    const coursesWithColumns = dayCourses.map((course) => ({
      ...course,
      column: 0,
      totalColumns: 1,
      sortedGroups: sortGroups([...course.groups]),
    }));

    if (fixedGroupColumns.length > 1) {
      const groupToColumn = new Map(fixedGroupColumns.map((group, index) => [group, index]));
      const totalColumns = fixedGroupColumns.length;

      const spanningCoursesByKey = new Map<string, CourseWithPosition>();
      const subgroupCourses: CourseWithPosition[] = [];

      coursesWithColumns.forEach((course) => {
        if (shouldSpanAllFixedColumns(course)) {
          const mergeKey = [
            course.day,
            course.start_time,
            course.end_time,
            course.module_name,
            course.module_abbrev,
            course.course_type,
            course.is_graded ? 1 : 0,
            course.tutor_username,
            course.room_name,
          ].join("|");

          const existing = spanningCoursesByKey.get(mergeKey);
          if (!existing) {
            spanningCoursesByKey.set(mergeKey, {
              ...course,
              column: 0,
              totalColumns,
            });
            return;
          }

          const mergedGroups = sortGroups(Array.from(new Set([...existing.groups, ...course.groups])));
          existing.groups = mergedGroups;
          existing.sortedGroups = mergedGroups;
          existing.totalColumns = totalColumns;
          return;
        }

        subgroupCourses.push(course);
      });

      const positionedSubgroupCourses = subgroupCourses.map((course) => {
        const matchedGroup = course.sortedGroups
          .map((group) => normalizeGroupCode(group))
          .find((group) => groupToColumn.has(group));

        return {
          ...course,
          column: matchedGroup ? groupToColumn.get(matchedGroup)! : 0,
          totalColumns,
        };
      });

      return [...spanningCoursesByKey.values(), ...positionedSubgroupCourses].sort(
        (a, b) => a.start_time - b.start_time || a.column - b.column,
      );
    }

    for (let i = 0; i < coursesWithColumns.length; i++) {
      const current = coursesWithColumns[i];
      const overlapping = coursesWithColumns.filter((c, idx) => idx !== i && coursesOverlap(current, c));
      if (overlapping.length > 0) {
        const allOverlapping = [current, ...overlapping].sort((a, b) => {
          const groupA = a.sortedGroups[0] || '';
          const groupB = b.sortedGroups[0] || '';
          return groupA.localeCompare(groupB);
        });
        allOverlapping.forEach((course, index) => {
          course.column = index;
        });
        const totalCols = allOverlapping.length;
        allOverlapping.forEach((course) => {
          course.totalColumns = totalCols;
        });
      }
    }

    return coursesWithColumns;
  }, [fixedGroupColumns, shouldSpanAllFixedColumns]);

  const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
  const dayStartHour = 8;
  const dayEndHour = 19;
  const hourHeight = isMobile ? 56 : 80; // 56px sur mobile pour voir plus de cours, 80px sur desktop pour plus d'espace
  const pxPerMinute = hourHeight / 60;
  const headerHeight = 56;
  const contentHeight = (dayEndHour - dayStartHour) * 60 * pxPerMinute;

  // timeMarks previously used for inline grids; superseded by displayTimes

  const timeColumnWidth = React.useMemo(() => {
    if (isMobile) {
      return timeColumnExpanded ? 56 : 20;
    }
    return 100;
  }, [isMobile, timeColumnExpanded]);

  const gridTemplateColumns = React.useMemo(() => {
    if (isMobile) {
      if (daysToShow === 1) {
        return `${timeColumnWidth}px 1fr`;
      }
      return `${timeColumnWidth}px repeat(${daysToShow}, minmax(0, 1fr))`;
    }
    return `${timeColumnWidth}px repeat(${daysToShow}, minmax(240px, 1fr))`;
  }, [daysToShow, isMobile, timeColumnWidth]);

  const enableHorizontalScroll = isMobile && daysToShow > 1 && timeColumnExpanded;

  const coursesByDay = React.useMemo(() => {
    return courses.reduce((acc, course) => {
      const idx = dayNameToIndex(course.day);
      if (idx > 0 && idx <= 5) {
        (acc[idx] ||= []).push(course);
      }
      return acc;
    }, {} as { [key: number]: CoursAPI[] });
  }, [courses]);

  const selectedDayCourses = React.useMemo(() => {
    return buildCoursesWithColumns([...(coursesByDay[startDayIndex + 1] || [])]);
  }, [buildCoursesWithColumns, coursesByDay, startDayIndex]);

  // Display times via hook
  const displayTimes = useDisplayTimes(courses, dayStartHour, dayEndHour);

  const isoWeekStartDate = React.useMemo(() => getSharedISOWeekStartDate(week, yearNumber), [week, yearNumber]);
  const currentMonthLabel = React.useMemo(
    () =>
      isoWeekStartDate.toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
      }),
    [isoWeekStartDate]
  );
  const getDateForColumn = React.useCallback((dayIndex: number) => {
    const base = new Date(isoWeekStartDate);
    base.setDate(base.getDate() + dayIndex);
    return base;
  }, [isoWeekStartDate]);

  useEffect(() => {
    if (!selectedDate || !isDateInSelectedWeek(selectedDate)) {
      setSelectedDate(isoWeekStartDate);
    }
  }, [isoWeekStartDate, isDateInSelectedWeek, selectedDate]);

  const nowInfo = React.useMemo(() => getISOWeekInfo(now), [now]);
  const isCurrentWeek = nowInfo.week === week && nowInfo.year === yearNumber;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const isTodayColumn = React.useCallback((dayIndex: number) => {
    if (!isCurrentWeek) return false;
    const columnDate = getDateForColumn(dayIndex);
    return columnDate.toDateString() === now.toDateString();
  }, [getDateForColumn, isCurrentWeek, now]);

  const goToPreviousDay = React.useCallback(() => {
    if (startDayIndex > 0) {
      setStartDayIndex((current) => current - 1);
      return;
    }

    const previousYear = week === 1 ? yearNumber - 1 : yearNumber;
    const previousWeek = week === 1 ? getISOWeeksInYear(previousYear) : week - 1;
    setWeek(previousWeek);
    setYearNumber(previousYear);
    setStartDayIndex(4);
  }, [startDayIndex, week, yearNumber]);

  const goToNextDay = React.useCallback(() => {
    if (startDayIndex < days.length - 1) {
      setStartDayIndex((current) => current + 1);
      return;
    }

    const nextYear = week >= getISOWeeksInYear(yearNumber) ? yearNumber + 1 : yearNumber;
    const nextWeek = week >= getISOWeeksInYear(yearNumber) ? 1 : week + 1;
    setWeek(nextWeek);
    setYearNumber(nextYear);
    setStartDayIndex(0);
  }, [startDayIndex, week, yearNumber, days.length]);

  const selectedTutorInfo = selectedCourse ? getTutorInfo(selectedCourse.tutor_username) : null;
  const selectedTutorEmail = getSafeEmailDisplay(selectedTutorInfo?.email);

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={`min-h-screen bg-background ${isMobile ? 'p-2' : 'p-4 md:p-6 lg:p-8'} animate-fade-in ${isMobile ? '' : 'max-w-[75vw] mx-auto'}`}
      >
      {/* Header */}
      <header className={`${isMobile ? 'mb-2' : 'mb-8'} animate-slide-up`}>
        <div className={`flex flex-col ${isMobile ? 'gap-2' : 'gap-6'} md:flex-row md:items-center md:justify-between`}>
          <div className={`flex items-center gap-3 ${isMobile ? 'w-full' : ''}`}>
            {/* Menu Button */}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  className="flex items-center justify-center w-11 h-11 rounded-xl bg-card border border-border hover:bg-muted transition-base shadow-elegant"
                  aria-label="Menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[320px] p-0 flex flex-col">
                {/* Header avec titre et saison */}
                <div className="p-6 border-b border-border">
                  <h2 className="text-xl font-bold mb-1 bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
                    BetterEDT
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Semaine {week} • {yearNumber}
                  </p>
                </div>
                
                {/* Navigation principale */}
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                  {/* Home - Retour à la page Welcome */}
                  <button 
                    onClick={() => {
                      profilesManager.setActiveProfile(null);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-secondary transition-colors text-left"
                  >
                    <Home className="w-5 h-5" />
                    <span className="font-medium">Accueil</span>
                  </button>
                  
                  {/* Emploi du temps - Configuration EDT (Foldable) */}
                  <div className="space-y-2">
                    <button 
                      onClick={() => setConfigEdtOpen(!configEdtOpen)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg hover:bg-secondary transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <BookOpen className="w-5 h-5" />
                        <span className="font-medium">Configuration EDT</span>
                      </div>
                      <ChevronDown 
                        className={`w-4 h-4 transition-transform ${configEdtOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    
                    {/* Contenu de configuration */}
                    {configEdtOpen && (
                      <div className="ml-4 pl-4 border-l-2 border-border space-y-3 pb-2">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-2 block">Département</label>
                          <select
                            value={dept}
                            onChange={(e) => { 
                              setDept(e.target.value); 
                              setGroupFilter("ALL");
                              setYear("BUT1");
                            }}
                            className="w-full px-3 py-2 text-sm rounded-lg bg-secondary border-0 text-foreground font-medium transition-colors hover:bg-secondary/80 focus:ring-2 focus:ring-primary outline-none"
                          >
                            <option value="INFO">🖥️ INFO</option>
                            <option value="CS">📚 CS</option>
                            <option value="GIM">⚙️ GIM</option>
                            <option value="RT">📡 RT</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-2 block">Promotion</label>
                          <select
                            value={year}
                            onChange={(e) => {
                              setYear(e.target.value);
                              setGroupFilter("ALL");
                            }}
                            className="w-full px-3 py-2 text-sm rounded-lg bg-secondary border-0 text-foreground font-medium transition-colors hover:bg-secondary/80 focus:ring-2 focus:ring-primary outline-none"
                          >
                            <option value="BUT1">🎓 BUT1</option>
                            <option value="BUT2">🎓 BUT2</option>
                            <option value="BUT3">🎓 BUT3</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-2 block">Groupe</label>
                          <select
                            value={groupFilter}
                            onChange={(e) => setGroupFilter(e.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-lg bg-secondary border-0 text-foreground font-medium transition-colors hover:bg-secondary/80 focus:ring-2 focus:ring-primary outline-none"
                          >
                            <option value="ALL">Tous les groupes</option>
                            {Object.entries(availableGroupsByCategory).map(([category, groups]) => (
                              <optgroup label={category} key={category}>
                                {groups.map(g => <option key={g} value={g}>{g}</option>)}
                              </optgroup>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-2 block">Nombre de jours</label>
                          <div className="flex gap-2">
                            {dayOptions.map((num) => (
                              <button
                                key={num}
                                onClick={() => {
                                  setDaysToShow(num);
                                  setStartDayIndex(0);
                                }}
                                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                  daysToShow === num
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'bg-secondary/50 text-foreground hover:bg-secondary'
                                }`}
                              >
                                {num}j
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Salles libres - Intégré au menu */}
                  <FreeRoomsDialog 
                    week={week} 
                    year={yearNumber} 
                    apiBase={API_BASE}
                    renderTrigger={(onClick) => (
                      <button
                        onClick={onClick}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-secondary transition-colors text-left"
                      >
                        <DoorOpen className="w-5 h-5" />
                        <span className="font-medium">Salles libres</span>
                      </button>
                    )}
                  />

                  {/* EDT des professeurs - Intégré au menu */}
                  <button
                    onClick={() => { setMenuOpen(false); setTutorScheduleOpen(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-secondary transition-colors text-left"
                  >
                    <GraduationCap className="w-5 h-5" />
                    <span className="font-medium">EDT des professeurs</span>
                  </button>
                  
                  {/* Profile - Intégré au menu */}
                  <ProfileManager
                    profiles={profilesManager.profiles}
                    activeProfile={profilesManager.activeProfile}
                    dept={dept}
                    year={year}
                    groupFilter={groupFilter}
                    theme={dark ? "dark" : "light"}
                    onCreateProfile={(p) => { profilesManager.createProfile(p); }}
                    onSelectProfile={(id) => { handleSelectProfile(id); }}
                    onDeleteProfile={(id) => { profilesManager.deleteProfile(id); }}
                    onUpdateProfile={(id, updates) => { profilesManager.updateProfile(id, updates); }}
                    renderTrigger={(onClick) => (
                      <button
                        onClick={onClick}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-secondary transition-colors text-left"
                      >
                        <Users className="w-5 h-5" />
                        <span className="font-medium">Profils</span>
                      </button>
                    )}
                  />
                  
                  {/* Thème */}
                  <button
                    onClick={() => setDark(!dark)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg hover:bg-secondary transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                      <span className="font-medium">Thème</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{dark ? 'Sombre' : 'Clair'}</span>
                  </button>
                </nav>

                {/* Section utilisateur en bas - Nom du profil et classe */}
                <div className="p-4 border-t border-border">
                  <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-colors cursor-pointer">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                      {profilesManager.activeProfile?.name?.slice(0, 2).toUpperCase() || dept.slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">
                        {profilesManager.activeProfile?.name || "Aucun profil"}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {dept} {year} • {groupFilter}
                      </p>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div>
              <h1 className={`${isMobile ? 'text-lg mb-0' : 'text-4xl mb-2'} font-bold bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent`}>
                BetterEDT
              </h1>
              <p className={`text-muted-foreground ${isMobile ? 'hidden' : ''}`}>Semaine {week} • {yearNumber}</p>
            </div>

            {isMobile && (
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                aria-label="Groupe"
                className="ml-auto h-10 max-w-[112px] rounded-lg border border-border bg-card px-2 text-xs font-semibold text-foreground outline-none transition-base focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="ALL">Tous</option>
                {Object.entries(availableGroupsByCategory).map(([category, groups]) => (
                  <optgroup key={category} label={category}>
                    {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                  </optgroup>
                ))}
              </select>
            )}
          </div>

          <div className="hidden flex-wrap gap-3 md:flex">
            {/* Day navigation - conservée pour la vue desktop */}
            {daysToShow < 5 && !isMobile && (
              <div className="flex items-center gap-1 rounded-xl bg-card border border-border p-1 shadow-elegant">
                <button
                  onClick={() => setStartDayIndex(Math.max(0, startDayIndex - 1))}
                  disabled={startDayIndex === 0}
                  className="flex items-center justify-center w-9 h-9 rounded-lg text-foreground hover:bg-muted transition-base disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Jour précédent"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="px-3 py-1 text-sm font-medium text-muted-foreground min-w-[80px] text-center">
                  {startDayIndex + daysToShow > 5 ? 
                    `${days[startDayIndex].slice(0, 3)}...` : 
                    daysToShow === 1 ? days[startDayIndex] : 
                    `${days[startDayIndex].slice(0, 3)}-${days[startDayIndex + daysToShow - 1].slice(0, 3)}`
                  }
                </div>
                <button
                  onClick={() => setStartDayIndex(Math.min(5 - daysToShow, startDayIndex + 1))}
                  disabled={startDayIndex >= 5 - daysToShow}
                  className="flex items-center justify-center w-9 h-9 rounded-lg text-foreground hover:bg-muted transition-base disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Jour suivant"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Days selector - Masqué sur mobile */}
            {!isMobile && (
              <div className="flex items-center gap-1 rounded-xl bg-card border border-border p-1 shadow-elegant">
                {dayOptions.map((num) => (
                  <button
                    key={num}
                    onClick={() => {
                      setDaysToShow(num);
                      setStartDayIndex(0); // Reset au lundi quand on change de vue
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-base ${
                      daysToShow === num
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {num}j
                  </button>
                ))}
              </div>
            )}

            {/* Profile Manager - Masqué sur mobile */}
            {!isMobile && (
              <ProfileManager
                profiles={profilesManager.profiles}
                activeProfile={profilesManager.activeProfile}
                dept={dept}
                year={year}
                groupFilter={groupFilter}
                theme={dark ? "dark" : "light"}
                onCreateProfile={profilesManager.createProfile}
                onSelectProfile={handleSelectProfile}
                onDeleteProfile={profilesManager.deleteProfile}
                onUpdateProfile={profilesManager.updateProfile}
              />
            )}

            {/* Free Rooms Dialog - masqué sur mobile (dans le menu) */}
            {!isMobile && <FreeRoomsDialog week={week} year={yearNumber} apiBase={API_BASE} />}

            {/* EDT des professeurs - masqué sur mobile (dans le menu) */}
            {!isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setTutorScheduleOpen(true)}
                    className="flex items-center justify-center w-11 h-11 rounded-xl bg-card border border-border hover:bg-muted transition-base shadow-elegant"
                    aria-label="EDT des professeurs"
                  >
                    <GraduationCap className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>EDT des professeurs</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Theme toggle - masqué sur mobile (dans le menu) */}
            {!isMobile && (
              <button
                onClick={() => setDark(!dark)}
                className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-card border border-border hover:bg-muted transition-base shadow-elegant"
                aria-label="Toggle theme"
              >
                <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className={`${isMobile ? 'mt-1 gap-2' : 'mt-6 gap-3'} flex flex-wrap`}>
          {!isMobile && (
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="min-w-[200px] rounded-xl border border-border bg-card px-4 py-2.5 font-medium text-foreground outline-none shadow-elegant transition-base hover:border-primary focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">📚 Tous les groupes</option>
              {Object.entries(availableGroupsByCategory).map(([category, groups]) => (
                <optgroup key={category} label={category}>
                  {groups.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}

          {/* Navigation semaine avec boutons et calendrier */}
          <div className={`${isMobile ? 'w-full justify-between gap-0 rounded-xl border border-border/70 bg-card/60 p-0.5 shadow-sm' : 'gap-2'} flex items-center`}>
            <button
              onClick={() => {
                if (week === 1) {
                  const previousYear = yearNumber - 1;
                  setWeek(getISOWeeksInYear(previousYear));
                  setYearNumber(previousYear);
                } else {
                  setWeek(week - 1);
                }
              }}
              className={`flex items-center justify-center ${isMobile ? 'h-10 w-10 rounded-lg border-0 bg-transparent shadow-none' : 'h-11 w-11 rounded-xl border border-border bg-card shadow-elegant'} hover:bg-muted transition-base`}
              aria-label="Semaine précédente"
            >
              <ChevronLeft className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'}`} />
            </button>

            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                  <button
                    className={`flex items-center justify-center gap-2 ${isMobile ? 'h-10 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-2 shadow-none' : 'h-11 rounded-xl border border-border bg-card px-4 shadow-elegant'} hover:bg-muted transition-base`}
                    aria-label="Choisir une date"
                  >
                    <CalendarIcon className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'}`} />
                    <span className={`font-medium text-muted-foreground ${isMobile ? 'text-xs' : 'text-base'}`}>Semaine {week}</span>
                  </button>
                </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      const { week: newWeek, year: newYear } = getISOWeekInfo(date);
                      setWeek(newWeek);
                      setYearNumber(newYear);
                      setSelectedDate(date);
                      setCalendarOpen(false);
                    }
                  }}
                  initialFocus
                  weekStartsOn={1}
                />
              </PopoverContent>
            </Popover>

            <button
              onClick={() => {
                if (week >= getISOWeeksInYear(yearNumber)) {
                  setWeek(1);
                  setYearNumber(yearNumber + 1);
                } else {
                  setWeek(week + 1);
                }
              }}
              className={`flex items-center justify-center ${isMobile ? 'h-10 w-10 rounded-lg border-0 bg-transparent shadow-none' : 'h-11 w-11 rounded-xl border border-border bg-card shadow-elegant'} hover:bg-muted transition-base`}
              aria-label="Semaine suivante"
            >
              <ChevronRight className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Month label above timetable */}
      <div className="mb-6 hidden text-sm font-semibold capitalize text-muted-foreground md:block">
        {currentMonthLabel}
      </div>

      {/* Loading and empty states */}
      {loading && courses.length === 0 && (
        <div className="flex min-h-[132px] items-center justify-center text-center animate-scale-in">
          <p className="text-sm text-muted-foreground">Chargement de l’emploi du temps…</p>
        </div>
      )}

      {!loading && error && courses.length === 0 && (
        <div className="flex min-h-[132px] items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-5 text-center animate-scale-in">
          <div>
            <h3 className="text-sm font-semibold">Impossible de charger l’emploi du temps</h3>
            <p className="mt-1 text-xs text-muted-foreground">Vérifiez la connexion puis réessayez.</p>
          </div>
        </div>
      )}

      {!loading && !error && courses.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-scale-in">
          <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <CalendarIcon className="w-10 h-10 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Aucun cours trouvé</h3>
          <p className="text-muted-foreground">Essayez de modifier vos filtres.</p>
        </div>
      )}

      {/* Mobile timetable: a compact day flow replaces the proportional calendar grid. */}
      {courses.length > 0 && isMobile && (
        <div
          key={`mobile-day-${week}-${yearNumber}-${groupFilter}-${startDayIndex}`}
          className="animate-scale-in"
        >
          <DaySelector
            days={days}
            selectedDayIndex={startDayIndex}
            onDayChange={setStartDayIndex}
            getDateForColumn={getDateForColumn}
            isTodayColumn={isTodayColumn}
          />
          <MobileDayTimeline
            key={`mobile-timeline-${week}-${yearNumber}-${startDayIndex}`}
            courses={selectedDayCourses}
            isToday={isTodayColumn(startDayIndex)}
            nowMinutes={nowMinutes}
            onCourseClick={(course) => {
              setSelectedCourse(course);
              setCourseDialogOpen(true);
            }}
            onPreviousDay={goToPreviousDay}
            onNextDay={goToNextDay}
          />
        </div>
      )}

      {/* Desktop/tablet timetable grid. */}
      {courses.length > 0 && !isMobile && (
        <div 
          key={`grid-${week}-${yearNumber}-${groupFilter}-${daysToShow}`}
          className={`rounded-2xl border border-border shadow-lg animate-scale-in overflow-hidden ${
            isMobile ? 'bg-background/95 backdrop-blur-sm' : 'bg-card'
          }`}
        >
          <div
            className={`${isMobile ? 'relative overflow-y-auto touch-pan-y scroll-smooth' : ''}`}
            style={{
              display: 'grid',
              gridTemplateColumns,
              gridTemplateRows: isMobile && daysToShow === 1 ? `${contentHeight}px` : `${headerHeight}px ${contentHeight}px`,
              overflowX: enableHorizontalScroll ? 'auto' : undefined,
            }}
          >
            {/* Top-left corner */}
            {!(isMobile && daysToShow === 1) && (
              <div
                className={`bg-muted/50 border-r border-b border-border ${isMobile ? 'sticky top-0 z-40 backdrop-blur-lg flex items-center justify-center' : ''}`}
              >
                {isMobile && daysToShow > 1 && (
                  <button
                    type="button"
                    onClick={() => setTimeColumnExpanded((prev) => !prev)}
                    className="m-1 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-base hover:text-primary"
                    aria-label={timeColumnExpanded ? "Réduire la colonne des heures" : "Afficher la colonne des heures"}
                  >
                    {timeColumnExpanded ? (
                      <PanelLeftClose className="h-4 w-4" />
                    ) : (
                      <PanelLeftOpen className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Day headers */}
            <DayHeaders
              days={days}
              startDayIndex={startDayIndex}
              daysToShow={daysToShow}
              isMobile={isMobile}
              isTodayColumn={isTodayColumn}
              getDateForColumn={getDateForColumn}
            />

            {/* Time column */}
            <TimeColumn
              contentHeight={contentHeight}
              displayTimes={displayTimes}
              dayStartHour={dayStartHour}
              pxPerMinute={pxPerMinute}
              timeColumnExpanded={timeColumnExpanded}
              isMobile={isMobile}
              nowMinutes={nowMinutes}
              gridRow={isMobile && daysToShow === 1 ? '1' : '2'}
            />

            {/* Day columns with courses */}
            {isMobile && daysToShow === 1 ? (
              // Mobile single day view - grid with time slots
              <div
                key={`mobile-col-${startDayIndex}`}
                className="relative"
                style={{ 
                  height: contentHeight,
                  gridColumn: '2 / -1',
                  gridRow: '1',
                }}
              >
                {/* Time grid lines */}
                {displayTimes.map((t) => {
                  const top = (t - dayStartHour * 60) * pxPerMinute;
                  return (
                    <div
                      key={`line-${startDayIndex}-${t}`}
                      className="absolute left-0 right-0 border-t border-border/30"
                      style={{ top }}
                    />
                  );
                })}

                {/* Current time indicator */}
                {isTodayColumn(startDayIndex) && nowMinutes >= dayStartHour * 60 && nowMinutes <= dayEndHour * 60 && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none z-20"
                    style={{ top: (nowMinutes - dayStartHour * 60) * pxPerMinute }}
                  >
                    <div className="absolute left-0 right-0 h-[2px] bg-rose-500/80" />
                    <div className="absolute -left-2 top-0 w-3 h-3 rounded-full bg-rose-500 border-[3px] border-background shadow-sm" />
                  </div>
                )}

                {/* Course cards for selected day */}
                {(() => {
                  const dayCourses = [...(coursesByDay[startDayIndex + 1] || [])].sort((a, b) => a.start_time - b.start_time);
                  const coursesWithColumns = buildCoursesWithColumns(dayCourses);

                  return coursesWithColumns.map((c) => {
                    const start = c.start_time;
                    const end = c.end_time;
                    const top = (start - dayStartHour * 60) * pxPerMinute;
                    const actualDuration = end - start;
                    const visualDuration = Math.max(25, actualDuration - 5);
                    const height = visualDuration * pxPerMinute;

                    const isExam = c.is_graded || c.course_type === 'DS';
                    const displayName = c.module_abbrev || c.module_name || "Cours";
                    const courseType = c.course_type && c.course_type !== 'DS' ? c.course_type : null;
                    
                    // Calcul de la position et largeur en fonction des colonnes
                    const normalizedGroupFilter = normalizeGroupCode(groupFilter.trim());
                    const hasParentGroupAssignment = /^\d+$/.test(normalizedGroupFilter)
                      && c.groups.some((group) => normalizeGroupCode(group) === normalizedGroupFilter);
                    const spanAllColumns = c.totalColumns > 1
                      && (shouldSpanAllFixedColumns(c) || hasParentGroupAssignment);

                    let leftStyle, widthStyle;
                    if (spanAllColumns) {
                      leftStyle = '4px';
                      widthStyle = 'calc(100% - 8px)';
                    } else if (c.totalColumns > 1) {
                      const gap = 2;
                      const columnWidth = 100 / c.totalColumns;
                      const leftPercent = (c.column * columnWidth);
                      const widthPercent = columnWidth;
                      const leftMargin = c.column === 0 ? 4 : gap;
                      const rightMargin = c.column === c.totalColumns - 1 ? 4 : gap;
                      leftStyle = `calc(${leftPercent}% + ${leftMargin}px)`;
                      widthStyle = `calc(${widthPercent}% - ${leftMargin + rightMargin}px)`;
                    } else {
                      leftStyle = '4px';
                      widthStyle = 'calc(100% - 8px)';
                    }
                    
                    return (
                      <div
                        key={`${c.id}-${c.day}-${c.start_time}`}
                        onClick={() => {
                          setSelectedCourse(c);
                          setCourseDialogOpen(true);
                        }}
                        className={`absolute rounded-lg cursor-pointer transition-all hover:scale-[1.01] hover:shadow-md active:scale-[0.98] group overflow-hidden flex border-l-4 ${
                          isExam ? 'ring-[3px] ring-amber-500' : ''
                        }`}
                        style={{
                          top,
                          height,
                          left: leftStyle,
                          width: widthStyle,
                          backgroundColor: hexToRgba(c.display_color_bg, 0.20),
                          borderLeftColor: c.display_color_bg,
                          color: 'var(--foreground)',
                          zIndex: 10,
                        }}
                        title={`${isExam ? '📝 DEVOIR SURVEILLÉ - ' : ''}${courseType ? `[${courseType}] ` : ''}${c.module_name} (${displayName})\nGroupes: ${c.groups.join(', ')}\nProfesseur: ${c.tutor_username}\nSalle: ${c.room_name}\nHoraire: ${formatTime(start)} - ${formatTime(end)}`}
                      >
                        {/* Section de l'étiquette */}
                        <div className="flex items-center justify-center w-14 flex-shrink-0 self-stretch bg-black/30">
                          {isExam ? (
                            <span className="text-[10px] font-bold text-white">
                              📝 DS
                            </span>
                          ) : courseType && (
                            <span className="text-[11px] font-bold text-white">
                              {courseType}
                            </span>
                          )}
                        </div>
                        
                        {/* Section des détails */}
                        <div className="flex-1 min-w-0 p-2">
                          <div className="font-semibold text-[13px] leading-tight truncate mb-1">
                            {displayName}
                          </div>
                          {height >= 50 && (
                            <>
                              <div className="text-[11px] text-muted-foreground leading-tight mb-0.5 truncate">
                                {formatTime(start)} - {formatTime(end)}
                              </div>
                              <div className="text-[11px] text-muted-foreground leading-tight mb-0.5 truncate">
                                👤 {c.tutor_username}
                              </div>
                              <div className="text-[11px] text-muted-foreground leading-tight truncate">
                                📍 {c.room_name}
                              </div>
                            </>
                          )}
                          {groupFilter === "ALL" && c.groups.length > 0 && height >= 85 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {sortGroups([...c.groups]).map(g => (
                                <span 
                                  key={g} 
                                  className="text-[9px] px-1.5 py-0.5 bg-muted/60 rounded-md text-muted-foreground font-medium"
                                >
                                  {g}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              days.slice(startDayIndex, startDayIndex + daysToShow).map((_, relativeIndex) => {
                const dayIndex = startDayIndex + relativeIndex;
                return (
                  <div
                    key={`col-${dayIndex}`}
                    className={`relative border-l border-border ${isMobile && daysToShow > 1 ? 'min-w-0' : ''}`}
                    style={{ height: contentHeight }}
                  >
                    {/* Background sections - Figma style */}
                    {!isMobile && (
                      <>
                        {/* Morning section (8:00-12:30) */}
                        <div 
                          className="absolute left-0 right-0 bg-secondary/10"
                          style={{ top: 0, height: '45%', zIndex: 0 }}
                        />
                        {/* Afternoon section (14:15-18:00+) */}
                        <div
                          className="absolute left-0 right-0 bg-secondary/10"
                          style={{ top: '50%', height: '50%', zIndex: 0 }}
                        />
                      </>
                    )}

                    {/* Time grid lines - aligned with course start times */}
                    {displayTimes.map((t) => {
                      const top = (t - dayStartHour * 60) * pxPerMinute;
                      return (
                        <div
                          key={`line-${dayIndex}-${t}`}
                          className={`absolute left-0 right-0 border-t ${isMobile ? 'border-border/30' : 'border-border/40'}`}
                          style={{ top }}
                        />
                      );
                    })}

                    {isMobile && isTodayColumn(dayIndex) && nowMinutes >= dayStartHour * 60 && nowMinutes <= dayEndHour * 60 && (
                      <div
                        className="absolute left-0 right-0 pointer-events-none"
                        style={{ top: (nowMinutes - dayStartHour * 60) * pxPerMinute }}
                      >
                        <div className="absolute left-0 right-0 h-[2px] bg-rose-500/80" />
                        <div className="absolute -left-2 top-0 w-3 h-3 rounded-full bg-rose-500 border-[3px] border-background shadow-sm" />
                      </div>
                    )}

                    {/* Course cards */}
                    {(() => {
                      const dayCourses = [...(coursesByDay[dayIndex + 1] || [])].sort((a, b) => a.start_time - b.start_time);
                      const coursesWithColumns = buildCoursesWithColumns(dayCourses);

                      return coursesWithColumns.map((c) => {
                        const start = c.start_time;
                        const end = c.end_time;
                        const top = (start - dayStartHour * 60) * pxPerMinute;
                        const actualDuration = end - start;
                        const visualDuration = Math.max(25, actualDuration - 5);
                        const height = visualDuration * pxPerMinute;

                        const displayName = c.module_abbrev || c.module_name || "Cours";
                        const normalizedGroupFilter = normalizeGroupCode(groupFilter.trim());
                        const hasParentGroupAssignment = /^\d+$/.test(normalizedGroupFilter)
                          && c.groups.some((group) => normalizeGroupCode(group) === normalizedGroupFilter);
                        const spanAllColumns = c.totalColumns > 1
                          && (shouldSpanAllFixedColumns(c) || hasParentGroupAssignment);
                        const isCompactMode = groupFilter === "ALL" && c.totalColumns > 1 && !spanAllColumns;
                        const courseType = c.course_type && c.course_type !== 'DS' ? c.course_type : null;

                        let leftStyle, widthStyle;
                        if (spanAllColumns) {
                          leftStyle = isMobile ? '4px' : '8px';
                          widthStyle = isMobile ? 'calc(100% - 8px)' : 'calc(100% - 16px)';
                        } else if (c.totalColumns > 1) {
                          const gap = isMobile ? 2 : 4;
                          const columnWidth = 100 / c.totalColumns;
                          const leftPercent = (c.column * columnWidth);
                          const widthPercent = columnWidth;
                          const leftMargin = c.column === 0 ? (isMobile ? 4 : 8) : gap;
                          const rightMargin = c.column === c.totalColumns - 1 ? (isMobile ? 4 : 8) : gap;
                          leftStyle = `calc(${leftPercent}% + ${leftMargin}px)`;
                          widthStyle = `calc(${widthPercent}% - ${leftMargin + rightMargin}px)`;
                        } else {
                          leftStyle = isMobile ? '4px' : '8px';
                          widthStyle = isMobile ? 'calc(100% - 8px)' : 'calc(100% - 16px)';
                        }

                        const isExam = c.is_graded || c.course_type === 'DS';

                        return (
                          <div
                            key={`${c.id}-${c.day}-${c.start_time}`}
                            onClick={() => {
                              setSelectedCourse(c);
                              setCourseDialogOpen(true);
                            }}
                            className={`absolute rounded-lg cursor-pointer transition-all hover:scale-[1.01] hover:shadow-md ${isMobile ? 'active:scale-[0.98]' : ''} group overflow-hidden flex flex-col border-l-4 ${
                              !isMobile && daysToShow === 1 ? 'items-center text-center' : ''
                            } ${isCompactMode ? 'justify-center' : ''} ${isExam ? 'ring-[3px] ring-amber-500' : ''}`}
                            style={{
                              top,
                              height,
                              left: leftStyle,
                              width: widthStyle,
                              backgroundColor: hexToRgba(c.display_color_bg, isMobile ? 0.20 : 0.15),
                              borderLeftColor: c.display_color_bg,
                              color: 'var(--foreground)',
                              padding: isMobile ? (isCompactMode ? '4px 6px' : '6px 8px') : (isCompactMode ? '6px' : '8px'),
                              zIndex: 10, // Au-dessus de l'icône lunch (zIndex: 0)
                            }}
                            title={`${isExam ? '📝 DEVOIR SURVEILLÉ - ' : ''}${courseType ? `[${courseType}] ` : ''}${c.module_name} (${displayName})\nGroupes: ${c.groups.join(', ')}\nProfesseur: ${c.tutor_username}\nSalle: ${c.room_name}\nHoraire: ${formatTime(start)} - ${formatTime(end)}`}
                          >
                            <div className="flex items-start gap-1 flex-wrap mb-1">
                              {isExam && height >= 35 && (
                                <span className={`inline-block ${isMobile ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-1'} bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-md font-bold shadow-sm`}>
                                  📝 DS
                                </span>
                              )}
                              {courseType && height >= 35 && (
                                <span className={`inline-block ${isMobile ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5'} bg-primary/50 text-primary-foreground rounded-md font-bold border border-primary/60`}>
                                  {courseType}
                                </span>
                              )}
                            </div>
                            <div className={`font-semibold ${isMobile ? 'text-[11px]' : 'text-sm'} leading-tight truncate mb-1`}>
                              {displayName}
                            </div>

                            {height >= (isMobile ? 50 : 65) && !isCompactMode && (
                              <>
                                <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} text-muted-foreground leading-tight mb-0.5 truncate`}>
                                  {formatTime(start)} - {formatTime(end)}
                                </div>
                                <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} text-muted-foreground leading-tight mb-0.5 truncate`}>
                                  {c.tutor_username}
                                </div>
                                <div className={`${isMobile ? 'text-[9px]' : 'text-xs'} text-muted-foreground leading-tight truncate`}>
                                  {c.room_name}
                                </div>
                              </>
                            )}

                            {isCompactMode && height >= 40 && (
                              <div className={`${isMobile ? 'text-[8px]' : 'text-[10px]'} text-muted-foreground leading-tight truncate`}>
                                {c.room_name}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Dialog pour afficher les détails du cours */}
      {selectedCourse && (
        <Dialog open={courseDialogOpen} onOpenChange={setCourseDialogOpen}>
          <DialogContent className={isMobile ? "max-w-[90vw] rounded-xl" : "sm:max-w-md"}>
            <DialogHeader className="pb-2">
              {/* Header avec indicateur de couleur */}
              <div className="flex items-start gap-3">
                <div
                  className="w-1.5 min-h-[3.5rem] rounded-full flex-shrink-0"
                  style={{ backgroundColor: selectedCourse.display_color_bg }}
                />
                <div className="flex-1 min-w-0 text-left">
                  <DialogTitle className="text-xl font-bold leading-tight break-words" style={{ color: selectedCourse.display_color_bg }}>
                    {selectedCourse.module_name}
                  </DialogTitle>
                  <DialogDescription className="text-sm mt-1 flex flex-wrap items-center gap-2">
                    <span>{selectedCourse.module_abbrev}</span>
                    {/* Badge type de cours */}
                    {(selectedCourse.is_graded || selectedCourse.course_type === 'DS') ? (
                      <span className="text-[10px] px-2 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded font-bold">
                        📝 DS
                      </span>
                    ) : selectedCourse.course_type && (
                      <span 
                        className="text-[10px] px-2 py-0.5 rounded font-bold"
                        style={{ 
                          backgroundColor: `${selectedCourse.display_color_bg}30`,
                          color: selectedCourse.display_color_bg 
                        }}
                      >
                        {selectedCourse.course_type}
                      </span>
                    )}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            
            <div className="space-y-3 pt-2">
              {/* Horaires & Salle - sur la même ligne */}
              <div className="flex gap-4">
                <div className="flex items-center gap-2 flex-1 p-2.5 bg-muted/40 rounded-lg">
                  <span className="text-lg">🕐</span>
                  <div>
                    <div className="text-xs text-muted-foreground">Horaire</div>
                    <div className="font-medium">{formatTime(selectedCourse.start_time)} - {formatTime(selectedCourse.end_time)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-1 p-2.5 bg-muted/40 rounded-lg">
                  <span className="text-lg">📍</span>
                  <div>
                    <div className="text-xs text-muted-foreground">Salle</div>
                    <div className="font-medium">{selectedCourse.room_name}</div>
                  </div>
                </div>
              </div>

              {/* Professeur */}
              <div className="p-3 bg-muted/40 rounded-lg">
                <div className="flex items-start gap-3">
                  <span className="text-lg">👤</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Professeur</div>
                    <div className="font-medium">
                      {getTutorFullName(selectedCourse.tutor_username)}
                      <span className="text-muted-foreground font-normal ml-1.5">({selectedCourse.tutor_username})</span>
                    </div>
                    {selectedTutorEmail && (
                      <div className="inline-flex items-center gap-1.5 text-sm text-primary mt-1.5">
                        <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{selectedTutorEmail}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Groupes */}
              {selectedCourse.groups.length > 0 && (
                <div className="p-3 bg-muted/40 rounded-lg">
                  <div className="flex items-start gap-3">
                    <span className="text-lg">👥</span>
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground mb-2">Groupes</div>
                      <div className="flex flex-wrap gap-1.5">
                        {sortGroups([...selectedCourse.groups]).map(g => (
                          <span 
                            key={g} 
                            className="text-sm px-2.5 py-1 bg-background border rounded-md font-medium"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog EDT des profs */}
      <TutorScheduleDialog
        open={tutorScheduleOpen}
        onOpenChange={setTutorScheduleOpen}
        initialWeek={week}
        initialYear={yearNumber}
      />
      </div>
    </TooltipProvider>
  );
}
