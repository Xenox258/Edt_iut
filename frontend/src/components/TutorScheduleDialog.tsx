import React, { useState, useMemo, useEffect } from "react";
import { ChevronLeft, ChevronRight, Search, User, Calendar, Clock, MapPin, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTutors } from "@/hooks/useTutors";
import { useTutorSchedule, TutorCourse } from "@/hooks/useTutorSchedule";
import { formatTime, DAYS, getISOWeeksInYear, hexToRgba, DAY_START_HOUR, DAY_END_HOUR, HOUR_HEIGHT } from "@/lib/timetable-utils";
import type { Tutor } from "@/types/timetable";

interface TutorScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialWeek: number;
  initialYear?: number;
}

export const TutorScheduleDialog: React.FC<TutorScheduleDialogProps> = ({
  open,
  onOpenChange,
  initialWeek,
  initialYear = new Date().getFullYear(),
}) => {
  const [selectedTutor, setSelectedTutor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [week, setWeek] = useState(initialWeek);
  const [year, setYear] = useState(initialYear);
  const [selectedCourse, setSelectedCourse] = useState<TutorCourse | null>(null);

  // Réinitialiser l'état quand le dialog se ferme
  useEffect(() => {
    if (!open) {
      setSelectedTutor(null);
      setSearchQuery("");
      setSelectedCourse(null);
      setWeek(initialWeek);
      setYear(initialYear);
    }
  }, [open, initialWeek, initialYear]);
  
  // Utiliser INFO comme département par défaut pour la liste des tuteurs
  // (l'API tutors retourne tous les tuteurs de tous les départements)
  const { tutors, getTutorFullName } = useTutors("INFO");
  const { courses, coursesByDay, loading, error } = useTutorSchedule(selectedTutor, week, year);
  
  // Filtrer et trier les tuteurs selon la recherche
  const filteredTutors = useMemo(() => {
    const tutorList = Object.values(tutors) as Tutor[];
    
    // Liste des usernames à exclure (placeholders/tests)
    const excludedUsernames = ['XX', 'XXX', 'test', 'te'];
    
    // Filtrer les tuteurs sans nom (données incomplètes) et les placeholders
    const validTutors = tutorList.filter(t => {
      // Exclure les usernames de test
      if (excludedUsernames.includes(t.username)) return false;
      // Exclure les noms qui ressemblent à des tests (X X, test test, etc.)
      const fullName = `${t.first_name || ''} ${t.last_name || ''}`.toLowerCase().trim();
      if (fullName === 'x x' || fullName === 'x xx' || fullName === 'test test') return false;
      // Garder seulement si prénom ou nom existe
      return t.first_name?.trim() || t.last_name?.trim();
    });
    
    // Copier et trier par nom de famille puis prénom (avec trim pour ignorer les espaces)
    const sortedList = [...validTutors].sort((a, b) => {
      const lastNameA = (a.last_name || '').trim();
      const lastNameB = (b.last_name || '').trim();
      const lastNameCompare = lastNameA.localeCompare(lastNameB, 'fr');
      if (lastNameCompare !== 0) return lastNameCompare;
      const firstNameA = (a.first_name || '').trim();
      const firstNameB = (b.first_name || '').trim();
      return firstNameA.localeCompare(firstNameB, 'fr');
    });
    
    if (!searchQuery.trim()) return sortedList;
    
    const query = searchQuery.toLowerCase();
    return sortedList.filter((t: Tutor) => 
      t.username.toLowerCase().includes(query) ||
      (t.first_name || '').toLowerCase().includes(query) ||
      (t.last_name || '').toLowerCase().includes(query)
    );
  }, [tutors, searchQuery]);
  
  // Navigation de semaine avec gestion du passage à l'année suivante/précédente
  const goToPrevWeek = () => {
    if (week === 1) {
      const previousYear = year - 1;
      setWeek(getISOWeeksInYear(previousYear));
      setYear(previousYear);
    } else {
      setWeek(w => w - 1);
    }
  };
  const goToNextWeek = () => {
    if (week >= getISOWeeksInYear(year)) {
      setWeek(1);
      setYear(y => y + 1);
    } else {
      setWeek(w => w + 1);
    }
  };
  
  // Calculer les heures de travail du prof cette semaine
  const totalHours = useMemo(() => {
    return courses.reduce((acc, c) => acc + (c.duration || 90), 0) / 60;
  }, [courses]);

  const pxPerMinute = HOUR_HEIGHT / 60;
  const totalHeight = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Emploi du temps des professeurs
          </DialogTitle>
          <DialogDescription>
            Consultez l'emploi du temps d'un professeur pour voir ses disponibilités
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Sélection du tuteur */}
          {!selectedTutor ? (
            <div className="space-y-4">
              {/* Barre de recherche */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher un professeur (nom, prénom ou abréviation)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
              </div>
              
              {/* Liste des tuteurs avec scrollbar visible */}
              <div 
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar"
              >
                {filteredTutors.map((tutor) => (
                  <button
                    key={tutor.username}
                    onClick={() => setSelectedTutor(tutor.username)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-primary/20 hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                      {tutor.username.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {tutor.first_name} {tutor.last_name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {tutor.username}
                      </div>
                    </div>
                  </button>
                ))}
                {filteredTutors.length === 0 && (
                  <div className="col-span-full text-center text-muted-foreground py-8">
                    Aucun professeur trouvé
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Header avec le tuteur sélectionné */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedTutor(null)}
                    className="p-2 rounded-lg hover:bg-muted"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                    {selectedTutor.slice(0, 2)}
                  </div>
                  <div>
                    <div className="font-semibold text-lg">
                      {getTutorFullName(selectedTutor)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {selectedTutor} • {totalHours.toFixed(1)}h cette semaine
                    </div>
                  </div>
                </div>
                
                {/* Navigation semaine */}
                <div className="flex items-center gap-2">
                  <button onClick={goToPrevWeek} className="p-2 rounded-lg hover:bg-muted">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="font-medium px-3">Semaine {week} ({year})</span>
                  <button onClick={goToNextWeek} className="p-2 rounded-lg hover:bg-muted">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
              
              {/* Emploi du temps */}
              {loading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : error ? (
                <div className="flex-1 flex items-center justify-center text-red-500">
                  Erreur: {error}
                </div>
              ) : courses.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <Calendar className="h-12 w-12 opacity-50" />
                  <p>Aucun cours cette semaine</p>
                  <p className="text-sm">Ce professeur est absent toute la semaine </p>
                </div>
              ) : (
                <div className="flex-1 overflow-auto">
                  {/* Grille de l'EDT */}
                  <div className="flex min-w-[600px]">
                    {/* Colonne des heures */}
                    <div className="w-16 flex-shrink-0 border-r">
                      <div className="h-10"></div> {/* Header spacer */}
                      <div className="relative" style={{ height: totalHeight }}>
                        {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }).map((_, i) => (
                          <div
                            key={i}
                            className="absolute w-full text-xs text-muted-foreground text-right pr-2"
                            style={{ top: i * HOUR_HEIGHT - 8 }}
                          >
                            {DAY_START_HOUR + i}h
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Colonnes des jours */}
                    <div className="flex-1 grid grid-cols-5">
                      {[1, 2, 3, 4, 5].map((dayIndex) => (
                        <div key={dayIndex} className="border-r last:border-r-0">
                          {/* Header du jour */}
                          <div className="h-10 flex items-center justify-center font-medium border-b bg-muted/30">
                            {DAYS[dayIndex - 1]}
                          </div>
                          
                          {/* Contenu du jour */}
                          <div className="relative" style={{ height: totalHeight }}>
                            {/* Lignes des heures */}
                            {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }).map((_, i) => (
                              <div
                                key={i}
                                className="absolute w-full border-t border-dashed border-muted"
                                style={{ top: i * HOUR_HEIGHT }}
                              />
                            ))}
                            
                            {/* Cours du jour */}
                            {(coursesByDay[dayIndex] || []).map((course) => {
                              const top = (course.start_time - DAY_START_HOUR * 60) * pxPerMinute;
                              const height = Math.max(30, (course.duration || 90) * pxPerMinute - 4);
                              
                              return (
                                <div
                                  key={course.id}
                                  onClick={() => setSelectedCourse(course)}
                                  className="absolute left-1 right-1 rounded-md cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md overflow-hidden border-l-4"
                                  style={{
                                    top,
                                    height,
                                    backgroundColor: hexToRgba(course.display_color_bg, 0.2),
                                    borderLeftColor: course.display_color_bg,
                                  }}
                                >
                                  <div className="p-1.5 h-full flex flex-col">
                                    <div className="font-medium text-xs truncate">
                                      {course.module_abbrev}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate">
                                      {course.room_name}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground truncate">
                                      {course.department}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        
        {/* Dialog détail cours */}
        {selectedCourse && (
          <Dialog open={!!selectedCourse} onOpenChange={() => setSelectedCourse(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle style={{ color: selectedCourse.display_color_bg }}>
                  {selectedCourse.module_name}
                </DialogTitle>
                <DialogDescription>
                  {selectedCourse.module_abbrev} • {selectedCourse.course_type}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-2 bg-muted/40 rounded-lg">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Horaire</div>
                    <div className="font-medium">
                      {formatTime(selectedCourse.start_time)} - {formatTime(selectedCourse.end_time)}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-2 bg-muted/40 rounded-lg">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Salle</div>
                    <div className="font-medium">{selectedCourse.room_name}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-2 bg-muted/40 rounded-lg">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Département & Groupes</div>
                    <div className="font-medium">
                      {selectedCourse.department} - {selectedCourse.train_prog}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {selectedCourse.groups.join(", ")}
                    </div>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
};
