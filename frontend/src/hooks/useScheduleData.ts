import { useEffect, useState, useMemo } from "react";
import type { CoursAPI } from "@/types/timetable";
import { normalizeCourse, dayNameToIndex } from "@/lib/timetable-utils";

// Utiliser l'URL publique de l'API par défaut
// En production, utiliser le proxy nginx du frontend (même origine). Une
// URL externe reste possible via VITE_API_URL pour un environnement séparé.
const API_BASE_URL = import.meta.env.VITE_API_URL || "";

/**
 * Hook to fetch and manage schedule data
 * @param dept Department code (e.g., "INFO")
 * @param trainYear Training year (1, 2, 3) - used for filtering by train_prog
 * @param calendarYear Calendar year currently displayed in the timetable
 * @param week Week number
 */
export function useScheduleData(
  dept: string,
  trainYear: string,
  calendarYear: number,
  week: number,
) {
  const [courses, setCourses] = useState<CoursAPI[]>([]);
  const [allGroups, setAllGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Utiliser l'année de la semaine affichée. L'année civile actuelle ne
    // convient pas lorsque l'utilisateur navigue vers une autre année.
    const url = `${API_BASE_URL}/api/schedule/${dept}/${calendarYear}/${week}`;
    
    console.log('Fetching schedule:', { dept, trainYear, calendarYear, week, url });

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then((rawData) => {
        console.log('Raw data received:', rawData.length, 'courses');
        
        if (!Array.isArray(rawData)) {
          setCourses([]);
          setAllGroups([]);
          setError("Invalid data format");
          return;
        }

        // Define the expected raw item shape to avoid any
        type RawGroup = { name?: string; train_prog?: string };
        type RawModuleDisplay = { color_bg?: string; color_txt?: string };
        type RawModule = { name?: string; abbrev?: string; display?: RawModuleDisplay };
        type RawCourse = { groups?: RawGroup[]; module?: RawModule; is_graded?: boolean; type?: string; train_prog?: string };
        type RawRoom = { name?: string };
        type RawItem = {
          id?: string | number;
          course?: RawCourse;
          room?: RawRoom;
          day?: string;
          start_time?: number;
          duration?: number;
          tutor?: string;
          train_prog?: string;
        };

        console.log('Filtering by trainYear:', trainYear);

        const targetYearDigits = (() => {
          if (trainYear === "ALL") return null;
          const digits = String(trainYear).match(/\d+/);
          return digits ? digits[0] : null;
        })();

        const filteredData = rawData.filter((item: RawItem) => {
          if (!targetYearDigits) {
            return true;
          }

          const groups = item.course?.groups || [];

          const matchesGroup = groups.some((g: RawGroup) => {
            const trainProgDigits = g.train_prog ? String(g.train_prog).match(/\d+/)?.[0] : null;
            if (trainProgDigits) {
              return trainProgDigits === targetYearDigits;
            }

            const nameDigits = g.name ? String(g.name).match(/\d+/)?.[0] : null;
            if (nameDigits) {
              return nameDigits === targetYearDigits;
            }

            return false;
          });

          if (matchesGroup) {
            return true;
          }

          const fallbackTrainProg = item.course?.train_prog ?? item.train_prog;
          if (fallbackTrainProg) {
            const fallbackDigits = String(fallbackTrainProg).match(/\d+/)?.[0];
            if (fallbackDigits) {
              return fallbackDigits === targetYearDigits;
            }
          }

          return false;
        });

        console.log('Filtered data:', filteredData.length, 'courses after filtering');
        console.log('Sample filtered course:', filteredData[0]);

        // Normaliser les cours
        const normalized = filteredData
          .map((item: RawItem) => normalizeCourse(item))
          .filter((c): c is CoursAPI => c !== null);

        console.log('Normalized courses:', normalized.length);

        setCourses(normalized);

        // Extraire tous les groupes uniques
        const groupsSet = new Set<string>();
        normalized.forEach((c) => {
          console.log('Course groups:', c.groups, 'from course:', c.module_abbrev);
          c.groups.forEach((g) => groupsSet.add(g));
        });
        const allGroupsSorted = Array.from(groupsSet).sort();
        setAllGroups(allGroupsSorted);
        
        console.log('All groups:', allGroupsSorted);
      })
      .catch((err) => {
        console.error("Error fetching schedule:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setCourses([]);
        setAllGroups([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [dept, trainYear, calendarYear, week]);

  // Regrouper les cours par jour (index numérique: 1=lundi, 2=mardi, etc.)
  const coursesByDay = useMemo(() => {
    const grouped: Record<number, CoursAPI[]> = {};
    courses.forEach((course) => {
      const dayIndex = dayNameToIndex(course.day);
      if (dayIndex === undefined) return;

      if (!grouped[dayIndex]) {
        grouped[dayIndex] = [];
      }
      grouped[dayIndex].push(course);
    });
    return grouped;
  }, [courses]);

  return { 
    courses,           // Tableau de tous les cours
    coursesByDay,      // Cours regroupés par index de jour
    allGroups, 
    loading, 
    error 
  };
}
