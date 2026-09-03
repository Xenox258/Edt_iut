import { useEffect, useState, useMemo } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export interface TutorCourse {
  id: number;
  day: string;
  start_time: number;
  end_time: number;
  duration: number;
  room_name: string;
  module_name: string;
  module_abbrev: string;
  course_type: string;
  groups: string[];
  train_prog: string;
  department: string;
  display_color_bg: string;
  display_color_txt: string;
}

export interface TutorScheduleResponse {
  tutor: string;
  week: number;
  year: number;
  courses: TutorCourse[];
  totalCourses: number;
}

/**
 * Hook pour récupérer l'emploi du temps d'un tuteur
 * @param tutorUsername Username du tuteur (ex: "FP", "NEK")
 * @param week Numéro de semaine
 * @param year Année (par défaut l'année courante)
 */
export function useTutorSchedule(tutorUsername: string | null, week: number, year?: number) {
  const [schedule, setSchedule] = useState<TutorScheduleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tutorUsername) {
      setSchedule(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const effectiveYear = year ?? new Date().getFullYear();
    const url = `${API_BASE_URL}/api/tutor-schedule?tutor=${tutorUsername}&week=${week}&year=${effectiveYear}`;
    
    console.log("Fetching tutor schedule:", url);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then((data: TutorScheduleResponse) => {
        console.log("Tutor schedule received:", data.totalCourses, "courses");
        setSchedule(data);
      })
      .catch((err) => {
        console.error("Error fetching tutor schedule:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setSchedule(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [tutorUsername, week, year]);

  // Regrouper les cours par jour
  const coursesByDay = useMemo(() => {
    if (!schedule) return {};
    
    const dayMapping: Record<string, number> = {
      'm': 1, 'tu': 2, 'w': 3, 'th': 4, 'f': 5
    };
    
    const grouped: Record<number, TutorCourse[]> = {};
    schedule.courses.forEach((course) => {
      const dayIndex = dayMapping[course.day] || 0;
      if (!grouped[dayIndex]) {
        grouped[dayIndex] = [];
      }
      grouped[dayIndex].push(course);
    });
    
    return grouped;
  }, [schedule]);

  return {
    schedule,
    courses: schedule?.courses || [],
    coursesByDay,
    loading,
    error,
  };
}
