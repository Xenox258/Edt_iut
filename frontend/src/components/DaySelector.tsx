import React from "react";

interface DaySelectorProps {
  days: string[];
  selectedDayIndex: number;
  onDayChange: (index: number) => void;
  getDateForColumn: (dayIndex: number) => Date;
  isTodayColumn: (dayIndex: number) => boolean;
}

export const DaySelector: React.FC<DaySelectorProps> = ({
  days,
  selectedDayIndex,
  onDayChange,
  getDateForColumn,
  isTodayColumn,
}) => {
  const weekDates = days.map((_, index) => getDateForColumn(index));
  const firstDate = weekDates[0];
  const lastDate = weekDates[weekDates.length - 1];
  const dateRange = `${firstDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${lastDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="sticky top-0 z-20 -mx-1 border-b border-border/70 bg-background/95 px-1 pb-2 pt-0 backdrop-blur-sm">
      <div className="mb-2 px-1">
        <span className="text-xs font-medium text-muted-foreground">{dateRange}</span>
      </div>

      <div className="grid grid-cols-5 gap-1">
        {days.map((day, index) => {
          const date = getDateForColumn(index);
          const isToday = isTodayColumn(index);
          const isSelected = selectedDayIndex === index;

          return (
            <button
              key={`day-pill-${index}`}
              onClick={() => onDayChange(index)}
              aria-label={`${day} ${date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`}
              aria-current={isSelected ? "date" : undefined}
              className={`flex min-h-[52px] min-w-0 flex-col items-center justify-center rounded-lg px-1 py-1.5 transition-all ${
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : isToday
                  ? 'bg-primary/10 text-primary hover:bg-primary/20'
                  : 'bg-secondary/40 text-foreground hover:bg-secondary'
              }`}
            >
              <span className={`text-[11px] leading-none ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                {day.slice(0, 3)}
              </span>
              <span className={`mt-1 text-base leading-none ${isSelected ? 'font-bold' : 'font-semibold'}`}>
                {date.getDate()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
