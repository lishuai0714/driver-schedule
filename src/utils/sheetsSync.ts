import { Driver, ManualLocks, ShiftCategory } from '../types';

/**
 * Extracts Google Spreadsheet ID from a shared link, URL, or raw ID string.
 */
export const extractSpreadsheetId = (urlOrId: string): string => {
  const trimmed = urlOrId.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
};

/**
 * Checks if the required worksheets ('drivers' and 'locks') exist. 
 * If any of them are missing, pro-actively creates them.
 */
export const checkAndCreateSheetTabs = async (
  token: string,
  spreadsheetId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // 1. Fetch current spreadsheet sheets list
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `无法获取表格元数据，可能无权限或ID错误: ${errText}` };
    }

    const data = await res.json();
    const sheetTitles: string[] = (data.sheets || []).map(
      (s: any) => s.properties?.title
    );

    const missingSheets: string[] = [];
    if (!sheetTitles.includes('drivers')) missingSheets.push('drivers');
    if (!sheetTitles.includes('locks')) missingSheets.push('locks');

    // 2. If nothing is missing, we are good!
    if (missingSheets.length === 0) {
      return { success: true };
    }

    // 3. Create the missing sheets
    const requests = missingSheets.map(title => ({
      addSheet: {
        properties: { title },
      },
    }));

    const createRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      }
    );

    if (!createRes.ok) {
      const errText = await createRes.text();
      return { success: false, error: `创建子表格 (${missingSheets.join(', ')}) 失败: ${errText}` };
    }

    return { success: true };
  } catch (error: any) {
    console.error('检查/创建 Google Sheet 标签失败:', error);
    return { success: false, error: error.message || '未知异常' };
  }
};

/**
 * Loads schedule data (drivers config and manual edits/locks) from Google Sheets.
 */
export const loadDataFromGoogleSheet = async (
  token: string,
  spreadsheetId: string
): Promise<{ success: boolean; drivers?: Driver[]; locks?: ManualLocks; error?: string }> => {
  try {
    const spreadsheetIdClean = extractSpreadsheetId(spreadsheetId);
    
    // Ensure tabs exist first
    const initCheck = await checkAndCreateSheetTabs(token, spreadsheetIdClean);
    if (!initCheck.success) {
      return { success: false, error: initCheck.error };
    }

    // Get values of 'drivers' and 'locks' ranges
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetIdClean}/values:batchGet?ranges=drivers!A:E&ranges=locks!A:C`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `获取数据失败: ${errText}` };
    }

    const data = await res.json();
    const valueRanges = data.valueRanges || [];

    // Parse 'drivers' from the first range
    const driversRange = valueRanges.find((r: any) => r.range && r.range.startsWith('drivers'));
    const driversValues = driversRange ? driversRange.values : null;

    const loadedDrivers: Driver[] = [];
    if (driversValues && driversValues.length > 1) {
      // Index 0 is the table header: ['id', 'name', 'isFiveTonOnly', 'fixedRestDays', 'mandatoryRestDays']
      for (let i = 1; i < driversValues.length; i++) {
        const row = driversValues[i];
        if (!row || row.length === 0 || !row[0]) continue;

        const id = String(row[0]).trim();
        const name = row[1] ? String(row[1]).trim() : '';
        const isFiveTonOnly = row[2] === 'true' || row[2] === 'TRUE' || row[2] === true || row[2] === '1';
        
        const fixedRestDays = row[3]
          ? String(row[3])
              .split(',')
              .map(s => parseInt(s.trim(), 10))
              .filter(n => !isNaN(n))
          : [];

        const mandatoryRestDays = row[4]
          ? String(row[4])
              .split(',')
              .map(s => parseInt(s.trim(), 10))
              .filter(n => !isNaN(n))
          : [];

        loadedDrivers.push({
          id,
          name,
          isFiveTonOnly,
          fixedRestDays,
          mandatoryRestDays,
        });
      }
    }

    // Parse 'locks' from the second range
    const locksRange = valueRanges.find((r: any) => r.range && r.range.startsWith('locks'));
    const locksValues = locksRange ? locksRange.values : null;

    const loadedLocks: ManualLocks = {};
    if (locksValues && locksValues.length > 1) {
      // Index 0 is the table header: ['dateKey', 'driverId', 'shift']
      for (let i = 1; i < locksValues.length; i++) {
        const row = locksValues[i];
        if (!row || row.length < 3) continue;

        const dateKey = String(row[0]).trim();
        const driverId = String(row[1]).trim();
        const shift = String(row[2]).trim() as ShiftCategory;

        if (dateKey && driverId && shift) {
          if (!loadedLocks[dateKey]) {
            loadedLocks[dateKey] = {};
          }
          loadedLocks[dateKey][driverId] = shift;
        }
      }
    }

    return {
      success: true,
      drivers: loadedDrivers.length > 0 ? loadedDrivers : undefined,
      locks: loadedLocks,
    };
  } catch (error: any) {
    console.error('从 Google Sheets 加载数据失败:', error);
    return { success: false, error: error.message || '读取表格数据时发生异常' };
  }
};

/**
 * Saves/Publishes the local drivers configuration and manual locks/edits into Google Sheets.
 */
export const saveDataToGoogleSheet = async (
  token: string,
  spreadsheetId: string,
  drivers: Driver[],
  locks: ManualLocks
): Promise<{ success: boolean; error?: string }> => {
  try {
    const spreadsheetIdClean = extractSpreadsheetId(spreadsheetId);

    // Ensure tabs exist first
    const initCheck = await checkAndCreateSheetTabs(token, spreadsheetIdClean);
    if (!initCheck.success) {
      return { success: false, error: initCheck.error };
    }

    // 1. Clear old ranges to avoid leaving trailing rows if the new records are fewer
    const clearRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetIdClean}/values:batchClear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ranges: ['drivers!A:E', 'locks!A:C'],
        }),
      }
    );

    if (!clearRes.ok) {
      const errText = await clearRes.text();
      console.warn('清空原表格数据失败，直接覆写中...', errText);
    }

    // 2. Build rows for drivers
    const driversRows = [
      ['id', 'name', 'isFiveTonOnly', 'fixedRestDays', 'mandatoryRestDays'],
      ...drivers.map(d => [
        d.id,
        d.name,
        d.isFiveTonOnly ? 'TRUE' : 'FALSE',
        (d.fixedRestDays || []).join(','),
        (d.mandatoryRestDays || []).join(','),
      ]),
    ];

    // 3. Build rows for locks
    const locksRows = [['dateKey', 'driverId', 'shift']];
    Object.entries(locks).forEach(([dateKey, driverLocks]) => {
      Object.entries(driverLocks).forEach(([driverId, shift]) => {
        locksRows.push([dateKey, driverId, shift]);
      });
    });

    // 4. Batch update values
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetIdClean}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [
            {
              range: 'drivers!A:E',
              values: driversRows,
            },
            {
              range: 'locks!A:C',
              values: locksRows,
            },
          ],
        }),
      }
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return { success: false, error: `写入表格失败: ${errText}` };
    }

    return { success: true };
  } catch (error: any) {
    console.error('推送数据到 Google Sheets 发生错误:', error);
    return { success: false, error: error.message || '写入表格数据时发生异常' };
  }
};
