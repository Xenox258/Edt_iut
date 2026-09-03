import { useEffect, useState } from "react";
import type { TutorsMap } from "@/types/timetable";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

// Cache global pour éviter les requêtes multiples
const globalTutorsCache: Record<string, TutorsMap> = {};
const globalCacheTimestamps: Record<string, number> = {};
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 heures

/**
 * Hook pour récupérer les informations des tuteurs
 * @param dept Department code (e.g., "INFO")
 */
export function useTutors(dept: string) {
  const [tutors, setTutors] = useState<TutorsMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dept) {
      setLoading(false);
      return;
    }

    const now = Date.now();
    const cacheKey = `tutors_${dept}`;

    // Vérifier le cache local
    if (
      globalTutorsCache[cacheKey] &&
      globalCacheTimestamps[cacheKey] &&
      now - globalCacheTimestamps[cacheKey] < CACHE_DURATION
    ) {
      setTutors(globalTutorsCache[cacheKey]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const url = `${API_BASE_URL}/api/tutors?dept=${dept}`;
    console.log("Fetching tutors:", url);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then((data: TutorsMap) => {
        console.log("Tutors received:", Object.keys(data).length, "tutors");

        // Mettre à jour le cache
        globalTutorsCache[cacheKey] = data;
        globalCacheTimestamps[cacheKey] = now;

        setTutors(data);
      })
      .catch((err) => {
        console.error("Error fetching tutors:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        
        // Utiliser le cache même s'il est expiré en cas d'erreur
        if (globalTutorsCache[cacheKey]) {
          setTutors(globalTutorsCache[cacheKey]);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [dept]);

  /**
   * Obtenir les infos complètes d'un tuteur par son username
   */
  const getTutorInfo = (username: string) => {
    return tutors[username] || null;
  };

  /**
   * Obtenir le nom complet d'un tuteur
   */
  const getTutorFullName = (username: string): string => {
    const tutor = tutors[username];
    if (!tutor) return username;
    
    const fullName = [tutor.first_name, tutor.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    
    return fullName || username;
  };

  return {
    tutors,
    loading,
    error,
    getTutorInfo,
    getTutorFullName,
  };
}
