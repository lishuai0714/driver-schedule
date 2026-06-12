import { Driver, ShiftCategory, ScheduleGrid, ManualLocks, RuleViolation } from '../types';

// Helper: Get weekday index (0 = Sunday, 1 = Monday, ..., 6 = Saturday) and Name
export const WEEKDAYS_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function getDaysInMonth(year: number, month: number): Date[] {
  // month is 1-indexed (1-12)
  const date = new Date(year, month - 1, 1);
  const days: Date[] = [];
  while (date.getMonth() === month - 1) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Get the Monday-based week identifier (YYYY-Wxx) for a given date
export function getWeekKey(date: Date): string {
  const tempDate = new Date(date.getTime());
  // Set to nearest Thursday: current date + 4 - current day number, make Sunday = 7
  const day = tempDate.getDay();
  const rDay = day === 0 ? 7 : day;
  tempDate.setDate(tempDate.getDate() + 4 - rDay);
  const yearStart = new Date(tempDate.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((tempDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tempDate.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getDaysInCalendarWeek(date: Date): Date[] {
  const result: Date[] = [];
  const day = date.getDay();
  // Monday is 1, Sunday is 0 -> map Sunday to 7
  const rDay = day === 0 ? 7 : day;
  const monday = new Date(date.getTime());
  monday.setDate(date.getDate() - (rDay - 1));
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getTime());
    d.setDate(monday.getDate() + i);
    result.push(d);
  }
  return result;
}

// Check how many rests a driver has in a specific week
export function countWeeklyRests(
  driverId: string,
  weekKey: string,
  daysInMonth: Date[],
  grid: ScheduleGrid
): number {
  let rests = 0;
  daysInMonth.forEach(d => {
    if (getWeekKey(d) === weekKey) {
      const dateKey = formatDateKey(d);
      const shift = grid[dateKey]?.[driverId];
      if (shift === '休息') {
        rests++;
      }
    }
  });
  return rests;
}

interface SchedulerOptions {
  drivers: Driver[];
  year: number;
  month: number;
  locks: ManualLocks;
  existingGrid?: ScheduleGrid; // Optional past values to carry forward if preferred
}

/**
 * Generates/solves a schedule for the given month.
 * Will run day-by-day and respect any locks in `locks`.
 */
export function generateSchedule({ drivers, year, month, locks, existingGrid }: SchedulerOptions): ScheduleGrid {
  const days = getDaysInMonth(year, month);
  const grid: ScheduleGrid = {};
  
  // Initialize grid days
  days.forEach(d => {
    grid[formatDateKey(d)] = {};
  });

  // Keep track of driver statistics *during* scheduling as we go day by day
  const driverNightCount: Record<string, number> = {};
  const driverEDMCount: Record<string, number> = {};
  const driverDayCount: Record<string, number> = {};
  const driverFiveTonCount: Record<string, number> = {};
  
  drivers.forEach(dr => {
    driverNightCount[dr.id] = 0;
    driverEDMCount[dr.id] = 0;
    driverDayCount[dr.id] = 0;
    driverFiveTonCount[dr.id] = 0;
  });

  // Track the shift assigned yesterday to enforce "夜班之后只能休息"
  const getPreviousDayShift = (driverId: string, currentDate: Date): ShiftCategory | null => {
    const prevDate = new Date(currentDate.getTime() - 86400000);
    // If previous day is in the same month, get from grid
    if (prevDate.getMonth() === currentDate.getMonth()) {
      const prevKey = formatDateKey(prevDate);
      return grid[prevKey]?.[driverId] || null;
    }
    // Else check existingGrid if available
    if (existingGrid) {
      const prevKey = formatDateKey(prevDate);
      return existingGrid[prevKey]?.[driverId] || null;
    }
    return null;
  };

  // Track weekly rest status dynamically. 
  // Let's count how many times a driver rests in each weekKey.
  const getWeeklyRestCount = (driverId: string, date: Date): number => {
    const weekKey = getWeekKey(date);
    const calendarWeekDays = getDaysInCalendarWeek(date);
    const dr = drivers.find(d => d.id === driverId);
    if (!dr) return 0;

    let rests = 0;
    calendarWeekDays.forEach(d => {
      if (d < date) {
        const dKey = formatDateKey(d);
        if (d.getMonth() === date.getMonth()) {
          if (grid[dKey]?.[driverId] === '休息') {
            rests++;
          }
        } else {
          if (existingGrid && existingGrid[dKey]?.[driverId] !== undefined) {
            if (existingGrid[dKey]?.[driverId] === '休息') {
              rests++;
            }
          } else {
            if (dr.fixedRestDays.includes(d.getDay()) || (dr.mandatoryRestDays || []).includes(d.getDay())) {
              rests++;
            }
          }
        }
      }
    });
    return rests;
  };

  // Let's execute day by day
  days.forEach((date, dayIndex) => {
    const dateKey = formatDateKey(date);
    const dayOfWeek = date.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const weekKey = getWeekKey(date);
    
    // Remaining days in this week (including today) in the 7-day calendar week
    const calendarWeekDays = getDaysInCalendarWeek(date);
    const remainingDaysInWeek = calendarWeekDays.filter(d => d >= date).length;

    // 1. Process locked values first
    drivers.forEach(dr => {
      if (locks[dateKey]?.[dr.id]) {
        const lockedShift = locks[dateKey][dr.id];
        grid[dateKey][dr.id] = lockedShift;
        
        // Update cumulative stats
        if (lockedShift === '夜班') driverNightCount[dr.id]++;
        else if (lockedShift === 'EDM') driverEDMCount[dr.id]++;
        else if (lockedShift === '白班') driverDayCount[dr.id]++;
        else if (lockedShift === '5吨') driverFiveTonCount[dr.id]++;
      }
    });

    // Determine what shifts are already satisfied by manual locks
    let lockedDayShifts = 0;
    let lockedNightShifts = 0;
    let lockedEDMShifts = 0;
    let lockedFiveTonShifts = 0;

    drivers.forEach(dr => {
      const assigned = grid[dateKey][dr.id];
      if (assigned === '白班') lockedDayShifts++;
      else if (assigned === '夜班') lockedNightShifts++;
      else if (assigned === 'EDM') lockedEDMShifts++;
      else if (assigned === '5吨') lockedFiveTonShifts++;
    });

    // Core requirements still to fulfill:
    let neededDay = Math.max(0, 1 - lockedDayShifts);
    let neededNight = Math.max(0, 1 - lockedNightShifts);
    let neededEDM = Math.max(0, 1 - lockedEDMShifts);
    let neededFiveTon = Math.max(0, 1 - lockedFiveTonShifts);

    // Available drivers who are NOT locked today
    const availableDrivers = drivers.filter(dr => !locks[dateKey]?.[dr.id]);

    // Characterize each driver's constraints for TODAY
    const driverConstraints = availableDrivers.map(dr => {
      const prevShift = getPreviousDayShift(dr.id, date);
      const isPostNightShift = prevShift === '夜班';
      const isMandatoryRestDay = (dr.mandatoryRestDays || []).includes(dayOfWeek);
      const isFixedRestDay = dr.fixedRestDays.includes(dayOfWeek);
      const restsEarnedSoFar = getWeeklyRestCount(dr.id, date);
      
      // If a driver has 2 rests already in this week, they don't *need* more rests
      // If remaining weekdays in week equals the number of rests they still need, they MUST rest today!
      const restsNeeded = Math.max(0, 2 - restsEarnedSoFar);
      const mustRest = restsNeeded >= remainingDaysInWeek;

      // Cannot work if must rest, or if night shift yesterday (forced rule), OR if it is a mandatory rest day
      const forcedRest = isPostNightShift || mustRest || isMandatoryRestDay || (isFixedRestDay && restsEarnedSoFar < 2);

      return {
        driver: dr,
        isPostNightShift,
        isFixedRestDay,
        isMandatoryRestDay,
        restsEarnedSoFar,
        restsNeeded,
        mustRest,
        forcedRest,
      };
    });

    // Helper: Assign a shift to a driver
    const assignShift = (driverId: string, shift: ShiftCategory) => {
      grid[dateKey][driverId] = shift;
      if (shift === '夜班') driverNightCount[driverId]++;
      else if (shift === 'EDM') driverEDMCount[driverId]++;
      else if (shift === '白班') driverDayCount[driverId]++;
      else if (shift === '5吨') driverFiveTonCount[driverId]++;
    };

    // Keep track of which available drivers have been assigned a shift today
    const assignedToday = new Set<string>();

    // Step A: Handle forced rests immediately!
    driverConstraints.forEach(c => {
      if (c.forcedRest) {
        assignShift(c.driver.id, '休息');
        assignedToday.add(c.driver.id);
      }
    });

    // Step B: Fulfill "5吨 (5-Ton)" Requirement
    if (neededFiveTon > 0) {
      // Is there a 5-ton-only driver who is available and not assigned rest?
      const fiveTonOnlyDr = driverConstraints.find(
        c => c.driver.isFiveTonOnly && !assignedToday.has(c.driver.id)
      );
      
      if (fiveTonOnlyDr) {
        assignShift(fiveTonOnlyDr.driver.id, '5吨');
        assignedToday.add(fiveTonOnlyDr.driver.id);
        neededFiveTon = 0;
      } else {
        // Find another driver who is available
        const candidate = driverConstraints
          .filter(c => !assignedToday.has(c.driver.id) && !c.driver.isFiveTonOnly)
          .sort((a, b) => {
            // Prefer those who prefer working today over rest
            if (a.isFixedRestDay !== b.isFixedRestDay) {
              return a.isFixedRestDay ? 1 : -1;
            }
            // Prefer those with fewer 5吨 shifts
            return driverFiveTonCount[a.driver.id] - driverFiveTonCount[b.driver.id];
          })[0];

        if (candidate) {
          assignShift(candidate.driver.id, '5吨');
          assignedToday.add(candidate.driver.id);
          neededFiveTon = 0;
        }
      }
    }

    // Step C: Fulfill "夜班 (Night Shift)" - Priority is balancing night shifts
    if (neededNight > 0) {
      const candidates = driverConstraints
        .filter(c => !assignedToday.has(c.driver.id) && !c.driver.isFiveTonOnly)
        .sort((a, b) => {
          // Rule 1: Prefer driver who is NOT on fixed rest day
          if (a.isFixedRestDay !== b.isFixedRestDay) {
            return a.isFixedRestDay ? 1 : -1;
          }
          // Rule 2: Balance night shifts - lowest Night shift count first
          return driverNightCount[a.driver.id] - driverNightCount[b.driver.id];
        });

      if (candidates.length > 0) {
        assignShift(candidates[0].driver.id, '夜班');
        assignedToday.add(candidates[0].driver.id);
        neededNight = 0;
      }
    }

    // Step D: Fulfill "EDM" Shift - Priority is balancing EDM shifts
    if (neededEDM > 0) {
      const candidates = driverConstraints
        .filter(c => !assignedToday.has(c.driver.id) && !c.driver.isFiveTonOnly)
        .sort((a, b) => {
          // Rule 1: Prefer driver who is NOT on fixed rest day
          if (a.isFixedRestDay !== b.isFixedRestDay) {
            return a.isFixedRestDay ? 1 : -1;
          }
          // Rule 2: Balance EDM shifts - lowest EDM count first
          return driverEDMCount[a.driver.id] - driverEDMCount[b.driver.id];
        });

      if (candidates.length > 0) {
        assignShift(candidates[0].driver.id, 'EDM');
        assignedToday.add(candidates[0].driver.id);
        neededEDM = 0;
      }
    }

    // Step E: Fulfill "白班 (Day Shift)"
    if (neededDay > 0) {
      const candidates = driverConstraints
        .filter(c => !assignedToday.has(c.driver.id) && !c.driver.isFiveTonOnly)
        .sort((a, b) => {
          if (a.isFixedRestDay !== b.isFixedRestDay) {
            return a.isFixedRestDay ? 1 : -1;
          }
          return driverDayCount[a.driver.id] - driverDayCount[b.driver.id];
        });

      if (candidates.length > 0) {
        assignShift(candidates[0].driver.id, '白班');
        assignedToday.add(candidates[0].driver.id);
        neededDay = 0;
      }
    }

    // Step F: Fill remaining unassigned drivers
    // "除了司机强制休息的规定，尽量让每个司机每周都排5天班。多出来的班次先排成白班。"
    // Let's find remaining drivers who are not yet assigned today.
    const remainingCandidates = driverConstraints.filter(c => !assignedToday.has(c.driver.id));

    remainingCandidates.forEach(c => {
      const dr = c.driver;
      if (dr.isFiveTonOnly) {
        // 5-ton-only driver can only work 5-ton or rest. Today we've met 5-ton if scheduled,
        // or if not scheduled, they rest. Since they can't do anything else, assign Rest.
        assignShift(dr.id, '休息');
        assignedToday.add(dr.id);
        return;
      }

      // Check if driver needs to rest because of weekly limit, or if they prefer to rest today
      const restsEarned = getWeeklyRestCount(dr.id, date);
      
      // Determine if they should work or rest
      if (restsEarned < 2 && (c.isFixedRestDay || remainingDaysInWeek <= (2 - restsEarned))) {
        // Let them rest on preferred rest days or if they absolutely must rest in the remaining days of the week
        assignShift(dr.id, '休息');
      } else {
        // Otherwise, schedule them to work to target exactly 5 working days (and exactly 2 rest days)
        // prioritized as "白班" as requested.
        assignShift(dr.id, '白班');
      }
      assignedToday.add(dr.id);
    });

    // Final safety: if anyone was completely missed, set them to 休息
    drivers.forEach(dr => {
      if (grid[dateKey][dr.id] === undefined) {
        grid[dateKey][dr.id] = '休息';
      }
    });
  });

  return grid;
}

/**
 * Scans the schedule grid and generates a list of rule violations.
 * Works on both generated and manual edits.
 */
export function auditSchedule(
  grid: ScheduleGrid,
  drivers: Driver[],
  year: number,
  month: number
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const days = getDaysInMonth(year, month);
  const totalDays = days.length;

  // Track weekly rest counts manually to audit
  // Set of all week keys in this month
  const weekKeys = Array.from(new Set(days.map(d => getWeekKey(d))));

  // 1. Audit Daily Requirements:
  // "每天至少一个白班，一个EDM，一个晚班，一个5吨，这个是优先级最高的规则。"
  days.forEach(d => {
    const dateKey = formatDateKey(d);
    const dayName = `${String(d.getDate()).padStart(2, '0')}日 (${WEEKDAYS_CN[d.getDay()]})`;
    const dayGrid = grid[dateKey] || {};

    let dayCount = 0;
    let edmCount = 0;
    let nightCount = 0;
    let fiveTonCount = 0;

    drivers.forEach(dr => {
      const shift = dayGrid[dr.id];
      if (shift === '白班') dayCount++;
      else if (shift === 'EDM') edmCount++;
      else if (shift === '夜班') nightCount++;
      else if (shift === '5吨') fiveTonCount++;
    });

    if (dayCount < 1) {
      violations.push({
        id: `daily-day-${dateKey}`,
        type: 'error',
        date: dateKey,
        message: `${dayName} 缺少白班人员（当天：${dayCount}个）`
      });
    }
    if (edmCount < 1) {
      violations.push({
        id: `daily-edm-${dateKey}`,
        type: 'error',
        date: dateKey,
        message: `${dayName} 缺少EDM人员（当天：${edmCount}个）`
      });
    }
    if (nightCount < 1) {
      violations.push({
        id: `daily-night-${dateKey}`,
        type: 'error',
        date: dateKey,
        message: `${dayName} 缺少夜班人员（当天：${nightCount}个）`
      });
    }
    if (fiveTonCount < 1) {
      violations.push({
        id: `daily-fiveton-${dateKey}`,
        type: 'error',
        date: dateKey,
        message: `${dayName} 缺少5吨班人员（当天：${fiveTonCount}个）`
      });
    }

    // No extra shift warnings are required now, as extra shifts are intentionally prioritized as Day shifts to achieve the 5-day work week quota.
  });

  // 2. Audit Individual Driver Constraints:
  drivers.forEach(dr => {
    // "有一个司机只能排5吨"
    // "晚班之后只能休息"
    // "要求每个司机每周固定休息2天"
    
    // Check consecutive days for Night -> Rest
    for (let i = 0; i < totalDays - 1; i++) {
      const currentDay = days[i];
      const nextDay = days[i + 1];
      const currentKey = formatDateKey(currentDay);
      const nextKey = formatDateKey(nextDay);

      const currentShift = grid[currentKey]?.[dr.id];
      const nextShift = grid[nextKey]?.[dr.id];

      if (currentShift === '夜班' && nextShift !== '休息' && nextShift !== undefined) {
        violations.push({
          id: `night-rest-${dr.id}-${currentKey}`,
          type: 'error',
          date: nextKey,
          driverId: dr.id,
          message: `${dr.name} 在 ${currentDay.getDate()}号 排了夜班，但 ${nextDay.getDate()}号 排的是「${nextShift}」，夜班后必须休息！`
        });
      }
    }

    // Check 5-ton-only driver constraint
    if (dr.isFiveTonOnly) {
      days.forEach(d => {
        const dateKey = formatDateKey(d);
        const shift = grid[dateKey]?.[dr.id];
        if (shift && shift !== '5吨' && shift !== '休息') {
          violations.push({
            id: `fiveton-restriction-${dr.id}-${dateKey}`,
            type: 'error',
            date: dateKey,
            driverId: dr.id,
            message: `${dr.name} 设定为只能跑5吨或休息，但当前排了「${shift}」`
          });
        }
      });
    }

    // Check weekly rests (target: exactly 2 rest days per week, or at least 2)
    weekKeys.forEach(weekKey => {
      // Find all days of this week *that fall within* the month
      const daysInWeek = days.filter(d => getWeekKey(d) === weekKey);
      
      // Calculate how many rest days were scheduled out of the days that exist in the month for this week
      let scheduledRests = 0;
      daysInWeek.forEach(d => {
        const dateKey = formatDateKey(d);
        if (grid[dateKey]?.[dr.id] === '休息') {
          scheduledRests++;
        }
      });

      // Split the week label for clarity
      const firstDay = daysInWeek[0];
      const lastDay = daysInWeek[daysInWeek.length - 1];
      const weekLabel = `${firstDay.getDate()}日-${lastDay.getDate()}日`;

      // Estimate rests in days of this calendar week that fall OUTSIDE of the current month
      const calendarWeekDays = getDaysInCalendarWeek(firstDay);
      let outsideRests = 0;
      calendarWeekDays.forEach(d => {
        if (d.getMonth() !== firstDay.getMonth()) {
          if (dr.fixedRestDays.includes(d.getDay()) || (dr.mandatoryRestDays || []).includes(d.getDay())) {
            outsideRests++;
          }
        }
      });

      const totalEstimatedRests = scheduledRests + outsideRests;

      // We only flag strict "not 2 rests" warnings/errors based on estimated total rests for the entire week
      if (totalEstimatedRests < 2) {
        violations.push({
          id: `weekly-rest-low-${dr.id}-${weekKey}`,
          type: daysInWeek.length >= 5 ? 'error' : 'warning',
          date: formatDateKey(firstDay),
          driverId: dr.id,
          message: `${dr.name} 在本周 (${weekLabel}) 休息不足 2 天（实际排休了 ${scheduledRests} 天，估算跨月休了 ${outsideRests} 天）`
        });
      } else if (totalEstimatedRests > 2 && daysInWeek.length === 7) {
        violations.push({
          id: `weekly-rest-high-${dr.id}-${weekKey}`,
          type: 'warning',
          date: formatDateKey(firstDay),
          driverId: dr.id,
          message: `${dr.name} 在本周 (${weekLabel}) 休息了超过 2 天（实际排休了 ${scheduledRests} 天）`
        });
      }
    });
  });

  return violations;
}
