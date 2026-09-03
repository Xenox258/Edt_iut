/**
 * Script pour télécharger les cours depuis flOpEDT
 * et les enregistrer dans MariaDB (tables department/week/course/...).
 * Usage: node scripts/fetch-weeks-db.js
 */

import path from "path";
import { fileURLToPath } from "url";
import { pool as db } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = "https://flopedt.iut-blagnac.fr/en/api/fetch/scheduledcourses";
const DEPTS = ["INFO", "CS", "GIM", "RT"];

// --- Helpers date/semaine ---
// Retourne l'année ISO (celle du jeudi de la semaine), et non simplement
// l'année civile de la date. Cela gère notamment les semaines 52/53 et le
// passage d'une année à l'autre.
function getISOWeekInfo(date = new Date()) {
  const temp = new Date(date.getTime());
  temp.setHours(0, 0, 0, 0);
  const dayNum = temp.getDay() || 7;
  temp.setDate(temp.getDate() + 4 - dayNum);
  const yearStart = new Date(temp.getFullYear(), 0, 1);
  const week = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: temp.getFullYear() };
}

function getCurrentWeek(date = new Date()) {
  return getISOWeekInfo(date);
}

function getFutureWeeks(count = 15, startDate = new Date()) {
  const start = new Date(startDate.getTime());
  // Midi évite les effets de bord liés aux changements d'heure lors de
  // l'ajout de semaines.
  start.setHours(12, 0, 0, 0);
  const weeks = [];

  for (let i = 0; i < count; i++) {
    const date = new Date(start.getTime());
    date.setDate(date.getDate() + i * 7);
    weeks.push(getISOWeekInfo(date));
  }

  return weeks;
}

export { getISOWeekInfo, getCurrentWeek, getFutureWeeks };

// --- Appels API flOpEDT ---
async function fetchWeek(dept, week, year) {
  const url = `${API_BASE}/?dept=${dept}&week=${week}&year=${year}&work_copy=0`;
  console.log(`📥 Fetching ${dept} week ${week}/${year}...`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`⚠️ HTTP ${response.status} for ${dept} week ${week}/${year}`);
      return null;
    }
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      console.log(`ℹ️ No data for ${dept} week ${week}/${year}`);
      return null;
    }
    return data;
  } catch (error) {
    console.error(`❌ Error fetching ${dept} week ${week}/${year}:`, error.message);
    return null;
  }
}

// --- Helpers BD ---
async function upsertWeek(conn, deptCode, year, weekNum) {
  const [[dept]] = await conn.query(
    "SELECT id FROM department WHERE code = ?",
    [deptCode]
  );
  const deptId = dept.id;

  const [rows] = await conn.query(
    "SELECT id FROM week WHERE dept_id = ? AND year = ? AND week_num = ?",
    [deptId, year, weekNum]
  );
  if (rows.length) return rows[0].id;

  const [res] = await conn.query(
    "INSERT INTO week(dept_id, year, week_num) VALUES (?,?,?)",
    [deptId, year, weekNum]
  );
  return res.insertId;
}

async function upsertRoom(conn, name) {
  if (!name) return null;
  const [rows] = await conn.query("SELECT id FROM room WHERE name = ?", [name]);
  if (rows.length) return rows[0].id;
  const [res] = await conn.query("INSERT INTO room(name) VALUES (?)", [name]);
  return res.insertId;
}

async function upsertModule(conn, mod) {
  if (!mod) return null;
  const [rows] = await conn.query(
    "SELECT id FROM module WHERE name = ? AND abbrev = ?",
    [mod.name, mod.abbrev]
  );
  if (rows.length) return rows[0].id;

  const [res] = await conn.query(
    "INSERT INTO module(name, abbrev, color_bg, color_txt) VALUES (?,?,?,?)",
    [mod.name, mod.abbrev, mod.display?.color_bg || null, mod.display?.color_txt || null]
  );
  return res.insertId;
}

async function upsertTutor(conn, identifier) {
  if (!identifier) return null;
  const [rows] = await conn.query(
    "SELECT id FROM tutor WHERE identifier = ?",
    [identifier]
  );
  if (rows.length) return rows[0].id;

  const [res] = await conn.query(
    "INSERT INTO tutor(identifier) VALUES (?)",
    [identifier]
  );
  return res.insertId;
}

