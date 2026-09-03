import React from "react";
import type { CourseWithPosition } from "@/types/timetable";
import { formatTime, hexToRgba } from "@/lib/timetable-utils";

interface MobileDayTimelineProps {
  courses: CourseWithPosition[];
  isToday: boolean;
  nowMinutes: number;
  onCourseClick: (course: CourseWithPosition) => void;
  onPreviousDay: () => void;
  onNextDay: () => void;
}

type CourseCluster = {
  courses: CourseWithPosition[];
  startTime: number;
  endTime: number;
};

const DAY_START_MINUTES = 8 * 60;

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours} h` : `${hours} h ${remainingMinutes}`;
};

const formatPause = (minutes: number) => {
  return `Pause ${formatDuration(minutes)}`;
};

const buildClusters = (courses: CourseWithPosition[]): CourseCluster[] => {
  const sortedCourses = [...courses].sort(
    (a, b) => a.start_time - b.start_time || a.end_time - b.end_time,
  );

  return sortedCourses.reduce<CourseCluster[]>((clusters, course) => {
    const currentCluster = clusters[clusters.length - 1];
    if (!currentCluster || course.start_time >= currentCluster.endTime) {
      clusters.push({
        courses: [course],
        startTime: course.start_time,
        endTime: course.end_time,
      });
    } else {
      currentCluster.courses.push(course);
      currentCluster.endTime = Math.max(currentCluster.endTime, course.end_time);
    }
    return clusters;
  }, []);
};

const getColumnCount = (courses: CourseWithPosition[]) => {
  const columns: number[] = [];
  courses.forEach((course) => {
    const availableColumn = columns.findIndex((endTime) => endTime <= course.start_time);
    if (availableColumn === -1) {
      columns.push(course.end_time);
    } else {
      columns[availableColumn] = course.end_time;
    }
  });
  return Math.max(1, columns.length);
};

const groupCoursesByStartTime = (courses: CourseWithPosition[]) => {
  return courses.reduce<CourseWithPosition[][]>((rows, course) => {
    const row = rows[rows.length - 1];
    if (!row || row[0].start_time !== course.start_time) {
      rows.push([course]);
    } else {
      row.push(course);
    }
    return rows;
  }, []);
};

const MobileTimelineCourse: React.FC<{
  course: CourseWithPosition;
  columnCount: number;
  onClick: () => void;
}> = ({ course, columnCount, onClick }) => {
  const isExam = course.is_graded || course.course_type === "DS";
  const typeLabel = isExam ? "DS" : course.course_type?.trim();
  const moduleLabel = course.module_abbrev?.trim() || course.module_name || "Cours";
  const tutor = course.tutor_username?.trim();
  const room = course.room_name?.trim();
  const secondaryLabel = [tutor, room].filter(Boolean).join(" · ") || "Informations à compléter";
  const width = columnCount > 1 ? `calc(${100 / columnCount}% - 4px)` : "100%";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-h-[86px] min-w-0 rounded-xl border border-border/70 border-l-4 bg-card/85 px-3 py-2.5 text-left shadow-sm transition-all hover:border-primary/60 hover:bg-card active:scale-[0.99]"
      style={{
        width,
        borderLeftColor: course.display_color_bg,
        backgroundColor: hexToRgba(course.display_color_bg, 0.12),
      }}
      title={`${course.module_name} · ${formatTime(course.start_time)} - ${formatTime(course.end_time)}${room ? ` · ${room}` : ""}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        {typeLabel && (
          <span
            className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none ${
              isExam ? "bg-amber-500 text-white" : "bg-primary/80 text-primary-foreground"
            }`}
          >
            {typeLabel}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-tight text-foreground">
          {moduleLabel}
        </span>
      </div>
      <div className="mt-1 text-[12px] font-medium tabular-nums text-foreground/80">
        {formatTime(course.start_time)}–{formatTime(course.end_time)}
      </div>
      <div className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
        {secondaryLabel}
      </div>
    </button>
  );
};

export const MobileDayTimeline: React.FC<MobileDayTimelineProps> = ({
  courses,
  isToday,
  nowMinutes,
  onCourseClick,
  onPreviousDay,
  onNextDay,
}) => {
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);
  const clusters = React.useMemo(() => buildClusters(courses), [courses]);
  const firstCluster = clusters[0];
  const firstCourse = firstCluster?.courses[0];
  const lastCourseEnd = clusters[clusters.length - 1]?.endTime;
  const nextCourse = isToday
    ? courses
        .filter((course) => course.start_time > nowMinutes)
        .sort((a, b) => a.start_time - b.start_time)[0]
    : undefined;
  const leadingFreeMinutes = firstCluster ? firstCluster.startTime - DAY_START_MINUTES : 0;
  const summaryLabel = nextCourse ? "Prochain cours à" : "Premier cours à";
  const summaryCourse = nextCourse || firstCourse;
  const dayCountLabel = isToday ? "aujourd’hui" : "ce jour";

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = touch.clientY - touchStart.current.y;
    touchStart.current = null;

    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    if (deltaX < 0) onNextDay();
    else onPreviousDay();
  };

  return (
    <section
      className="mobile-day-enter touch-pan-y pb-4"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        touchStart.current = null;
      }}
      aria-label="Emploi du temps de la journée"
    >
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            {isToday ? "Aujourd’hui" : "Journée"}
          </p>
          {firstCourse && lastCourseEnd !== undefined ? (
            <>
              <p className="mt-1 text-base font-semibold leading-tight text-foreground">
                {summaryLabel} <span className="tabular-nums text-primary">{formatTime((summaryCourse || firstCourse).start_time)}</span>
              </p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {summaryCourse?.module_abbrev || summaryCourse?.module_name || "Cours"}
                {summaryCourse?.room_name ? ` · ${summaryCourse.room_name}` : ""}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm font-medium text-foreground">Aucun cours prévu</p>
          )}
        </div>
        {firstCourse && lastCourseEnd !== undefined && (
          <p className="shrink-0 text-right text-[11px] leading-tight text-muted-foreground">
            <span className="font-semibold text-foreground">{courses.length} cours</span>{" "}
            {dayCountLabel}
            <br />
            fin à <span className="font-semibold tabular-nums text-foreground">{formatTime(lastCourseEnd)}</span>
          </p>
        )}
      </div>

      {clusters.length === 0 ? (
        <div className="flex min-h-[132px] items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/30 px-5 text-center">
          <div>
            <p className="text-sm font-medium text-foreground">Journée libre</p>
            <p className="mt-1 text-xs text-muted-foreground">Profitez-en pour avancer à votre rythme.</p>
          </div>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute bottom-3 left-[52px] top-3 w-px bg-border/80" aria-hidden="true" />
          <div className="space-y-2">
            {clusters.map((cluster, index) => {
              const previousCluster = clusters[index - 1];
              const pause = previousCluster ? cluster.startTime - previousCluster.endTime : 0;
              const isFirstCluster = index === 0;
              const sortedClusterCourses = [...cluster.courses].sort(
                (a, b) => a.start_time - b.start_time || a.end_time - b.end_time,
              );
              const courseRows = groupCoursesByStartTime(sortedClusterCourses);

              return (
                <React.Fragment key={`mobile-cluster-${cluster.startTime}-${cluster.endTime}`}>
                  {isFirstCluster && leadingFreeMinutes >= 30 && (
                    <div className="flex items-center gap-2 py-1 text-[10px] font-medium text-muted-foreground">
                      <span className="w-[44px] shrink-0 text-right tabular-nums">{formatTime(DAY_START_MINUTES)}</span>
                      <span className="h-px flex-1 bg-border/60" />
                      <span className="shrink-0 rounded-full bg-muted/60 px-2 py-1">
                        Libre {formatDuration(leadingFreeMinutes)}
                      </span>
                      <span className="h-px w-4 bg-border/60" />
                    </div>
                  )}
                  {pause > 15 && (
                    <div className="flex items-center gap-2 py-1 pl-[62px] text-[10px] font-medium text-muted-foreground">
                      <span className="h-px flex-1 bg-border/60" />
                      <span className="shrink-0 rounded-full bg-muted/60 px-2 py-1">{formatPause(pause)}</span>
                      <span className="h-px w-4 bg-border/60" />
                    </div>
                  )}
                  <div className={`space-y-2 ${isFirstCluster && leadingFreeMinutes > 0 && leadingFreeMinutes < 30 ? "pt-2" : ""}`}>
                    {courseRows.map((row) => {
                      const columnCount = getColumnCount(row);
                      return (
                        <div
                          key={`mobile-row-${row[0].start_time}-${row.map((course) => course.id).join("-")}`}
                          className="grid grid-cols-[44px_minmax(0,1fr)] gap-2"
                        >
                          <div className="relative z-10 pt-3 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">
                            <span className="bg-background pr-1">{formatTime(row[0].start_time)}</span>
                          </div>
                          <div className="flex min-w-0 items-stretch gap-1">
                            {row.map((course) => (
                              <MobileTimelineCourse
                                key={`${course.id}-${course.start_time}-${course.end_time}`}
                                course={course}
                                columnCount={columnCount}
                                onClick={() => onCourseClick(course)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
