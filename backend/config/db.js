import mysql from 'mysql2';
import dotenv from 'dotenv';

dotenv.config();

// Set Eastern timezone for the entire Node.js process.
// db.js is the first shared module imported everywhere, so this runs before
// any controller or service code that calls new Date().
process.env.TZ = 'America/New_York';

const rawPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    timezone: 'local' // use process TZ (Eastern) for datetime conversions
});

// Set the MySQL session timezone on every new connection so that
// CURDATE(), NOW(), and TIMESTAMP reads all reflect US Eastern time.
// MySQL named timezones (e.g. 'America/New_York') require the tz tables to be
// loaded on the server. Use a numeric UTC offset instead, derived from the
// Node.js process TZ (already set to Eastern above), so DST is handled
// automatically: -05:00 during EST, -04:00 during EDT.
rawPool.on('connection', (connection) => {
    const mins = new Date().getTimezoneOffset(); // positive = behind UTC (e.g. 300 for EST)
    const sign = mins <= 0 ? '+' : '-';
    const h = String(Math.floor(Math.abs(mins) / 60)).padStart(2, '0');
    const m = String(Math.abs(mins) % 60).padStart(2, '0');
    connection.query(`SET time_zone = '${sign}${h}:${m}'`);
});

const pool = rawPool.promise();

export default pool;
