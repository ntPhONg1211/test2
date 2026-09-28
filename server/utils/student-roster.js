import ExcelJS from "exceljs";

const MAX_STUDENTS = 500;
const MAX_WORKSHEET_ROWS = 1000;
const HEADER_ALIASES = {
  fullName: ["ho va ten", "ho ten", "ten hoc sinh"],
  dateOfBirth: ["ngay sinh", "ngay thang nam sinh"],
  newClass: ["lop moi"],
  gender: ["nu", "gioi tinh"],
  previousClass: ["lop cu"],
  category: ["doi tuong"],
  notes: ["ghi chu"],
};

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getCellText(cell) {
  return String(cell.text ?? "").trim();
}

function findHeaders(sheet) {
  const searchEnd = Math.min(sheet.rowCount, 20);
  for (let rowNumber = 1; rowNumber <= searchEnd; rowNumber++) {
    const columns = new Map();
    sheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, column) => {
      columns.set(normalizeText(getCellText(cell)), column);
    });
    const headers = {};
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      headers[key] = aliases.map((alias) => columns.get(alias)).find(Boolean);
    }
    if (headers.fullName && headers.dateOfBirth && headers.newClass) {
      return { rowNumber, headers };
    }
  }
  return null;
}

function dateString(value, date1904) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const date = new Date(epoch + Math.floor(value) * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  const dmy = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return validDateString(year, month, day);
  }
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, year, month, day] = iso;
    return validDateString(year, month, day);
  }
  return "";
}

function validDateString(yearValue, monthValue, dayValue) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return "";
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeClassCode(value) {
  return String(value ?? "")
    .trim()
    .replace(/^lớp\s*/i, "")
    .toUpperCase()
    .replace(/\s+/g, "");
}

export async function parseStudentRoster(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const records = [];
  const errors = [];

  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > MAX_WORKSHEET_ROWS) {
      throw new Error(`Sheet "${sheet.name}" vượt quá giới hạn ${MAX_WORKSHEET_ROWS} dòng.`);
    }
    const headerInfo = findHeaders(sheet);
    if (!headerInfo) {
      errors.push({
        sheet: sheet.name,
        row: 1,
        message: "Không tìm thấy các cột Họ và tên, Ngày sinh, Lớp mới.",
      });
      continue;
    }

    for (let rowNumber = headerInfo.rowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const name = getCellText(row.getCell(headerInfo.headers.fullName));
      const dateValue = row.getCell(headerInfo.headers.dateOfBirth).value;
      const classValue = row.getCell(headerInfo.headers.newClass).value;
      if (!name && !dateValue && !classValue) continue;
      if (!name) {
        errors.push({ sheet: sheet.name, row: rowNumber, message: "Thiếu họ và tên học sinh." });
        continue;
      }
      const nameParts = name.replace(/\s+/g, " ").split(" ");
      const firstName = nameParts.at(-1) || "";
      const lastName = nameParts.slice(0, -1).join(" ");
      if (name.length > 200 || firstName.length > 100 || lastName.length > 100) {
        errors.push({ sheet: sheet.name, row: rowNumber, message: "Họ tên vượt quá giới hạn cho phép." });
        continue;
      }

      const dateOfBirth = dateString(dateValue, workbook.properties.date1904);
      if (!dateOfBirth) {
        errors.push({ sheet: sheet.name, row: rowNumber, message: "Ngày sinh không hợp lệ." });
        continue;
      }

      const classCode = normalizeClassCode(
        row.getCell(headerInfo.headers.newClass).text || classValue,
      );
      if (!/^\d{1,2}[A-Z]\d{1,2}$/.test(classCode)) {
        errors.push({ sheet: sheet.name, row: rowNumber, message: "Lớp mới không đúng định dạng, ví dụ 6A1." });
        continue;
      }

      const previousClass = headerInfo.headers.previousClass
        ? getCellText(row.getCell(headerInfo.headers.previousClass))
        : "";
      const category = headerInfo.headers.category
        ? getCellText(row.getCell(headerInfo.headers.category))
        : "";
      if (previousClass.length > 100 || category.length > 80) {
        errors.push({ sheet: sheet.name, row: rowNumber, message: "Lớp cũ hoặc diện đối tượng vượt quá giới hạn cho phép." });
        continue;
      }

      const genderValue = headerInfo.headers.gender
        ? normalizeText(getCellText(row.getCell(headerInfo.headers.gender)))
        : "";
      records.push({
        sheet: sheet.name,
        row: rowNumber,
        fullName: name.replace(/\s+/g, " "),
        dateOfBirth,
        gender: ["nu", "female", "f", "x", "1", "yes", "✓"].includes(genderValue)
          ? "female"
          : ["nam", "male", "m"].includes(genderValue)
            ? "male"
            : genderValue
              ? "female"
              : "male",
        classCode,
        previousClass,
        category,
        notes: headerInfo.headers.notes
          ? getCellText(row.getCell(headerInfo.headers.notes))
          : "",
      });
      if (records.length > MAX_STUDENTS) {
        throw new Error(`Mỗi lần chỉ được import tối đa ${MAX_STUDENTS} học sinh.`);
      }
    }
  }

  if (!records.length && !errors.length) {
    throw new Error("File Excel không có dòng học sinh để import.");
  }
  return { records, errors };
}
