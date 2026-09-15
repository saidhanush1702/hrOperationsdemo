import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { runSeed } from './db/seeds/001_initial_seed.js';
import { runSeed2 } from './db/seeds/002_marital_phone_lookups.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    multipleStatements: true
});

const runMigrations = async () => {
    let connection;
    try {
        connection = await pool.getConnection();
        // Same stock SQL mode as the app pool (see config/db.js) — hosted MySQL
        // defaults to ANSI mode, which breaks "double quoted" string literals.
        await connection.query(`SET SESSION sql_mode = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'`);
        console.log(`Connected to Database: ${process.env.DB_NAME}. Checking migrations...`);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                migration_name VARCHAR(255) UNIQUE NOT NULL,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Look at the new path here (./db/migrations):
        const migrationsDir = path.join(__dirname, './db/migrations');
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

        const [executedRows] = await connection.query('SELECT migration_name FROM schema_migrations');
        const executedMigrations = executedRows.map(row => row.migration_name);

        for (const file of files) {
            if (!executedMigrations.includes(file)) {
                console.log(`Running migration: ${file}...`);
                const filePath = path.join(migrationsDir, file);
                const sql = fs.readFileSync(filePath, 'utf8');
                
                const queries = sql.split(';').filter(q => q.trim() !== '');
                
                for (let query of queries) {
                    await connection.query(query);
                }

                await connection.query('INSERT INTO schema_migrations (migration_name) VALUES (?)', [file]);
                console.log(`✅ Migration ${file} applied successfully.`);
            }
        }

        console.log("✅ Migrations complete.");

        console.log("Running seeds...");
        await runSeed(connection);
        await runSeed2(connection);
        console.log("✅ Seeding complete.");

    } catch (error) {
        console.error("❌ Migration failed:", error);
    } finally {
        if (connection) connection.release();
        await pool.end();
        process.exit();
    }
};

runMigrations();