async function upsertGroup(conn, grp) {
  const [rows] = await conn.query(
    "SELECT id FROM `group` WHERE name = ? AND train_prog = ?",
    [grp.name, grp.train_prog]
  );
  if (rows.length) return rows[0].id;

  const [res] = await conn.query(
    "INSERT INTO `group`(name, train_prog, is_structural) VALUES (?,?,?)",
    [grp.name, grp.train_prog, false]
  );
  return res.insertId;
}

// --- Sauvegarde d'une semaine en BD ---
async function saveWeekToDb(dept, week, year, data) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const weekId = await upsertWeek(conn, dept, year, week);

    // 1) Purge des cours supprimés côté API (source de vérité)
    // Si data est vide => on fait rien (on arrive ici seulement si data non-null et non-vide)
    const apiIds = data.map((x) => x.id);

    // Supprimer d'abord les cours absents : si tu as ON DELETE CASCADE sur course_group(course_id)->course(id),
    // les lignes de course_group seront supprimées automatiquement. [web:56][web:72]
    await conn.query(
      `DELETE FROM course
       WHERE week_id = ?
         AND id NOT IN (${apiIds.map(() => "?").join(",")})`,
      [weekId, ...apiIds]
    );

    // 2) Upsert des cours présents
    for (const item of data) {
      const roomId = await upsertRoom(conn, item.room?.name);
      const moduleId = await upsertModule(conn, item.course?.module);
      const tutorId = await upsertTutor(conn, item.tutor);

      // Remplace REPLACE par INSERT ... ON DUPLICATE KEY UPDATE (pas de delete+insert implicite). [web:92]
      await conn.query(
        `INSERT INTO course
           (id, week_id, day, start_time, duration, room_id, course_type, tutor_id, module_id)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           week_id = VALUES(week_id),
           day = VALUES(day),
           start_time = VALUES(start_time),
           duration = VALUES(duration),
           room_id = VALUES(room_id),
           course_type = VALUES(course_type),
           tutor_id = VALUES(tutor_id),
           module_id = VALUES(module_id)`,
        [
          item.id,
          weekId,
          item.day,
          item.start_time,
          item.duration ?? 90,
          roomId,
          item.course?.type,
          tutorId,
          moduleId,
        ]
      );

      // 3) Groupes: stratégie simple = on enlève tous les liens pour ce cours, puis on remet ceux de l’API
      // (plus simple que de diff; nécessite que supprimer course_group soit autorisé). [web:41]
      await conn.query("DELETE FROM course_group WHERE course_id = ?", [item.id]);

      if (Array.isArray(item.course?.groups)) {
        for (const grp of item.course.groups) {
          const groupId = await upsertGroup(conn, grp);
          await conn.query(
            "INSERT INTO course_group(course_id, group_id) VALUES (?,?)",
            [item.id, groupId]
          );
        }
      }
    }

    await conn.commit();
    console.log(`✅ Saved ${dept} week ${week}/${year} (${data.length} courses)`);
    return true;
  } catch (e) {
    await conn.rollback();
    console.error(`❌ DB error for ${dept} week ${week}/${year}:`, e.message);
    return false;
  } finally {
    conn.release();
  }
}

// --- Main ---
async function main() {
  const weeksToFetch = getFutureWeeks(15);

  console.log("🚀 Starting FUTURE(15) DB sync...");
  console.log(
    "📆 Weeks:",
    weeksToFetch.map(({ week, year }) => `${week}/${year}`).join(", ")
  );

  let totalSaved = 0;
  let totalSkipped = 0;

  for (const dept of DEPTS) {
    console.log(`\n📚 Department: ${dept}`);

    for (const { week, year } of weeksToFetch) {
      const data = await fetchWeek(dept, week, year);

      if (data) {
        const saved = await saveWeekToDb(dept, week, year, data);
        if (saved) {
          totalSaved++;
        } else {
          totalSkipped++;
        }
      } else {
        totalSkipped++;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(
    `✨ Future(15) sync done! ${totalSaved} weeks saved, ${totalSkipped} skipped`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
